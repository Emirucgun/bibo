// Üretim sonrası kod kontrolleri (docs/SPEC.md 5.2 son paragraf, PLAN M5 karar 10).
// Şemadan geçen bir etkinlik yine de burada reddedilebilir; reddedilen slot bir kez yeniden üretilir.
import type { ActivityType } from "@/lib/content/activity-types";
import { answersMatch, normalizeAnswer, tokenizeWords } from "@/lib/engine/normalize";
import type { Level } from "@/lib/engine/types";
import type { GeneratedItem } from "./schemas";

/** Planlayıcı slotunun kontrol için gereken kısmı. */
export interface SlotSpec {
  position: number;
  topic_id: string;
  activity_type: ActivityType;
}

export const MAX_SENTENCE_WORDS: Record<Level, number> = { A1: 12, A2: 16 };

/** Boşluk doldurmadaki boşluk işareti. */
export const GAP_MARK = "___";

const CHOICE_TYPES: ActivityType[] = ["mcq_read", "listen_choose"];

/** Metni cümlelere böl ve her cümlenin kelime sayısını döndür. */
export function sentenceWordCounts(text: string): number[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length);
}

function sameMultiset(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const x = [...a].sort();
  const y = [...b].sort();
  return x.every((v, i) => v === y[i]);
}

/** Bir etkinliğin sorunları; boş dizi = geçti. Mesajlar kısa kodlardır (loglanabilir). */
export function checkItem(item: GeneratedItem, slot: SlotSpec, level: Level): string[] {
  const p = item.payload;
  const k = item.key;
  const problems: string[] = [];
  const need = (cond: unknown, code: string) => {
    if (!cond) problems.push(code);
  };

  // Plan eşleşmesi
  need(item.slot === slot.position, "slot_mismatch");
  need(item.activity_type === slot.activity_type, "activity_type_mismatch");
  need(item.topic_id === slot.topic_id, "topic_mismatch");

  // Türe göre zorunlu alanlar
  switch (item.activity_type) {
    case "mcq_read":
    case "listen_choose":
      need(p.text_en, "missing_text_en");
      need(p.question_en, "missing_question_en");
      need(p.options && p.options.length >= 3, "missing_options");
      need(k.correct, "missing_correct");
      break;
    case "gap_fill":
      need(p.text_en, "missing_text_en");
      need(k.accepted && k.accepted.length > 0, "missing_accepted");
      if (p.text_en) need(p.text_en.split(GAP_MARK).length === 2, "gap_count");
      break;
    case "word_order":
      need(p.tokens && p.tokens.length >= 3, "missing_tokens");
      need(k.accepted && k.accepted.length > 0, "missing_accepted");
      break;
    case "dictation":
      need(p.text_en, "missing_text_en");
      need(k.correct ?? k.accepted?.[0], "missing_correct");
      need(k.target_words && k.target_words.length > 0, "missing_target_words");
      break;
    case "translate_tr_en":
      need(p.source_tr, "missing_source_tr");
      need(k.model_answer_en ?? k.accepted?.[0], "missing_model_answer");
      break;
    case "short_write":
    case "speak_answer":
      need(p.prompt_en, "missing_prompt_en");
      need(k.model_answer_en, "missing_model_answer");
      break;
  }

  // options doğru cevabı tam bir kez içerir; distractors her yanlış şık için tam bir kayıt
  if (CHOICE_TYPES.includes(item.activity_type) && p.options && k.correct) {
    const correct = k.correct.trim();
    const hits = p.options.filter((o) => o.trim() === correct).length;
    need(hits === 1, "correct_not_once_in_options");
    const wrong = p.options.map((o) => o.trim()).filter((o) => o !== correct);
    need(new Set(wrong).size === wrong.length, "duplicate_options");
    const ds = (k.distractors ?? []).map((d) => d.option.trim());
    need(sameMultiset(ds, wrong), "distractors_not_one_per_wrong_option");
  }

  // tokens, accepted[0]'ın bir permütasyonu
  if (item.activity_type === "word_order" && p.tokens && k.accepted?.[0]) {
    need(sameMultiset(tokenizeWords(p.tokens.join(" ")), tokenizeWords(k.accepted[0])), "tokens_not_permutation");
    need(!answersMatch(p.tokens.join(" "), k.accepted[0]), "tokens_already_ordered");
  }

  // dikte: anahtardaki cümle seslendirilen metinle aynı, hedef kelimeler cümlede
  if (item.activity_type === "dictation" && p.text_en) {
    const sentence = k.correct ?? k.accepted?.[0];
    if (sentence) need(answersMatch(sentence, p.text_en), "dictation_key_mismatch");
    const words = new Set(tokenizeWords(p.text_en));
    need((k.target_words ?? []).every((w) => words.has(normalizeAnswer(w))), "target_word_not_in_text");
  }

  // Cümle uzunluğu: A1 ≤ 12, A2 ≤ 16 kelime (İngilizce alanlar, cümle başına)
  const max = MAX_SENTENCE_WORDS[level];
  const english = [
    p.text_en?.replaceAll(GAP_MARK, "x"),
    p.question_en,
    ...(p.options ?? []),
    ...(k.accepted ?? []),
    k.correct,
    k.model_answer_en,
  ].filter((s): s is string => Boolean(s));
  need(english.every((s) => sentenceWordCounts(s).every((n) => n <= max)), "sentence_too_long");

  return problems;
}
