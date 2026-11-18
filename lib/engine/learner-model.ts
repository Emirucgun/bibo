// Öğrenme profili v2 (docs/SPEC.md 4.1): hiyerarşik Bayesçi lojistik model.
//   η = θ_genel + s_beceri + d_konu + e_konu×beceri − b
//   P(doğru) = c + (d − c) · σ(a · η)
// Tüm gizil terimler tek bir Gauss sonsalında (ortalama + kovaryans) tutulur; her cevaptan sonra
// varsayılan yoğunluk filtrelemesiyle (moment eşleme, TrueSkill/Glicko'daki gibi) güncellenir.
// Oturumlar arasında süreç gürültüsü eklenir (unutma). "Kanıt yoksa hüküm yok": bir hücreye
// "çalışılacak" demek için konuda doğrudan kanıt gerekir. Saf: zaman parametre olarak gelir.
import { SKILLS, type Mode, type Skill } from "@/lib/content/activity-types";
import { normalCdf, sigmoid, type IrtParams } from "./irt";

const DAY_MS = 86_400_000;
const K = SKILLS.length;

export interface LearnerModelConfig {
  /** Değişirse durum cevaplardan yeniden kurulur. */
  version: number;
  prior_mu: number;
  prior_sd: number;
  tau_skill: number;
  tau_topic: number;
  tau_cell: number;
  /** Günlük varyans artışı (unutma / değişim). */
  q_global: number;
  q_skill: number;
  q_topic: number;
  q_cell: number;
  /** L1 riski başına konu ve hücre unutma çarpanı: (1 + l1_forgetting × l1_risk). */
  l1_forgetting: number;
  a: number;
  slip_d: number;
  guess: Record<Mode, number>;
  mode_offset: Record<Mode, number>;
  /** "Ustalık": kontrollü bir maddeyi doğru cevaplama olasılığı ≥ mastery_p. */
  mastery_p: number;
  solid_p: number;
  needs_p: number;
  min_topic_evidence: number;
  tight_sd: number;
  /** Konu eksiği: P(konu terimi < −gap_delta) ≥ diag_p. */
  gap_delta: number;
  diag_p: number;
  /** Beceri eksiği: P(beceri + konu×beceri < −skill_gap_delta) ≥ skill_gap_p. */
  skill_gap_delta: number;
  skill_gap_p: number;
  hint_weight: number;
  incidental_weight: number;
  review_p: number;
  min_review_days: number;
  max_review_days: number;
}

export const DEFAULT_LEARNER_MODEL_CONFIG: LearnerModelConfig = {
  version: 1,
  prior_mu: 0.25,
  prior_sd: 1.6,
  tau_skill: 0.5,
  tau_topic: 0.6,
  tau_cell: 0.6,
  q_global: 0.002,
  q_skill: 0.0005,
  q_topic: 0.003,
  q_cell: 0.002,
  l1_forgetting: 0.5,
  a: 1.0,
  slip_d: 0.97,
  guess: { recognition: 0.3, controlled: 0.02, free: 0 },
  mode_offset: { recognition: -0.4, controlled: 0, free: 0.4 },
  mastery_p: 0.8,
  solid_p: 0.8,
  needs_p: 0.2,
  min_topic_evidence: 2,
  tight_sd: 0.6,
  gap_delta: 0.5,
  diag_p: 0.9,
  skill_gap_delta: 0,
  skill_gap_p: 0.9,
  hint_weight: 0.5,
  incidental_weight: 0.5,
  review_p: 0.8,
  min_review_days: 1,
  max_review_days: 30,
};

/** Modelin konu bilgisi: ortak ölçekteki zorluk ve L1 riski. */
export interface ModelTopic {
  id: string;
  b: number;
  l1_risk: number;
  kind: "grammar" | "pron" | "measure";
}

