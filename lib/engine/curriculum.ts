// Müfredat motoru (docs/SPEC.md 4.4; docs/arastirma/mufredat-onerisi.md):
// kapsam (açık konular) → sıra (ön koşullar + varsayılan yol) → seçim (hazır konular arasından
// değer, yol, okul ve hedefe göre). L1 riski giriş sırasını değil, tekrar dozunu belirler.
// Saf: öğrenme profili ve zaman parametre olarak gelir.
import {
  cell,
  expectedAccuracy,
  pGlobalAbove,
  productiveMastery,
  topicEvidence,
  topicMastery,
  type LearnerState,
  type ModelContext,
} from "./learner-model";
import type { EngineTopic, Goal, Level, StudyMode } from "./types";

export interface CurriculumConfig {
  /** Ön koşul "hazır" sayılır: beklenen doğru oranı ≥ ready_acc (ya da konu sağlam). */
  ready_acc: number;
  /** Kanıtı az ama büyük olasılıkla biliniyor: beklenen doğru oranı ≥ likely_acc → odak değil, kısa kontrol. */
  likely_acc: number;
  /** Konu "sağlam" sayılır: üretim becerisinde P(ustalık) ≥ solid_p ve okumada ≥ receptive_p. */
  solid_p: number;
  receptive_p: number;
  /** Odak, üretim becerisinde bu olasılığa ulaşınca yeni konu açılabilir. */
  advance_p: number;
  /** Aynı odakla en çok ardışık oturum. */
  max_sessions_per_focus: number;
  /** Aynı anda "çalışılıyor" durumundaki en çok konu. */
  max_learning: number;
  /** "Çalışılıyor": konuda en az bu kadar doğrudan cevap ve sağlam değil. */
  learning_evidence: number;
  /** A1 öğrencisine A2 konuları açılır: P(genel seviye ≥ A1|A2) ≥ a2_open_p. */
  a2_open_p: number;
  a1a2_cut: number;
  weights: { need: number; path: number; value: number; goal: number; exam: number };
}

export const DEFAULT_CURRICULUM_CONFIG: CurriculumConfig = {
  ready_acc: 0.65,
  likely_acc: 0.75,
  solid_p: 0.8,
  receptive_p: 0.6,
  advance_p: 0.6,
  max_sessions_per_focus: 3,
  max_learning: 3,
  learning_evidence: 3,
  a2_open_p: 0.5,
  a1a2_cut: 0,
  weights: { need: 1, path: 1.2, value: 0.6, goal: 0.4, exam: 0.4 },
};

/** sağlam · çalışılıyor · büyük olasılıkla biliniyor (kontrol edilecek) · öğrenmeye hazır · kilitli */
export type TopicStatus = "solid" | "learning" | "likely" | "ready" | "locked";

export interface CurriculumInput {
  ctx: ModelContext;
  state: LearnerState;
  topics: readonly EngineTopic[];
  level_est: Level;
  study_mode: StudyMode;
  goal: Goal | null;
  school_topic_id: string | null;
  focus_choice: string | null;
  recent_focus: readonly (string | null)[];
  config?: CurriculumConfig;
}

const cfgOf = (i: CurriculumInput) => i.config ?? DEFAULT_CURRICULUM_CONFIG;

/** Öğretilebilir konu: aktif dilbilgisi konusu (sesletim ve ölçme konuları odak olmaz). */
export const isTeachable = (t: EngineTopic) => t.active && t.kind === "grammar";

/** Öğrencinin seviyesine açık konular. */
export function openTopics(input: CurriculumInput): EngineTopic[] {
  const cfg = cfgOf(input);
  const a2Open = input.level_est === "A2" || pGlobalAbove(input.state, cfg.a1a2_cut) >= cfg.a2_open_p;
  return input.topics.filter((t) => isTeachable(t) && (t.level === "A1" || (t.level === "A2" && a2Open)));
}

