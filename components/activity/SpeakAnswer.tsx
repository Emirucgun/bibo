"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_RECORDING_SEC, MIN_RECORDING_SEC } from "@/lib/audio/wav";
import { RecorderError, WavRecorder, type RecorderErrorCode } from "@/lib/audio/wav-recorder";
import type { SpeechResult } from "@/lib/session/service";
import type { ItemPayload } from "@/lib/session/types";
import { EnglishText } from "./shared";

const FALLBACK = "Bir şeyler ters gitti. Biraz sonra yeniden dene.";

const RECORDER_MESSAGES: Record<RecorderErrorCode, string> = {
  unsupported: "Tarayıcın ses kaydını desteklemiyor. Safari ya da Chrome'un güncel sürümünü dene.",
  permission_denied: "Mikrofon izni verilmedi. Tarayıcı ayarlarından bu siteye mikrofon izni verip yeniden dene.",
  no_microphone: "Mikrofon bulunamadı.",
  failed: "Kayıt başlatılamadı. Yeniden dene.",
};

type Phase = { name: "idle" } | { name: "starting" } | { name: "recording"; since: number } | { name: "sending" };

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

// Sesli cevapla (`speak_answer`, PRD F6): bas-başlat / bas-bitir; sessizlikte durmaz, en çok 45 sn.
// Kayıt bitince WAV doğrudan `POST /api/items/:id/speech`'e gider; transkript ve değerlendirme döner.
// Ses tarayıcıda yalnızca bellekte tutulur.
export function SpeakAnswer({
  itemId,
  payload,
  tryNo,
  elapsedMs,
  onResult,
}: {
  itemId: string;
  payload: ItemPayload;
  tryNo: number;
  /** Etkinliğin açılmasından bu yana geçen süre (`attempts.time_ms`). */
  elapsedMs: () => number;
  onResult: (result: SpeechResult) => void;
}) {
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const recorder = useRef<WavRecorder | null>(null);
  const stopping = useRef(false);

  useEffect(() => {
    if (phase.name !== "recording") return;
    const timer = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(timer);
  }, [phase.name]);

  // Etkinlikten çıkılırsa mikrofon kapanır.
  useEffect(() => () => void recorder.current?.cancel(), []);

  async function start() {
    setError(null);
    setPhase({ name: "starting" });
    stopping.current = false;
    const rec = new WavRecorder(() => void stop());
    recorder.current = rec;
    try {
      await rec.start();
      const since = performance.now();
      setNow(since);
      setPhase({ name: "recording", since });
    } catch (err) {
      recorder.current = null;
      setError(err instanceof RecorderError ? RECORDER_MESSAGES[err.code] : RECORDER_MESSAGES.failed);
      setPhase({ name: "idle" });
    }
  }

  async function stop() {
    const rec = recorder.current;
    if (!rec || stopping.current) return;
    stopping.current = true;
    recorder.current = null;
    setPhase({ name: "sending" });
    const recording = await rec.stop();
    if (recording.durationSec < MIN_RECORDING_SEC) {
      setError("Kayıt çok kısa. Düğmeye basıp konuş, bitince yeniden bas.");
      setPhase({ name: "idle" });
      return;
    }
    const form = new FormData();
    form.append("audio", new Blob([recording.wav as BlobPart], { type: "audio/wav" }), "answer.wav");
    form.append("timeMs", String(Math.max(0, Math.min(3_600_000, Math.round(elapsedMs())))));
    form.append("tryNo", String(tryNo));
    try {
      const response = await fetch(`/api/items/${itemId}/speech`, { method: "POST", body: form });
      const json: unknown = await response.json().catch(() => null);
      if (response.ok) {
        onResult(json as SpeechResult);
        return;
      }
      const message = (json as { error?: { message_tr?: unknown } } | null)?.error?.message_tr;
      setError(typeof message === "string" ? message : FALLBACK);
    } catch {
      setError("Bağlantı kurulamadı. İnternetini kontrol edip yeniden kaydet.");
    }
    setPhase({ name: "idle" });
  }

  const seconds = phase.name === "recording" ? Math.max(0, (now - phase.since) / 1000) : 0;

  return (
    <div className="flex flex-col gap-4">
      {payload.prompt_en ? <EnglishText>{payload.prompt_en}</EnglishText> : null}

      {phase.name === "recording" ? (
        <Button type="button" variant="destructive" onClick={() => void stop()} className="h-16 w-full gap-2 text-base">
          <Square aria-hidden className="size-5" />
          Bitir · {clock(seconds)} / {clock(MAX_RECORDING_SEC)}
        </Button>
      ) : (
        <Button
          type="button"
          onClick={() => void start()}
          disabled={phase.name !== "idle"}
          className="h-16 w-full gap-2 text-base"
        >
          <Mic aria-hidden className="size-5" />
          {phase.name === "starting"
            ? "Mikrofon açılıyor…"
            : phase.name === "sending"
              ? "Cevabını dinliyoruz…"
              : tryNo > 1
                ? "Yeniden kaydet"
                : "Kaydı başlat"}
        </Button>
      )}
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {phase.name === "recording"
          ? "Konuşman bitince “Bitir”e bas. Duraklasan da kayıt sürer."
          : "Düğmeye bas, cevabını İngilizce söyle, bitince yeniden bas."}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
