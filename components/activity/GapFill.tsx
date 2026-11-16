"use client";

import { useState, type FormEvent } from "react";
import { GAP_MARK } from "@/lib/ai/checks";
import { ANSWER_FIELD_CLASS, ANSWER_INPUT_PROPS, SubmitButton, type ActivityProps } from "./shared";

// Boşluk doldur (`gap_fill`): `___` işaretli tek boşluk. Cevap `{ text }`.
export function GapFill({ payload, locked, onSubmit }: ActivityProps) {
  const [text, setText] = useState("");
  const [before, ...rest] = (payload.text_en ?? "").split(GAP_MARK);
  const after = rest.join(GAP_MARK);
  const ready = text.trim().length > 0;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked || !ready) return;
    onSubmit({ text: text.trim() });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p lang="en" className="rounded-lg bg-muted px-4 py-3 text-base leading-loose">
        {before}
        <input
          {...ANSWER_INPUT_PROPS}
          aria-label="Boşluğa gelecek kelime"
          value={text}
          disabled={locked}
          maxLength={60}
          onChange={(event) => setText(event.target.value)}
          className={`${ANSWER_FIELD_CLASS} mx-1 inline-block w-32 py-1 text-center`}
        />
        {after}
      </p>
      {locked ? null : <SubmitButton disabled={!ready} />}
    </form>
  );
}
