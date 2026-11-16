// Açıklama modu öğrenimi (PRD F4, PLAN karar 23). Saf.
// Son 2 oturumda yanlış cevapların ≥ %50'sinde uzun açıklama açılmışsa "uzun"a geçer;
// uzun moddayken < %20'sinde açılmışsa "kısa"ya döner. Aradaki boşluk mod gidip gelmesin diye.
export type ExplainMode = "short" | "long";

export const EXPLAIN_MODE_SESSIONS = 2;
export const TO_LONG_RATE = 0.5;
export const TO_SHORT_RATE = 0.2;

export interface ExplainStats {
  /** Son oturumlardaki yanlış cevap sayısı. */
  wrong: number;
  /** Bunlardan uzun açıklaması açılmış (uzun modda: kapatılmamış) olanlar. */
  opened: number;
}

export function nextExplainMode(current: ExplainMode, stats: ExplainStats): ExplainMode {
  if (stats.wrong <= 0) return current;
  const rate = stats.opened / stats.wrong;
  if (current === "short" && rate >= TO_LONG_RATE) return "long";
  if (current === "long" && rate < TO_SHORT_RATE) return "short";
  return current;
}
