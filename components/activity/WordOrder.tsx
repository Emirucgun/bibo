"use client";

import { useState, type FormEvent } from "react";
import { SubmitButton, type ActivityProps } from "./shared";

const CHIP = "min-h-11 rounded-lg border px-3 py-2 text-base disabled:opacity-70";

// Cümle diz (`word_order`): karışık kelimelere dokunarak cümle kurulur. Cevap `{ order }`.
export function WordOrder({ payload, locked, onSubmit }: ActivityProps) {
  const tokens = payload.tokens ?? [];
  // Aynı kelime iki kez geçebilir: seçim metne değil sıra numarasına göre tutulur.
  const [picked, setPicked] = useState<number[]>([]);
  const ready = tokens.length > 0 && picked.length === tokens.length;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked || !ready) return;
    onSubmit({ order: picked.map((i) => tokens[i]) });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div
        aria-label="Kurduğun cümle"
        lang="en"
        className="flex min-h-16 flex-wrap content-start gap-2 rounded-lg border border-dashed border-border bg-muted/50 p-3"
      >
        {picked.length === 0 ? (
          <span lang="tr" className="self-center text-sm text-muted-foreground">
            Kelimelere sırayla dokun.
          </span>
        ) : null}
        {picked.map((i) => (
          <button
            key={i}
            type="button"
            disabled={locked}
            aria-label={`${tokens[i]} kelimesini çıkar`}
            onClick={() => setPicked((p) => p.filter((x) => x !== i))}
            className={`${CHIP} border-primary bg-primary/10 font-medium`}
          >
            {tokens[i]}
          </button>
        ))}
      </div>
      <div aria-label="Kelimeler" lang="en" className="flex flex-wrap gap-2">
        {tokens.map((token, i) =>
          picked.includes(i) ? null : (
            <button
              key={i}
              type="button"
              disabled={locked}
              onClick={() => setPicked((p) => [...p, i])}
              className={`${CHIP} border-border bg-background`}
            >
              {token}
            </button>
          ),
        )}
      </div>
      {locked ? null : <SubmitButton disabled={!ready} />}
    </form>
  );
}