/** Konu zorluğu yoksa varsayılan: A1 −0,75, A2 0,75, B1 2,25, B2 3,75; L1 riski başına +0,25 (risk 1 nötr). */
export function defaultTopicB(level: string, l1Risk: number): number {
  const base = level === "A1" ? -0.75 : level === "A2" ? 0.75 : level === "B1" ? 2.25 : level === "B2" ? 3.75 : 0;
  return base + 0.25 * (l1Risk - 1);
}

export interface ModelContext {
  topics: ModelTopic[];
  index: Map<string, number>;
  config: LearnerModelConfig;
}

export function createContext(topics: readonly ModelTopic[], config: LearnerModelConfig = DEFAULT_LEARNER_MODEL_CONFIG): ModelContext {
  return { topics: [...topics], index: new Map(topics.map((t, i) => [t.id, i])), config };
}

export interface LearnerState {
  version: number;
  topics: string[];
  mu: Float64Array;
  S: Float64Array;
  /** Hücre başına doğrudan kanıt sayısı ve doğru sayısı (T × 4). */
  n: Int32Array;
  correct: Int32Array;
  /** Hücrenin son görülme anı (ms; NaN = hiç). */
  seen: Float64Array;
  /** Son süreç gürültüsü uygulanan an (ms); null = hiç. */
  at: number | null;
}

/** Tek kanıt. `irt` verilirse (yerleştirme maddesi) maddenin kendi parametreleri kullanılır. */
export interface Observation {
  topic_id: string;
  skill: Skill;
  mode: Mode;
  /** 0..1 */
  score: number;
  /** 0..1 kanıt ağırlığı (ipucu, değerlendirme güveni, yan kanıt). */
  weight: number;
  at: Date;
  irt?: IrtParams;
}

const dim = (T: number) => 1 + K + T + T * K;
const skillIdx = (k: number) => 1 + k;
const topicIdx = (t: number) => 1 + K + t;
const cellIdx = (T: number, t: number, k: number) => 1 + K + T + t * K + k;

export function emptyState(ctx: ModelContext, prior?: { mu: number; sd: number }): LearnerState {
  const T = ctx.topics.length;
  const D = dim(T);
  const c = ctx.config;
  const mu = new Float64Array(D);
  const S = new Float64Array(D * D);
  mu[0] = prior?.mu ?? c.prior_mu;
  const sd0 = prior?.sd ?? c.prior_sd;
  S[0] = sd0 * sd0;
  for (let k = 0; k < K; k++) S[skillIdx(k) * D + skillIdx(k)] = c.tau_skill ** 2;
  for (let t = 0; t < T; t++) {
    S[topicIdx(t) * D + topicIdx(t)] = c.tau_topic ** 2;
    for (let k = 0; k < K; k++) S[cellIdx(T, t, k) * D + cellIdx(T, t, k)] = c.tau_cell ** 2;
  }
  return {
    version: c.version,
    topics: ctx.topics.map((t) => t.id),
    mu,
    S,
    n: new Int32Array(T * K),
    correct: new Int32Array(T * K),
    seen: new Float64Array(T * K).fill(Number.NaN),
    at: null,
  };
}

/** Durumun bu bağlamla (sürüm ve konu listesi) uyumlu olup olmadığı. */
export function compatible(ctx: ModelContext, state: LearnerState): boolean {
  return (
    state.version === ctx.config.version &&
    state.topics.length === ctx.topics.length &&
    state.topics.every((id, i) => ctx.topics[i].id === id)
  );
}

function qFor(ctx: ModelContext, i: number): number {
  const T = ctx.topics.length;
  const c = ctx.config;
  if (i === 0) return c.q_global;
  if (i <= K) return c.q_skill;
  const mult = (t: number) => 1 + c.l1_forgetting * ctx.topics[t].l1_risk;
  if (i <= K + T) return c.q_topic * mult(i - 1 - K);
  const t = Math.floor((i - 1 - K - T) / K);
  return c.q_cell * mult(t);
}

