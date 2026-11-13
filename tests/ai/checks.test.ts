import { describe, expect, it } from "vitest";
import { checkItem, sentenceWordCounts } from "@/lib/ai/checks";
import type { GeneratedItem } from "@/lib/ai/schemas";
import { slotsFor, TYPES_10, validItem } from "./fixtures";

const slots = slotsFor(TYPES_10);

function check(item: GeneratedItem, level: "A1" | "A2" = "A1") {
  return checkItem(item, slots[item.slot - 1], level);
}

describe("checkItem", () => {
  it("fikstürdeki her tür geçer", () => {
    for (const [i, t] of TYPES_10.entries()) expect(check(validItem(i + 1, t)), t).toEqual([]);
  });

  it("slot, tür ve konu planla eşleşmeli", () => {
    const item = validItem(1, "mcq_read");
    expect(check({ ...item, activity_type: "listen_choose" })).toContain("activity_type_mismatch");
    expect(check({ ...item, topic_id: "g.be_present" })).toContain("topic_mismatch");
  });

  it("options doğru cevabı tam bir kez içermeli", () => {
    const item = validItem(1, "mcq_read");
    const none = { ...item, payload: { ...item.payload, options: ["He play football.", "He playing football.", "X"] } };
    expect(check(none)).toContain("correct_not_once_in_options");
    const twice = { ...item, payload: { ...item.payload, options: ["He plays football.", "He plays football.", "He play football."] } };
    expect(check(twice)).toContain("correct_not_once_in_options");
  });

  it("her yanlış şık için tam bir distractor kaydı", () => {
    const item = validItem(1, "mcq_read");
    const missing = { ...item, key: { ...item.key, distractors: item.key.distractors!.slice(0, 1) } };
    expect(check(missing)).toContain("distractors_not_one_per_wrong_option");
    const extra = { ...item, key: { ...item.key, distractors: [...item.key.distractors!, { option: "He plays football.", code: "GEN.OTHER" as const, feedback_tr: "x" }] } };
    expect(check(extra)).toContain("distractors_not_one_per_wrong_option");
  });

  it("tokens accepted[0]'ın permütasyonu olmalı ve sıralı verilmemeli", () => {
    const item = validItem(3, "word_order");
    expect(check({ ...item, payload: { ...item.payload, tokens: ["football", "He", "likes."] } })).toContain("tokens_not_permutation");
    expect(check({ ...item, payload: { ...item.payload, tokens: ["He", "plays", "football."] } })).toContain("tokens_already_ordered");
  });

  it("boşluk doldurmada tek boşluk", () => {
    const item = validItem(2, "gap_fill");
    expect(check({ ...item, payload: { ...item.payload, text_en: "She ___ tennis ___." } })).toContain("gap_count");
  });

  it("dikte anahtarı metinle aynı, hedef kelimeler metinde", () => {
    const item = validItem(5, "dictation");
    expect(check({ ...item, key: { ...item.key, correct: "She plays tennis every day." } })).toContain("dictation_key_mismatch");
    expect(check({ ...item, key: { ...item.key, target_words: ["watches"] } })).toContain("target_word_not_in_text");
  });

  it("cümle uzunluğu A1 ≤ 12, A2 ≤ 16 kelime", () => {
    const item = validItem(2, "gap_fill");
    const long = "She ___ tennis with her friends at the big park near the old school.";
    expect(sentenceWordCounts(long.replace("___", "x"))).toEqual([14]);
    const it2 = { ...item, payload: { ...item.payload, text_en: long } };
    expect(check(it2, "A1")).toContain("sentence_too_long");
    expect(check(it2, "A2")).not.toContain("sentence_too_long");
  });

  it("türe göre zorunlu alanlar", () => {
    const item = validItem(6, "translate_tr_en");
    expect(check({ ...item, payload: { instruction_tr: "x" } })).toContain("missing_source_tr");
  });

  it("açıklamalar, ipucu ve yönerge boş ya da yalnız boşluk olamaz", () => {
    const item = validItem(8, "speak_answer");
    const empty = { ...item, key: { ...item.key, explanation_short_tr: "", explanation_long_tr: " ", hint_tr: "" } };
    expect(check(empty)).toEqual(["missing_explanation_short", "missing_explanation_long", "missing_hint"]);
    expect(check({ ...item, payload: { ...item.payload, instruction_tr: "  " } })).toEqual(["missing_instruction"]);
  });
});
