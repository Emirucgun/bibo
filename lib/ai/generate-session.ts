// Oturum üretimi (docs/SPEC.md 5.1, 5.2): tek çağrı → Zod + kod kontrolleri →
// geçmeyen slotlar için tek bir yeniden üretim → en az 8 etkinlik.
// Veritabanına etkinlik yazmaz; M6'daki çağıran `items` / `item_keys`'e böler.
import type { z } from "zod";
import type { Level } from "@/lib/engine/types";
import type { StructuredCall } from "./client";
import { checkItem } from "./checks";
import { guardedLlmCall, type AiDeps, type CallContext } from "./guard";
import { buildGenerateUser, GENERATE_SYSTEM, type GenerateUserInput } from "./prompts/generate";
import { SessionGen, SlotRegen, type GeneratedItem } from "./schemas";
import type { AiSettings } from "./settings";

/** SPEC 5.1: üretimde `max_tokens` 16.000 (düşünme dahil), zaman aşımı 120 sn. */
export const GENERATE_MAX_TOKENS = 16_000;
export const GENERATE_TIMEOUT_MS = 120_000;
/** Oturum en az 8 etkinlik kalmalı (SPEC 5.1, 5.2). */
export const MIN_SESSION_ITEMS = 8;

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

export async function generateSession(
  deps: AiDeps,
  ctx: Omit<CallContext, "purpose">,
  input: GenerateSessionInput,
): Promise<GenerationOutcome> {
  const callCtx: CallContext = { ...ctx, purpose: "generate" };
  const pickModel = (s: { model_generate: string }) => s.model_generate;
  let calls = 0;

  // 1) Tüm oturum; geçersiz ya da reddedilmiş yanıtta bir kez daha.
  let full: SessionGen | null = null;
  let lastKind: "refusal" | "invalid" = "invalid";
  let lastIssues = "";
  for (let i = 0; i < 2 && !full; i++) {
    calls++;
    const res = await guardedLlmCall<SessionGen>(
      deps,
      callCtx,
      pickModel,
      buildCall(SessionGen, "session_gen", buildGenerateUser(input)),
    );
    if (res.kind === "ok") full = res.data;
    else {
      lastKind = res.kind;
      lastIssues = res.kind === "invalid" ? res.issues : "";
    }
  }
  if (!full) {
    throw new GenerationError(lastKind === "refusal" ? "refusal" : "invalid_output", lastIssues);
  }

  // 2) Kod kontrolleri
  const slotsByPos = new Map(input.slots.map((s) => [s.position, s]));
  const valid = new Map<number, GeneratedItem>();
  const failing = new Map<number, string[]>();
  const evaluate = (items: GeneratedItem[], wanted: Set<number>) => {
    for (const pos of wanted) {
      const slot = slotsByPos.get(pos)!;
      const item = items.find((it) => it.slot === pos);
      const problems = item ? checkItem(item, slot, input.level) : ["missing_item"];
      if (problems.length === 0 && item) {
        valid.set(pos, item);
        failing.delete(pos);
      } else failing.set(pos, problems);
    }
  };
  evaluate(full.items, new Set(slotsByPos.keys()));

  // 3) Geçmeyen slotlar bir kez yeniden üretilir; yine geçmezse çıkarılır.
  const regenerated = [...failing.keys()];
  if (regenerated.length > 0) {
    const regenInput = { ...input, slots: input.slots.filter((s) => failing.has(s.position)) };
    const problemsNote = regenerated.map((p) => `slot ${p}: ${failing.get(p)!.join(", ")}`).join("; ");
    calls++;
    const res = await guardedLlmCall<SlotRegen>(
      deps,
      callCtx,
      pickModel,
      buildCall(
        SlotRegen,
        "slot_regen",
        buildGenerateUser(
          regenInput,
          `Rewrite only these slots; the previous versions failed automatic checks (${problemsNote}).`,
        ),
      ),
    );
    if (res.kind === "ok") evaluate(res.data.items, new Set(regenerated));
  }

  const dropped = [...failing.entries()].map(([slot, problems]) => ({ slot, problems }));
  const items = input.slots.map((s) => valid.get(s.position)).filter((x): x is GeneratedItem => Boolean(x));
  if (items.length < MIN_SESSION_ITEMS) {
    throw new GenerationError("too_few_items", `${items.length} valid`);
  }
  return { items, dropped, regenerated, calls };
}
