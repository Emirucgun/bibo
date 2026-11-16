"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { cn } from "cn";
import { GapFill } from "@/components/activity/GapFill";
import { McqRead } from "@/components/activity/McqRead";
import { ShortWrite } from "@/components/activity/ShortWrite";
import { Translate } from "@/components/activity/Translate";
import { WordOrder } from "@/components/activity/WordOrder";
import type { ActivityProps } from "@/components/activity/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { callApi } from "@/lib/api/client";
import type { ActivityType } from "@/lib/content/activity-types";
import type { ExplainMode } from "@/lib/session/explain-mode";
import type { AttemptResponse } from "@/lib/session/schemas";
import type { AttemptResult, FinishResult, SessionView } from "@/lib/session/service";
import type { ItemPublic } from "@/lib/session/types";
import { FeedbackCard } from "./FeedbackCard";
import { ProgressBar } from "./ProgressBar";
import { SessionSummary } from "./SessionSummary";

// M6: beş metin etkinliği. Dinleme (M7) ve konuşma (M8) bileşenleri sonra eklenir.
const ACTIVITY: Partial<Record<ActivityType, ComponentType<ActivityProps>>> = {
  mcq_read: McqRead,
  gap_fill: GapFill,
  word_order: WordOrder,
  translate_tr_en: Translate,
  short_write: ShortWrite,
};

type Phase =
  | { name: "loading" }
  | { name: "problem"; message: string }
  | { name: "run"; items: ItemPublic[]; index: number }
  | { name: "finishing" }
  | { name: "summary"; result: FinishResult };

const fire = (name: string, props?: Record<string, string | number>) =>
  void callApi("/api/events", { method: "POST", body: { name, ...(props ? { props } : {}) } });

/** Oturum ekranı: etkinlikler tek tek gelir; sayfa yenilenince ilk cevapsız etkinlikten devam eder. */
export function SessionRunner({ sessionId, explainMode }: { sessionId: string; explainMode: ExplainMode }) {
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [hintPending, setHintPending] = useState(false);
  const hintUsed = useRef(false);
  const shownAt = useRef(0);

  const finish = useCallback(async () => {
    setPhase({ name: "finishing" });
    const res = await callApi<FinishResult>(`/api/sessions/${sessionId}/finish`, { method: "POST", body: {} });
    setPhase(res.ok ? { name: "summary", result: res.data } : { name: "problem", message: res.message });
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const first = await callApi<SessionView>(`/api/sessions/${sessionId}`, { method: "GET" });
      if (cancelled) return;
      if (!first.ok) return setPhase({ name: "problem", message: first.message });
      let view = first.data;

      if (view.session.status === "ready") {
        const started = await callApi(`/api/sessions/${sessionId}/start`, { method: "POST", body: {} });
        if (cancelled) return;
        if (!started.ok) return setPhase({ name: "problem", message: started.message });
        view = { ...view, session: { ...view.session, status: "active" } };
      }
      if (view.session.status === "done") return void finish();
      if (view.session.status !== "active") {
        return setPhase({
          name: "problem",
          message:
            view.session.status === "generating"
              ? "Bu oturum hâlâ hazırlanıyor. Ana sayfadan birazdan yeniden dene."
              : "Bu oturum artık açık değil.",
        });
      }

      const answered = new Set(view.attempts.map((a) => a.item_id));
      const index = view.items.findIndex((item) => !answered.has(item.id));
      if (index === -1) return void finish();
      if (answered.size > 0) fire("session_resume", { session_id: sessionId, position: index });
      shownAt.current = performance.now();
      setPhase({ name: "run", items: view.items, index });
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, finish]);

  if (phase.name === "loading" || phase.name === "finishing") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {phase.name === "loading" ? "Oturumun açılıyor…" : "Özetin hazırlanıyor…"}
      </p>
    );
  }
  if (phase.name === "problem") {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="text-base">
          {phase.message}
        </p>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "h-12 w-full text-base")}>
          Ana sayfaya dön
        </Link>
      </div>
    );
  }
  if (phase.name === "summary") return <SessionSummary sessionId={sessionId} result={phase.result} />;

  const { items, index } = phase;
  const item = items[index];
  const Activity = ACTIVITY[item.activity_type];
  const isLast = index === items.length - 1;

  async function submit(response: AttemptResponse) {
    if (submitting || result) return;
    setSubmitting(true);
    setError(null);
    const res = await callApi<AttemptResult>(`/api/items/${item.id}/attempt`, {
      method: "POST",
      body: {
        response,
        timeMs: Math.max(0, Math.min(3_600_000, Math.round(performance.now() - shownAt.current))),
        hintUsed: hintUsed.current,
      },
    });
    if (res.ok) setResult(res.data);
    else setError(res.message);
    setSubmitting(false);
  }

  async function showHint() {
    if (hintPending || hint) return;
    setHintPending(true);
    const res = await callApi<{ hintTr: string }>(`/api/items/${item.id}/hint`, { method: "GET" });
    if (res.ok) {
      hintUsed.current = true;
      setHint(res.data.hintTr);
    } else setError(res.message);
    setHintPending(false);
  }

  function next() {
    if (isLast) return void finish();
    setResult(null);
    setHint(null);
    setError(null);
    hintUsed.current = false;
    shownAt.current = performance.now();
    setPhase({ name: "run", items, index: index + 1 });
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="flex flex-col gap-5">
      <ProgressBar current={index} total={items.length} skill={item.skill} activityType={item.activity_type} />
      <p className="text-base font-medium">{item.payload.instruction_tr}</p>

      {Activity ? (
        // key: her etkinlikte bileşen durumu sıfırlanır.
        <Activity key={item.id} payload={item.payload} locked={submitting || result !== null} onSubmit={submit} />
      ) : (
        <p className="text-sm text-muted-foreground">Bu etkinlik türü henüz desteklenmiyor.</p>
      )}

      {submitting ? (
        <p role="status" className="text-sm text-muted-foreground">
          Cevabına bakıyoruz…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {result ? (
        <FeedbackCard key={result.attemptId} result={result} explainMode={explainMode} isLast={isLast} busy={false} onNext={next} />
      ) : hint ? (
        <p className="rounded-lg border border-border bg-muted px-4 py-3 text-sm">
          <span className="font-medium">İpucu: </span>
          {hint}
        </p>
      ) : (
        <Button type="button" variant="ghost" disabled={hintPending || submitting} onClick={showHint} className="h-11 text-sm">
          {hintPending ? "İpucu geliyor…" : "İpucu"}
        </Button>
      )}

      {!Activity && !result ? (
        <Button type="button" onClick={next} className="h-12 w-full text-base">
          Geç
        </Button>
      ) : null}
    </div>
  );
}
