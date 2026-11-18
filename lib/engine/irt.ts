// Madde tepki kuramı (IRT) yardımcıları: 4 parametreli lojistik model, ızgara üzerinde sonsal
// dağılım, sınıf olasılıkları ve madde bilgisi (docs/SPEC.md 4.7; docs/arastirma/olcme-ve-ogrenen-modeli.md Ek B).
// Saf fonksiyonlar: ağ, veritabanı ve zaman yok.

/** Madde parametreleri: ayırt edicilik a, zorluk b, tahmin payı c, üst asimptot (dikkatsizlik) d. */
export interface IrtParams {
  a: number;
  b: number;
  c: number;
  d: number;
}

/** θ ızgarası: −5 … 7 logit, 0,05 adım (241 nokta). */
export const GRID: Float64Array = Float64Array.from({ length: 241 }, (_, i) => -5 + i * 0.05);

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** P(doğru | θ) = c + (d − c) · σ(a (θ − b)). */
export function p4(theta: number, p: IrtParams): number {
  return p.c + (p.d - p.c) * sigmoid(p.a * (theta - p.b));
}

/** 4PL madde bilgisi I(θ) = a² (P − c)² (d − P)² / ((d − c)² P (1 − P)). */
export function fisherInfo(theta: number, p: IrtParams): number {
  const P = p4(theta, p);
  const num = p.a * p.a * (P - p.c) ** 2 * (p.d - P) ** 2;
  const den = (p.d - p.c) ** 2 * P * (1 - P);
  return den <= 1e-12 ? 0 : num / den;
}

/** Normal önselin ızgara üzerindeki log yoğunluğu (sabit hariç). */
export function normalLogPrior(mu: number, sd: number): Float64Array {
  return GRID.map((t) => -0.5 * ((t - mu) / sd) ** 2);
}

/**
 * Bir cevabın log olabilirliği. `score` 0..1: 1 doğru, 0 yanlış, aradaki değerler kısmi puan
 * (P^s (1 − P)^(1 − s)); dikte gibi kısmi puanlı maddeler için.
 */
export function addResponse(logpost: Float64Array, p: IrtParams, score: number): Float64Array {
  const s = Math.min(1, Math.max(0, score));
  const out = new Float64Array(logpost.length);
  for (let i = 0; i < GRID.length; i++) {
    const P = Math.min(1 - 1e-9, Math.max(1e-9, p4(GRID[i], p)));
    out[i] = logpost[i] + s * Math.log(P) + (1 - s) * Math.log(1 - P);
  }
  return out;
}

/** Log sonsalı normalleştirilmiş ağırlıklara çevirir. */
export function normalize(logpost: Float64Array): Float64Array {
  let max = -Infinity;
  for (const v of logpost) if (v > max) max = v;
  const w = logpost.map((v) => Math.exp(v - max));
  let sum = 0;
  for (const v of w) sum += v;
  return w.map((v) => v / sum);
}

export function posteriorMean(post: Float64Array): number {
  let m = 0;
  for (let i = 0; i < GRID.length; i++) m += post[i] * GRID[i];
  return m;
}

export function posteriorSd(post: Float64Array): number {
  const m = posteriorMean(post);
  let v = 0;
  for (let i = 0; i < GRID.length; i++) v += post[i] * (GRID[i] - m) ** 2;
  return Math.sqrt(v);
}

/** Izgara noktasının sınıfı: kesimler artan sırada; sınıf = kesimden büyük-eşit olanların sayısı. */
export function classOf(theta: number, cuts: readonly number[]): number {
  let k = 0;
  for (const c of cuts) if (theta >= c) k++;
  return k;
}

/** Sınıf olasılıkları (kesim sayısı + 1 sınıf). */
export function classProbs(post: Float64Array, cuts: readonly number[]): number[] {
  const out = Array(cuts.length + 1).fill(0);
  for (let i = 0; i < GRID.length; i++) out[classOf(GRID[i], cuts)] += post[i];
  return out;
}

export function entropy(q: readonly number[]): number {
  let h = 0;
  for (const v of q) if (v > 1e-12) h -= v * Math.log(v);
  return h;
}

/**
 * Maddeyi sorduktan sonra beklenen sınıf entropisi (bir adım ileri bakış). Düşük = karara daha çok
 * katkı. Yerleştirmede madde seçimi bu değere göre yapılır.
 */
export function expectedClassEntropy(post: Float64Array, p: IrtParams, cuts: readonly number[]): number {
  const k = cuts.length + 1;
  const right = Array(k).fill(0);
  const wrong = Array(k).fill(0);
  let pc = 0;
  for (let i = 0; i < GRID.length; i++) {
    const P = p4(GRID[i], p);
    const c = classOf(GRID[i], cuts);
    right[c] += post[i] * P;
    wrong[c] += post[i] * (1 - P);
    pc += post[i] * P;
  }
  const pw = 1 - pc;
  const hr = pc > 1e-12 ? entropy(right.map((v) => v / pc)) : 0;
  const hw = pw > 1e-12 ? entropy(wrong.map((v) => v / pw)) : 0;
  return pc * hr + pw * hw;
}

/** Sonsala göre maddenin doğru cevaplanma olasılığı. */
export function predictiveP(post: Float64Array, p: IrtParams): number {
  let s = 0;
  for (let i = 0; i < GRID.length; i++) s += post[i] * p4(GRID[i], p);
  return s;
}

/** Standart normal birikimli dağılım (Abramowitz–Stegun 7.1.26 ile erf). */
export function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}
