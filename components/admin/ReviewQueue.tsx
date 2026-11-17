"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { callApi } from "@/lib/api/client";
import type { QueueEntry } from "@/lib/admin/service";

type Verdict = "agree" | "fix" | "not_error";

// POST /api/admin/reviews: Doğru / Düzelt (doğru kodla) / Hata değil.
export function ReviewQueue({ initial, codes }: { initial: QueueEntry[]; codes: { code: string; nameTr: string }[] }) {
  const [items, setItems] = useState(initial);
  if (items.length === 0) {
    return <p className="rounded-lg border border-border p-4 text-sm">Kuyrukta bekleyen hata yok. 🎉</p>;
  }
  return (
    <ul className="flex flex-col gap-4">
      {items.map((e) => (
        <ReviewCard key={e.id} entry={e} codes={codes} onDone={() => setItems((xs) => xs.filter((x) => x.id !== e.id))} />
      ))}
    </ul>
  );
}

function ReviewCard({ entry, codes, onDone }: { entry: QueueEntry; codes: { code: string; nameTr: string }[]; onDone: () => void }) {
  const [fixing, setFixing] = useState(false);
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(verdict: Verdict) {
    setBusy(true);
    setError(null);
    const res = await callApi("/api/admin/reviews", {
      method: "POST",
      body: { errorEventId: entry.id, verdict, ...(verdict === "fix" ? { correctedL1Code: code } : {}), ...(note.trim() ? { note: note.trim() } : {}) },
    });
    if (res.ok) onDone();
    else {
      setError(res.message);
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border p-4 text-sm">
      <p className="text-xs text-muted-foreground">
        {new Date(entry.createdAt).toLocaleString("tr-TR")} · {entry.activityType} · {entry.skill}
        {entry.topicTitleTr ? ` · ${entry.topicTitleTr}` : ""}
      </p>
      {entry.task ? (
        <p>
          <span className="text-muted-foreground">Görev: </span>
          {entry.task}
        </p>
      ) : null}
      {entry.studentText ? (
        <p lang="en">
          <span className="text-muted-foreground">Öğrenci: </span>
          {entry.studentText}
        </p>
      ) : null}
      <p>
        <span className="text-muted-foreground">Etiket: </span>
        <strong>{entry.l1NameTr}</strong> ({entry.l1Code})
        {entry.wrongSpan ? (
          <>
            {" · "}
            <span className="line-through">{entry.wrongSpan}</span> → {entry.correction ?? "—"}
          </>
        ) : null}
      </p>
      {fixing ? (
        <select value={code} onChange={(e) => setCode(e.target.value)} className="h-11 rounded-md border border-input bg-background px-2">
          <option value="">Doğru kodu seç…</option>
          {codes.map((c) => (
            <option key={c.code} value={c.code}>
              {c.nameTr} ({c.code})
            </option>
          ))}
        </select>
      ) : null}
      <input
        placeholder="Not (isteğe bağlı)"
        value={note}
        maxLength={500}
        onChange={(e) => setNote(e.target.value)}
        className="h-11 rounded-md border border-input bg-background px-2"
      />
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-3 gap-2">
        <Button type="button" disabled={busy} onClick={() => send("agree")} className="h-11">
          Doğru
        </Button>
        {fixing ? (
          <Button type="button" variant="outline" disabled={busy || !code} onClick={() => send("fix")} className="h-11">
            Kaydet
          </Button>
        ) : (
          <Button type="button" variant="outline" disabled={busy} onClick={() => setFixing(true)} className="h-11">
            Düzelt
          </Button>
        )}
        <Button type="button" variant="outline" disabled={busy} onClick={() => send("not_error")} className="h-11">
          Hata değil
        </Button>
      </div>
    </li>
  );
}
