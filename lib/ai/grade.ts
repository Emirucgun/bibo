// Serbest cevap değerlendirme (docs/SPEC.md 5.1): `translate_tr_en`, `short_write` ve
// `speak_answer` transkripti. Guard ve `llm_usage` `guardedLlmCall` içinde.
import type { StructuredCall } from "./client";
import { guardedLlmCall, type AiDeps, type CallContext } from "./guard";
import { buildGradeUser, GRADE_SYSTEM, type GradeUserInput } from "./prompts/grade";
import { GradeResult } from "./schemas";
import type { AiSettings } from "./settings";

/** SPEC 5.1: değerlendirmede `max_tokens` 3.000 (düşünme dahil), zaman aşımı 20 sn. */
export const GRADE_MAX_TOKENS = 3_000;
export const GRADE_TIMEOUT_MS = 20_000;

/** Öğrenciye gösterilen mesaj (refusal ya da geçersiz çıktı); ustalık güncellenmez. */
export const GRADE_UNAVAILABLE_TR = "Bu cevabı şu an değerlendiremedik";

export type GradeOutcome =
  | { kind: "ok"; result: GradeResult }
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

export async function gradeFreeAnswer(
  deps: AiDeps,
  ctx: Omit<CallContext, "purpose"> & { purpose?: "grade" | "placement" },
  input: GradeUserInput,
): Promise<GradeOutcome> {
  const callCtx: CallContext = { ...ctx, purpose: ctx.purpose ?? "grade" };
  const build = buildGradeCall(input);
  let reason: "refusal" | "invalid_output" = "invalid_output";
  // Refusal tekrar denenmez; geçersiz çıktı bir kez daha denenir.
  for (let i = 0; i < 2; i++) {
    const res = await guardedLlmCall(deps, callCtx, (s) => s.model_grade, build);
    if (res.kind === "ok") return { kind: "ok", result: res.data };
    if (res.kind === "refusal") return { kind: "unavailable", reason: "refusal" };
    reason = "invalid_output";
  }
  return { kind: "unavailable", reason };
}
