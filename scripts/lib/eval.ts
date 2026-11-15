// eval-generation ve eval-tagging için saf yardımcılar (testli: tests/scripts/eval.test.ts).
import { z } from "zod";
import type { GradeResult } from "@/lib/ai/schemas";
import type { AiSettings } from "@/lib/ai/settings";
import type { AiStore, LlmUsageRow } from "@/lib/ai/store";
import { createRng } from "@/lib/engine/random";

/** Sıralı olmayan dizinin p yüzdeliği (en yakın sıra yöntemi). */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

export function mean(values: number[]): number {
  return values.length === 0 ? NaN : values.reduce((a, b) => a + b, 0) / values.length;
}

/** `--no-db` kipinde göçteki varsayılanlarla bellek içi depo. */
export class MemoryAiStore implements AiStore {
  rows: LlmUsageRow[] = [];
  constructor(private settings: AiSettings) {}
  async loadSettings() {
    return this.settings;
  }
  async costSince() {
    return this.rows.reduce((a, r) => a + r.cost_usd, 0);
  }
  async sessionsStartedSince() {
    return 0;
  }
  async insertUsage(row: LlmUsageRow) {
    this.rows.push(row);
  }
  async addSessionCost() {}
}

/** Her `llm_usage` satırını gerçek depoya yazarken rapor için de tutar. */
export class RecordingStore implements AiStore {
  rows: LlmUsageRow[] = [];
  constructor(private inner: AiStore) {}
  loadSettings() {
    return this.inner.loadSettings();
  }
  costSince(since: Date) {
    return this.inner.costSince(since);
  }
  sessionsStartedSince(userId: string, since: Date) {
    return this.inner.sessionsStartedSince(userId, since);
  }
  async insertUsage(row: LlmUsageRow) {
    this.rows.push(row);
    await this.inner.insertUsage(row);
  }
  addSessionCost(id: string, usd: number) {
    return this.inner.addSessionCost(id, usd);
  }
}

/** Göçteki (`20261110141914_…`) varsayılanlar; yalnızca `--no-db` için. */
export const MIGRATION_DEFAULTS: AiSettings = {
  kill_switch: false,
  monthly_budget_usd: 40,
  daily_session_limit: 2,
  model_generate: "claude-haiku-5-5",
  model_grade: "claude-haiku-5-5",
  effort_generate: "medium",
  effort_grade: "low",
  thinking_grade: "adaptive",
  tts_plan_usd: 0,
  openrouter_fee_rate: 0.055,
};

export interface UsageSummary {
  calls: number;
  ok: number;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  /** İlk çağrıdan sonraki başarılı çağrılardan `cache_read_tokens > 0` olanların oranı. */
  cache_hit_rate_after_first: number;
}

export function summarizeUsage(rows: LlmUsageRow[]): UsageSummary {
  const sum = (k: keyof LlmUsageRow) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const later = rows.slice(1).filter((r) => r.ok);
  return {
    calls: rows.length,
    ok: rows.filter((r) => r.ok).length,
    cost_usd: Math.round(sum("cost_usd") * 1e6) / 1e6,
    input_tokens: sum("input_tokens"),
    output_tokens: sum("output_tokens"),
    cache_read_tokens: sum("cache_read_tokens"),
    cache_write_tokens: sum("cache_write_tokens"),
    cache_hit_rate_after_first:
      later.length === 0 ? NaN : later.filter((r) => r.cache_read_tokens > 0).length / later.length,
  };
}

