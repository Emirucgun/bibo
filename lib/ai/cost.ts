// Fiyat tablosu (docs/SPEC.md 1, 5.3, 8 "Maliyet modeli"). Maliyeti yalnızca bu dosya hesaplar.
// Fiyatlar $ / 1M token. OpenRouter aynı fiyatı geçirir; kredi komisyonu burada yok (PLAN açık soru 2).

export interface LlmPrice {
  input: number;
  output: number; // düşünme tokenları dahil
  cache_read: number;
  cache_write: number; // 5 dakikalık önbellek yazma (girdinin 1,25 katı)
}

export const LLM_PRICES: Record<string, LlmPrice> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cache_read: 0.01, cache_write: 0.125 },
};

/** MAI-Transcribe-2: 1,67 $ / 1000 dk (M8'de kullanılır). */
export const TRANSCRIBE_USD_PER_MINUTE = 1.67 / 1000;

export interface LlmTokenUsage {
  /** Önbelleğe girmeyen girdi. */
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}

export function priceFor(model: string): LlmPrice {
  const price = LLM_PRICES[model];
  if (!price) throw new Error(`fiyat tablosunda model yok: ${model} (lib/ai/cost.ts)`);
  return price;
}

/** 6 ondalığa yuvarlanmış $ (`llm_usage.cost_usd` numeric(10,6)). */
export function llmCostUsd(model: string, u: LlmTokenUsage): number {
  const p = priceFor(model);
  const usd =
    (u.input_tokens * p.input +
      u.output_tokens * p.output +
      u.cache_read_tokens * p.cache_read +
      u.cache_write_tokens * p.cache_write) /
    1_000_000;
  return round6(usd);
}

export function transcribeCostUsd(audioSeconds: number): number {
  return round6((audioSeconds / 60) * TRANSCRIBE_USD_PER_MINUTE);
}

export function round6(x: number): number {
  return Math.round(x * 1_000_000) / 1_000_000;
}
