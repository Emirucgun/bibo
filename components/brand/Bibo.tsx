// Bibo maskotu (Figma "Bibo — Marka Kimliği", 02 · Maskot). Her hal 240 × 240 tuvalde bir SVG'dir:
// public/brand/bibo-<hal>.svg. Kurallar: bir ekranda en fazla bir Bibo; oturum içinde küçük (32–48 px),
// karşılama, boş durum ve teşhis kartında büyük. En "olumsuz" hali sakin bir "Tekrar bakalım"dır.

export const BIBO_STATES = {
  varsayilan: "Her yerde: profil görseli, başlıklar, boş durumlar.",
  merhaba: "Karşılama ekranı ve ana sayfa selamı.",
  dusunuyor: "Oturum hazırlanırken ve cevap değerlendirilirken (yükleme).",
  buldum: "Teşhis kartı: hatanın kaynağı bulundu.",
  tebrikler: "Doğru cevap ve oturum sonu özeti.",
  "tekrar-bakalim": "Yanlış cevap: sakin ve yargısız.",
  dinliyor: "Konuşma (bas-konuş) ve dinleme etkinlikleri.",
  ipucu: "“İpucu” ve “Daha fazla açıkla” anları.",
  dinleniyor: "Oturum bittiğinde ya da ara verildiğinde.",
} as const;

export type BiboState = keyof typeof BIBO_STATES;

export function biboSrc(state: BiboState): string {
  return `/brand/bibo-${state}.svg`;
}

export function Bibo({
  state = "varsayilan",
  size = 240,
  alt = "",
  className,
}: {
  state?: BiboState;
  size?: number;
  alt?: string;
  className?: string;
}) {
  return (
    // SVG olduğu için next/image'in optimizasyonuna gerek yok; boyut tuvalle orantılı.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={biboSrc(state)} width={size} height={size} alt={alt} className={className} draggable={false} />
  );
}
