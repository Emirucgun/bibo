// Zod → katı (strict) JSON şeması. Anthropic'in yapılandırılmış çıktısı uzunluk ve sayı
// sınırlarını desteklemez; bunlar alanın açıklamasına taşınır (SPEC 5.2 notları).
// Cevap geldikten sonra aynı Zod şemasıyla yeniden doğrulanır, sınırlar orada uygulanır.
import { z } from "zod";

type Json = Record<string, unknown>;

/** Şemadan çıkarılıp açıklamaya taşınan anahtar sözcükler. */
const MOVED: Record<string, (v: number) => string> = {
  maxLength: (v) => `at most ${v} characters`,
  minLength: (v) => `at least ${v} characters`,
  maxItems: (v) => `at most ${v} items`,
  minimum: (v) => `minimum ${v}`,
  maximum: (v) => `maximum ${v}`,
  exclusiveMinimum: (v) => `greater than ${v}`,
  exclusiveMaximum: (v) => `less than ${v}`,
};

/** Desteklenmeyen anahtar sözcükler (açıklamaya taşınacak anlamı yok). */
const DROPPED = new Set(["$schema", "pattern", "format", "multipleOf"]);

function transform(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(transform);
  if (node === null || typeof node !== "object") return node;

  const src = node as Json;
  const out: Json = {};
  const notes: string[] = [];

  for (const [k, v] of Object.entries(src)) {
    if (DROPPED.has(k)) continue;
    if (k in MOVED && typeof v === "number") {
      notes.push(MOVED[k](v));
      continue;
    }
    // minItems yalnızca 0 ve 1 destekleniyor.
    if (k === "minItems" && typeof v === "number" && v > 1) {
      notes.push(`at least ${v} items`);
      out.minItems = 1;
      continue;
    }
    out[k] = transform(v);
  }

  if (out.type === "object") out.additionalProperties = false;
  if (notes.length > 0) {
    const base = typeof out.description === "string" ? `${out.description} ` : "";
    out.description = `${base}(${notes.join(", ")})`;
  }
  return out;
}

export function toStrictJsonSchema(schema: z.ZodType): Json {
  return transform(z.toJSONSchema(schema, { target: "draft-2020-12" })) as Json;
}
