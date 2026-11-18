// Uyarlamalı yerleştirme: Bayesçi sınıflama testi (docs/SPEC.md 4.7).
// Her cevaptan sonra θ sonsalı güncellenir; sonraki madde beklenen sınıf entropisini en çok
// azaltan maddedir; en yüksek sınıf olasılığı eşiği geçince test biter. Sınıflar: A1 (alt seviyeler
// dahil), A2 ve "A2 üstü" (kapsam kapısı). Saf: rastgelelik parametre olarak gelir.
import type { ActivityType, Skill } from "@/lib/content/activity-types";
import {
  addResponse,
  classProbs,
  expectedClassEntropy,
  normalize,
  normalLogPrior,
  posteriorMean,
  posteriorSd,
  type IrtParams,
} from "./irt";

export type Cefr = "preA1" | "A1" | "A2" | "B1" | "B2";
export type PlacementLevel = "A1" | "A2" | "B1+";
export const PLACEMENT_LEVELS: readonly PlacementLevel[] = ["A1", "A2", "B1+"];

/** Bankadaki maddenin motorun kullandığı kısmı (içerik `supabase/seed/placement_bank.json`'da). */
export interface PlacementBankItem {
  id: string;
  cefr: Cefr;
  topic_id: string;
  activity_type: ActivityType;
  skill: Skill;
  irt: IrtParams;
}

export interface PlacementAnswer {
  item_id: string;
  /** 0..1 (kısmi puanlı maddelerde ara değer). */
  score: number;
}

export interface PlacementConfig {
  /** A1|A2 ve A2|B1 kesimleri (θ ölçeği). */
  cuts: [number, number];
  /** Beyana göre önsel ortalama. */
  prior_mu: { A1: number; A2: number; unsure: number };
  prior_sd: number;
  /** Bu olasılığı geçen sınıfta test biter. */
  stop_p: number;
  min_items: number;
  max_items: number;
  /** "A2 üstü" kararı için gereken olasılık (asimetrik kapı). */
  gate_p: number;
  /** En çok maddede P(A2 üstü) bu aralıktaysa uzatma bloğu: [extension_low, gate_p). */
  extension_low: number;
  extension_items: number;
  /** Isınma: ilk n madde kolay A1 maddeleri. */
  warmup: number;
  warmup_b: number;
  /** Çoktan seçmeli (oku-seç, dinle-seç) payının üst sınırı. */
  max_choice_share: number;
  /** En iyi k maddeden rastgele biri (maruz kalma kontrolü). */
  top_k: number;
}

export const DEFAULT_PLACEMENT_CONFIG: PlacementConfig = {
  cuts: [0, 1.5],
  prior_mu: { A1: -0.5, A2: 0.6, unsure: 0.25 },
  prior_sd: 1.6,
  stop_p: 0.95,
  min_items: 8,
  max_items: 25,
  gate_p: 0.9,
  extension_low: 0.6,
  extension_items: 5,
  warmup: 2,
  warmup_b: -1,
  max_choice_share: 0.6,
  top_k: 3,
};

const CHOICE_TYPES: readonly ActivityType[] = ["mcq_read", "listen_choose"];

export interface PlacementStatus {
  /** [P(A1), P(A2), P(A2 üstü)] */
  probs: [number, number, number];
  theta_mean: number;
  theta_sd: number;
  n: number;
}

export interface PlacementOutcome extends PlacementStatus {
  level: PlacementLevel;
  /** A2 üstü ve P ≥ gate_p: kapsam kapısı. */
  gate: boolean;
  /** Karar eşiğe ulaşmadan bitti (en çok madde). */
  borderline: boolean;
}

export type PlacementStep =
  | { kind: "ask"; item: PlacementBankItem; status: PlacementStatus }
  | { kind: "done"; outcome: PlacementOutcome };

export function placementPrior(levelSelf: string | null | undefined, config: PlacementConfig): { mu: number; sd: number } {
  const mu = levelSelf === "A1" ? config.prior_mu.A1 : levelSelf === "A2" ? config.prior_mu.A2 : config.prior_mu.unsure;
  return { mu, sd: config.prior_sd };
}

function logPosterior(bank: Map<string, PlacementBankItem>, answers: readonly PlacementAnswer[], prior: { mu: number; sd: number }) {
  let lp = normalLogPrior(prior.mu, prior.sd);
  for (const a of answers) {
    const item = bank.get(a.item_id);
    if (item) lp = addResponse(lp, item.irt, a.score);
  }
  return lp;
}

export function placementStatus(
  bank: readonly PlacementBankItem[],
  answers: readonly PlacementAnswer[],
  prior: { mu: number; sd: number },
  config: PlacementConfig = DEFAULT_PLACEMENT_CONFIG,
): PlacementStatus {
  const post = normalize(logPosterior(new Map(bank.map((b) => [b.id, b])), answers, prior));
  const p = classProbs(post, config.cuts);
  return { probs: [p[0], p[1], p[2]], theta_mean: posteriorMean(post), theta_sd: posteriorSd(post), n: answers.length };
}

