// Oturum üretimi (docs/SPEC.md 5.1, 5.2): en çok 5 slotluk paralel parçalar → Zod + kod
// kontrolleri → geçmeyen slotlar için tek bir yeniden üretim turu → en az 8 etkinlik.
// Veritabanına etkinlik yazmaz; M6'daki çağıran `items` / `item_keys`'e böler.
import type { z } from "zod";
import type { Level } from "@/lib/engine/types";
import { formatIssues, type StructuredCall } from "./client";
import { checkItem } from "./checks";
import { guardedLlmCall, type AiDeps, type CallContext } from "./guard";
import { buildGenerateUser, GENERATE_SYSTEM, type GenerateSlotInput, type GenerateUserInput } from "./prompts/generate";
import { GeneratedItem, SessionGen, slotKey } from "./schemas";
import type { AiSettings } from "./settings";

/** SPEC 5.1: üretimde `max_tokens` 16.000 (düşünme dahil), zaman aşımı 120 sn. */
export const GENERATE_MAX_TOKENS = 16_000;
export const GENERATE_TIMEOUT_MS = 120_000;
/** Oturum en az 8 etkinlik kalmalı (SPEC 5.1, 5.2). */
export const MIN_SESSION_ITEMS = 8;
/**
 * Bir çağrıdaki en çok slot. Slot anahtarlı katı şema 6 slottan itibaren Anthropic'te
 * "Schema is too complex for compilation" ile reddediliyor (ölçüm 11.11.2026).
 */
export const MAX_SLOTS_PER_CALL = 5;

export type GenerationErrorCode = "refusal" | "invalid_output" | "too_few_items";

export class GenerationError extends Error {
  constructor(
    public readonly code: GenerationErrorCode,
    public readonly detail = "",
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "GenerationError";
  }
}

export interface DroppedSlot {
  slot: number;
  problems: string[];
}

export interface GenerationOutcome {
  /** Slot sırasında, kontrollerden geçmiş etkinlikler. */
  items: GeneratedItem[];
  dropped: DroppedSlot[];
  /** Yeniden üretilen slot numaraları. */
  regenerated: number[];
  /** Yapılan model çağrısı sayısı (HTTP yeniden denemeleri hariç). */
  calls: number;
}

export interface GenerateSessionInput extends GenerateUserInput {
  level: Level;
}

/** Bir etkinlik için kaydedilen Zod sorunları en çok bu kadar (yeniden üretim notu kısa kalsın). */
const MAX_ITEM_ISSUES = 3;

export interface SalvagedItems {
  items: GeneratedItem[];
  /** Şemadan geçmeyen etkinliklerin slotları ve sorunları (`schema:<yol>:<kod>`). */
  problems: Map<number, string[]>;
}

/** Slot anahtarlı yanıtı slot sırasında etkinlik listesine çevirir; `slot` anahtardan alınır. */
export function itemsFromSlots(data: SessionGen, positions: readonly number[]): GeneratedItem[] {
  return positions.flatMap((p) => {
    const item = data[slotKey(p)];
    return item ? [{ ...item, slot: p }] : [];
  });
}

/**
 * Şemadan geçmeyen yanıtta slotları tek tek doğrular. Tek bir alandaki taşma (ör. açıklama
 * karakter sınırı) bütün oturumu yeniden ürettirmesin; yalnızca o slot yeniden üretilir.
 * Yanıt nesne değilse `null` (tüm çağrı tekrar denenir). Eksik anahtar `missing_item` sayılır.
 */
export function salvageItems(raw: unknown, positions: readonly number[]): SalvagedItems | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const items: GeneratedItem[] = [];
  const problems = new Map<number, string[]>();
  for (const p of positions) {
    if (!(slotKey(p) in obj)) continue;
    const parsed = GeneratedItem.safeParse(obj[slotKey(p)]);
    if (parsed.success) {
      items.push({ ...parsed.data, slot: p });
      continue;
    }
    problems.set(
      p,
      formatIssues(parsed.error.issues, MAX_ITEM_ISSUES)
        .split(", ")
        .map((s) => `schema:${s}`),
    );
  }
  return { items, problems };
}

function buildCall<T>(schema: z.ZodType<T>, name: string, user: string) {
  return (settings: AiSettings, model: string): StructuredCall<T> => ({
    model,
    effort: settings.effort_generate,
    thinking: "adaptive",
    system: GENERATE_SYSTEM,
    user,
    schema,
    schemaName: name,
    maxTokens: GENERATE_MAX_TOKENS,
    timeoutMs: GENERATE_TIMEOUT_MS,
  });
}

/** Slotları en çok `MAX_SLOTS_PER_CALL`'luk, olabildiğince eşit parçalara böler (10 → 5+5, 9 → 5+4, 8 → 4+4). */
export function chunkSlots<T>(slots: readonly T[], max = MAX_SLOTS_PER_CALL): T[][] {
  const parts = Math.ceil(slots.length / max);
  const out: T[][] = [];
  let start = 0;
  for (let i = 0; i < parts; i++) {
    const size = Math.ceil((slots.length - start) / (parts - i));
    out.push(slots.slice(start, start + size));
    start += size;
  }
  return out;
}

