"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { callApi } from "@/lib/api/client";

// Haftalık okul konusu (PRD F10): haftada bir kez sorulur, atlanabilir.
export function SchoolTopicCard({
  topics,
  suggestions = [],
}: {
  topics: { id: string; titleTr: string }[];
  /** Varsayılan yolda öğrencinin sınırına en yakın konular: tek dokunuşla seçilir. */
  suggestions?: { id: string; titleTr: string }[];
}) {
  const [choice, setChoice] = useState("");
  const [state, setState] = useState<"idle" | "pending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function send(topicId: string | null) {
    if (state === "pending") return;
    setState("pending");
    setError(null);
    const res = await callApi("/api/school-topic", { method: "POST", body: { topicId } });
    if (!res.ok) {
      setError(res.message);
      setState("idle");
      return;
    }
    setState("done");
    // Konu seçildiyse hazır oturum yeniden planlanır: ana sayfa kartı yenilensin.
    if (topicId) window.location.reload();
  }

  if (state === "done") return null;
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-5">
      <h2 className="text-base font-semibold">Bu hafta okulda ne gördün?</h2>
      <p className="text-sm text-muted-foreground">Seçersen bu haftaki oturumlarında o konuya da yer açarız.</p>
      {suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((t) => (
            <Button
              key={t.id}
              type="button"
              variant="outline"
              disabled={state === "pending"}
              onClick={() => void send(t.id)}
              className="h-11 text-sm"
            >
              {t.titleTr}
            </Button>
          ))}
        </div>
      ) : null}
      <label className="sr-only" htmlFor="school-topic">
        Konu
      </label>
      <select
        id="school-topic"
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        className="h-12 w-full rounded-lg border border-input bg-background px-3 text-base"
      >
        <option value="">{suggestions.length > 0 ? "Başka bir konu…" : "Konu seç…"}</option>
        {topics.map((t) => (
          <option key={t.id} value={t.id}>
            {t.titleTr}
          </option>
        ))}
      </select>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" disabled={state === "pending"} onClick={() => send(null)} className="h-11 text-sm">
          Hatırlamıyorum / atla
        </Button>
        <Button type="button" disabled={!choice || state === "pending"} onClick={() => send(choice)} className="h-11 text-sm">
          Kaydet
        </Button>
      </div>
    </section>
  );
}
