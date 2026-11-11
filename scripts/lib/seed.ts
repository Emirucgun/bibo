// supabase/seed/*.csv → supabase/seed.sql. İçeriği pedagoji sahibi CSV'de düzenler;
// `npx tsx scripts/build-seed.ts` seed.sql'i yeniden üretir (tests/content/seed.test.ts eşitliği denetler).
import { readFileSync } from "node:fs";

const SEED_DIR = new URL("../../supabase/seed/", import.meta.url);

export interface TopicRow {
  id: string;
  level: "A1" | "A2";
  kind: "grammar" | "pron";
  title_tr: string;
  title_en: string;
  description_tr: string;
  l1_risk: 0 | 1 | 2;
  prereqs: string[];
  sort: number;
  active: boolean;
}

export interface L1CodeRow {
  code: string;
  topic_id: string | null;
  is_l1: boolean;
  name_tr: string;
  rule_tr: string | null;
  wrong_example: string | null;
  right_example: string | null;
}

/** RFC 4180 CSV: çift tırnaklı alanlar, "" kaçışı, alan içinde virgül ve satır sonu. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (quoted) throw new Error("CSV: kapanmamış tırnak");
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => !(r.length === 1 && r[0] === ""));
  const [header, ...body] = nonEmpty;
  if (!header) return [];
  return body.map((r, n) => {
    if (r.length !== header.length) {
      throw new Error(`CSV satır ${n + 2}: ${r.length} alan, başlıkta ${header.length}`);
    }
    return Object.fromEntries(header.map((h, j) => [h, r[j]]));
  });
}

const orNull = (s: string): string | null => (s.trim() === "" ? null : s);

function parseBool(s: string, where: string): boolean {
  if (s === "true") return true;
  if (s === "false") return false;
  throw new Error(`${where}: boolean bekleniyor, '${s}' geldi`);
}

export function readSeedFile(name: string): string {
  return readFileSync(new URL(name, SEED_DIR), "utf8");
}

export function loadTopics(text = readSeedFile("topics.csv")): TopicRow[] {
  return parseCsv(text).map((r) => {
    const l1Risk = Number(r.l1_risk);
    if (![0, 1, 2].includes(l1Risk)) throw new Error(`${r.id}: l1_risk 0–2 olmalı`);
    if (r.level !== "A1" && r.level !== "A2") throw new Error(`${r.id}: level`);
    if (r.kind !== "grammar" && r.kind !== "pron") throw new Error(`${r.id}: kind`);
    return {
      id: r.id,
      level: r.level,
      kind: r.kind,
      title_tr: r.title_tr,
      title_en: r.title_en,
      description_tr: r.description_tr,
      l1_risk: l1Risk as 0 | 1 | 2,
      prereqs: r.prereqs.split(";").map((s) => s.trim()).filter(Boolean),
      sort: Number(r.sort),
      active: parseBool(r.active, `${r.id}.active`),
    };
  });
}

export function loadL1Codes(text = readSeedFile("l1_codes.csv")): L1CodeRow[] {
  return parseCsv(text).map((r) => ({
    code: r.code,
    topic_id: orNull(r.topic_id),
    is_l1: parseBool(r.is_l1, `${r.code}.is_l1`),
    name_tr: r.name_tr,
    rule_tr: orNull(r.rule_tr),
    wrong_example: orNull(r.wrong_example),
    right_example: orNull(r.right_example),
  }));
}

export function loadPlacement(text = readSeedFile("placement.json")) {
  return JSON.parse(text) as {
    version: string;
    status: string;
    items: PlacementItem[];
  };
}

export interface PlacementItem {
  position: number;
  activity_type: string;
  topic_id: string;
  l1_target: string | null;
  payload: {
    instruction_tr: string;
    text_en?: string;
    question_en?: string;
    options?: string[];
    tokens?: string[];
    source_tr?: string;
    prompt_en?: string;
  };
  key: {
    correct?: string;
    accepted?: string[];
    distractors?: { option: string; code: string; feedback_tr: string }[];
    wrong_patterns?: { answer: string; code: string }[];
    target_words?: string[];
    model_answer_en?: string;
    explanation_short_tr: string;
    explanation_long_tr: string;
    hint_tr: string;
  };
}

// --- SQL ---

function lit(v: string | number | boolean | null | string[]): string {
  if (v === null) return "null";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) {
    return v.length === 0 ? "'{}'::text[]" : `array[${v.map(lit).join(", ")}]::text[]`;
  }
  return `'${v.replace(/'/g, "''")}'`;
}

export function buildSeedSql(topics = loadTopics(), codes = loadL1Codes()): string {
  const topicCols = [
    "id", "level", "kind", "title_tr", "title_en", "description_tr",
    "l1_risk", "prereqs", "sort", "active",
  ] as const;
  const codeCols = [
    "code", "topic_id", "is_l1", "name_tr", "rule_tr", "wrong_example", "right_example",
  ] as const;

  const upsert = (
    table: string,
    pk: string,
    cols: readonly string[],
    rows: Record<string, unknown>[],
  ) =>
    [
      `insert into public.${table} (${cols.join(", ")}) values`,
      rows
        .map((r) => `  (${cols.map((c) => lit(r[c] as never)).join(", ")})`)
        .join(",\n"),
      `on conflict (${pk}) do update set`,
      cols
        .filter((c) => c !== pk)
        .map((c) => `  ${c} = excluded.${c}`)
        .join(",\n") + ";",
    ].join("\n");

  return [
    "-- ÜRETİLMİŞ DOSYA, elle düzenlemeyin. Kaynak: supabase/seed/topics.csv, l1_codes.csv",
    "-- Yeniden üret: npx tsx scripts/build-seed.ts",
    "-- Uzak projeye: npx supabase db push --remote --include-seed (upsert; tekrar çalıştırılabilir).",
    "-- placement.json veritabanına yazılmaz; yerleştirme oturumu (M9) dosyadan okur.",
    "",
    "begin;",
    "",
    upsert("topics", "id", topicCols, topics as unknown as Record<string, unknown>[]),
    "",
    upsert("l1_codes", "code", codeCols, codes as unknown as Record<string, unknown>[]),
    "",
    "commit;",
    "",
  ].join("\n");
}
