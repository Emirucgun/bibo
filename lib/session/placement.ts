// Uyarlamalı yerleştirme testi (docs/SPEC.md 4.7, 6 `POST /api/placement`, Ek C; PRD F2).
// Soru bankası `supabase/seed/placement_bank.json`'dan gelir; dil modeli üretmez (konuşma sorusunun
// değerlendirmesi hariç). Maddeler tek tek eklenir: her cevaptan sonra `nextPlacementStep` sıradaki
// maddeyi seçer ya da testi bitirir. Saf: rastgelelik, seslendirme durumu ve zaman parametre olarak gelir.
import bank from "@/supabase/seed/placement_bank.json";
import { ACTIVITY_TYPE_INFO, isActivityType, type ActivityType } from "@/lib/content/activity-types";
import { L1_CODES } from "@/lib/content/taxonomy";
import { defaultPath, isTeachable } from "@/lib/engine/curriculum";
import type { IrtParams } from "@/lib/engine/irt";
import { cell, expectedAccuracy, type LearnerState, type ModelContext } from "@/lib/engine/learner-model";
import {
  decide,
  DEFAULT_PLACEMENT_CONFIG,
  nextPlacementStep,
  placementPrior,
  placementStatus,
  type Cefr,
  type PlacementAnswer,
  type PlacementBankItem,
  type PlacementConfig,
  type PlacementLevel,
  type PlacementOutcome,
} from "@/lib/engine/placement-cat";
import { createRng, seedFromString } from "@/lib/engine/random";
import type { EngineTopic, ItemKey } from "@/lib/engine/types";
import { CHOICE_TYPES, shuffled, SPOKEN_TEXT_TYPES } from "./save-items";
import type { AttemptRow, ItemPayload, ItemRow, NewItem } from "./types";

interface RawBankItem {
  id: string;
  cefr: Cefr;
  activity_type: string;
  topic_id: string;
  l1_target: string | null;
  irt: IrtParams;
  payload: ItemPayload;
  key: ItemKey;
}

interface RawSpeaking {
  id: string;
  topic_id: string;
  activity_type: "speak_answer";
  l1_target: string | null;
  payload: ItemPayload;
  key: ItemKey;
}

const RAW = bank as unknown as { items: RawBankItem[]; speaking: RawSpeaking };

export const PLACEMENT_BANK: readonly RawBankItem[] = RAW.items.filter((i) => isActivityType(i.activity_type));
export const PLACEMENT_SPEAKING: RawSpeaking = RAW.speaking;
const BY_ID = new Map(PLACEMENT_BANK.map((i) => [i.id, i]));

/** `item_calibration`: veriden güncellenen ayırt edicilik ve zorluk (gece işi; yalnızca yeterli veride). */
export type ItemCalibration = ReadonlyMap<string, { a: number; b: number }>;

const irtOf = (raw: RawBankItem, calibration?: ItemCalibration): IrtParams => {
  const c = calibration?.get(raw.id);
  return c ? { ...raw.irt, a: c.a, b: c.b } : raw.irt;
};

/** Bankadaki maddenin IRT parametreleri (yerleştirme cevabının öğrenme profiline işlenmesi için). */
export function bankIrt(bankItemId: string | null | undefined, calibration?: ItemCalibration): IrtParams | null {
  const raw = bankItemId ? BY_ID.get(bankItemId) : undefined;
  return raw ? irtOf(raw, calibration) : null;
}

/** Bankanın önsel parametreleri (gece kalibrasyonunun başlangıç noktası). */
export function bankPriors(): Map<string, IrtParams> {
  return new Map(PLACEMENT_BANK.map((i) => [i.id, i.irt]));
}

/** Motorun gördüğü banka (seslendirme yoksa dinleme maddeleri yok). */
export function engineBank(listening: boolean, calibration?: ItemCalibration): PlacementBankItem[] {
  return PLACEMENT_BANK.flatMap((i) => {
    const type = i.activity_type as ActivityType;
    const skill = ACTIVITY_TYPE_INFO[type].skill;
    if (!listening && skill === "listening") return [];
    return [{ id: i.id, cefr: i.cefr, topic_id: i.topic_id, activity_type: type, skill, irt: irtOf(i, calibration) }];
  });
}

