import { describe, expect, it } from "vitest";
import { alignWords, gradeLocal } from "@/lib/engine/grade-local";

describe("gradeLocal: mcq_read / listen_choose", () => {
  const key = {
    correct: "She plays football.",
    distractors: [
      { option: "She play football.", code: "L1.3SG_S", feedback_tr: "he/she/it ile fiile -s eklenir." },
      { option: "She playing football.", code: "GEN.VERB_FORM", feedback_tr: "…" },
    ],
  };

  it("doğru şık", () => {
    const r = gradeLocal({ activity_type: "mcq_read", l1_target: null, key, response: { choice: "She plays football." } });
    expect(r).toEqual({ is_correct: true, score: 1, errors: [] });
  });

  it("yanlış şık çeldiricinin kodunu taşır (source = distractor)", () => {
    const r = gradeLocal({ activity_type: "listen_choose", l1_target: null, key, response: { choice: "She play football." } });
    expect(r.is_correct).toBe(false);
    expect(r.errors[0]).toMatchObject({ l1_code: "L1.3SG_S", source: "distractor", correction: "She plays football." });
  });
});

describe("gradeLocal: gap_fill", () => {
  const key = { accepted: ["doesn't", "does not"], wrong_patterns: [{ answer: "don't", code: "L1.3SG_S" }] };

  it("normalize edilmiş kabul edilen cevap", () => {
    expect(gradeLocal({ activity_type: "gap_fill", l1_target: "L1.DO_SUPPORT", key, response: { text: " Does not. " } }).is_correct).toBe(true);
  });

  it("wrong_patterns eşleşirse o kod", () => {
    const r = gradeLocal({ activity_type: "gap_fill", l1_target: "L1.DO_SUPPORT", key, response: { text: "Don’t" } });
    expect(r.errors[0].l1_code).toBe("L1.3SG_S");
  });

  it("eşleşmezse l1_target, o da yoksa GEN.OTHER", () => {
    expect(gradeLocal({ activity_type: "gap_fill", l1_target: "L1.DO_SUPPORT", key, response: { text: "isn't" } }).errors[0].l1_code).toBe("L1.DO_SUPPORT");
    expect(gradeLocal({ activity_type: "gap_fill", l1_target: null, key, response: { text: "isn't" } }).errors[0].l1_code).toBe("GEN.OTHER");
  });
});

describe("gradeLocal: word_order", () => {
  const key = { accepted: ["Where do you live?"] };

  it("doğru sıralama", () => {
    const r = gradeLocal({ activity_type: "word_order", l1_target: "L1.Q_INVERSION", key, response: { order: ["where", "do", "you", "live"] } });
    expect(r.is_correct).toBe(true);
  });

  it("yanlış sıralama l1_target ile etiketlenir", () => {
    const r = gradeLocal({ activity_type: "word_order", l1_target: "L1.Q_INVERSION", key, response: { order: ["you", "live", "where", "do"] } });
    expect(r.is_correct).toBe(false);
    expect(r.errors[0]).toMatchObject({ l1_code: "L1.Q_INVERSION", wrong_span: "you live where do" });
  });
});

describe("gradeLocal: dictation (kelime düzeyi Levenshtein)", () => {
  const key = { correct: "She plays football every day.", target_words: ["plays"] };

  it("ROADMAP: 'She play football every day' → 5 kelimede 1 hata, 0,80 → yanlış", () => {
    const r = gradeLocal({ activity_type: "dictation", l1_target: "L1.3SG_S", key, response: { text: "She play football every day" } });
    expect(r.score).toBe(0.8);
    expect(r.is_correct).toBe(false);
    expect(r.errors).toEqual([{ l1_code: "L1.3SG_S", wrong_span: "play", correction: "plays", source: "rule" }]);
  });

  it("noktalama ve büyük harf fark etmez → 1,0 doğru", () => {
    const r = gradeLocal({ activity_type: "dictation", l1_target: "L1.3SG_S", key, response: { text: "she plays football every day" } });
    expect(r).toMatchObject({ is_correct: true, score: 1, errors: [] });
  });

  it("hedef kelime dışındaki hata GEN.OTHER; puan 0'ın altına inmez", () => {
    const r1 = gradeLocal({ activity_type: "dictation", l1_target: "L1.3SG_S", key, response: { text: "She plays football every week" } });
    expect(r1.errors[0].l1_code).toBe("GEN.OTHER");
    const r2 = gradeLocal({ activity_type: "dictation", l1_target: null, key, response: { text: "a b c d e f g h i j k" } });
    expect(r2.score).toBe(0);
  });

  it("eşik 0,9: 10 kelimede 1 hata doğru sayılır", () => {
    const k = { correct: "My brother and I play football in the park today" };
    const r = gradeLocal({ activity_type: "dictation", l1_target: null, key: k, response: { text: "My brother and I play football in a park today" } });
    expect(r.score).toBe(0.9);
    expect(r.is_correct).toBe(true);
  });
});

describe("alignWords", () => {
  it("ekleme, silme ve değiştirme", () => {
    expect(alignWords(["a", "b", "c"], ["a", "x", "c", "d"])).toEqual([
      { kind: "sub", target: "b", answer: "x" },
      { kind: "ins", answer: "d" },
    ]);
    expect(alignWords(["a", "b", "c"], ["a", "c"])).toEqual([{ kind: "del", target: "b" }]);
  });
});
