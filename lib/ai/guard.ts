// Maliyet koruması (docs/SPEC.md 5.4). Her yapay zekâ, transkript ve TTS çağrısı
// `withAiCall()` içinden geçer: guard → çağrı → `llm_usage` satırı → `sessions.cost_usd`.
// Guard'ı atlayan yol yok.
import { AiCallError, type LlmClient, type StructuredCall, type StructuredResult } from "./client";
import { llmCostUsd, type LlmTokenUsage } from "./cost";
import type { AiSettings } from "./settings";
import type { AiStore, LlmUsageRow, UsagePurpose } from "./store";

export type GuardCode = "kill_switch" | "budget" | "daily_limit";

export class GuardError extends Error {
  constructor(public readonly code: GuardCode) {
    super(code);
    this.name = "GuardError";
  }
}

export interface GuardState {
  settings: AiSettings;
  /** Ay içi `sum(llm_usage.cost_usd)`. */
  monthCostUsd: number;
  /** Öğrencinin bugün başlattığı günlük oturum sayısı; yalnızca üretimde gerekli. */
  sessionsStartedToday: number | null;
}

/** SPEC 5.4 sırası: acil durdurma → aylık tavan (+ seslendirme plan ücreti) → günlük sınır (üretim). */
export function evaluateGuard(
  state: GuardState,
  purpose: UsagePurpose,
): { ok: true } | { ok: false; code: GuardCode } {
  const s = state.settings;
  if (s.kill_switch) return { ok: false, code: "kill_switch" };
  if (state.monthCostUsd + s.tts_plan_usd >= s.monthly_budget_usd) return { ok: false, code: "budget" };
  if (
    purpose === "generate" &&
    state.sessionsStartedToday !== null &&
    state.sessionsStartedToday >= s.daily_session_limit
  ) {
    return { ok: false, code: "daily_limit" };
  }
  return { ok: true };
}

const DAY_MS = 86_400_000;
/** Türkiye UTC+3, yaz saati yok (2016'dan beri). */
const ISTANBUL_OFFSET_MS = 3 * 3_600_000;

/** Europe/Istanbul gününün başlangıcı (UTC zamanı olarak). */
export function istanbulDayStart(now: Date): Date {
  const local = now.getTime() + ISTANBUL_OFFSET_MS;
  return new Date(Math.floor(local / DAY_MS) * DAY_MS - ISTANBUL_OFFSET_MS);
}

/** Faturalama ayı: UTC ayının başlangıcı. */
export function utcMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface CallContext {
  purpose: UsagePurpose;
  userId: string | null;
  sessionId: string | null;
  now: Date;
}

export async function loadGuardState(store: AiStore, ctx: CallContext): Promise<GuardState> {
  const settings = await store.loadSettings();
  const monthCostUsd = await store.costSince(utcMonthStart(ctx.now));
  const sessionsStartedToday =
    ctx.purpose === "generate" && ctx.userId
      ? await store.sessionsStartedSince(ctx.userId, istanbulDayStart(ctx.now))
      : null;
  return { settings, monthCostUsd, sessionsStartedToday };
}

/** Guard'ı uygular; reddedilirse `GuardError` atar. Ayarları döner (çağrı için gerekli). */
export async function assertGuard(store: AiStore, ctx: CallContext): Promise<AiSettings> {
  const state = await loadGuardState(store, ctx);
  const decision = evaluateGuard(state, ctx.purpose);
  if (!decision.ok) throw new GuardError(decision.code);
  return state.settings;
}

/** Bir çağrının ölçümü: sayılar ve kısa sonuç kodu. */
export interface CallMetrics {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  audio_seconds?: number | null;
  tts_chars?: number | null;
  cost_usd: number;
  ok: boolean;
  /** Kısa kod (ör. `refusal`, `invalid_output`); içerik değil. */
  error?: string | null;
}

