import { describe, expect, it } from "vitest";
import {
  diagnoseTopic,
  diagnosisMessage,
  reconcileDiagnoses,
  type MasteryBySkill,
} from "@/lib/engine/diagnosis";
import type { ExistingDiagnosis, TopicAttempt } from "@/lib/engine/types";
import { masteryFrom } from "./fixtures";

// L1 riski 1 olan konu (başlangıç 0,35) — SPEC 4.3 örneği
const T = "g.present_simple"; // l1_risk 1

const repeat = (skill: TopicAttempt["skill"], type: TopicAttempt["activity_type"], answers: number[]): TopicAttempt[] =>
  answers.map((a) => ({ skill, activity_type: type, is_correct: a === 1 }));

describe("diagnoseTopic — beceri eksiği", () => {
  const mastery: MasteryBySkill = {
    writing: masteryFrom(T, "writing", [1, 1, 1, 1, 0, 1]),
    speaking: masteryFrom(T, "speaking", [0, 0, 1, 0]),
  };

  it("SPEC örneği: yazma ≈ 0,70, konuşma ≈ 0,30", () => {
    expect(mastery.writing!.score).toBeCloseTo(0.7, 1);
    expect(mastery.speaking!.score).toBeCloseTo(0.3, 1);
  });

  it("ROADMAP: yazma 5/6 + konuşma 1/4 → skill_gap(speaking), güven ≥ 0,6", () => {
    const d = diagnoseTopic(T, mastery)!;
    expect(d.kind).toBe("skill_gap");
    expect(d.weak_skill).toBe("speaking");
    expect(d.strong_skill).toBe("writing");
    expect(d.confidence).toBeGreaterThanOrEqual(0.6);
    expect(d.confidence).toBeCloseTo(1, 1);
    expect(d.evidence.skills.writing).toMatchObject({ correct: 5, n: 6 });
    expect(d.evidence.skills.speaking).toMatchObject({ correct: 1, n: 4 });
  });

  it("zayıf becerinin kanıtı azsa güven düşer (n_lo / 4)", () => {
    const m: MasteryBySkill = {
      writing: masteryFrom(T, "writing", [1, 1, 1, 1, 0, 1]),
      speaking: masteryFrom(T, "speaking", [0, 0, 0]),
    };
    const d = diagnoseTopic(T, m)!;
    expect(d.kind).toBe("skill_gap");
    expect(d.confidence).toBeLessThanOrEqual(0.75);
  });

  it("n < 3 olan beceri hesaba katılmaz → belirsiz", () => {
    const m: MasteryBySkill = {
      writing: masteryFrom(T, "writing", [1, 1, 1, 1, 1, 1]),
      speaking: masteryFrom(T, "speaking", [0, 0]),
    };
    expect(diagnoseTopic(T, m)).toBeNull();
  });
});

describe("diagnoseTopic — konu eksiği", () => {
  it("ROADMAP: tüm ölçülen beceriler ≤ 0,45 ve toplam kanıt ≥ 6 → topic_gap", () => {
    const m: MasteryBySkill = {
      writing: masteryFrom(T, "writing", [0, 1, 0]),
      reading: masteryFrom(T, "reading", [0, 0, 1]),
    };
    expect(m.writing!.score).toBeLessThanOrEqual(0.45);
    expect(m.reading!.score).toBeLessThanOrEqual(0.45);
    const d = diagnoseTopic(T, m)!;
    expect(d.kind).toBe("topic_gap");
    expect(d.weak_skill).toBeNull();
    expect(d.confidence).toBeGreaterThan(0);
  });

  it("toplam kanıt < 6 ise kaydedilmez", () => {
    const m: MasteryBySkill = {
      writing: masteryFrom(T, "writing", [0, 0, 0]),
      reading: masteryFrom(T, "reading", [0, 0]),
    };
    expect(diagnoseTopic(T, m)).toBeNull();
  });

  it("beceri eksiği koşulu tutuyorsa konu eksiğinden önce gelir (kurallar sırayla)", () => {
    const m: MasteryBySkill = {
      writing: masteryFrom(T, "writing", [1, 1, 1, 1, 0, 1]),
      speaking: masteryFrom(T, "speaking", [0, 0, 0, 0]),
    };
    expect(diagnoseTopic(T, m)!.kind).toBe("skill_gap");
  });
});

