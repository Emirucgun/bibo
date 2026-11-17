"use client";

import { useState, type FormEvent } from "react";
import { ChoiceList, EnglishText, SubmitButton, type ActivityProps } from "./shared";

// Oku ve seç (`mcq_read`): metin, soru, 3–4 şık. Cevap `{ choice }`.
export function McqRead({ payload, locked, onSubmit }: ActivityProps) {
  const [choice, setChoice] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked || choice === null) return;
    onSubmit({ choice });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {payload.text_en ? <EnglishText>{payload.text_en}</EnglishText> : null}
      {payload.question_en ? (
        <p lang="en" className="text-base font-medium">
          {payload.question_en}
        </p>
      ) : null}
      <ChoiceList options={payload.options ?? []} choice={choice} locked={locked} onChoose={setChoice} />
      {locked ? null : <SubmitButton disabled={choice === null} />}
    </form>
  );
}
