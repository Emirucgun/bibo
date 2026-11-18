// Serbest cevap değerlendirme (docs/SPEC.md 5.1): `translate_tr_en`, `short_write` ve
// `speak_answer` transkripti. Guard ve `llm_usage` `guardedLlmCall` içinde.
import type { StructuredCall } from "./client";
import { guardedLlmCall, type AiDeps, type CallContext } from "./guard";
import { buildGradeUser, GRADE_SYSTEM, type GradeUserInput } from "./prompts/grade";
import { voteGrades } from "./grade-vote";
import { GradeResult } from "./schemas";
import type { AiSettings } from "./settings";

/** SPEC 5.1: değerlendirmede `max_tokens` 3.000 (düşünme dahil), zaman aşımı 20 sn. */
export const GRADE_MAX_TOKENS = 3_000;
export const GRADE_TIMEOUT_MS = 20_000;

/** Öğrenciye gösterilen mesaj (refusal ya da geçersiz çıktı); ustalık güncellenmez. */
export const GRADE_UNAVAILABLE_TR = "Bu cevabı şu an değerlendiremedik";

export type GradeOutcome =
  /** `confidence`: kanıt ağırlığı çarpanı (örnek uyumu × modelin güveni); `samples`: geçerli örnek sayısı. */
  | { kind: "ok"; result: GradeResult; confidence: number; samples: number }
  /** Model reddetti ya da iki denemede de geçersiz çıktı: ustalık güncellenmez (SPEC 5.1). */
  | { kind: "unavailable"; reason: "refusal" | "invalid_output" };

export function buildGradeCall(input: GradeUserInput) {
  const user = buildGradeUser(input);
  return (settings: AiSettings, model: string): StructuredCall<GradeResult> => ({
    model,
    effort: settings.effort_grade,
    thinking: settings.thinking_grade,
    system: GRADE_SYSTEM,
    user,
    schema: GradeResult,
    schemaName: "grade_result",
    maxTokens: GRADE_MAX_TOKENS,
    timeoutMs: GRADE_TIMEOUT_MS,
  });
}

type SampleOutcome = { kind: "ok"; result: GradeResult } | { kind: "unavailable"; reason: "refusal" | "invalid_output" };

async function gradeOnce(deps: AiDeps, callCtx: CallContext, build: ReturnType<typeof buildGradeCall>): Promise<SampleOutcome> {
  // Refusal tekrar denenmez; geçersiz çıktı bir kez daha denenir.
  for (let i = 0; i < 2; i++) {
    const res = await guardedLlmCall(deps, callCtx, (s) => s.model_grade, build);
    if (res.kind === "ok") return { kind: "ok", result: res.data };
    if (res.kind === "refusal") return { kind: "unavailable", reason: "refusal" };
  }
  return { kind: "unavailable", reason: "invalid_output" };
}

/**
 * `samples` bağımsız değerlendirme paralel istenir (her biri guard → çağrı → `llm_usage`) ve çoğunluk
 * oyuyla birleştirilir (`app_settings.grade_samples`, karar 11). Hiçbiri geçerli değilse değerlendirilemedi.
 * Guard reddi ya da sağlayıcı hatası fırlatılır (çağıran oturumu kırmadan ele alır).
 */
export async function gradeFreeAnswer(
  deps: AiDeps,
  ctx: Omit<CallContext, "purpose"> & { purpose?: "grade" | "placement" },
  input: GradeUserInput,
  samples = 1,
): Promise<GradeOutcome> {
  const callCtx: CallContext = { ...ctx, purpose: ctx.purpose ?? "grade" };
  const build = buildGradeCall(input);
  const n = Math.max(1, Math.min(5, Math.floor(samples)));
  const settled = await Promise.allSettled(Array.from({ length: n }, () => gradeOnce(deps, callCtx, build)));
  const ok = settled.flatMap((r) => (r.status === "fulfilled" && r.value.kind === "ok" ? [r.value.result] : []));
  if (ok.length === 0) {
    const firstError = settled.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (firstError) throw firstError.reason;
    const refused = settled.some((r) => r.status === "fulfilled" && r.value.kind === "unavailable" && r.value.reason === "refusal");
    return { kind: "unavailable", reason: refused ? "refusal" : "invalid_output" };
  }
  const voted = voteGrades(ok);
  return { kind: "ok", result: voted.result, confidence: voted.confidence, samples: voted.samples };
}
