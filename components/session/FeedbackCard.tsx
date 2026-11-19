"use client";

import { useEffect, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { callApi } from "@/lib/api/client";
import type { ExplainMode } from "@/lib/session/explain-mode";
import { feedbackHeading } from "@/lib/session/feedback-heading";
import type { AttemptResult } from "@/lib/session/service";

type Explanation = { state: "closed" } | { state: "loading" } | { state: "open"; text: string } | { state: "error" };

// Cevaptan sonraki kart (PRD F4): doğru/yanlış, ≤ 2 cümle Türkçe açıklama, doğru biçim,
// "Daha fazla açıkla". Uzun modda yanlış cevapta uzun açıklama kendiliğinden açılır ve
// "Kısa yeter" ile kapatılır (kapatılan cevap açıklama modu kuralında "açılmadı" sayılır).
export function FeedbackCard({
  result,
  explainMode,
  isLast,
  busy,
  onNext,
}: {
  result: AttemptResult;
  explainMode: ExplainMode;
  isLast: boolean;
  busy: boolean;
  onNext: () => void;
}) {
  const autoOpen = explainMode === "long" && result.isCorrect === false;
  const [explanation, setExplanation] = useState<Explanation>(autoOpen ? { state: "loading" } : { state: "closed" });
  const gradable = result.isCorrect !== null;

  async function load(via: "click" | "auto" | "dismiss") {
    const res = await callApi<{ explanationLongTr: string }>(
      `/api/attempts/${result.attemptId}/explanation${via === "click" ? "" : `?via=${via}`}`,
      { method: "GET" },
    );
    return res.ok ? res.data.explanationLongTr : null;
  }

  useEffect(() => {
    if (!autoOpen) return;
    let cancelled = false;
    void (async () => {
      const text = await load("auto");
      if (!cancelled) setExplanation(text ? { state: "open", text } : { state: "error" });
    })();
    return () => {
      cancelled = true;
    };
    // Kart her cevap için yeniden bağlanır (key = attemptId).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function open() {
    setExplanation({ state: "loading" });
    const text = await load("click");
    setExplanation(text ? { state: "open", text } : { state: "error" });
  }

  function dismiss() {
    setExplanation({ state: "closed" });
    void load("dismiss");
  }

  return (
    <section
      aria-live="polite"
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-4",
        // Figma: doğru turkuaz, yanlış sakin mercan ("Tekrar bakalım"); kırmızı yalnızca geri dönüşsüz işlemler için.
        result.isCorrect === true && "border-correct/30 bg-correct-bg",
        result.isCorrect === false && "border-retry/30 bg-retry-bg",
        result.isCorrect === null && "border-border bg-muted",
      )}
    >
      {gradable ? (
        <div className="flex flex-col gap-0.5">
          <h2
            className={cn(
              "flex items-center gap-1.5 text-base font-semibold",
              result.isCorrect ? "text-correct" : "text-retry",
            )}
          >
            {result.isCorrect ? <Check aria-hidden className="size-4" /> : <RotateCcw aria-hidden className="size-4" />}
            {feedbackHeading(result)}
          </h2>
          {result.errorNameTr ? <p className="text-sm font-medium text-muted-foreground">{result.errorNameTr}</p> : null}
        </div>
      ) : null}
      {result.feedbackShortTr ? <p className="text-sm leading-relaxed">{result.feedbackShortTr}</p> : null}
      {result.correction ? (
        <p className="text-sm">
          <span className="text-muted-foreground">Doğru cevap: </span>
          <span lang="en" className="font-medium">
            {result.correction}
          </span>
        </p>
      ) : null}

      {explanation.state === "open" ? (
        <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
          <p className="text-sm leading-relaxed">{explanation.text}</p>
          {autoOpen ? (
            <Button type="button" variant="ghost" onClick={dismiss} className="h-11 self-start px-2 text-sm">
              Kısa yeter
            </Button>
          ) : null}
        </div>
      ) : null}
      {explanation.state === "loading" ? <p className="text-sm text-muted-foreground">Açıklama geliyor…</p> : null}
      {explanation.state === "error" ? (
        <p className="text-sm text-muted-foreground">Açıklamayı şu an getiremedik.</p>
      ) : null}
      {gradable && (explanation.state === "closed" || explanation.state === "error") ? (
        <Button type="button" variant="outline" onClick={open} className="h-11 text-sm">
          Daha fazla açıkla
        </Button>
      ) : null}

      <Button type="button" onClick={onNext} disabled={busy} className="h-12 w-full text-base">
        {busy ? "Bekle…" : isLast ? "Oturumu bitir" : "Devam"}
      </Button>
    </section>
  );
}
