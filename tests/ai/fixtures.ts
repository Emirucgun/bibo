import type { LlmClient, StructuredCall, StructuredResult } from "@/lib/ai/client";
import type { LlmTokenUsage } from "@/lib/ai/cost";
import type { GenerateSlotInput } from "@/lib/ai/prompts/generate";
import type { GeneratedItem } from "@/lib/ai/schemas";
import type { AiSettings } from "@/lib/ai/settings";
import type { AiStore, LlmUsageRow } from "@/lib/ai/store";
import type { ActivityType } from "@/lib/content/activity-types";

export const SETTINGS: AiSettings = {
  kill_switch: false,
  monthly_budget_usd: 40,
  daily_session_limit: 2,
  model_generate: "claude-haiku-5-5",
  model_grade: "claude-haiku-5-5",
  effort_generate: "medium",
  effort_grade: "low",
  thinking_grade: "adaptive",
  tts_plan_usd: 0,
};

export const USAGE: LlmTokenUsage = {
  input_tokens: 1000,
  output_tokens: 2000,
  cache_read_tokens: 3000,
  cache_write_tokens: 0,
};

export class FakeStore implements AiStore {
  settings: AiSettings = { ...SETTINGS };
  monthCost = 0;
  startedToday = 0;
  rows: LlmUsageRow[] = [];
  sessionCost = new Map<string, number>();

  async loadSettings() {
    return this.settings;
  }
  async costSince() {
    return this.monthCost + this.rows.reduce((a, r) => a + r.cost_usd, 0);
  }
  async sessionsStartedSince() {
    return this.startedToday;
  }
  async insertUsage(row: LlmUsageRow) {
    this.rows.push(row);
  }
  async addSessionCost(id: string, usd: number) {
    this.sessionCost.set(id, (this.sessionCost.get(id) ?? 0) + usd);
  }
}

/** Sırayla verilen yanıtları döner; her çağrının isteğini kaydeder. */
/** İsteğe bakarak yanıt üreten sahte yanıt (paralel parçalarda sıra yerine içerikle eşleşir). */
export type Responder = (call: StructuredCall<unknown>) => StructuredResult<unknown>;

export class FakeLlm implements LlmClient {
  calls: StructuredCall<unknown>[] = [];
  constructor(private responses: (StructuredResult<unknown> | Error | Responder)[]) {}
  async callStructured<T>(call: StructuredCall<T>): Promise<StructuredResult<T>> {
    this.calls.push(call as StructuredCall<unknown>);
    const next = this.responses.shift();
    if (!next) throw new Error("FakeLlm: yanıt kalmadı");
    if (next instanceof Error) throw next;
    if (typeof next === "function") return next(call as StructuredCall<unknown>) as StructuredResult<T>;
    return next as StructuredResult<T>;
  }
}

export const ok = <T>(data: T): StructuredResult<T> => ({ kind: "ok", data, usage: USAGE });

const base = {
  explanation_short_tr: "Doğru biçim: She plays.",
  explanation_long_tr: "Üçüncü tekil şahısta fiile -s eklenir.",
  hint_tr: "Özne kim?",
};

/** Kontrollerden geçen geçerli bir etkinlik. */
export function validItem(slot: number, type: ActivityType, topic = "g.present_simple_3sg"): GeneratedItem {
  const head = { slot, activity_type: type, topic_id: topic as GeneratedItem["topic_id"] };
  switch (type) {
    case "mcq_read":
    case "listen_choose":
      return {
        ...head,
        payload: {
          instruction_tr: "Doğru seçeneği işaretle.",
          text_en: "Ali likes football. He plays every day.",
          question_en: "What does Ali do every day?",
          options: ["He plays football.", "He play football.", "He playing football."],
        },
        key: {
          ...base,
          correct: "He plays football.",
          distractors: [
            { option: "He play football.", code: "L1.3SG_S", feedback_tr: "He ile fiile -s gelir." },
            { option: "He playing football.", code: "GEN.OTHER", feedback_tr: "Yardımcı fiil eksik." },
          ],
        },
      };
    case "gap_fill":
      return {
        ...head,
        payload: { instruction_tr: "Boşluğu doldur.", text_en: "She ___ tennis on Sundays." },
        key: { ...base, accepted: ["plays"], wrong_patterns: [{ answer: "play", code: "L1.3SG_S" }] },
      };
    case "word_order":
      return {
        ...head,
        payload: { instruction_tr: "Cümleyi diz.", tokens: ["football", "He", "plays."] },
        key: { ...base, accepted: ["He plays football."] },
      };
    case "dictation":
      return {
        ...head,
        payload: { instruction_tr: "Duyduğunu yaz.", text_en: "She plays football every day." },
        key: { ...base, correct: "She plays football every day.", target_words: ["plays"] },
      };
    case "translate_tr_en":
      return {
        ...head,
        payload: { instruction_tr: "İngilizceye çevir.", source_tr: "O her gün futbol oynar." },
        key: { ...base, model_answer_en: "He plays football every day.", accepted: ["She plays football every day."] },
      };
    case "short_write":
    case "speak_answer":
      return {
        ...head,
        payload: { instruction_tr: "Cevap ver.", prompt_en: "What does your friend do on weekends?" },
        key: { ...base, model_answer_en: "My friend plays games. He watches films." },
      };
  }
}

export const TYPES_10: ActivityType[] = [
  "mcq_read",
  "gap_fill",
  "word_order",
  "listen_choose",
  "dictation",
  "translate_tr_en",
  "short_write",
  "speak_answer",
  "gap_fill",
  "mcq_read",
];

export function slotsFor(types: ActivityType[], topic = "g.present_simple_3sg"): GenerateSlotInput[] {
  return types.map((t, i) => ({
    position: i + 1,
    topic_id: topic,
    skill: "writing",
    activity_type: t,
    purpose: "focus",
    l1_target: "L1.3SG_S",
    interest: i % 5 === 0 ? null : "football",
  }));
}

/** Etkinlik listesini slot anahtarlı üretim yanıtına çevirir (`{ slot_1: item, … }`). */
export function bySlot(items: readonly unknown[]): Record<string, unknown> {
  return Object.fromEntries(items.map((it) => [`slot_${(it as { slot: number }).slot}`, it]));
}

/** Üretim isteğindeki (yerel numaralı) slot listesi. */
export function requestedSlots(call: StructuredCall<unknown>): { slot: number; activity_type: ActivityType; topic_id: string }[] {
  const marker = "Slots:\n";
  return JSON.parse(call.user.slice(call.user.indexOf(marker) + marker.length));
}

/** İstenen her slot için geçerli etkinlik döndüren yanıt; `edit` ile tek tek bozulabilir. */
export function answerAll(edit: (item: GeneratedItem, call: StructuredCall<unknown>) => unknown = (i) => i): Responder {
  return (call) => {
    const items = requestedSlots(call).map((s) => edit(validItem(s.slot, s.activity_type, s.topic_id), call));
    return ok(bySlot(items.filter((x) => x !== undefined)));
  };
}