describe("diagnoseTopic — etkinlik uyumsuzluğu", () => {
  it("ROADMAP: aynı konu+beceride bir tür ≤ %35, diğeri ≥ %70 → activity_mismatch", () => {
    const attempts = [
      ...repeat("writing", "gap_fill", [1, 1, 1, 1]),
      ...repeat("writing", "translate_tr_en", [0, 0, 1, 0]),
    ];
    const m: MasteryBySkill = { writing: masteryFrom(T, "writing", [1, 1, 1, 1, 0, 0, 1, 0]) };
    const d = diagnoseTopic(T, m, attempts)!;
    expect(d.kind).toBe("activity_mismatch");
    expect(d.weak_skill).toBe("writing");
    expect(d.weak_activity).toBe("translate_tr_en");
    expect(d.strong_activity).toBe("gap_fill");
    expect(d.confidence).toBeGreaterThanOrEqual(0.6);
    expect(d.evidence.activities?.translate_tr_en).toEqual({ skill: "writing", correct: 1, n: 4 });
  });

  it("farklı becerilerdeki türler karşılaştırılmaz", () => {
    const attempts = [
      ...repeat("writing", "gap_fill", [1, 1, 1, 1]),
      ...repeat("speaking", "speak_answer", [0, 0, 0]),
    ];
    expect(diagnoseTopic(T, {}, attempts)).toBeNull();
  });

  it("türde n < 3 ise hesaba katılmaz", () => {
    const attempts = [
      ...repeat("writing", "gap_fill", [1, 1, 1, 1]),
      ...repeat("writing", "short_write", [0, 0]),
    ];
    expect(diagnoseTopic(T, {}, attempts)).toBeNull();
  });
});

describe("reconcileDiagnoses", () => {
  const strongGap = diagnoseTopic(T, {
    writing: masteryFrom(T, "writing", [1, 1, 1, 1, 0, 1]),
    speaking: masteryFrom(T, "speaking", [0, 0, 1, 0]),
  })!;
  const old: ExistingDiagnosis = {
    id: "d1", topic_id: T, kind: "topic_gap", weak_skill: null, weak_activity: null, status: "active",
  };

  it("güven ≥ 0,6 → eklenir, aynı konudaki eski farklı teşhis superseded", () => {
    const r = reconcileDiagnoses({ topic_id: T, candidate: strongGap, existing: [old], mastery: {} });
    expect(r.insert).toBe(strongGap);
    expect(r.updates).toEqual([{ id: "d1", status: "superseded" }]);
  });

  it("güven < 0,6 → kaydedilmez", () => {
    const r = reconcileDiagnoses({ topic_id: T, candidate: { ...strongGap, confidence: 0.59 }, existing: [], mastery: {} });
    expect(r.insert).toBeNull();
  });

  it("aynı teşhis zaten aktifse yeni satır yok", () => {
    const same: ExistingDiagnosis = { ...old, kind: "skill_gap", weak_skill: "speaking" };
    const r = reconcileDiagnoses({ topic_id: T, candidate: strongGap, existing: [same], mastery: {} });
    expect(r).toEqual({ insert: null, updates: [] });
  });

  it("zayıf beceri ≥ 0,65'e çıkınca skill_gap resolved", () => {
    const active: ExistingDiagnosis = { ...old, kind: "skill_gap", weak_skill: "speaking" };
    const mastery: MasteryBySkill = {
      writing: masteryFrom(T, "writing", [1, 1, 1, 1, 1, 1]),
      speaking: masteryFrom(T, "speaking", [0, 0, 1, 1, 1, 1, 1, 1]),
    };
    expect(mastery.speaking!.score).toBeGreaterThanOrEqual(0.65);
    const r = reconcileDiagnoses({ topic_id: T, candidate: diagnoseTopic(T, mastery), existing: [active], mastery });
    expect(r.updates).toEqual([{ id: "d1", status: "resolved" }]);
    expect(r.insert).toBeNull();
  });
});

describe("diagnosisMessage (şablonlar)", () => {
  it("skill_gap mesajı kanıtı sayılarla verir", () => {
    const d = diagnoseTopic(T, {
      writing: masteryFrom(T, "writing", [1, 1, 1, 1, 0, 1]),
      speaking: masteryFrom(T, "speaking", [0, 0, 1, 0]),
    })!;
    expect(diagnosisMessage(d, "Geniş zaman")).toBe(
      "Geniş zaman konusunu biliyorsun: yazma etkinliklerinde 5/6 doğru. Zorlandığın yer konuşma: 1/4. " +
        "Önümüzdeki oturumlarda Geniş zaman konusunu konuşma ile çalışacağız.",
    );
  });

  it("topic_gap ve activity_mismatch", () => {
    const tg = diagnoseTopic(T, {
      writing: masteryFrom(T, "writing", [0, 1, 0]),
      reading: masteryFrom(T, "reading", [0, 0, 1]),
    })!;
    expect(diagnosisMessage(tg, "Geniş zaman")).toBe(
      "Geniş zaman henüz oturmamış: tüm becerilerde toplam 2/6. Konuyu baştan, kısa adımlarla ele alacağız.",
    );
    const am = diagnoseTopic(T, {}, [
      ...repeat("writing", "gap_fill", [1, 1, 1]),
      ...repeat("writing", "word_order", [0, 0, 0]),
    ])!;
    expect(diagnosisMessage(am, "Geniş zaman")).toContain("“Cümle diz” türünde 0/3, “Boşluk doldur” türünde 3/3");
  });
});