/** `app_settings.placement_model` motor ayarlarının üzerine yazılır (yalnızca bilinen sayısal alanlar). */
export function placementConfig(overrides: Partial<PlacementConfig> | null | undefined): PlacementConfig {
  const out: PlacementConfig = { ...DEFAULT_PLACEMENT_CONFIG };
  for (const [k, v] of Object.entries(overrides ?? {})) {
    if (k in out && typeof v === typeof (out as unknown as Record<string, unknown>)[k]) {
      (out as unknown as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

/**
 * Bankadan oturum satırı. Dinlemede seslendirilecek metin `item_keys.text_en`'e taşınır; şıklar
 * karıştırılır (doğru şık ilk sırada kalmasın).
 */
export function bankItemRow(raw: RawBankItem | RawSpeaking, position: number, rng: () => number): NewItem {
  const type = raw.activity_type as ActivityType;
  const info = ACTIVITY_TYPE_INFO[type];
  const payload: ItemPayload = { ...raw.payload };
  if (CHOICE_TYPES.includes(type) && payload.options) payload.options = shuffled(payload.options, rng);
  const key: ItemKey = { ...raw.key };
  if (SPOKEN_TEXT_TYPES.includes(type)) {
    key.text_en = raw.payload.text_en ?? raw.key.correct;
    delete payload.text_en;
  }
  return {
    position,
    topic_id: raw.topic_id,
    activity_type: type,
    skill: info.skill,
    mode: info.mode,
    purpose: "placement",
    interest: null,
    l1_target: raw.l1_target,
    payload,
    key,
    bank_item_id: raw.id,
  };
}

/** Cevaplanmış banka maddeleri, sorulma sırasıyla. Değerlendirilemeyen (atlanan) madde sayılmaz. */
export function placementAnswers(items: readonly ItemRow[], attempts: readonly AttemptRow[]): PlacementAnswer[] {
  const byItem = new Map(attempts.filter((a) => a.try_no === 1).map((a) => [a.item_id, a]));
  return [...items]
    .sort((a, b) => a.position - b.position)
    .flatMap((i) => {
      const a = byItem.get(i.id);
      if (!i.bank_item_id || !BY_ID.has(i.bank_item_id) || !a || a.score === null) return [];
      return [{ item_id: i.bank_item_id, score: a.score }];
    });
}

export type PlacementNext =
  | { kind: "wait" }
  | { kind: "item"; row: NewItem }
  | { kind: "complete"; outcome: PlacementOutcome };

/**
 * Sıradaki adım. Cevapsız madde varsa `wait`. Sınıflama bitince (kapsam kapısı değilse) bir konuşma
 * sorusu eklenir: konuşma yalnızca öğrenme profiline destek kanıttır, seviye kararını değiştirmez.
 */
export function nextPlacement(args: {
  sessionId: string;
  items: readonly ItemRow[];
  attempts: readonly AttemptRow[];
  levelSelf: string | null | undefined;
  /** Seslendirme şu an kullanılabilir mi? */
  ttsAvailable: boolean;
  config: PlacementConfig;
  calibration?: ItemCalibration;
}): PlacementNext {
  const answered = new Set(args.attempts.map((a) => a.item_id));
  if (args.items.some((i) => !answered.has(i.id))) return { kind: "wait" };
  const position = args.items.reduce((m, i) => Math.max(m, i.position), 0) + 1;
  if (args.items.some((i) => i.activity_type === "speak_answer")) {
    return { kind: "complete", outcome: placementOutcome(args.items, args.attempts, args.levelSelf, args.config, args.calibration) };
  }
  // Atlanan dinleme maddesi (ses çalınamadı): testin geri kalanında dinleme yok.
  const skippedListening = args.items.some(
    (i) => i.skill === "listening" && args.attempts.some((a) => a.item_id === i.id && a.score === null),
  );
  const answers = placementAnswers(args.items, args.attempts);
  const step = nextPlacementStep({
    bank: engineBank(args.ttsAvailable && !skippedListening, args.calibration),
    answers,
    levelSelf: args.levelSelf,
    listening: args.ttsAvailable && !skippedListening,
    rng: createRng(seedFromString(`${args.sessionId}:${answers.length}`)),
    config: args.config,
  });
  const rng = createRng(seedFromString(`${args.sessionId}:${position}:options`));
  if (step.kind === "ask") return { kind: "item", row: bankItemRow(BY_ID.get(step.item.id)!, position, rng) };
  if (step.outcome.gate) return { kind: "complete", outcome: step.outcome };
  return { kind: "item", row: bankItemRow(PLACEMENT_SPEAKING, position, rng) };
}

/** Cevaplardan karar (sonsal yeniden hesaplanır; durum saklanmaz). */
export function placementOutcome(
  items: readonly ItemRow[],
  attempts: readonly AttemptRow[],
  levelSelf: string | null | undefined,
  config: PlacementConfig,
  calibration?: ItemCalibration,
): PlacementOutcome {
  const status = placementStatus(engineBank(true, calibration), placementAnswers(items, attempts), placementPrior(levelSelf, config), config);
  return decide(status, config);
}

/** Kartlarda gösterilen konu sayısı. */
export const PLACEMENT_CARD_TOPICS = 3;

export interface TopicLine {
  topicId: string;
  titleTr: string;
  /** Konunun Türkçe kaynaklı ilk hata kodunun kuralı (`l1_codes.rule_tr`); yoksa `null`. */
  ruleTr?: string | null;
}

export interface PlacementCards {
  /** Doğrudan kanıtla iyi giden konular. */
  strengths: TopicLine[];
  /** Kanıtla zorlandığı konular (en az bir yanlış ve beklenen doğruluk < %50). */
  weakPoints: TopicLine[];
  /** Seviyesine açık ama henüz hiç sorulmamış konular: "netleştireceğiz". */
  toClarify: TopicLine[];
}

const ruleOf = (topicId: string) => L1_CODES.find((c) => c.topic_id === topicId && c.is_l1 && c.rule_tr)?.rule_tr ?? null;

/**
 * Yerleştirme özeti: "kanıt yoksa hüküm yok". Zayıf nokta yalnızca bu testte yanlış cevaplanmış ve
 * modelin de zayıf gördüğü konudur; hiç sorulmamış konu zayıf ya da güçlü sayılmaz.
 */
export function placementCards(args: {
  ctx: ModelContext;
  state: LearnerState;
  topics: readonly EngineTopic[];
  items: readonly ItemRow[];
  attempts: readonly AttemptRow[];
  level: PlacementLevel;
}): PlacementCards {
  const { ctx, state } = args;
  const graded = new Map(args.attempts.filter((a) => a.score !== null).map((a) => [a.item_id, a]));
  const perTopic = new Map<string, { n: number; wrong: number }>();
  for (const i of args.items) {
    const a = graded.get(i.id);
    if (!a) continue;
    const e = perTopic.get(i.topic_id) ?? { n: 0, wrong: 0 };
    e.n += 1;
    if (a.is_correct === false) e.wrong += 1;
    perTopic.set(i.topic_id, e);
  }
  const teachable = args.topics.filter(isTeachable);
  const line = (t: EngineTopic, withRule = false): TopicLine => ({
    topicId: t.id,
    titleTr: t.title_tr,
    ...(withRule ? { ruleTr: ruleOf(t.id) } : {}),
  });
  const acc = (t: EngineTopic) => expectedAccuracy(ctx, state, t.id);

  const weakPoints = teachable
    .filter((t) => (perTopic.get(t.id)?.wrong ?? 0) > 0 && acc(t) < 0.5)
    .sort((a, b) => acc(a) - acc(b) || b.l1_risk - a.l1_risk || a.sort - b.sort)
    .slice(0, PLACEMENT_CARD_TOPICS)
    .map((t) => line(t, true));
  const strengths = teachable
    .filter((t) => {
      const e = perTopic.get(t.id);
      return !!e && e.wrong === 0 && acc(t) >= 0.75;
    })
    .sort((a, b) => acc(b) - acc(a) || a.sort - b.sort)
    .slice(0, PLACEMENT_CARD_TOPICS)
    .map((t) => line(t));
  const open = args.level === "A1" ? teachable.filter((t) => t.level === "A1") : teachable;
  const toClarify = defaultPath(open)
    .filter((t) => !perTopic.has(t.id) && (cell(ctx, state, t.id, "writing")?.n ?? 0) === 0)
    .slice(0, PLACEMENT_CARD_TOPICS)
    .map((t) => line(t));
  return { strengths, weakPoints, toClarify };
}
