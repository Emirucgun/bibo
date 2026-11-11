// Claude Haiku 5.5 çağrısı — OpenRouter chat API'si üzerinden (SCOPE günlüğü 11.11.2026, PLAN M5 karar 1).
// Doğrudan Anthropic'e dönülürse yalnızca bu dosya değişir.
//
// Kurallar (.claude/rules/ai-katmani.md, SPEC 5.1):
//   - temperature / top_p / top_k / ön doldurma GÖNDERİLMEZ.
//   - Düşünme derinliği `reasoning.effort`; kapatmak için `reasoning.enabled = false`.
//   - Sistem komutu `cache_control: ephemeral` ile işaretli; öğrenciye özgü kısım user mesajında.
//   - İçerik konumla değil türle okunur: OpenRouter düşünmeyi `message.reasoning`'e ayırır,
//     cevap `message.content`'tedir.
// Bu dosya tek bir HTTP isteği yapar; guard, yeniden deneme ve `llm_usage` `guard.ts`'te.
import type { z } from "zod";
import type { LlmTokenUsage } from "./cost";
import { toStrictJsonSchema } from "./json-schema";
import type { Effort } from "./settings";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface StructuredCall<T> {
  /** `app_settings`'teki kimlik (ör. `claude-haiku-5-5`). */
  model: string;
  effort: Effort;
  thinking: "adaptive" | "disabled";
  system: string;
  user: string;
  schema: z.ZodType<T>;
  schemaName: string;
  maxTokens: number;
  timeoutMs: number;
}

export type StructuredResult<T> =
  | { kind: "ok"; data: T; usage: LlmTokenUsage }
  | { kind: "refusal"; usage: LlmTokenUsage }
  /** JSON ya da şema geçersiz; `issues` yalnızca yol/kod içerir, model metni içermez. */
  | { kind: "invalid"; issues: string; usage: LlmTokenUsage };

export interface LlmClient {
  callStructured<T>(call: StructuredCall<T>): Promise<StructuredResult<T>>;
}

/** HTTP/ağ hatası. `code` loglanabilir kısa bir değerdir (içerik yok). */
export class AiCallError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
  ) {
    super(code);
    this.name = "AiCallError";
  }
}

/** `claude-haiku-5-5` → `anthropic/claude-haiku-5.5`; `/` içeren kimlik olduğu gibi. */
export function toOpenRouterModel(model: string): string {
  if (model.includes("/")) return model;
  const m = /^claude-([a-z]+)-(\d+)-(\d+)$/.exec(model);
  if (m) return `anthropic/claude-${m[1]}-${m[2]}.${m[3]}`;
  throw new Error(`OpenRouter model kimliğine çevrilemedi: ${model}`);
}

export function buildRequestBody(call: StructuredCall<unknown>): Record<string, unknown> {
  return {
    model: toOpenRouterModel(call.model),
    // Yalnızca Anthropic altyapısı (veri işleyen listesi değişmesin), eğitimde kullanım yok,
    // json_schema ve reasoning'i desteklemeyen uç noktaya düşme.
    provider: { only: ["anthropic"], data_collection: "deny", require_parameters: true },
    max_tokens: call.maxTokens,
    reasoning: call.thinking === "disabled" ? { enabled: false } : { effort: call.effort },
    messages: [
      {
        role: "system",
        content: [{ type: "text", text: call.system, cache_control: { type: "ephemeral" } }],
      },
      { role: "user", content: call.user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: call.schemaName, strict: true, schema: toStrictJsonSchema(call.schema) },
    },
  };
}

interface OpenRouterResponse {
  choices?: {
    finish_reason?: string | null;
    native_finish_reason?: string | null;
    message?: { content?: string | null; refusal?: string | null };
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
  };
}

/** OpenRouter `prompt_tokens` toplamdır; Anthropic anlamına çevir (PLAN M5 karar 4). */
export function parseUsage(u: OpenRouterResponse["usage"]): LlmTokenUsage {
  const prompt = u?.prompt_tokens ?? 0;
  const read = u?.prompt_tokens_details?.cached_tokens ?? 0;
  const write = u?.prompt_tokens_details?.cache_write_tokens ?? 0;
  return {
    input_tokens: Math.max(0, prompt - read - write),
    output_tokens: u?.completion_tokens ?? 0,
    cache_read_tokens: read,
    cache_write_tokens: write,
  };
}

export function isRefusal(choice: NonNullable<OpenRouterResponse["choices"]>[number]): boolean {
  return (
    choice.native_finish_reason === "refusal" ||
    choice.finish_reason === "refusal" ||
    choice.finish_reason === "content_filter" ||
    Boolean(choice.message?.refusal)
  );
}

/** Kod çiti (```json … ```) içinde gelirse soy. */
export function extractJson(content: string): string {
  const fenced = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/.exec(content);
  return fenced ? fenced[1] : content.trim();
}

export function parseStructured<T>(
  schema: z.ZodType<T>,
  json: OpenRouterResponse,
): StructuredResult<T> {
  const usage = parseUsage(json.usage);
  const choice = json.choices?.[0];
  if (!choice) return { kind: "invalid", issues: "no_choice", usage };
  if (isRefusal(choice)) return { kind: "refusal", usage };

  const content = choice.message?.content;
  if (!content) return { kind: "invalid", issues: `empty(finish=${choice.finish_reason})`, usage };

  let raw: unknown;
  try {
    raw = JSON.parse(extractJson(content));
  } catch {
    return { kind: "invalid", issues: "json_parse", usage };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".")}:${i.code}`)
      .join(", ");
    return { kind: "invalid", issues, usage };
  }
  return { kind: "ok", data: parsed.data, usage };
}

export interface ClientOptions {
  apiKey?: string;
  fetch?: typeof fetch;
}

export function createLlmClient(opts: ClientOptions = {}): LlmClient {
  const doFetch = opts.fetch ?? fetch;
  return {
    async callStructured<T>(call: StructuredCall<T>): Promise<StructuredResult<T>> {
      const apiKey = opts.apiKey ?? process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new AiCallError("missing_api_key", false);

      let res: Response;
      try {
        res = await doFetch(OPENROUTER_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify(buildRequestBody(call as StructuredCall<unknown>)),
          signal: AbortSignal.timeout(call.timeoutMs),
        });
      } catch (err) {
        const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        throw new AiCallError(timeout ? "timeout" : "network", true);
      }

      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        throw new AiCallError(`http_${res.status}`, retryable);
      }
      return parseStructured(call.schema, (await res.json()) as OpenRouterResponse);
    },
  };
}