/** Varsayılan yol: ünite, sonra sıra (ön koşul grafiğiyle tutarlı olacak şekilde topolojik). */
export function defaultPath(topics: readonly EngineTopic[]): EngineTopic[] {
  const teach = topics.filter(isTeachable);
  const byId = new Map(teach.map((t) => [t.id, t]));
  const key = (t: EngineTopic) => (t.unit ?? 999) * 10_000 + t.sort;
  const remaining = [...teach].sort((a, b) => key(a) - key(b));
  const out: EngineTopic[] = [];
  const placed = new Set<string>();
  while (remaining.length > 0) {
    const i = remaining.findIndex((t) => t.prereqs.every((p) => placed.has(p) || !byId.has(p)));
    const next = remaining.splice(i >= 0 ? i : 0, 1)[0];
    out.push(next);
    placed.add(next.id);
  }
  return out;
}

/** Konu sağlam mı: üretim becerisinde ≥ solid_p ve tanımada ≥ receptive_p (sesletimde dinleme ≥ solid_p). */
export function isSolid(input: CurriculumInput, topic: EngineTopic): boolean {
  const cfg = cfgOf(input);
  const { ctx, state } = input;
  if (topic.kind === "pron") return topicMastery(ctx, state, topic.id) >= cfg.solid_p;
  const reading = cell(ctx, state, topic.id, "reading")?.p_mastered ?? 0;
  return productiveMastery(ctx, state, topic.id) >= cfg.solid_p && reading >= cfg.receptive_p;
}

export function topicStatus(input: CurriculumInput, topic: EngineTopic): TopicStatus {
  const cfg = cfgOf(input);
  const { ctx, state } = input;
  if (isSolid(input, topic)) return "solid";
  if (topicEvidence(ctx, state, topic.id) >= cfg.learning_evidence) return "learning";
  if (expectedAccuracy(ctx, state, topic.id) >= cfg.likely_acc) return "likely";
  return prereqsReady(input, topic) ? "ready" : "locked";
}

/** Ön koşulların hepsi hazır mı (beklenen doğru oranı ya da sağlamlık). */
export function prereqsReady(input: CurriculumInput, topic: EngineTopic): boolean {
  const cfg = cfgOf(input);
  const { ctx, state } = input;
  const byId = new Map(input.topics.map((t) => [t.id, t]));
  return topic.prereqs.every((p) => {
    const pt = byId.get(p);
    return !pt || !ctx.index.has(p) || expectedAccuracy(ctx, state, p) >= cfg.ready_acc || isSolid(input, pt);
  });
}

export interface Candidate {
  topic: EngineTopic;
  status: TopicStatus;
  score: number;
  mastery: number;
}

/** Hazır ve çalışılan konuların puanı (yüksek = önce). */
export function rankCandidates(input: CurriculumInput): Candidate[] {
  const cfg = cfgOf(input);
  const w = cfg.weights;
  const path = defaultPath(input.topics);
  const rank = new Map(path.map((t, i) => [t.id, i]));
  const N = Math.max(1, path.length - 1);
  const out: Candidate[] = [];
  for (const t of openTopics(input)) {
    const status = topicStatus(input, t);
    if (status === "solid" || status === "locked" || status === "likely") continue;
    // Çalışılan konu da ön koşulları hazır olmadan odak olmaz (tekrar ve sondalardan kanıt birikebilir).
    if (status === "learning" && !prereqsReady(input, t)) continue;
    const mastery = topicMastery(input.ctx, input.state, t.id);
    const examOn = input.study_mode === "school" || input.goal === "exam";
    const score =
      w.need * (1 - mastery) +
      w.path * (1 - (rank.get(t.id) ?? N) / N) +
      w.value * (((t.value ?? 2) - 1) / 2) +
      w.goal * (input.goal && t.goal_tags?.includes(input.goal) ? 1 : 0) +
      w.exam * (examOn ? (t.exam_weight ?? 1) / 2 : 0);
    out.push({ topic: t, status, score, mastery });
  }
  return out.sort((a, b) => b.score - a.score || a.topic.sort - b.topic.sort);
}

