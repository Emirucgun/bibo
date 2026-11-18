import { describe, expect, it } from "vitest";
import { A1_SET, A2_SET, coverage, lemmaCandidates } from "@/lib/content/wordlist";

describe("wordlist", () => {
  it("A2 listesi A1'i kapsar", () => {
    for (const w of A1_SET) expect(A2_SET.has(w)).toBe(true);
    expect(A2_SET.size).toBeGreaterThan(A1_SET.size);
  });

  it("gövdeleme çekimli biçimleri bulur", () => {
    expect(lemmaCandidates("watches")).toContain("watch");
    expect(lemmaCandidates("studied")).toContain("study");
    expect(lemmaCandidates("running")).toContain("run");
    expect(lemmaCandidates("went")).toContain("go");
    expect(lemmaCandidates("bigger")).toContain("big");
  });

  it("A1 metninde kapsama %100; özel adlar ve sayılar sayılmaz", () => {
    expect(coverage("This is Ali. He is from Izmir. He likes music.", "A1").ratio).toBe(1);
    expect(coverage("Elif watches TV every evening at 8.", "A1").ratio).toBe(1);
  });

  it("seviye üstü kelimeler bilinmeyen sayılır; extra listesi kabul edilir", () => {
    const c = coverage("The committee postponed the proposal.", "A2");
    expect(c.unknown).toEqual(["committee", "postponed", "proposal"]);
    expect(coverage("The committee met.", "A2", ["committee"]).ratio).toBe(1);
  });
});