/** Süreç gürültüsü: son güncellemeden bu yana geçen gün kadar varyans eklenir. */
export function drift(ctx: ModelContext, state: LearnerState, at: Date): void {
  const now = at.getTime();
  if (state.at === null) {
    state.at = now;
    return;
  }
  const days = (now - state.at) / DAY_MS;
  if (days <= 0) return;
  const D = state.mu.length;
  for (let i = 0; i < D; i++) state.S[i * D + i] += qFor(ctx, i) * days;
  state.at = now;
}

interface Linear {
  idx: number[];
  beta: number;
  p: IrtParams;
}

function linear(ctx: ModelContext, obs: Pick<Observation, "topic_id" | "skill" | "mode" | "irt">): Linear | null {
  const t = ctx.index.get(obs.topic_id);
  const k = SKILLS.indexOf(obs.skill);
  if (t === undefined || k < 0) return null;
  const c = ctx.config;
  const T = ctx.topics.length;
  const p: IrtParams = obs.irt ?? { a: c.a, b: 0, c: c.guess[obs.mode], d: c.slip_d };
  const beta = obs.irt ? obs.irt.b : ctx.topics[t].b + c.mode_offset[obs.mode];
  return { idx: [0, skillIdx(k), topicIdx(t), cellIdx(T, t, k)], beta, p };
}

function moments(state: LearnerState, idx: number[]): { m: number; v: number } {
  const D = state.mu.length;
  let m = 0;
  let v = 0;
  for (const i of idx) {
    m += state.mu[i];
    for (const j of idx) v += state.S[i * D + j];
  }
  return { m, v: Math.max(v, 1e-9) };
}

const QUAD_N = 81;

/** η ~ N(m, v) altında f(η) ağırlıklı integraller (Z, E[η], E[η²]). */
function integrate(m: number, v: number, f: (eta: number) => number): { Z: number; m1: number; m2: number } {
  const sd = Math.sqrt(v);
  let Z = 0;
  let m1 = 0;
  let m2 = 0;
  for (let i = 0; i < QUAD_N; i++) {
    const z = -6 + (12 * i) / (QUAD_N - 1);
    const eta = m + sd * z;
    const w = Math.exp(-0.5 * z * z) * f(eta);
    Z += w;
    m1 += w * eta;
    m2 += w * eta * eta;
  }
  return { Z, m1: m1 / Z, m2: m2 / Z };
}

const pCorrect = (p: IrtParams, eta: number) => p.c + (p.d - p.c) * sigmoid(p.a * eta);

/** Cevaptan önce: modelin doğru cevap olasılığı tahmini (`attempts.pred_p`). */
export function predict(ctx: ModelContext, state: LearnerState, obs: Pick<Observation, "topic_id" | "skill" | "mode" | "irt">): number | null {
  const lin = linear(ctx, obs);
  if (!lin) return null;
  const { m, v } = moments(state, lin.idx);
  // E[P(η)], η ~ N(m − β, v)
  let num = 0;
  let den = 0;
  const sd = Math.sqrt(v);
  for (let i = 0; i < QUAD_N; i++) {
    const z = -6 + (12 * i) / (QUAD_N - 1);
    const w = Math.exp(-0.5 * z * z);
    num += w * pCorrect(lin.p, m - lin.beta + sd * z);
    den += w;
  }
  return num / den;
}