/** Sonucu karara çevirir: en olası sınıf; A2 üstü ancak P ≥ gate_p ise (değilse A2). */
export function decide(status: PlacementStatus, config: PlacementConfig): PlacementOutcome {
  let k = 0;
  for (let i = 1; i < 3; i++) if (status.probs[i] > status.probs[k]) k = i;
  let level = PLACEMENT_LEVELS[k];
  if (level === "B1+" && status.probs[2] < config.gate_p) level = "A2";
  return {
    ...status,
    level,
    gate: level === "B1+",
    borderline: Math.max(...status.probs) < config.stop_p,
  };
}

function pickTop<T>(scored: { item: T; score: number }[], k: number, rng: () => number): T {
  const top = [...scored].sort((a, b) => a.score - b.score).slice(0, Math.max(1, k));
  return top[Math.floor(rng() * top.length)].item;
}

/**
 * Sonraki adım: soru ya da karar. `answers` sırası sorulma sırasıdır. Seslendirme yoksa dinleme
 * maddeleri sorulmaz.
 */
export function nextPlacementStep(args: {
  bank: readonly PlacementBankItem[];
  answers: readonly PlacementAnswer[];
  levelSelf?: string | null;
  listening: boolean;
  rng: () => number;
  config?: PlacementConfig;
}): PlacementStep {
  const config = args.config ?? DEFAULT_PLACEMENT_CONFIG;
  const byId = new Map(args.bank.map((b) => [b.id, b]));
  const prior = placementPrior(args.levelSelf, config);
  const lp = logPosterior(byId, args.answers, prior);
  const post = normalize(lp);
  const p = classProbs(post, config.cuts);
  const status: PlacementStatus = {
    probs: [p[0], p[1], p[2]],
    theta_mean: posteriorMean(post),
    theta_sd: posteriorSd(post),
    n: args.answers.length,
  };
  const n = args.answers.length;
  const maxP = Math.max(...status.probs);
  if (n >= config.min_items && maxP >= config.stop_p) return { kind: "done", outcome: decide(status, config) };
  if (n >= config.max_items) {
    const pGate = status.probs[2];
    const extend = pGate >= config.extension_low && pGate < config.gate_p && n < config.max_items + config.extension_items;
    if (!extend) return { kind: "done", outcome: decide(status, config) };
  }

  const asked = args.answers.map((a) => byId.get(a.item_id)).filter((x): x is PlacementBankItem => !!x);
  const askedIds = new Set(asked.map((a) => a.id));
  const last = asked[asked.length - 1];
  const topicCount = new Map<string, number>();
  const skillCount = new Map<Skill, number>();
  let choiceCount = 0;
  for (const a of asked) {
    topicCount.set(a.topic_id, (topicCount.get(a.topic_id) ?? 0) + 1);
    skillCount.set(a.skill, (skillCount.get(a.skill) ?? 0) + 1);
    if (CHOICE_TYPES.includes(a.activity_type)) choiceCount++;
  }

  const isMeasure = (topicId: string) => topicId.startsWith("m.");
  let pool = args.bank.filter((b) => !askedIds.has(b.id) && (args.listening || b.skill !== "listening"));
  // Yumuşak kısıtlar: alternatif kalırsa uygulanır.
  const soft = (pred: (b: PlacementBankItem) => boolean) => {
    const kept = pool.filter(pred);
    if (kept.length > 0) pool = kept;
  };
  soft((b) => !last || isMeasure(b.topic_id) || b.topic_id !== last.topic_id);
  soft((b) => isMeasure(b.topic_id) || (topicCount.get(b.topic_id) ?? 0) < 2);
  if (n >= 4) {
    soft((b) => ((skillCount.get(b.skill) ?? 0) + 1) / (n + 1) <= 0.5);
    soft((b) => !CHOICE_TYPES.includes(b.activity_type) || (choiceCount + 1) / (n + 1) <= config.max_choice_share);
  }
  if (pool.length === 0) return { kind: "done", outcome: decide(status, config) };

  if (n < config.warmup) {
    const easy = pool.filter((b) => b.cefr === "A1" || b.cefr === "preA1");
    if (easy.length > 0) {
      const item = pickTop(easy.map((b) => ({ item: b, score: Math.abs(b.irt.b - config.warmup_b) })), config.top_k, args.rng);
      return { kind: "ask", item, status };
    }
  }
  const scored = pool.map((b) => ({ item: b, score: expectedClassEntropy(post, b.irt, config.cuts) }));
  return { kind: "ask", item: pickTop(scored, config.top_k, args.rng), status };
}
