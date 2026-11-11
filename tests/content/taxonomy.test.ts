import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildTaxonomyTs, loadL1Codes, loadTopics } from "../../scripts/lib/seed";
import { L1_CODE_IDS, L1_CODES, TOPIC_IDS, TOPICS } from "@/lib/content/taxonomy";

describe("lib/content/taxonomy.ts", () => {
  it("CSV'lerle eşit (değiştirdiysen: npx tsx scripts/build-seed.ts)", () => {
    const onDisk = readFileSync(new URL("../../lib/content/taxonomy.ts", import.meta.url), "utf8");
    expect(onDisk).toBe(buildTaxonomyTs(loadTopics(), loadL1Codes()));
  });

  it("32 konu ve 24 kod; kimlik listeleri satırlarla aynı sırada", () => {
    expect(TOPIC_IDS).toHaveLength(32);
    expect(L1_CODE_IDS).toHaveLength(24);
    expect(TOPICS.map((t) => t.id)).toEqual([...TOPIC_IDS]);
    expect(L1_CODES.map((c) => c.code)).toEqual([...L1_CODE_IDS]);
  });
});
