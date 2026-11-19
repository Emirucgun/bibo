"use client";

import { useState } from "react";
import { Bibo } from "@/components/brand/Bibo";
import { Button } from "@/components/ui/button";
import { SessionRunner } from "@/components/session/SessionRunner";
import { callApi } from "@/lib/api/client";

// Yerleştirme testi (PRD F2, docs/SPEC.md 4.7): kısa giriş → uyarlamalı test (soru soru) → sonuç kartları.
export function PlacementFlow() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sessionId) return <SessionRunner sessionId={sessionId} explainMode="short" />;

  async function start() {
    if (pending) return;
    setPending(true);
    setError(null);
    const res = await callApi<{ sessionId: string }>("/api/placement", { method: "POST", body: {} });
    if (res.ok) setSessionId(res.data.sessionId);
    else {
      setError(res.message);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Bibo state="merhaba" size={120} className="mb-2 size-28" />
        <p className="text-sm text-muted-foreground">Adım 2/2</p>
        <h1 className="text-2xl font-semibold">Kısa bir tanışma testi</h1>
        <p className="text-base leading-relaxed">
          Çoğu kişi için 14–19 kısa soru, yaklaşık 8 dakika. Bu bir sınav değil: amacımız seni tanıyıp ilk
          oturumunu sana göre hazırlamak.
        </p>
      </header>
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed">
        <li>Sorular cevaplarına göre değişir: doğru bildikçe zorlaşır, zorlandıkça kolaylaşır.</li>
        <li>Test sırasında doğru ya da yanlış göstermiyoruz; sonuçları sonda birlikte göreceğiz.</li>
        <li>Okuma, boşluk doldurma, cümle dizme ve dinleme soruları var. Sonda telefonuna kısaca konuşacaksın.</li>
        <li>Bilmediğin soruda tahmin etmen yeterli. Yanlışlar da bize çok şey anlatır.</li>
      </ul>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="button" onClick={start} disabled={pending} className="h-12 w-full text-base">
        {pending ? "Hazırlanıyor…" : "Teste başla"}
      </Button>
    </div>
  );
}
