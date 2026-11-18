// Modelin doğruluğu ve yerleştirme maddelerinin veriden kalibrasyonu (docs/arastirma/olcme-ve-ogrenen-modeli.md
// "Ölçme ve kalibrasyon"). Saf: satırlar parametre olarak gelir.
import { p4, type IrtParams } from "./irt";

// ---------------------------------------------------------------- tahmin kalitesi

export interface PredictionRow {
  /** Cevaptan önce modelin doğru olasılığı (`attempts.pred_p`). */
  pred_p: number;
  /** 0..1; ≥ 0,5 doğru sayılır. */
  score: number;
}

export interface CalibrationBin {
  /** Kutunun alt sınırı (0, 0.1, …, 0.9). */
  from: number;
  n: number;
  mean_pred: number;
  mean_obs: number;
}

export interface ModelMetrics {
  n: number;
  /** Sıralama gücü: rastgele doğru cevabın tahmini rastgele yanlışınkinden yüksek olma olasılığı. */
  auc: number | null;
  /** Ortalama log-kayıp (düşük iyi; her şeye 0,5 demek ≈ 0,693). */
  log_loss: number | null;
  brier: number | null;
  /** Beklenen kalibrasyon hatası: kutularda |tahmin − gözlem| ağırlıklı ortalaması. */
  ece: number | null;
  bins: CalibrationBin[];
}

const clampP = (p: number) => Math.min(1 - 1e-6, Math.max(1e-6, p));

/** AUC (Mann–Whitney; eşit tahminlere yarım puan). */
export function auc(rows: readonly PredictionRow[]): number | null {
  const pos = rows.filter((r) => r.score >= 0.5).map((r) => r.pred_p);
  const neg = rows.filter((r) => r.score < 0.5).map((r) => r.pred_p);
  if (pos.length === 0 || neg.length === 0) return null;
  // Sıralama ile O(n log n).
  const all = [...pos.map((p) => ({ p, y: 1 })), ...neg.map((p) => ({ p, y: 0 }))].sort((a, b) => a.p - b.p);
  let rankSumPos = 0;
  for (let i = 0; i < all.length; ) {
    let j = i;
    while (j < all.length && all[j].p === all[i].p) j++;
    const avgRank = (i + 1 + j) / 2; // 1 tabanlı ortalama sıra
    for (let k = i; k < j; k++) if (all[k].y === 1) rankSumPos += avgRank;
    i = j;
  }
  return (rankSumPos - (pos.length * (pos.length + 1)) / 2) / (pos.length * neg.length);
}

export function modelMetrics(rows: readonly PredictionRow[], binCount = 10): ModelMetrics {
  const valid = rows.filter((r) => Number.isFinite(r.pred_p) && Number.isFinite(r.score));
  const n = valid.length;
  if (n === 0) return { n: 0, auc: null, log_loss: null, brier: null, ece: null, bins: [] };
  let ll = 0;
  let brier = 0;
  const bins = Array.from({ length: binCount }, (_, i) => ({ from: i / binCount, n: 0, sp: 0, so: 0 }));
  for (const r of valid) {
    const y = r.score >= 0.5 ? 1 : 0;
    const p = clampP(r.pred_p);
    ll += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
    brier += (r.pred_p - y) ** 2;
    const b = bins[Math.min(binCount - 1, Math.floor(r.pred_p * binCount))];
    b.n++;
    b.sp += r.pred_p;
    b.so += y;
  }
  const used = bins.filter((b) => b.n > 0).map((b) => ({ from: b.from, n: b.n, mean_pred: b.sp / b.n, mean_obs: b.so / b.n }));
  const ece = used.reduce((acc, b) => acc + (b.n / n) * Math.abs(b.mean_pred - b.mean_obs), 0);
  const round = (x: number) => Math.round(x * 1000) / 1000;
  return {
    n,
    auc: (() => {
      const a = auc(valid);
      return a === null ? null : round(a);
    })(),
    log_loss: round(ll / n),
    brier: round(brier / n),
    ece: round(ece),
    bins: used.map((b) => ({ ...b, mean_pred: round(b.mean_pred), mean_obs: round(b.mean_obs) })),
  };
}

// ---------------------------------------------------------------- madde kalibrasyonu

export interface ItemResponse {
  item_id: string;
  /** Öğrencinin yerleştirme sonundaki θ tahmini. */
  theta: number;
  score: number;
}

export interface CalibratedItem {
  item_id: string;
  a: number;
  b: number;
  n: number;
}

/** Kalibrasyon için en az cevap sayısı (altında önsel değer kullanılmaya devam eder). */
export const CALIBRATION_MIN_N = 20;
/** b'nin önseli: banka değeri ± bu standart sapma (az veride önsele çekilir). */
export const CALIBRATION_PRIOR_SD = 0.5;

/**
 * Maddenin zorluğunu (b) öğrencilerin θ tahminlerinden MAP ile günceller; a, c, d bankadaki
 * değerde kalır (50 kişilik pilotta ayırt edicilik güvenilir kestirilemez). Newton adımları.
 */
export function calibrateItem(prior: IrtParams, responses: readonly { theta: number; score: number }[]): number {
  let b = prior.b;
  const v0 = CALIBRATION_PRIOR_SD ** 2;
  for (let iter = 0; iter < 30; iter++) {
    // log sonsal türevleri (b'ye göre); sayısal türev sağlam ve yeterince hızlı.
    const lp = (bb: number) => {
      let s = -((bb - prior.b) ** 2) / (2 * v0);
      for (const r of responses) {
        const p = clampP(p4(r.theta, { ...prior, b: bb }));
        const y = r.score >= 0.5 ? 1 : 0;
        s += y * Math.log(p) + (1 - y) * Math.log(1 - p);
      }
      return s;
    };
    const h = 1e-3;
    const f0 = lp(b);
    const g = (lp(b + h) - lp(b - h)) / (2 * h);
    const H = (lp(b + h) - 2 * f0 + lp(b - h)) / (h * h);
    if (!(H < 0)) break;
    const step = Math.max(-0.5, Math.min(0.5, -g / H));
    b += step;
    if (Math.abs(step) < 1e-4) break;
  }
  return Math.round(b * 1000) / 1000;
}

export function calibrateItems(
  bank: ReadonlyMap<string, IrtParams>,
  responses: readonly ItemResponse[],
  minN = CALIBRATION_MIN_N,
): CalibratedItem[] {
  const byItem = new Map<string, { theta: number; score: number }[]>();
  for (const r of responses) {
    if (!bank.has(r.item_id) || !Number.isFinite(r.theta)) continue;
    byItem.set(r.item_id, [...(byItem.get(r.item_id) ?? []), { theta: r.theta, score: r.score }]);
  }
  const out: CalibratedItem[] = [];
  for (const [item_id, rs] of byItem) {
    if (rs.length < minN) continue;
    const prior = bank.get(item_id)!;
    out.push({ item_id, a: prior.a, b: calibrateItem(prior, rs), n: rs.length });
  }
  return out.sort((x, y) => x.item_id.localeCompare(y.item_id));
}
