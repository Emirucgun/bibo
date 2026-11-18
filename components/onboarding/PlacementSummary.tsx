"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ScopeNotice } from "@/components/onboarding/ScopeNotice";
import { Button } from "@/components/ui/button";
import type { FinishResult, PlacementResult } from "@/lib/session/service";
import type { TopicLine } from "@/lib/session/placement";

const LEVEL_TEXT: Record<"A1" | "A2", string> = {
  A1: "A1: temel cümleleri kuruyorsun; şimdi bunları sağlamlaştırma zamanı.",
  A2: "A2: günlük konularda iletişim kurabiliyorsun; şimdi A2'yi tamamlama zamanı.",
};

function TopicList({ title, note, topics, tone }: { title: string; note: string; topics: TopicLine[]; tone: "good" | "work" | "open" }) {
  if (topics.length === 0) return null;
  const box = tone === "good" ? "border-emerald-300 bg-emerald-50" : tone === "work" ? "border-primary/30 bg-primary/5" : "border-border";
  return (
    <section className={`flex flex-col gap-3 rounded-lg border p-4 ${box}`}>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{note}</p>
      <ul className="flex flex-col gap-2">
        {topics.map((t) => (
          <li key={t.topicId} className="flex flex-col">
            <span className="text-base font-medium">{t.titleTr}</span>
            {t.ruleTr ? <span className="text-sm leading-relaxed text-muted-foreground">{t.ruleTr}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Yerleştirme sonu (PRD F2): seviye, kanıta dayalı kartlar ("kanıt yoksa hüküm yok") ve ilk oturuma geçiş.
// A2 üstü öğrenciye hizmet yerine "çok yakında" ekranı (docs/SPEC.md 4.7 kapsam kapısı).
export function PlacementSummary({ result }: { result: FinishResult & { placement: PlacementResult } }) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const { placement } = result;

  if (placement.gate) return <ScopeNotice status="above_scope" />;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Testi bitirdin</h1>
        <p className="text-base leading-relaxed">{LEVEL_TEXT[placement.levelEst]}</p>
        {placement.borderline ? (
          <p className="text-sm text-muted-foreground">
            Sonucun iki seviyenin sınırında. İlk oturumlarda bunu netleştireceğiz; seviyen kendiliğinden güncellenir.
          </p>
        ) : null}
      </header>

      <TopicList
        title="İyi gidenler"
        note="Bu konularda cevapların sağlamdı."
        topics={placement.strengths}
        tone="good"
      />
      <TopicList
        title="Zorlandıkların"
        note="Bu testte yanlış cevapladığın ve üzerinde çalışmaya değer konular. Kesin hüküm değil, ilk tahmin."
        topics={placement.weakPoints}
        tone="work"
      />
      <TopicList
        title="Netleştireceklerimiz"
        note="Bunlara henüz hiç bakmadık. İlk oturumlarda kısa sorularla göreceğiz."
        topics={placement.toClarify}
        tone="open"
      />

      <p className="text-sm leading-relaxed">İlk günlük oturumun şu an hazırlanıyor. Yarım dakika kadar sürer.</p>
      <Button
        type="button"
        disabled={leaving}
        className="h-12 w-full text-base"
        onClick={() => {
          setLeaving(true);
          // Başlangıç kapısı sunucuda yeniden okunsun.
          router.replace("/");
          router.refresh();
        }}
      >
        {leaving ? "Açılıyor…" : "İlk oturumuma geç"}
      </Button>
    </div>
  );
}
