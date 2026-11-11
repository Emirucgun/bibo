// Kademeli ustalık puanı (docs/SPEC.md 4.1) ve aralıklı tekrar (4.2).
import type { EngineTopic, Evidence, MasteryState, Mode, Skill } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export const ALPHA_RECOGNITION = 0.15;
export const ALPHA_DEFAULT = 0.25;
export const HINT_CAP = 0.5;

/** Başlangıç ustalığı: 0.50 / 0.35 / 0.20. */
export function prior(topic: Pick<EngineTopic, "l1_risk">): number {
  return round3(0.5 - 0.15 * topic.l1_risk);
}

export function emptyMastery(topic: Pick<EngineTopic, "l1_risk">): MasteryState {
  return { score: prior(topic), n: 0, correct: 0, last_seen_at: null, next_review_at: null };
}

export function alphaFor(mode: Mode, incidental: boolean): number {
  const a = mode === "recognition" ? ALPHA_RECOGNITION : ALPHA_DEFAULT;
  return incidental ? a / 2 : a;
}

/** 4.2: tekrar aralığı (gün). */
export function reviewIntervalDays(correct: boolean, m: number): number {
  if (!correct) return 1;
  if (m < 0.5) return 1;
  if (m < 0.7) return 3;
  if (m < 0.85) return 7;
  return 14;
}

export function nextReviewAt(now: Date, correct: boolean, m: number): Date {
  return new Date(now.getTime() + reviewIntervalDays(correct, m) * DAY_MS);
}

/** Tek kanıtla ustalığı günceller; |Δm| ≤ 0.25. */
export function applyEvidence(state: MasteryState, ev: Evidence, now: Date): MasteryState {
  let o = clamp01(ev.score);
  if (ev.hint_used) o = Math.min(o, HINT_CAP);
  const alpha = alphaFor(ev.mode, ev.incidental);
  const score = round3(state.score + alpha * (o - state.score));
  return {
    score,
    n: state.n + 1,
    correct: state.correct + (ev.is_correct ? 1 : 0),
    last_seen_at: now,
    next_review_at: nextReviewAt(now, ev.is_correct, score),
  };
}

export type MasteryBand = "unknown" | "weak" | "developing" | "solid";

/** İlerleme ızgarasının dört rengi. */
export function masteryBand(state: Pick<MasteryState, "n" | "score">): MasteryBand {
  if (state.n === 0) return "unknown";
  if (state.score < 0.45) return "weak";
  if (state.score < 0.7) return "developing";
  return "solid";
}

/**
 * Bir cevaptan ustalık kanıtları: hedef konu (`score` ile) + serbest cevaptaki yan kanıtlar
 * (`GradeResult.evidence`, alpha yarıya). Yan kanıt hedef konuyla aynıysa yok sayılır.
 */
export function evidenceFromAttempt(args: {
  topic_id: string;
  skill: Skill;
  mode: Mode;
  score: number;
  is_correct: boolean;
  hint_used: boolean;
  incidental?: { topic_id: string; correct: boolean }[];
}): Evidence[] {
  const main: Evidence = {
    topic_id: args.topic_id,
    skill: args.skill,
    mode: args.mode,
    score: args.score,
    is_correct: args.is_correct,
    hint_used: args.hint_used,
    incidental: false,
  };
  const seen = new Set([args.topic_id]);
  const extra: Evidence[] = [];
  for (const e of args.incidental ?? []) {
    if (seen.has(e.topic_id)) continue;
    seen.add(e.topic_id);
    extra.push({
      topic_id: e.topic_id,
      skill: args.skill,
      mode: args.mode,
      score: e.correct ? 1 : 0,
      is_correct: e.correct,
      hint_used: false,
      incidental: true,
    });
  }
  return [main, ...extra];
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
