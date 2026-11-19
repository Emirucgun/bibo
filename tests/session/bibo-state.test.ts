import { describe, expect, it } from "vitest";
import { sessionBibo } from "@/lib/session/bibo-state";

const base = { placement: false, submitting: false, hintPending: false, hint: null, result: null, speaking: false };

describe("sessionBibo", () => {
  it("bekleyen etkinlikte varsayılan", () => {
    expect(sessionBibo(base)).toBe("varsayilan");
  });

  it("cevap ya da ipucu beklenirken düşünüyor", () => {
    expect(sessionBibo({ ...base, submitting: true })).toBe("dusunuyor");
    expect(sessionBibo({ ...base, hintPending: true })).toBe("dusunuyor");
    expect(sessionBibo({ ...base, submitting: true, result: { isCorrect: true } })).toBe("dusunuyor");
  });

  it("doğru cevapta tebrikler, yanlışta tekrar bakalım, puansızda varsayılan", () => {
    expect(sessionBibo({ ...base, result: { isCorrect: true } })).toBe("tebrikler");
    expect(sessionBibo({ ...base, result: { isCorrect: false } })).toBe("tekrar-bakalim");
    expect(sessionBibo({ ...base, result: { isCorrect: null } })).toBe("varsayilan");
  });

  it("ipucu açıkken ipucu; cevaptan sonra cevabın hali öne geçer", () => {
    expect(sessionBibo({ ...base, hint: "he / she?" })).toBe("ipucu");
    expect(sessionBibo({ ...base, hint: "he / she?", result: { isCorrect: false } })).toBe("tekrar-bakalim");
  });

  it("konuşma etkinliğinde dinliyor", () => {
    expect(sessionBibo({ ...base, speaking: true })).toBe("dinliyor");
    expect(sessionBibo({ ...base, speaking: true, result: { isCorrect: true } })).toBe("tebrikler");
  });

  it("yerleştirmede doğru/yanlış ele verilmez", () => {
    expect(sessionBibo({ ...base, placement: true, result: { isCorrect: true } })).toBe("varsayilan");
    expect(sessionBibo({ ...base, placement: true, result: { isCorrect: false } })).toBe("varsayilan");
    expect(sessionBibo({ ...base, placement: true, submitting: true })).toBe("dusunuyor");
    expect(sessionBibo({ ...base, placement: true, speaking: true })).toBe("dinliyor");
  });
});
