// Oturum ekranında köşedeki tek Bibo'nun hali (Figma "Bibo — Marka Kimliği", 02 · Maskot).
// Kurallar: oturum içinde küçük ve köşede, bir ekranda en fazla bir Bibo; en "olumsuz" hali
// "Tekrar bakalım". Yerleştirmede doğru/yanlış gösterilmediği için Bibo da ele vermez. Saf.

export type SessionBiboState = "varsayilan" | "dusunuyor" | "ipucu" | "tebrikler" | "tekrar-bakalim" | "dinliyor";

export function sessionBibo(s: {
  placement: boolean;
  submitting: boolean;
  hintPending: boolean;
  hint: string | null;
  result: { isCorrect: boolean | null } | null;
  speaking: boolean;
}): SessionBiboState {
  if (s.submitting || s.hintPending) return "dusunuyor";
  if (s.result && !s.placement) {
    if (s.result.isCorrect === true) return "tebrikler";
    if (s.result.isCorrect === false) return "tekrar-bakalim";
    return "varsayilan";
  }
  if (s.hint && !s.placement) return "ipucu";
  if (s.speaking && !s.result) return "dinliyor";
  return "varsayilan";
}
