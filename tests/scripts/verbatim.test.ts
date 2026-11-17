import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { errorKept, normalizeWords, VerbatimManifest } from "../../scripts/lib/verbatim";

describe("eval-verbatim yardımcıları", () => {
  it("örnek kayıt listesi şemadan geçer", () => {
    const raw = JSON.parse(readFileSync("scripts/data/verbatim/manifest.example.json", "utf8"));
    expect(VerbatimManifest.parse(raw)).toHaveLength(3);
  });

  it("hata korunması: yanlış biçim var, düzeltilmiş biçim yok", () => {
    const e = { expect: "she play football", not: "she plays football" };
    expect(errorKept("She play football every day.", e)).toBe(true);
    expect(errorKept("She plays football every day.", e)).toBe(false);
    expect(errorKept("Uh, she, she play football, every day", { expect: "she play football", not: "she plays" })).toBe(true);
    const missing = { expect: "is teacher", not: "is a teacher" };
    expect(errorKept("My brother is teacher.", missing)).toBe(true);
    expect(errorKept("My brother is a teacher.", missing)).toBe(false);
  });

  it("kelime sınırı: 'play' 'player' içinde bulunmaz", () => {
    expect(errorKept("She is a player", { expect: "play", not: "plays" })).toBe(false);
    expect(normalizeWords("It’s OK!")).toBe(" it's ok ");
  });
});
