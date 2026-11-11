import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildSeedSql,
  loadL1Codes,
  loadTopics,
  parseCsv,
} from "../../scripts/lib/seed";

const topics = loadTopics();
const codes = loadL1Codes();
const topicIds = new Set(topics.map((t) => t.id));

describe("parseCsv", () => {
  it("tırnaklı alanları, virgülü ve kaçışlı tırnağı okur", () => {
    const rows = parseCsv('a,b,c\n1,"x, y","say ""hi"""\r\n2,,\n');
    expect(rows).toEqual([
      { a: "1", b: "x, y", c: 'say "hi"' },
      { a: "2", b: "", c: "" },
    ]);
  });

  it("alan sayısı tutmayan satırda hata verir", () => {
    expect(() => parseCsv("a,b\n1,2,3\n")).toThrow(/satır 2/);
  });
});

describe("topics.csv (SPEC Ek A)", () => {
  it("32 konu, benzersiz kimlik ve sıra", () => {
    expect(topics).toHaveLength(32);
    expect(topicIds.size).toBe(32);
    expect(new Set(topics.map((t) => t.sort)).size).toBe(32);
  });

  it("kimlikler g.* (grammar) ya da p.* (pron)", () => {
    for (const t of topics) {
      expect(t.id).toMatch(t.kind === "grammar" ? /^g\.[a-z0-9_]+$/ : /^p\.[a-z0-9_]+$/);
    }
    expect(topics.filter((t) => t.kind === "pron").map((t) => t.id)).toEqual(["p.th", "p.w_v"]);
  });

  it("20 A1 dilbilgisi + 10 A2 dilbilgisi + 2 sesletim", () => {
    const count = (level: string, kind: string) =>
      topics.filter((t) => t.level === level && t.kind === kind).length;
    expect(count("A1", "grammar")).toBe(20);
    expect(count("A2", "grammar")).toBe(10);
    expect(count("A1", "pron")).toBe(2);
  });

  it("önkoşullar var olan konulara işaret eder ve döngü yok", () => {
    const prereqs = new Map(topics.map((t) => [t.id, t.prereqs]));
    for (const t of topics) {
      for (const p of t.prereqs) expect(topicIds, `${t.id} → ${p}`).toContain(p);
    }
    const visiting = new Set<string>();
    const done = new Set<string>();
    const visit = (id: string) => {
      if (done.has(id)) return;
      if (visiting.has(id)) throw new Error(`önkoşul döngüsü: ${id}`);
      visiting.add(id);
      prereqs.get(id)!.forEach(visit);
      visiting.delete(id);
      done.add(id);
    };
    topics.forEach((t) => visit(t.id));
  });

  it("zorunlu metin alanları dolu", () => {
    for (const t of topics) {
      expect(t.title_tr.trim(), t.id).not.toBe("");
      expect(t.title_en.trim(), t.id).not.toBe("");
      expect(t.description_tr.trim(), t.id).not.toBe("");
    }
  });
});

describe("l1_codes.csv (SPEC Ek B)", () => {
  it("24 benzersiz kod: 20 L1.* + 4 GEN.*", () => {
    expect(codes).toHaveLength(24);
    expect(new Set(codes.map((c) => c.code)).size).toBe(24);
    expect(codes.filter((c) => c.code.startsWith("L1.")).length).toBe(20);
    expect(codes.filter((c) => c.code.startsWith("GEN.")).length).toBe(4);
  });

  it("L1.LITERAL dışındaki her L1.* kodunun geçerli bir topic_id'si var", () => {
    for (const c of codes.filter((c) => c.code.startsWith("L1.") && c.code !== "L1.LITERAL")) {
      expect(c.topic_id, c.code).not.toBeNull();
      expect(topicIds, c.code).toContain(c.topic_id);
    }
  });

  it("is_l1 yalnızca L1.* kodlarında true; GEN.* kodlarının konusu yok", () => {
    for (const c of codes) {
      expect(c.is_l1, c.code).toBe(c.code.startsWith("L1."));
      if (c.code.startsWith("GEN.")) expect(c.topic_id, c.code).toBeNull();
    }
  });

  it("her L1.* kodunun kuralı ve yanlış/doğru örneği var", () => {
    for (const c of codes.filter((c) => c.code.startsWith("L1."))) {
      expect(c.rule_tr, c.code).toBeTruthy();
      expect(c.wrong_example, c.code).toBeTruthy();
      expect(c.right_example, c.code).toBeTruthy();
    }
  });
});

describe("supabase/seed.sql", () => {
  it("CSV'lerle eşit (değiştirdiysen: npx tsx scripts/build-seed.ts)", () => {
    const onDisk = readFileSync(new URL("../../supabase/seed.sql", import.meta.url), "utf8");
    expect(onDisk).toBe(buildSeedSql(topics, codes));
  });

  it("tek tırnakları kaçışlar", () => {
    const sql = buildSeedSql(
      [{ ...topics[0], id: "g.x", title_tr: "it's" }],
      [],
    );
    expect(sql).toContain("'it''s'");
  });
});
