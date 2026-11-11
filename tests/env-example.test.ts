import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// docs/SPEC.md Bölüm 9 (11.11.2026: Anthropic + Azure anahtarları yerine OPENROUTER_API_KEY)
const EXPECTED_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "OPENROUTER_API_KEY",
  "SPEECHIFY_API_KEY",
  "CRON_SECRET",
  "APP_URL",
  "CONSENT_VERSION",
];

const PUBLIC_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
];

const entries = readFileSync(new URL("../.env.example", import.meta.url), "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line !== "" && !line.startsWith("#"))
  .map((line) => {
    const eq = line.indexOf("=");
    return { key: line.slice(0, eq), value: line.slice(eq + 1) };
  });

describe(".env.example", () => {
  it("SPEC Bölüm 9'daki değişkenleri tam olarak içerir", () => {
    expect(entries.map((e) => e.key).sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  it("hiçbir değer içermez", () => {
    expect(entries.filter((e) => e.value !== "")).toEqual([]);
  });

  it("NEXT_PUBLIC_ öneki yalnızca Supabase URL'si ve yayınlanabilir anahtardadır", () => {
    const publicKeys = entries
      .map((e) => e.key)
      .filter((key) => key.startsWith("NEXT_PUBLIC_"));
    expect(publicKeys.sort()).toEqual([...PUBLIC_KEYS].sort());
  });
});
