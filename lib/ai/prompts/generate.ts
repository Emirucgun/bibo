// Oturum üretim komutu (docs/SPEC.md 5.1, 5.3; PRD Bölüm 8).
// Sistem komutu SABİT ve önbelleklenir; öğrenciye özgü her şey user mesajında, en sonda.
import { ACTIVITY_TYPE_INFO, type ActivityType } from "@/lib/content/activity-types";
import { INTEREST_LABELS_TR, type Interest } from "@/lib/content/interests";
import { L1_CODES } from "@/lib/content/taxonomy";
import type { Level, Purpose, Skill } from "@/lib/engine/types";
import { GAP_MARK, MAX_SENTENCE_WORDS } from "../checks";
import { EXPLANATION_STYLE, L1_CODE_LIST_TEXT, TOPIC_LIST_TEXT } from "./taxonomy";

const ACTIVITY_SPECS: Record<ActivityType, string> = {
  mcq_read: `payload: text_en (short reading text), question_en, options (3–4). key: correct (exact text of the right option), distractors (one entry per wrong option: option text, L1 code of the typical error it represents, feedback_tr).`,
  listen_choose: `payload: text_en (what will be spoken aloud, 1–3 sentences), question_en, options (3–4). key: correct, distractors (one per wrong option, as above). Distractors should reflect listening confusions (e.g. -s endings, can/can't, th) mapped to an L1 code.`,
  gap_fill: `payload: text_en with exactly one gap written as "${GAP_MARK}". key: accepted (all correct fillers), wrong_patterns (typical wrong fillers with their L1 code).`,
  word_order: `payload: tokens (the words of the sentence, shuffled, NOT in the correct order; punctuation attached to its word). key: accepted (correct sentences using exactly these tokens).`,
  dictation: `payload: text_en (one sentence to be spoken and written down). key: correct (identical to text_en), target_words (the 1–3 words in the sentence that test the target topic).`,
  translate_tr_en: `payload: source_tr (one Turkish sentence). key: model_answer_en, accepted (other acceptable translations).`,
  short_write: `payload: prompt_en (a task asking for 2–3 sentences that naturally require the target structure). key: model_answer_en (2–3 sentences).`,
  speak_answer: `payload: prompt_en (a question the student answers aloud in 1–3 sentences, naturally requiring the target structure). key: model_answer_en.`,
};

const ACTIVITY_SPEC_TEXT = (Object.keys(ACTIVITY_SPECS) as ActivityType[])
  .map((t) => `- ${t} (${ACTIVITY_TYPE_INFO[t].skill}, ${ACTIVITY_TYPE_INFO[t].mode}): ${ACTIVITY_SPECS[t]}`)
  .join("\n");

export const GENERATE_SYSTEM = `You write English practice activities for Turkish-speaking university preparatory students at CEFR A1–A2. The app finds the source of each error (topic or skill), so every activity must test exactly one target topic and every wrong option or wrong pattern must be tagged with the L1 error code it represents.

Output: JSON matching the given schema. One item per requested slot, in slot order. Copy slot, activity_type and topic_id exactly from the slot list. Do not add or skip slots.

Content rules:
- Vocabulary within A1–A2. Each English sentence at most ${MAX_SENTENCE_WORDS.A1} words for A1 and ${MAX_SENTENCE_WORDS.A2} words for A2 students.
- No factual claims about real people. Fictional characters are fine; real cities, teams, games and brands may be mentioned.
- No culturally sensitive, political, religious or adult content.
- Each activity tests one target topic; the rest of the sentence must be easy.
- Theme each activity with the interest given for its slot ("general" = neutral everyday theme). Vary names, places and situations; use the variety seed to pick different ones each session.
- instruction_tr: a short Turkish instruction in "sen" form (e.g. "Doğru seçeneği işaretle.").
- options: all different, similar length, exactly one correct. Never put the correct answer in a distractor entry.
- Use L1.* codes only when the error is really caused by Turkish; otherwise GEN.* codes. Prefer the slot's l1_target code when it fits.
- If a slot's purpose is "review" or "retest", test the same topic with a fresh sentence; "stretch" may be slightly harder within the student's level.

Activity types (fields required for each):
${ACTIVITY_SPEC_TEXT}

${EXPLANATION_STYLE}

Topics (topic_id [level, kind] English — Turkish):
${TOPIC_LIST_TEXT}

L1 error codes (code (topic): name, rule, example):
${L1_CODE_LIST_TEXT}`;

export interface GenerateSlotInput {
  position: number;
  topic_id: string;
  skill: Skill;
  activity_type: ActivityType;
  purpose: Purpose;
  l1_target: string | null;
  interest: Interest | null;
}

export interface GenerateUserInput {
  level: Level;
  explainMode: "short" | "long";
  /** Oturuma özgü çeşitlilik tohumu (temperature yerine, SPEC 5.1). */
  varietySeed: string;
  slots: GenerateSlotInput[];
}

/** Slot konularına bağlı kodların kısa listesi (SPEC 5.1 "ilgili L1 kodları"). */
export function relevantCodes(topicIds: string[]): string[] {
  const set = new Set(topicIds);
  return L1_CODES.filter((c) => c.topic_id === null || set.has(c.topic_id)).map((c) => c.code);
}

export function buildGenerateUser(input: GenerateUserInput, header = "Write one item per slot."): string {
  const slots = input.slots.map((s) => ({
    slot: s.position,
    activity_type: s.activity_type,
    topic_id: s.topic_id,
    skill: s.skill,
    purpose: s.purpose,
    l1_target: s.l1_target,
    interest: s.interest ? `${s.interest} (${INTEREST_LABELS_TR[s.interest]})` : "general",
  }));
  return [
    header,
    `Student level: ${input.level}`,
    `Explanation mode: ${input.explainMode}`,
    `Variety seed: ${input.varietySeed}`,
    `Relevant L1 codes: ${relevantCodes(input.slots.map((s) => s.topic_id)).join(", ")}`,
    `Slots:`,
    JSON.stringify(slots, null, 1),
  ].join("\n");
}
