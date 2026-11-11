import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACTIVITY_TYPE_INFO,
  ACTIVITY_TYPES,
  MODES,
  PURPOSES,
  ROLES,
  SKILLS,
} from "@/lib/content/activity-types";
import { INTERESTS, INTEREST_LABELS_TR, isInterest } from "@/lib/content/interests";

const migrationsDir = new URL("../../supabase/migrations/", import.meta.url);
const sql = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(new URL(f, migrationsDir), "utf8"))
  .join("\n");

/** Tablonun `create table` bloğundaki `<column> in ('a', 'b', ...)` değer listesi. */
function checkList(table: string, column: string): string[] {
  const block = sql.match(new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`));
  if (!block) throw new Error(`tablo bulunamadı: ${table}`);
  const m = block[1].match(new RegExp(`\\b${column}\\s+in\\s*\\(([^)]*)\\)`));
  if (!m) throw new Error(`check kısıtı bulunamadı: ${table}.${column}`);
  return [...m[1].matchAll(/'([^']*)'/g)].map((v) => v[1]);
}

describe("sabit kümeler ↔ veritabanı check kısıtları", () => {
  it.each([
    ["items", "skill", SKILLS],
    ["error_events", "skill", SKILLS],
    ["mastery", "skill", SKILLS],
    ["diagnoses", "weak_skill", SKILLS],
    ["items", "mode", MODES],
    ["error_events", "mode", MODES],
    ["items", "activity_type", ACTIVITY_TYPES],
    ["error_events", "activity_type", ACTIVITY_TYPES],
    ["activity_stats", "activity_type", ACTIVITY_TYPES],
    ["diagnoses", "weak_activity", ACTIVITY_TYPES],
    ["items", "purpose", PURPOSES],
    ["profiles", "role", ROLES],
    ["items", "interest", INTERESTS],
  ] as const)("%s.%s", (table, column, values) => {
    expect(checkList(table, column)).toEqual([...values]);
  });
});

describe("etkinlik türleri (SPEC Bölüm 3 tablosu)", () => {
  it("her tür için beceri, mod, değerlendirme ve süre", () => {
    expect(Object.keys(ACTIVITY_TYPE_INFO)).toEqual([...ACTIVITY_TYPES]);
    expect(ACTIVITY_TYPE_INFO.speak_answer).toEqual({
      skill: "speaking", mode: "free", grading: "llm_audio", est_seconds: 120,
    });
    expect(ACTIVITY_TYPE_INFO.listen_choose.skill).toBe("listening");
    expect(ACTIVITY_TYPE_INFO.dictation.mode).toBe("controlled");
  });

  it("dört becerinin her biri en az bir türle ölçülür", () => {
    const skills = new Set(Object.values(ACTIVITY_TYPE_INFO).map((i) => i.skill));
    expect(skills).toEqual(new Set(SKILLS));
  });
});

describe("ilgi alanları", () => {
  it("12 seçenek, hepsinin Türkçe etiketi var", () => {
    expect(INTERESTS).toHaveLength(12);
    expect(Object.keys(INTEREST_LABELS_TR)).toEqual([...INTERESTS]);
    expect(isInterest("football")).toBe(true);
    expect(isInterest("chess")).toBe(false);
  });
});
