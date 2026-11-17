"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { callApi } from "@/lib/api/client";

/** Öğrenci aynı sesi en çok 3 kez dinler (PRD F5; istemcide sayılır, `audio_replay` olayına yazılır). */
export const MAX_PLAYS = 3;

type Load = { state: "loading" } | { state: "ready"; url: string } | { state: "error"; unavailable: boolean };

// Dinleme etkinliklerinin ses düğmesi. İmzalı URL etkinlik açılınca alınır; "Dinle" dokunuşu doğrudan
// `play()` çağırır (iOS Safari ses çalmayı yalnızca dokunuşun içinde başlatır; araya `await` girmez).
export function AudioPlayer({
  itemId,
  onUnavailable,
}: {
  itemId: string;
  onUnavailable?: () => void;
}) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [plays, setPlays] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await callApi<{ url: string }>(`/api/items/${itemId}/audio`, { method: "GET" });
      if (cancelled) return;
      if (res.ok) return setLoad({ state: "ready", url: res.data.url });
      const unavailable = res.code === "tts_unavailable";
      if (unavailable) onUnavailable?.();
      setLoad({ state: "error", unavailable });
    })();
    return () => {
      cancelled = true;
    };
    // `onUnavailable` her çizimde yeni olabilir; ses yalnızca etkinlik ve yeniden deneme değişince alınır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, attempt]);

  const left = MAX_PLAYS - plays;

  function play() {
    const el = audio.current;
    if (!el || left <= 0) return;
    if (playing) {
      el.pause();
      return;
    }
    el.currentTime = 0;
    const started = el.play();
    const n = plays + 1;
    setPlays(n);
    if (n > 1) {
      void callApi("/api/events", { method: "POST", body: { name: "audio_replay", props: { item_id: itemId, n } } });
    }
    started?.catch(() => {
      // Çalma başlamadı (ör. imzalı URL'nin süresi doldu): hak geri verilir, ses yeniden alınır.
      setPlays((p) => Math.max(0, p - 1));
      setLoad({ state: "loading" });
      setAttempt((a) => a + 1);
    });
  }

  if (load.state === "loading") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Ses hazırlanıyor…
      </p>
    );
  }
  if (load.state === "error") {
    // Seslendirme kullanılamıyorsa mesajı oturum ekranı gösterir; ağ hatasında yeniden denenir.
    return load.unavailable ? null : (
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setLoad({ state: "loading" });
          setAttempt((a) => a + 1);
        }}
        className="h-12 w-full text-base"
      >
        Sesi yeniden yükle
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <audio
        ref={audio}
        src={load.url}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <Button
        type="button"
        variant={playing ? "secondary" : "default"}
        disabled={left <= 0 && !playing}
        onClick={play}
        className="h-14 w-full gap-2 text-base"
      >
        {playing ? <Pause aria-hidden className="size-5" /> : <Volume2 aria-hidden className="size-5" />}
        {playing ? "Durdur" : left <= 0 ? "Dinleme hakkın bitti" : plays === 0 ? "Dinle" : "Yeniden dinle"}
      </Button>
      <p className="text-center text-sm text-muted-foreground" aria-live="polite">
        {left > 0 ? `${left} dinleme hakkın kaldı` : "Üç kez dinledin."}
      </p>
    </div>
  );
}
