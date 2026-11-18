import { describe, expect, it } from "vitest";
import { auc, calibrateItem, calibrateItems, CALIBRATION_MIN_N, modelMetrics } from "@/lib/engine/calibration";
import { p4 } from "@/lib/engine/irt";
import { createRng } from "@/lib/engine/random";

describe("modelMetrics", () => {
  it("mükemmel sıralama AUC 1, ters 0, sabit tahmin 0,5", () => {
    const rows = [0.9, 0.8, 0.2, 0.1].map((p, i) => ({ pred_p: p, score: i < 2 ? 1 : 0 }));
    expect(auc(rows)).toBe(1);
    expect(auc(rows.map((r) => ({ ...r, score: 1 - r.score })))).toBe(0);
    expect(auc(rows.map((r) => ({ ...r, pred_p: 0.5 })))).toBe(0.5);
    expect(auc([{ pred_p: 0.4, score: 1 }])).toBeNull();
  });

  it("kalibre tahminde ECE küçük, log-kayıp 0,693'ün altında", () => {
    const rng = createRng(3);
    const rows = Array.from({ length: 4000 }, () => {
      const p = rng();
      return { pred_p: p, score: rng() < p ? 1 : 0 };
    });
    const m = modelMetrics(rows);
    expect(m.n).toBe(4000);
    expect(m.ece!).toBeLessThan(0.04);
    expect(m.log_loss!).toBeLessThan(0.693);
    expect(m.auc!).toBeGreaterThan(0.75);
    expect(m.bins.reduce((a, b) => a + b.n, 0)).toBe(4000);
  });

  it("aşırı güvenli tahmin ECE'yi büyütür; boş veri null", () => {
    const rng = createRng(5);
    const rows = Array.from({ length: 2000 }, () => ({ pred_p: 0.95, score: rng() < 0.6 ? 1 : 0 }));
    expect(modelMetrics(rows).ece!).toBeGreaterThan(0.3);
    expect(modelMetrics([])).toMatchObject({ n: 0, auc: null, bins: [] });
  });
});

describe("madde kalibrasyonu", () => {
  const prior = { a: 1.2, b: 0, c: 0.2, d: 0.97 };
  const simulate = (trueB: number, n: number, seed: number) => {
    const rng = createRng(seed);
    return Array.from({ length: n }, () => {
      const theta = -2 + 4 * rng();
      return { theta, score: rng() < p4(theta, { ...prior, b: trueB }) ? 1 : 0 };
    });
  };

  it("bol veride gerçek zorluğa yaklaşır; az veride önsele çekilir", () => {
    expect(Math.abs(calibrateItem(prior, simulate(1, 400, 1)) - 1)).toBeLessThan(0.35);
    const few = calibrateItem(prior, simulate(1.5, 5, 2));
    expect(Math.abs(few)).toBeLessThan(1.5);
  });

  it("en az CALIBRATION_MIN_N cevap; bankada olmayan madde yok sayılır; a değişmez", () => {
    const bank = new Map([["x", prior], ["y", prior]]);
    const rs = [
      ...simulate(0.8, CALIBRATION_MIN_N, 3).map((r) => ({ ...r, item_id: "x" })),
      ...simulate(0.8, CALIBRATION_MIN_N - 1, 4).map((r) => ({ ...r, item_id: "y" })),
      ...simulate(0.8, 30, 5).map((r) => ({ ...r, item_id: "z" })),
    ];
    const out = calibrateItems(bank, rs);
    expect(out.map((o) => o.item_id)).toEqual(["x"]);
    expect(out[0]).toMatchObject({ a: prior.a, n: CALIBRATION_MIN_N });
  });
});