/** Tohumlu, tekrarsız örneklem (pedagoji incelemesi için 20 etkinlik). */
export function sample<T>(items: T[], n: number, seed: number): T[] {
  const rng = createRng(seed);
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

// --- Altın set (P4) ---------------------------------------------------------

export const GoldenItem = z.object({
  id: z.string(),
  activity_type: z.enum(["translate_tr_en", "short_write", "speak_answer"]),
  topic_id: z.string(),
  level: z.enum(["A1", "A2"]),
  /** `source_tr` ya da `prompt_en`. */
  task: z.string(),
  model_answer_en: z.string().nullable().default(null),
  student_text: z.string(),
  expected: z.object({
    is_correct: z.boolean(),
    /** Öğretmen etiketi; ilk kod birincil. Doğru cevapta boş. */
    l1_codes: z.array(z.string()),
  }),
});
export type GoldenItem = z.infer<typeof GoldenItem>;
export const GoldenSet = z.array(GoldenItem);

/**
 * Öğretmen etiketiyle uyum:
 * - Doğru cevap (kod yok): model de hatasız ve `is_correct` demeli.
 * - Hatalı cevap: öğretmenin birincil kodu modelin hata kodları arasında olmalı.
 */
export function tagAgrees(expected: GoldenItem["expected"], got: GradeResult): boolean {
  if (expected.l1_codes.length === 0) return got.is_correct && got.errors.length === 0;
  return got.errors.some((e) => e.l1_code === expected.l1_codes[0]);
}

// --- Altın set CSV'si (docs/pedagoji/altin-set.csv → scripts/data/golden.json) ----------

export interface GoldenTaxonomy {
  topics: readonly { id: string; level: string }[];
  codes: readonly string[];
}

export interface GoldenCsvResult {
  items: GoldenItem[];
  /** Dönüştürmeyi durduran sorunlar (`<id>: <açıklama>`). */
  errors: string[];
  /** Bilgi amaçlı; ölçümü bozmaz. */
  warnings: string[];
}

export const GOLDEN_CSV_COLUMNS = [
  "id", "etkinlik_turu", "konu", "seviye", "gorev", "model_cevap", "ogrenci_cevabi",
  "dogru_mu", "birincil_kod", "diger_kodlar", "not",
] as const;

/** Pedagoji sahibinin doldurduğu tabloyu doğrular ve `GoldenItem` listesine çevirir. */
export function goldenFromCsv(rows: Record<string, string>[], tax: GoldenTaxonomy): GoldenCsvResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const items: GoldenItem[] = [];
  const topicLevel = new Map(tax.topics.map((t) => [t.id, t.level]));
  const codes = new Set(tax.codes);
  const seen = new Set<string>();
  const texts = new Map<string, string>();

  if (rows[0]) {
    const missing = GOLDEN_CSV_COLUMNS.filter((c) => !(c in rows[0]));
    if (missing.length > 0) return { items, errors: [`eksik sütun: ${missing.join(", ")}`], warnings };
  }

  rows.forEach((raw, n) => {
    const r = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v.trim()]));
    const id = r.id || `satır ${n + 2}`;
    const bad = (msg: string) => errors.push(`${id}: ${msg}`);
    const before = errors.length;

    if (!r.id) bad("id boş");
    else if (seen.has(r.id)) bad("id tekrar ediyor");
    seen.add(r.id);

    const type = GoldenItem.shape.activity_type.safeParse(r.etkinlik_turu);
    if (!type.success) bad(`bilinmeyen etkinlik türü '${r.etkinlik_turu}'`);
    if (!topicLevel.has(r.konu)) bad(`bilinmeyen konu '${r.konu}'`);
    if (r.seviye !== "A1" && r.seviye !== "A2") bad(`seviye A1/A2 olmalı, '${r.seviye}' geldi`);
    else if (topicLevel.has(r.konu) && topicLevel.get(r.konu) !== r.seviye) {
      warnings.push(`${id}: seviye ${r.seviye}, konu ${r.konu} ise ${topicLevel.get(r.konu)}`);
    }
    for (const col of ["gorev", "model_cevap", "ogrenci_cevabi"] as const) if (!r[col]) bad(`${col} boş`);

    const others = r.diger_kodlar ? r.diger_kodlar.split(";").map((c) => c.trim()).filter(Boolean) : [];
    for (const c of [r.birincil_kod, ...others].filter(Boolean)) if (!codes.has(c)) bad(`bilinmeyen kod '${c}'`);
    if (others.includes(r.birincil_kod)) bad("birincil kod diger_kodlar'da da var");

    if (r.dogru_mu === "evet") {
      if (r.birincil_kod || others.length > 0) bad("doğru cevapta kod olmamalı");
    } else if (r.dogru_mu === "hayir") {
      if (!r.birincil_kod) bad("hatalı cevapta birincil_kod boş");
      if (r.ogrenci_cevabi && r.ogrenci_cevabi === r.model_cevap) bad("hatalı denmiş ama cevap model cevapla aynı");
    } else bad(`dogru_mu evet/hayir olmalı, '${r.dogru_mu}' geldi`);

    const dup = texts.get(r.ogrenci_cevabi);
    if (dup && r.ogrenci_cevabi) warnings.push(`${id}: öğrenci cevabı ${dup} ile aynı`);
    else texts.set(r.ogrenci_cevabi, id);

    if (errors.length === before && type.success) {
      items.push({
        id: r.id,
        activity_type: type.data,
        topic_id: r.konu,
        level: r.seviye as "A1" | "A2",
        task: r.gorev,
        model_answer_en: r.model_cevap,
        student_text: r.ogrenci_cevabi,
        expected: { is_correct: r.dogru_mu === "evet", l1_codes: r.birincil_kod ? [r.birincil_kod, ...others] : [] },
      });
    }
  });

  return { items, errors, warnings };
}
