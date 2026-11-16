// Geri bildirim kartının başlığı: hatanın derecesine göre (16.11.2026 deneme geri bildirimi).
// Puan yalnızca serbest cevaplarda ve diktede kademelidir; iki değerli etkinliklerde
// (şık, boşluk, cümle dizme) yanlış cevabın puanı 0'dır. Metinler pedagoji sahibinin onayına açık.
export const HEADING_CLOSE_SCORE = 0.7;
export const HEADING_PARTIAL_SCORE = 0.3;

export function feedbackHeading(result: { isCorrect: boolean | null; score: number | null }): string {
  if (result.isCorrect) return "Doğru";
  const score = result.score ?? 0;
  if (score >= HEADING_CLOSE_SCORE) return "Çok yakın";
  if (score >= HEADING_PARTIAL_SCORE) return "Az kaldı, bir daha bakalım";
  return "Buna birlikte bakalım";
}
