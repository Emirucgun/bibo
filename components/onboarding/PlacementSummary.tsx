"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { FinishResult, PlacementResult } from "@/lib/session/service";

// Yerleştirme sonu: "Tahmini zayıf noktalar" kartı (PRD F2: 3 konu, "tahmin" etiketi) ve ilk oturuma geçiş.
export function PlacementSummary({ result }: { result: FinishResult & { placement: PlacementResult } }) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const { summary, placement } = result;
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Testi bitirdin</h1>
        <p className="text-sm text-muted-foreground">
          {summary.correct} / {summary.total} doğru · Başlangıç seviyen: {placement.levelEst}
        </p>
      </header>

      <section className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Tahmini zayıf noktaların</h2>
          <span className="rounded-full border border-primary/40 px-2 py-0.5 text-xs font-medium">Tahmin</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Bu, 14 soruya dayanan ilk tahminimiz. Oturumlar ilerledikçe kesinleşecek ya da değişecek.
        </p>
        <ol className="flex flex-col gap-3">
          {placement.weakPoints.map((w, i) => (
            <li key={w.topicId} className="flex gap-3">
              <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <span className="flex flex-col">
                <span className="text-base font-medium">{w.titleTr}</span>
                {w.ruleTr ? <span className="text-sm leading-relaxed text-muted-foreground">{w.ruleTr}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <p className="text-sm leading-relaxed">
        İlk günlük oturumun şu an bu konulara göre hazırlanıyor. Yarım dakika kadar sürer.
      </p>
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