/** Eksik ön koşul zincirinde öğrenmeye hazır (ya da çalışılan) ilk konu. */
export function bridgeTarget(input: CurriculumInput, target: EngineTopic, seen = new Set<string>()): EngineTopic | null {
  const cfg = cfgOf(input);
  const byId = new Map(input.topics.map((t) => [t.id, t]));
  const acc = (id: string) => expectedAccuracy(input.ctx, input.state, id);
  const missing = target.prereqs
    .map((p) => byId.get(p))
    .filter((p): p is EngineTopic => !!p && isTeachable(p) && acc(p.id) < cfg.ready_acc && !isSolid(input, p))
    .sort((a, b) => acc(a.id) - acc(b.id));
  for (const p of missing) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    const st = topicStatus(input, p);
    if (st === "ready" || st === "learning") return p;
    const deeper = bridgeTarget(input, p, seen);
    if (deeper) return deeper;
  }
  return null;
}

export interface FocusDecision {
  topic: EngineTopic | null;
  /** Okul konusunun köprüsüyse okul konusu. */
  bridge_for: string | null;
  reason: string;
}

/**
 * Odak seçimi: öğrencinin seçimi → okul konusu (gerekirse köprü) → süren odak (tempo) →
 * çalışılan konu sınırı → en yüksek puanlı hazır konu.
 */
export function chooseFocus(input: CurriculumInput): FocusDecision {
  const cfg = cfgOf(input);
  const byId = new Map(input.topics.map((t) => [t.id, t]));
  const open = new Set(openTopics(input).map((t) => t.id));
  const ranked = rankCandidates(input);

  const choice = input.focus_choice ? byId.get(input.focus_choice) : undefined;
  if (choice && open.has(choice.id) && ranked.some((c) => c.topic.id === choice.id)) {
    return { topic: choice, bridge_for: null, reason: "student choice" };
  }

  const school = input.school_topic_id ? byId.get(input.school_topic_id) : undefined;
  if (school && isTeachable(school)) {
    const st = topicStatus(input, school);
    if (st === "ready" || st === "learning") return { topic: school, bridge_for: null, reason: "school topic" };
    // "likely" ya da "solid": odak değil; planlayıcı kısa kontrol (sonda) koyar.
    if (st === "locked") {
      const bridge = bridgeTarget(input, school);
      if (bridge) return { topic: bridge, bridge_for: school.id, reason: `bridge to school topic ${school.id}` };
    }
  }

  const last = input.recent_focus[0] ? byId.get(input.recent_focus[0]) : undefined;
  if (last && open.has(last.id) && topicStatus(input, last) === "learning") {
    let streak = 0;
    for (const f of input.recent_focus) {
      if (f === last.id) streak++;
      else break;
    }
    const advanced = productiveMastery(input.ctx, input.state, last.id) >= cfg.advance_p;
    if (!advanced && streak < cfg.max_sessions_per_focus) return { topic: last, bridge_for: null, reason: `continue focus (${streak})` };
  }

  const learning = ranked.filter((c) => c.status === "learning");
  if (learning.length >= cfg.max_learning) {
    const pick = [...learning].sort((a, b) => a.mastery - b.mastery || b.score - a.score)[0];
    return { topic: pick.topic, bridge_for: null, reason: "too many topics in progress" };
  }
  const best = ranked.find((c) => c.status === "ready") ?? ranked[0];
  return best ? { topic: best.topic, bridge_for: null, reason: `best candidate ${best.score.toFixed(2)}` } : { topic: null, bridge_for: null, reason: "nothing to learn" };
}

/** Ana sayfadaki "Bugün ne çalışalım?" seçenekleri: en iyi n aday (çalışılan ve hazır). */
export function focusChoices(input: CurriculumInput, n = 3): Candidate[] {
  return rankCandidates(input).slice(0, n);
}

/** Haftalık okul sorusu için öneriler: varsayılan yolda öğrencinin sınırına en yakın konular. */
export function schoolSuggestions(input: CurriculumInput, n = 3): EngineTopic[] {
  const path = defaultPath(input.topics);
  const firstOpen = path.findIndex((t) => topicStatus(input, t) !== "solid");
  const start = Math.max(0, firstOpen);
  return path.slice(start, start + n);
}

/** Konunun "sağlam" olduğu açık konuların oranı (seviye için; sürekli kapı). */
export function solidShare(input: CurriculumInput, level: "A1" | "A2"): number {
  const list = input.topics.filter((t) => isTeachable(t) && t.level === level);
  if (list.length === 0) return 0;
  return list.filter((t) => isSolid(input, t)).length / list.length;
}
