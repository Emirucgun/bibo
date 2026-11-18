"use client";

import { useEffect, useState } from "react";
import { cn } from "cn";
import { SchoolTopicCard } from "@/components/home/SchoolTopicCard";
import { callApi } from "@/lib/api/client";
import type { HomeOptions } from "@/lib/session/service";

// "Bugün ne çalışalım?" (2–3 seçenek; seçilen konu sonraki oturumun odağı olur) ve haftalık okul
// sorusu (PRD F10; okul programı haritalıysa ya da "kendi programım"da sorulmaz).
export function HomeOptionsCard() {
  const [options, setOptions] = useState<HomeOptions | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void callApi<HomeOptions>("/api/home", { method: "GET" }).then((res) => {
      if (!cancelled && res.ok) setOptions(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function choose(topicId: string | null) {
    if (pending) return;
    setPending(topicId ?? "none");
    setError(null);
    const res = await callApi("/api/focus-choice", { method: "POST", body: { topicId } });
    if (!res.ok) {
      setError(res.message);
      setPending(null);
      return;
    }
    // Hazır oturum bırakıldı; bugünkü oturum kartı yenisini hazırlasın.
    window.location.reload();
  }

  if (!options) return null;
  return (
    <>
      {options.focusChoices.length >= 2 ? (
        <section className="flex flex-col gap-3 rounded-lg border border-border p-5">
          <h2 className="text-base font-semibold">Bugün ne çalışalım?</h2>
          <p className="text-sm text-muted-foreground">
            Seçmezsen senin için biz seçeriz. Seçimin bir sonraki oturumun ana konusu olur.
          </p>
          <div className="flex flex-col gap-2">
            {options.focusChoices.map((c) => {
              const on = options.focusChoice === c.topicId;
              return (
                <button
                  key={c.topicId}
                  type="button"
                  aria-pressed={on}
                  disabled={pending !== null}
                  onClick={() => void choose(on ? null : c.topicId)}
                  className={cn(
                    "flex min-h-12 items-center justify-between gap-3 rounded-lg border px-4 py-2 text-left text-base",
                    on ? "border-primary bg-primary/5 font-medium" : "border-border",
                  )}
                >
                  <span>{c.titleTr}</span>
                  <span className="text-xs text-muted-foreground">
                    {pending === c.topicId ? "Hazırlanıyor…" : on ? "Seçildi" : c.status === "learning" ? "Devam" : "Yeni"}
                  </span>
                </button>
              );
            })}
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </section>
      ) : null}
      {options.school ? (
        <SchoolTopicCard
          topics={options.school.topics.map((t) => ({ id: t.topicId, titleTr: t.titleTr }))}
          suggestions={options.school.suggestions.map((t) => ({ id: t.topicId, titleTr: t.titleTr }))}
        />
      ) : null}
    </>
  );
}