/** Tek kanıtla güncelleme (yerinde). */
export function observe(ctx: ModelContext, state: LearnerState, obs: Observation): void {
  const lin = linear(ctx, obs);
  if (!lin) return;
  drift(ctx, state, obs.at);
  const w = Math.min(1, Math.max(0, obs.weight));
  if (w <= 0) return;
  const s = Math.min(1, Math.max(0, obs.score));
  const D = state.mu.length;
  const { m, v } = moments(state, lin.idx);
  const shift = m - lin.beta;
  const lik = (eta: number) => {
    const P = Math.min(1 - 1e-9, Math.max(1e-9, pCorrect(lin.p, eta)));
    return Math.exp(w * (s * Math.log(P) + (1 - s) * Math.log(1 - P)));
  };
  const r = integrate(shift, v, lik);
  const mNew = r.m1 + lin.beta; // η + β = lineer birleşim
  const vNew = Math.max(1e-9, r.m2 - r.m1 * r.m1);
  // Sw = Σ w_j S[:, j]
  const Sw = new Float64Array(D);
  for (let i = 0; i < D; i++) {
    let acc = 0;
    for (const j of lin.idx) acc += state.S[i * D + j];
    Sw[i] = acc;
  }
  const gain = (mNew - m) / v;
  const shrink = (v - vNew) / (v * v);
  for (let i = 0; i < D; i++) {
    state.mu[i] += Sw[i] * gain;
    if (Sw[i] === 0) continue;
    const row = i * D;
    for (let j = 0; j < D; j++) state.S[row + j] -= Sw[i] * Sw[j] * shrink;
  }
  for (let i = 0; i < D; i++) if (state.S[i * D + i] < 1e-8) state.S[i * D + i] = 1e-8;

  const t = ctx.index.get(obs.topic_id)!;
  const cellNo = t * K + SKILLS.indexOf(obs.skill);
  if (w >= 0.5) {
    state.n[cellNo] += 1;
    if (s >= 0.5) state.correct[cellNo] += 1;
  }
  state.seen[cellNo] = obs.at.getTime();
}

/** Durumu sıfırdan kurar (olay kaynaklı: cevaplar zaman sırasıyla). */
export function replay(ctx: ModelContext, observations: readonly Observation[], prior?: { mu: number; sd: number }): LearnerState {
  const state = emptyState(ctx, prior);
  const sorted = [...observations].sort((a, b) => a.at.getTime() - b.at.getTime());
  for (const o of sorted) observe(ctx, state, o);
  return state;
}

// ---------------------------------------------------------------- okumalar

export interface CellView {
  topic_id: string;
  skill: Skill;
  /** Kontrollü madde için η'nın ortalaması ve standart sapması. */
  mean: number;
  sd: number;
  /** P(kontrollü maddeyi doğru cevaplama olasılığı ≥ mastery_p). */
  p_mastered: number;
  /** P(doğru olasılığı ≤ %50). */
  p_gap: number;
  n: number;
  correct: number;
  last_seen: Date | null;
}

export type CellLabel = "solid" | "developing" | "needs_work" | "unknown";

function etaStar(ctx: ModelContext): number {
  const c = ctx.config;
  const g = c.guess.controlled;
  const x = (c.mastery_p - g) / (c.slip_d - g);
  return Math.log(x / (1 - x)) / c.a;
}

function etaHalf(ctx: ModelContext): number {
  const c = ctx.config;
  const g = c.guess.controlled;
  const x = (0.5 - g) / (c.slip_d - g);
  return Math.log(x / (1 - x)) / c.a;
}

export function cell(ctx: ModelContext, state: LearnerState, topicId: string, skill: Skill): CellView | null {
  const t = ctx.index.get(topicId);
  const k = SKILLS.indexOf(skill);
  if (t === undefined || k < 0) return null;
  const T = ctx.topics.length;
  const { m, v } = moments(state, [0, skillIdx(k), topicIdx(t), cellIdx(T, t, k)]);
  const mean = m - ctx.topics[t].b;
  const sd = Math.sqrt(v);
  const seen = state.seen[t * K + k];
  return {
    topic_id: topicId,
    skill,
    mean,
    sd,
    p_mastered: normalCdf((mean - etaStar(ctx)) / sd),
    p_gap: normalCdf((etaHalf(ctx) - mean) / sd),
    n: state.n[t * K + k],
    correct: state.correct[t * K + k],
    last_seen: Number.isNaN(seen) ? null : new Date(seen),
  };
}

