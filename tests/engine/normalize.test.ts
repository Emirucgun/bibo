import { describe, expect, it } from "vitest";
import { answersMatch, normalizeAnswer, tokenizeWords } from "@/lib/engine/normalize";

describe("normalizeAnswer (SPEC 4.6)", () => {
  it("küçük harf, baş/son ve çoklu boşluk", () => {
    expect(normalizeAnswer("  She   PLAYS football ")).toBe("she plays football");
  });

  it("sondaki noktalama yok sayılır", () => {
    expect(normalizeAnswer("He is a doctor.")).toBe("he is a doctor");
    expect(normalizeAnswer("Where do you live?!")).toBe("where do you live");
  });

  it("kıvrık kesme işareti düzleşir", () => {
    expect(normalizeAnswer("I don’t know")).toBe(normalizeAnswer("I don't know"));
  });

  it.each([
    ["don't", "do not"],
    ["doesn't", "does not"],
    ["I'm happy", "I am happy"],
    ["can't", "cannot"],
    ["won't", "will not"],
    ["they're here", "they are here"],
    ["she's a student", "she is a student"],
    ["there's a cat", "there is a cat"],
    ["I've got", "I have got"],
  ])("kısaltma eşdeğeri: %s ↔ %s", (a, b) => {
    expect(answersMatch(a, b)).toBe(true);
  });

  it("iyelik 's açılmaz", () => {
    expect(normalizeAnswer("Tom's car")).toBe("tom's car");
  });

  it("farklı cevaplar eşleşmez", () => {
    expect(answersMatch("She plays", "She play")).toBe(false);
  });
});

describe("tokenizeWords", () => {
  it("noktalamayı atar, kelime içi kesmeyi korur", () => {
    expect(tokenizeWords("Tom's car, is red.")).toEqual(["tom's", "car", "is", "red"]);
  });
});