export interface CallSpec<T> {
  provider: string;
  /** Model kimliği ayardan seçilir (ör. `s.model_generate`). */
  model: (settings: AiSettings) => string;
  /** Ayarlar guard'dan geçtikten sonra gelir. */
  run: (settings: AiSettings) => Promise<{ value: T; metrics: CallMetrics }>;
}

export interface WithAiCallOptions {
  /** Ağ hatası, zaman aşımı, 429/5xx'te yeniden deneme sayısı (SPEC 5.1: bir kez). */
  retries?: number;
  clock?: () => number;
}

/**
 * guard → çağrı → `llm_usage`. Yeniden denenebilir `AiCallError`'da bir kez daha dener;
 * her deneme kendi guard kontrolünü ve `llm_usage` satırını alır.
 */
export async function withAiCall<T>(
  store: AiStore,
  ctx: CallContext,
  spec: CallSpec<T>,
  opts: WithAiCallOptions = {},
): Promise<T> {
  const retries = opts.retries ?? 1;
  const clock = opts.clock ?? (() => performance.now());

  for (let attempt = 0; ; attempt++) {
    const settings = await assertGuard(store, ctx);
    const model = spec.model(settings);
    const t0 = clock();
    try {
      const { value, metrics } = await spec.run(settings);
      await record(store, ctx, spec.provider, model, metrics, Math.round(clock() - t0));
      return value;
    } catch (err) {
      const code = err instanceof AiCallError ? err.code : "exception";
      await record(store, ctx, spec.provider, model, { cost_usd: 0, ok: false, error: code }, Math.round(clock() - t0));
      const retryable = err instanceof AiCallError && err.retryable;
      if (!retryable || attempt >= retries) throw err;
    }
  }
}

async function record(
  store: AiStore,
  ctx: CallContext,
  provider: string,
  model: string,
  m: CallMetrics,
  latencyMs: number,
): Promise<void> {
  const row: LlmUsageRow = {
    user_id: ctx.userId,
    session_id: ctx.sessionId,
    purpose: ctx.purpose,
    provider,
    model,
    input_tokens: m.input_tokens ?? null,
    output_tokens: m.output_tokens ?? null,
    cache_read_tokens: m.cache_read_tokens ?? 0,
    cache_write_tokens: m.cache_write_tokens ?? 0,
    audio_seconds: m.audio_seconds ?? null,
    tts_chars: m.tts_chars ?? null,
    cost_usd: m.cost_usd,
    latency_ms: Math.max(0, latencyMs),
    ok: m.ok,
    error: m.error ?? null,
  };
  await store.insertUsage(row);
  if (ctx.sessionId && m.cost_usd > 0) await store.addSessionCost(ctx.sessionId, m.cost_usd);
}

/** `llm_usage.provider` (PLAN M5 karar 3). */
export const LLM_PROVIDER = "openrouter";

export interface AiDeps {
  store: AiStore;
  llm: LlmClient;
  clock?: () => number;
}

/** Yapılandırılmış dil modeli çağrısı; guard ve `llm_usage` dahil. */
export async function guardedLlmCall<T>(
  deps: AiDeps,
  ctx: CallContext,
  pickModel: (settings: AiSettings) => string,
  build: (settings: AiSettings, model: string) => StructuredCall<T>,
): Promise<StructuredResult<T>> {
  return withAiCall(
    deps.store,
    ctx,
    {
      provider: LLM_PROVIDER,
      model: pickModel,
      run: async (settings) => {
        const model = pickModel(settings);
        const result = await deps.llm.callStructured(build(settings, model));
        return { value: result, metrics: llmMetrics(model, result.usage, result.kind) };
      },
    },
    { clock: deps.clock },
  );
}

function llmMetrics(model: string, u: LlmTokenUsage, kind: StructuredResult<unknown>["kind"]): CallMetrics {
  return {
    ...u,
    cost_usd: llmCostUsd(model, u),
    ok: kind === "ok",
    error: kind === "ok" ? null : kind === "refusal" ? "refusal" : "invalid_output",
  };
}