/** Konudaki toplam doğrudan kanıt (tüm beceriler). */
export function topicEvidence(ctx: ModelContext, state: LearnerState, topicId: string): number {
  const t = ctx.index.get(topicId);
  if (t === undefined) return 0;
  let n = 0;
  for (let k = 0; k < K; k++) n += state.n[t * K + k];
  return n;
}

/**
 * Izgara etiketi: "kanıt yoksa hüküm yok". Zayıf için konuda en az `min_topic_evidence` cevap;
 * gelişiyor için dar sonsal ya da hücrede en az `min_topic_evidence` doğrudan cevap.
 */
export function cellLabel(ctx: ModelContext, state: LearnerState, view: CellView): CellLabel {
  const c = ctx.config;
  if (view.p_mastered >= c.solid_p) return "solid";
  if (view.p_mastered <= c.needs_p && topicEvidence(ctx, state, view.topic_id) >= c.min_topic_evidence) return "needs_work";
  // Doğrudan kanıtı olan hücre "bilinmiyor" görünmez: öğrenci cevap verdi, durum gelişiyor.
  if (view.sd <= c.tight_sd || view.n >= c.min_topic_evidence) return "developing";
  return "unknown";
}

/** Konu düzeyinde ustalık: dilbilgisinde min(okuma, max(yazma, konuşma)); sesletimde dinleme. */
export function topicMastery(ctx: ModelContext, state: LearnerState, topicId: string): number {
  const t = ctx.topics[ctx.index.get(topicId) ?? -1];
  if (!t) return 0;
  const p = (s: Skill) => cell(ctx, state, topicId, s)?.p_mastered ?? 0;
  if (t.kind === "pron") return p("listening");
  return Math.min(p("reading"), Math.max(p("writing"), p("speaking")));
}

/** Konuda kontrollü bir yazma maddesinin beklenen doğru cevaplanma olasılığı (ön koşul hazırlığı). */
export function expectedAccuracy(ctx: ModelContext, state: LearnerState, topicId: string): number {
  const t = ctx.topics[ctx.index.get(topicId) ?? -1];
  if (!t) return 0;
  const skill: Skill = t.kind === "pron" ? "listening" : "writing";
  const mode: Mode = t.kind === "pron" ? "recognition" : "controlled";
  return predict(ctx, state, { topic_id: topicId, skill, mode }) ?? 0;
}

/** Üretim becerisindeki (yazma/konuşma) en iyi ustalık olasılığı. */
export function productiveMastery(ctx: ModelContext, state: LearnerState, topicId: string): number {
  const p = (s: Skill) => cell(ctx, state, topicId, s)?.p_mastered ?? 0;
  return Math.max(p("writing"), p("speaking"));
}

/** P(genel seviye ≥ kesim). */
export function pGlobalAbove(state: LearnerState, cut: number): number {
  return normalCdf((state.mu[0] - cut) / Math.sqrt(state.S[0]));
}

export function globalLevel(state: LearnerState): { mean: number; sd: number } {
  return { mean: state.mu[0], sd: Math.sqrt(state.S[0]) };
}

/** P(konu terimi < −δ): konu, öğrencinin genel seviyesinden beklenenden belirgin biçimde zayıf. */
export function pTopicGap(ctx: ModelContext, state: LearnerState, topicId: string): number {
  const t = ctx.index.get(topicId);
  if (t === undefined) return 0;
  const D = state.mu.length;
  const i = topicIdx(t);
  return normalCdf((-ctx.config.gap_delta - state.mu[i]) / Math.sqrt(state.S[i * D + i]));
}

/** P(konu×beceri terimi < −δ): konu bu beceride belirgin biçimde zayıf. */
export function pCellGap(ctx: ModelContext, state: LearnerState, topicId: string, skill: Skill): number {
  const t = ctx.index.get(topicId);
  const k = SKILLS.indexOf(skill);
  if (t === undefined || k < 0) return 0;
  const D = state.mu.length;
  const i = cellIdx(ctx.topics.length, t, k);
  return normalCdf((-ctx.config.gap_delta - state.mu[i]) / Math.sqrt(state.S[i * D + i]));
}

