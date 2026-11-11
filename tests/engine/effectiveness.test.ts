import { describe, expect, it } from "vitest";
import { applyCredit, creditRetest, effectivenessScore, type FocusCandidate } from "@/lib/engine/effectiveness";
import { DAY, NOW } from "./fixtures";

const focusItem = (o: Partial<FocusCandidate>): FocusCandidate => ({
  item_id: "f1",
  topic_id: "g.can",
  activity_type: "gap_fill",
  purpose: "focus",
  credited: false,
  created_at: new Date(NOW.getTime() - 3 * DAY),
  ...o,
});

const retest = { topic_id: "g.can", activity_type: "speak_answer" as const, purpose: "retest" as const, is_correct: true, created_at: NOW };

describe("creditRetest (SPEC 4.5)", () => {
  it("≥ 48 saat önceki, kredilenmemiş, farklı türdeki en son odak etkinliği", () => {
    const items = [
      focusItem({ item_id: "old", created_at: new Date(NOW.getTime() - 5 * DAY) }),
      focusItem({ item_id: "latest" }),
      focusItem({ item_id: "too-recent", created_at: new Date(NOW.getTime() - DAY) }),
      focusItem({ item_id: "credited", credited: true, created_at: new Date(NOW.getTime() - 2.5 * DAY) }),
      focusItem({ item_id: "same-type", activity_type: "speak_answer", created_at: new Date(NOW.getTime() - 2.2 * DAY) }),
      focusItem({ item_id: "other-topic", topic_id: "g.plurals", created_at: new Date(NOW.getTime() - 2.1 * DAY) }),
      focusItem({ item_id: "review", purpose: "review", created_at: new Date(NOW.getTime() - 2.05 * DAY) }),
    ];
    expect(creditRetest(retest, items)).toEqual({ focus_item_id: "latest", activity_type: "gap_fill", taught_inc: 1, retained_inc: 1 });
  });

  it("yanlış tekrar: taught +1, retained +0; purpose retest değilse kredi yok", () => {
    expect(creditRetest({ ...retest, is_correct: false }, [focusItem({})])!.retained_inc).toBe(0);
    expect(creditRetest({ ...retest, purpose: "review" }, [focusItem({})])).toBeNull();
    expect(creditRetest(retest, [])).toBeNull();
  });

  it("tam 48 saat sınırı dahil", () => {
    const at48 = focusItem({ created_at: new Date(NOW.getTime() - 2 * DAY) });
    expect(creditRetest(retest, [at48])).not.toBeNull();
  });
});

describe("applyCredit ve verim puanı", () => {
  it("activity_stats günceller; yoksa ekler", () => {
    const c = creditRetest(retest, [focusItem({})])!;
    expect(applyCredit([], c)).toEqual([{ activity_type: "gap_fill", taught_n: 1, retained_n: 1 }]);
    expect(applyCredit([{ activity_type: "gap_fill", taught_n: 3, retained_n: 1 }], { ...c, retained_inc: 0 })).toEqual([
      { activity_type: "gap_fill", taught_n: 4, retained_n: 1 },
    ]);
  });

  it("(retained_n + 1) / (taught_n + 2)", () => {
    expect(effectivenessScore(undefined)).toBe(0.5);
    expect(effectivenessScore({ taught_n: 8, retained_n: 7 })).toBe(0.8);
  });
});
