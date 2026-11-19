"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";

// PRD Bölüm 1 tablosu: öğrencinin ChatGPT şikâyeti ve bibo'nun cevabı. Anahtar iki yüz arasında geçiş yapar.

const ROWS: { problem: string; answer: string }[] = [
  { problem: "Her sohbette sıfırdan başlıyor.", answer: "Seni hatırlar: her konu ve beceride nerede olduğunu, hangi hatayı tekrarladığını bilir." },
  { problem: "Öğrenip öğrenmediğimi bilmiyor.", answer: "Aynı konuyu birkaç gün sonra, başka bir beceride yeniden sorar. Gerçekten oturdu mu, görürsün." },
  { problem: "Cevaplar ya çok uzun ya çok kısa.", answer: "Geri bildirim en fazla 2 cümle. Yetmezse “Daha fazla açıkla” dersin." },
  { problem: "Okulda görmediğim şeyi anlatıyor.", answer: "Haftada bir “Bu hafta okulda ne gördün?” diye sorar; plan ona göre şekillenir." },
  { problem: "Doğru komutu ben yazmak zorundayım.", answer: "Komut yok. Bugün ne çalışacağını bibo hazırlar, sen yalnızca başlarsın." },
  { problem: "Konuşurken sözümü kesiyor.", answer: "Bas-konuş: sen bitirene kadar dinler, sessizlikte bile kesmez." },
];

export function Compare() {
  const [bibo, setBibo] = useState(true);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex w-fit gap-1 rounded-full border-2 border-cream/30 p-1" role="group" aria-label="Karşılaştırma">
        {[
          { on: false, label: "ChatGPT ile" },
          { on: true, label: "bibo ile" },
        ].map(({ on, label }) => (
          <button
            key={label}
            type="button"
            aria-pressed={bibo === on}
            onClick={() => setBibo(on)}
            className={`min-h-10 rounded-full px-5 text-sm font-semibold transition-colors ${
              bibo === on ? (on ? "bg-brand text-ink" : "bg-coral text-ink") : "text-cream/80 hover:text-cream"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ROWS.map((row, i) => (
          <li
            key={row.problem}
            className={`flex min-h-32 gap-3 rounded-2xl p-5 transition-colors duration-300 ${
              bibo ? "bg-cream text-ink" : "bg-ink-800 text-cream"
            }`}
            style={{ transitionDelay: `${i * 40}ms` }}
          >
            <span
              className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full [&_svg]:size-3.5 ${
                bibo ? "bg-brand text-ink" : "bg-coral text-ink"
              }`}
              aria-hidden
            >
              {bibo ? <Check strokeWidth={3} /> : <X strokeWidth={3} />}
            </span>
            <p key={String(bibo)} className="text-sm leading-relaxed animate-pop sm:text-base">
              {bibo ? row.answer : `“${row.problem}”`}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
