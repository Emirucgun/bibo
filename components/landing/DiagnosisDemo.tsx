"use client";

import { useState } from "react";
import { BookOpen, Headphones, Mic, PenLine, Target } from "lucide-react";
import type { ReactNode } from "react";

// "Konu mu, beceri mi?" farkını iki örnek öğrenciyle gösterir. Sayılar örnektir (PRD A4'teki
// teşhis kartı biçimi); çubuk rengi ustalık ölçeğinden (--mastery-0…3).

type Skill = { name: string; icon: ReactNode; right: number; total: number };
type Profile = { id: string; tab: string; skills: Skill[]; verdict: string; body: string };

const PROFILES: Profile[] = [
  {
    id: "beceri",
    tab: "Beceri sorunu",
    skills: [
      { name: "Okuma", icon: <BookOpen aria-hidden />, right: 4, total: 4 },
      { name: "Yazma", icon: <PenLine aria-hidden />, right: 5, total: 6 },
      { name: "Dinleme", icon: <Headphones aria-hidden />, right: 3, total: 4 },
      { name: "Konuşma", icon: <Mic aria-hidden />, right: 1, total: 4 },
    ],
    verdict: "Past simple'ı biliyorsun. Zorlandığın yer konuşma.",
    body: "Yazarken doğru, konuşurken yanlış: sorun konu değil, onu konuşurken geri çağırmak. Bu hafta konuşma etkinlikleriyle çalışacağız.",
  },
  {
    id: "konu",
    tab: "Konu sorunu",
    skills: [
      { name: "Okuma", icon: <BookOpen aria-hidden />, right: 1, total: 4 },
      { name: "Yazma", icon: <PenLine aria-hidden />, right: 2, total: 6 },
      { name: "Dinleme", icon: <Headphones aria-hidden />, right: 1, total: 4 },
      { name: "Konuşma", icon: <Mic aria-hidden />, right: 1, total: 4 },
    ],
    verdict: "Past simple henüz oturmamış.",
    body: "Dört becerinin dördünde de zorlanıyorsun: sorun bir beceride değil, konunun kendisinde. Önce kuralı kısa açıklamalarla tekrar edeceğiz.",
  },
];

function barColor(ratio: number): string {
  if (ratio >= 0.8) return "bg-mastery-3";
  if (ratio >= 0.5) return "bg-mastery-2";
  return "bg-mastery-1";
}

export function DiagnosisDemo() {
  const [active, setActive] = useState(PROFILES[0].id);
  const profile = PROFILES.find((p) => p.id === active) ?? PROFILES[0];

  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" aria-label="Örnek öğrenci" className="flex w-fit gap-1 rounded-full border-2 border-ink bg-white p-1">
        {PROFILES.map((p) => (
          <button
            key={p.id}
            role="tab"
            type="button"
            aria-selected={p.id === active}
            onClick={() => setActive(p.id)}
            className={`min-h-10 rounded-full px-4 text-sm font-semibold transition-colors ${
              p.id === active ? "bg-ink text-cream" : "text-ink hover:bg-muted"
            }`}
          >
            {p.tab}
          </button>
        ))}
      </div>

      <figure className="flex flex-col gap-5 rounded-3xl border-2 border-ink bg-white p-5 shadow-[6px_6px_0_var(--bibo-ink-900)] sm:p-7">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Target className="size-4" aria-hidden /> Teşhis · Past simple
        </div>
        <ul className="flex flex-col gap-3">
          {profile.skills.map((s) => {
            const ratio = s.right / s.total;
            return (
              <li key={s.name} className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-3 text-sm">
                <span className="flex items-center gap-2 font-medium [&_svg]:size-4 [&_svg]:text-muted-foreground">
                  {s.icon}
                  {s.name}
                </span>
                <span className="h-3.5 overflow-hidden rounded-full bg-mastery-0">
                  <span
                    className={`block h-full rounded-full transition-all duration-700 ease-out ${barColor(ratio)}`}
                    style={{ width: `${Math.max(6, ratio * 100)}%` }}
                  />
                </span>
                <span className="text-right font-semibold tabular-nums">
                  {s.right}/{s.total}
                </span>
              </li>
            );
          })}
        </ul>
        <figcaption key={profile.id} className="flex flex-col gap-1.5 border-t pt-4 animate-pop" aria-live="polite">
          <p className="text-lg font-semibold">{profile.verdict}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">{profile.body}</p>
        </figcaption>
        <div className="flex gap-2" aria-hidden>
          <span className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">Doğru</span>
          <span className="rounded-lg border px-3 py-1.5 text-xs font-medium">Bence değil</span>
        </div>
      </figure>
    </div>
  );
}