/**
 * P(beceri + konu×beceri < −δ): bu konu bu beceride, öğrencinin genel seviyesinden ve konuyu bilme
 * düzeyinden beklenenden belirgin biçimde zayıf ("konuyu biliyor ama bu beceride kullanamıyor").
 * Becerinin genel zayıflığı da bu teşhise dahildir.
 */
export function pSkillGap(ctx: ModelContext, state: LearnerState, topicId: string, skill: Skill): number {
  const t = ctx.index.get(topicId);
  const k = SKILLS.indexOf(skill);
  if (t === undefined || k < 0) return 0;
  const { m, v } = moments(state, [skillIdx(k), cellIdx(ctx.topics.length, t, k)]);
  return normalCdf((-ctx.config.skill_gap_delta - m) / Math.sqrt(v));
}

/**
 * Tekrar zamanı: kanıtı olan hücrede, unutma varyansıyla P(ustalık) review_p'nin altına düşene kadar
 * geçecek gün (min..max). Zaten altındaysa 0 (vadesi gelmiş).
 */
export function reviewInDays(ctx: ModelContext, state: LearnerState, topicId: string, skill: Skill): number | null {
  const v = cell(ctx, state, topicId, skill);
  if (!v || v.n === 0) return null;
  const c = ctx.config;
  const z = 0.8416; // Φ⁻¹(0,8)
  const margin = v.mean - etaStar(ctx);
  if (margin <= z * v.sd) return 0;
  const t = ctx.index.get(topicId)!;
  const T = ctx.topics.length;
  const k = SKILLS.indexOf(skill);
  const q = [0, skillIdx(k), topicIdx(t), cellIdx(T, t, k)].reduce((acc, i) => acc + qFor(ctx, i), 0);
  const days = ((margin / z) ** 2 - v.sd ** 2) / q;
  return Math.min(c.max_review_days, Math.max(c.min_review_days, days));
}

// ---------------------------------------------------------------- serileştirme

export interface SerializedState {
  v: number;
  topics: string[];
  mu: number[];
  /** Kovaryansın üst üçgeni (köşegen dahil), float32, base64. */
  s: string;
  n: number[];
  c: number[];
  seen: (number | null)[];
  at: number | null;
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function serialize(state: LearnerState): SerializedState {
  const D = state.mu.length;
  const tri = new Float32Array((D * (D + 1)) / 2);
  let k = 0;
  for (let i = 0; i < D; i++) for (let j = i; j < D; j++) tri[k++] = state.S[i * D + j];
  return {
    v: state.version,
    topics: state.topics,
    mu: Array.from(state.mu, (x) => Math.round(x * 1e5) / 1e5),
    s: toBase64(new Uint8Array(tri.buffer)),
    n: Array.from(state.n),
    c: Array.from(state.correct),
    seen: Array.from(state.seen, (x) => (Number.isNaN(x) ? null : x)),
    at: state.at,
  };
}

export function deserialize(data: SerializedState): LearnerState | null {
  try {
    const D = data.mu.length;
    const bytes = fromBase64(data.s);
    const tri = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    if (tri.length !== (D * (D + 1)) / 2) return null;
    const S = new Float64Array(D * D);
    let k = 0;
    for (let i = 0; i < D; i++)
      for (let j = i; j < D; j++) {
        S[i * D + j] = tri[k];
        S[j * D + i] = tri[k];
        k++;
      }
    return {
      version: data.v,
      topics: data.topics,
      mu: Float64Array.from(data.mu),
      S,
      n: Int32Array.from(data.n),
      correct: Int32Array.from(data.c),
      seen: Float64Array.from(data.seen, (x) => (x === null ? Number.NaN : x)),
      at: data.at,
    };
  } catch {
    return null;
  }
}
