// docs/SPEC.md Bölüm 3, "Sabit kümeler". Veritabanında items.interest check kısıtıyla aynı.
export const INTERESTS = [
  "football",
  "other_sports",
  "gaming",
  "music",
  "series_film",
  "tech",
  "social_media",
  "fashion",
  "food",
  "travel",
  "science_space",
  "cars",
] as const;

export type Interest = (typeof INTERESTS)[number];

export const INTEREST_LABELS_TR: Record<Interest, string> = {
  football: "Futbol",
  other_sports: "Diğer sporlar",
  gaming: "Oyun",
  music: "Müzik",
  series_film: "Dizi ve film",
  tech: "Teknoloji",
  social_media: "Sosyal medya",
  fashion: "Moda",
  food: "Yemek",
  travel: "Seyahat",
  science_space: "Bilim ve uzay",
  cars: "Arabalar",
};

/** Profilde seçilmesi gereken en az ilgi alanı sayısı (PRD F2). */
export const MIN_INTERESTS = 2;

export function isInterest(value: string): value is Interest {
  return (INTERESTS as readonly string[]).includes(value);
}
