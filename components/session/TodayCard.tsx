"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { callApi } from "@/lib/api/client";
import { TOPICS } from "@/lib/content/taxonomy";
import type { SessionView } from "@/lib/session/service";

type NextResult = { sessionId: string; status: SessionView["session"]["status"] };

type State =
  | { name: "loading" }
  | { name: "generating" }
  | { name: "ready"; view: SessionView }
  | { name: "message"; text: string };

const POLL_MS = 3000;
/** Üretim tipik 20–30 sn; 4 dakikadan sonra beklemeyi bırak. */
const MAX_POLLS = 80;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Ana sayfadaki "Bugünkü oturum" kartı (PRD A2 adım 1). Hazır oturum yoksa hazırlatır ve
// `GET /api/sessions/:id` ile yoklar; "Başla" dil modeli çağırmaz.
export function TodayCard() {
  const router = useRouter();
  const [state, setState] = useState<State>({ name: "loading" });
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void callApi("/api/events", { method: "POST", body: { name: "app_open" } });
    void (async () => {
      // Üretim başarısız olursa bir kez daha denenir.
      for (let round = 0; round < 2 && !cancelled; round++) {
        const next = await callApi<NextResult>("/api/sessions/next", { method: "POST", body: {} });
        if (cancelled) return;
        if (!next.ok) return setState({ name: "message", text: next.message });
        if (next.data.status === "generating") setState({ name: "generating" });

        for (let i = 0; i < MAX_POLLS && !cancelled; i++) {
          const view = await callApi<SessionView>(`/api/sessions/${next.data.sessionId}`, { method: "GET" });
          if (cancelled) return;
          if (!view.ok) return setState({ name: "message", text: view.message });
          const status = view.data.session.status;
          if (status === "ready" || status === "active") return setState({ name: "ready", view: view.data });
          if (status !== "generating") break; // failed / abandoned: yeniden dene
          await sleep(POLL_MS);
        }
      }
      if (!cancelled) {
        setState({ name: "message", text: "Oturumunu şu an hazırlayamadık. Biraz sonra sayfayı yenile." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.name === "loading") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Yükleniyor…
      </p>
    );
  }
  if (state.name === "generating") {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-border p-5">
        <h2 className="text-lg font-semibold">Oturumun hazırlanıyor</h2>
        <p role="status" className="text-sm text-muted-foreground">
          Sana göre etkinlikler yazılıyor. Yarım dakika kadar sürer; sayfayı kapatma.
        </p>
      </section>
    );
  }
  if (state.name === "message") {
    return (
      <section className="rounded-lg border border-border p-5">
        <p className="text-base">{state.text}</p>
      </section>
    );
  }

  const { session, items } = state.view;
  const active = session.status === "active";
  const minutes = Math.round(session.estSeconds / 60);
  const focus = TOPICS.find((t) => t.id === session.focusTopicId)?.title_tr;

  async function start() {
    if (starting) return;
    setStarting(true);
    setStartError(null);
    if (!active) {
      const res = await callApi(`/api/sessions/${session.id}/start`, { method: "POST", body: {} });
      if (!res.ok) {
        setStartError(res.message);
        setStarting(false);
        return;
      }
    }
    router.push(`/oturum/${session.id}`);
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{active ? "Oturumun yarım kaldı" : "Bugünkü oturum"}</h2>
        <p className="text-sm text-muted-foreground">
          {minutes} dk · {items.length} etkinlik{focus ? ` · Odak: ${focus}` : ""}
        </p>
      </div>
      {startError ? (
        <p role="alert" className="text-sm">
          {startError}
        </p>
      ) : null}
      <Button type="button" onClick={start} disabled={starting} className="h-12 w-full text-base">
        {starting ? "Açılıyor…" : active ? "Devam et" : "Başla"}
      </Button>
    </section>
  );
}
