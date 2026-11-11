import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AiCallError,
  buildRequestBody,
  createLlmClient,
  extractJson,
  parseUsage,
  toOpenRouterModel,
  type StructuredCall,
} from "@/lib/ai/client";
import { GradeResult } from "@/lib/ai/schemas";

const CALL: StructuredCall<GradeResult> = {
  model: "claude-haiku-5-5",
  effort: "low",
  thinking: "adaptive",
  system: "SYS",
  user: "USER",
  schema: GradeResult,
  schemaName: "grade_result",
  maxTokens: 3000,
  timeoutMs: 20000,
};

const GOOD = {
  is_correct: true,
  score: 1,
  corrected: "He plays.",
  feedback_short_tr: "Harika.",
  explanation_long_tr: "Doğru.",
  errors: [],
  evidence: [{ topic_id: "g.present_simple_3sg", correct: true }],
};

function fakeFetch(status: number, body: unknown, seen: { body?: Record<string, unknown> } = {}) {
  return (async (_url: string, init: RequestInit) => {
    seen.body = JSON.parse(String(init.body));
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

describe("istek gövdesi", () => {
  const body = buildRequestBody(CALL as StructuredCall<unknown>);

  it("temperature / top_p / top_k / ön doldurma yok", () => {
    const json = JSON.stringify(body);
    for (const k of ["temperature", "top_p", "top_k"]) expect(json).not.toContain(k);
    const msgs = body.messages as { role: string }[];
    expect(msgs.map((m) => m.role)).toEqual(["system", "user"]); // assistant prefill yok
  });

  it("sistem komutu önbellek işaretli, effort ve katı şema var", () => {
    expect(body.model).toBe("anthropic/claude-haiku-5.5");
    expect(body.reasoning).toEqual({ effort: "low" });
    expect(body.max_tokens).toBe(3000);
    const sys = (body.messages as { content: { cache_control?: unknown }[] }[])[0].content[0];
    expect(sys.cache_control).toEqual({ type: "ephemeral" });
    const rf = body.response_format as { json_schema: { strict: boolean; schema: Record<string, unknown> } };
    expect(rf.json_schema.strict).toBe(true);
    expect(rf.json_schema.schema.additionalProperties).toBe(false);
    expect(body.provider).toMatchObject({ only: ["anthropic"], data_collection: "deny" });
  });

  it("thinking_grade = disabled → reasoning kapalı", () => {
    const b = buildRequestBody({ ...CALL, thinking: "disabled" } as StructuredCall<unknown>);
    expect(b.reasoning).toEqual({ enabled: false });
  });

  it("lib/ai altındaki hiçbir dosya temperature/top_p/top_k göndermez (kod incelemesi)", () => {
    const dir = new URL("../../lib/ai/", import.meta.url);
    const files = readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith(".ts"));
    for (const f of files) {
      const src = readFileSync(new URL(f.replaceAll("\\", "/"), dir), "utf8")
        .split("\n")
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
        .join("\n");
      expect(src, f).not.toMatch(/\b(temperature|top_p|top_k)\s*:/);
    }
  });
});

describe("model kimliği", () => {
  it("app_settings kimliğini OpenRouter'a çevirir", () => {
    expect(toOpenRouterModel("claude-haiku-5-5")).toBe("anthropic/claude-haiku-5.5");
    expect(toOpenRouterModel("claude-sonnet-5-5")).toBe("anthropic/claude-sonnet-5.5");
    expect(toOpenRouterModel("anthropic/claude-opus-5.5")).toBe("anthropic/claude-opus-5.5");
    expect(() => toOpenRouterModel("gpt")).toThrow();
  });
});

describe("yanıt ayrıştırma", () => {
  it("kullanım: prompt_tokens toplamından önbellek çıkarılır", () => {
    expect(
      parseUsage({
        prompt_tokens: 7000,
        completion_tokens: 8500,
        prompt_tokens_details: { cached_tokens: 6000, cache_write_tokens: 0 },
      }),
    ).toEqual({ input_tokens: 1000, output_tokens: 8500, cache_read_tokens: 6000, cache_write_tokens: 0 });
  });

  it("kod çitini soyar", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJson(' {"a":1} ')).toBe('{"a":1}');
  });

  it("geçerli JSON → ok", async () => {
    const client = createLlmClient({
      apiKey: "k",
      fetch: fakeFetch(200, {
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify(GOOD) } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      }),
    });
    const res = await client.callStructured(CALL);
    expect(res).toMatchObject({ kind: "ok", data: GOOD, usage: { input_tokens: 100, output_tokens: 50 } });
  });

  it("refusal → kind refusal", async () => {
    const client = createLlmClient({
      apiKey: "k",
      fetch: fakeFetch(200, { choices: [{ finish_reason: "stop", native_finish_reason: "refusal", message: { content: "" } }] }),
    });
    expect((await client.callStructured(CALL)).kind).toBe("refusal");
  });

  it("şemaya uymayan çıktı → invalid; sorun listesinde model metni yok", async () => {
    const bad = { ...GOOD, score: 3, feedback_short_tr: "GİZLİ" };
    const client = createLlmClient({
      apiKey: "k",
      fetch: fakeFetch(200, { choices: [{ finish_reason: "stop", message: { content: JSON.stringify(bad) } }] }),
    });
    const res = await client.callStructured(CALL);
    expect(res.kind).toBe("invalid");
    if (res.kind === "invalid") {
      expect(res.issues).toContain("score:too_big(max 1)");
      expect(res.issues).not.toContain("GİZLİ");
      expect(res.raw).toEqual(bad); // kısmi kurtarma için bellekte; loglanmaz
    }
  });

  it("HTTP 429 yeniden denenebilir, 400 değil", async () => {
    const c429 = createLlmClient({ apiKey: "k", fetch: fakeFetch(429, {}) });
    await expect(c429.callStructured(CALL)).rejects.toEqual(new AiCallError("http_429", true));
    const c400 = createLlmClient({ apiKey: "k", fetch: fakeFetch(400, {}) });
    await expect(c400.callStructured(CALL)).rejects.toMatchObject({ code: "http_400", retryable: false });
  });
});