type ChunkResult = { kind: "ok"; batch: SalvagedItems } | { kind: "failed"; refusal: boolean; problem: string };

export async function generateSession(
  deps: AiDeps,
  ctx: Omit<CallContext, "purpose">,
  input: GenerateSessionInput,
): Promise<GenerationOutcome> {
  const callCtx: CallContext = { ...ctx, purpose: "generate" };
  const pickModel = (s: { model_generate: string }) => s.model_generate;
  let calls = 0;
  let anyNonRefusal = false;

  /**
   * Bir parça için tek çağrı. Model parçadaki slotları `slot_1…slot_k` olarak görür (en çok 5
   * farklı şema; derlenen şema sağlayıcıda önbellekte kalır), sonuç gerçek slotlara geri eşlenir.
   */
  const runChunk = async (chunk: GenerateSlotInput[], name: string, problems?: Map<number, string[]>): Promise<ChunkResult> => {
    const local = chunk.map((s, i) => ({ ...s, position: i + 1 }));
    const localPos = local.map((s) => s.position);
    const toReal = (p: number) => chunk[p - 1].position;
    const header = problems
      ? `Rewrite these slots; the previous versions failed automatic checks (${local
          .map((s, i) => `slot ${s.position}: ${problems.get(chunk[i].position)!.join(", ")}`)
          .join("; ")}).`
      : undefined;
    calls++;
    const res = await guardedLlmCall<SessionGen>(
      deps,
      callCtx,
      pickModel,
      buildCall(SessionGen(localPos), name, buildGenerateUser({ ...input, slots: local }, header)),
    );
    if (res.kind !== "refusal") anyNonRefusal = true;
    let batch: SalvagedItems | null = null;
    if (res.kind === "ok") batch = { items: itemsFromSlots(res.data, localPos), problems: new Map() };
    else if (res.kind === "invalid") batch = salvageItems(res.raw, localPos);
    if (!batch) return { kind: "failed", refusal: res.kind === "refusal", problem: res.kind === "refusal" ? "refusal" : "invalid_output" };
    return {
      kind: "ok",
      batch: {
        items: batch.items.map((it) => ({ ...it, slot: toReal(it.slot) })),
        problems: new Map([...batch.problems].map(([p, v]) => [toReal(p), v])),
      },
    };
  };

  const slotsByPos = new Map(input.slots.map((s) => [s.position, s]));
  const valid = new Map<number, GeneratedItem>();
  const failing = new Map<number, string[]>();
  const evaluate = (chunk: GenerateSlotInput[], result: ChunkResult) => {
    for (const { position: pos } of chunk) {
      const slot = slotsByPos.get(pos)!;
      const item = result.kind === "ok" ? result.batch.items.find((it) => it.slot === pos) : undefined;
      const problems =
        result.kind === "failed"
          ? [result.problem]
          : item
            ? checkItem(item, slot, input.level)
            : (result.batch.problems.get(pos) ?? ["missing_item"]);
      if (problems.length === 0 && item) {
        valid.set(pos, item);
        failing.delete(pos);
      } else failing.set(pos, problems);
    }
  };

  const runRound = async (slots: GenerateSlotInput[], name: string, problems?: Map<number, string[]>) => {
    const chunks = chunkSlots(slots);
    const results = await Promise.all(chunks.map((c) => runChunk(c, name, problems)));
    chunks.forEach((c, i) => evaluate(c, results[i]));
  };

  // 1) Tüm oturum, paralel parçalar hâlinde. Şemadan kısmen geçen ya da reddedilen parçanın
  //    slotları 2. adımda yeniden üretilir.
  await runRound(input.slots, "session_gen");

  // 2) Geçmeyen slotlar bir kez yeniden üretilir; yine geçmezse çıkarılır.
  const regenerated = [...failing.keys()];
  if (regenerated.length > 0) {
    await runRound(
      input.slots.filter((s) => failing.has(s.position)),
      "slot_regen",
      new Map(failing),
    );
  }

  const dropped = [...failing.entries()].map(([slot, problems]) => ({ slot, problems }));
  const items = input.slots.map((s) => valid.get(s.position)).filter((x): x is GeneratedItem => Boolean(x));
  if (items.length === 0) {
    throw new GenerationError(anyNonRefusal ? "invalid_output" : "refusal", dropped.map((d) => `slot ${d.slot}: ${d.problems.join(", ")}`).join("; ").slice(0, 300));
  }
  if (items.length < MIN_SESSION_ITEMS) {
    throw new GenerationError("too_few_items", `${items.length} valid`);
  }
  return { items, dropped, regenerated, calls };
}
