"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { cn } from "cn";
import { Button, buttonVariants } from "@/components/ui/button";
import { callApi } from "@/lib/api/client";
import type { DiagnosisCard as DiagnosisCardData, FinishResult } from "@/lib/session/service";

// Oturum sonu (PRD A4): özet, kanıtlı teşhis kartı, "Doğru / Bence değil", 1–5 puan ve not.
export function SessionSummary({ sessionId, result }: { sessionId: string; result: FinishResult }) {
  const { summary, diagnosis } = result;
  const minutes = Math.max(1, Math.round(summary.durationSec / 60));
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Oturum bitti</h1>
        {result.graduated ? null : (
          <p className="text-sm text-muted-foreground">Bir sonraki oturumun arka planda hazırlanıyor.</p>
        )}
      </header>

      {result.graduated ? (
        // Sürekli kapı (docs/SPEC.md 4.7): A2 tamamlandı, günlük oturumlar burada biter.
        <section className="flex flex-col gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4">
          <h2 className="text-base font-semibold">Tebrikler, A2&apos;yi tamamladın</h2>
          <p className="text-sm leading-relaxed">
            Cevapların artık A2&apos;nin üstünde olduğunu gösteriyor. Şu an yalnızca A1–A2 için çalışıyoruz; çok yakında
            senin seviyen için de buradayız.
          </p>
          <Link href="/kapsam" className={cn(buttonVariants(), "h-12 w-full text-base")}>
            Devam et
          </Link>
        </section>
      ) : null}

      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border p-4">
          <dt className="text-sm text-muted-foreground">Doğru</dt>
          <dd className="text-2xl font-semibold">
            {summary.correct} / {summary.total}
          </dd>
        </div>
        <div className="rounded-lg border border-border p-4">
          <dt className="text-sm text-muted-foreground">Süre</dt>
          <dd className="text-2xl font-semibold">{minutes} dk</dd>
        </div>
      </dl>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Bugün çalıştığın konular</h2>
        <ul className="flex flex-wrap gap-2">
          {summary.topics.map((topic) => (
            <li key={topic.id} className="rounded-full bg-muted px-3 py-1 text-sm">
              {topic.titleTr}
            </li>
          ))}
        </ul>
      </section>

      {diagnosis ? <DiagnosisCard diagnosis={diagnosis} /> : null}
      <RatingForm sessionId={sessionId} />

      <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "h-12 w-full text-base")}>
        Ana sayfaya dön
      </Link>
    </div>
  );
}

function DiagnosisCard({ diagnosis }: { diagnosis: DiagnosisCardData }) {
  const [feedback, setFeedback] = useState(diagnosis.userFeedback);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(value: "agree" | "disagree") {
    if (pending) return;
    setPending(true);
    setError(null);
    const res = await callApi<{ ok: true }>(`/api/diagnoses/${diagnosis.id}/feedback`, {
      method: "POST",
      body: { feedback: value },
    });
    if (res.ok) setFeedback(value);
    else setError(res.message);
    setPending(false);
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <h2 className="text-base font-semibold">
        {diagnosis.status === "resolved" ? "Çözüldü" : "Bulduğumuz şey"} · {diagnosis.topicTitleTr}
      </h2>
      <p className="text-sm leading-relaxed">{diagnosis.messageTr}</p>
      {diagnosis.evidence.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {diagnosis.evidence.map((e) => (
            <li key={e.skill} className="rounded-full bg-background px-3 py-1 text-sm">
              {e.skill}: {e.correct}/{e.n}
            </li>
          ))}
        </ul>
      ) : null}
      {diagnosis.status === "active" ? (
        feedback ? (
          <p className="text-sm text-muted-foreground">
            {feedback === "agree" ? "Not aldık: bu sana doğru geliyor." : "Not aldık: sana öyle gelmiyor. Bunu dikkate alacağız."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => send("agree")} className="h-11 text-sm">
              Doğru
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => send("disagree")} className="h-11 text-sm">
              Bence değil
            </Button>
          </div>
        )
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function RatingForm({ sessionId }: { sessionId: string }) {
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "pending" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rating === null || state === "pending") return;
    setState("pending");
    setError(null);
    const res = await callApi(`/api/sessions/${sessionId}/finish`, {
      method: "POST",
      body: { rating, ...(comment.trim() ? { comment: comment.trim() } : {}) },
    });
    if (res.ok) setState("saved");
    else {
      setError(res.message);
      setState("idle");
    }
  }

  if (state === "saved") return <p className="text-sm text-muted-foreground">Teşekkürler, puanını kaydettik.</p>;

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">Bu oturum nasıldı?</h2>
      <div role="radiogroup" aria-label="Oturum puanı" className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} puan`}
            onClick={() => setRating(n)}
            className={cn(
              "h-12 rounded-lg border text-base font-medium",
              rating === n ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <textarea
        aria-label="Not (isteğe bağlı)"
        placeholder="İstersen bir not bırak"
        rows={2}
        maxLength={500}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={rating === null || state === "pending"} className="h-12 w-full text-base">
        {state === "pending" ? "Kaydediliyor…" : "Puanı gönder"}
      </Button>
    </form>
  );
}
