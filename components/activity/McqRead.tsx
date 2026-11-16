"use client";

import { useState, type FormEvent } from "react";
import { cn } from "cn";
import { EnglishText, SubmitButton, type ActivityProps } from "./shared";

// Oku ve seç (`mcq_read`): metin, soru, 3–4 şık. Cevap `{ choice }`.
export function McqRead({ payload, locked, onSubmit }: ActivityProps) {
  const [choice, setChoice] = useState<string | null>(null);
  const options = payload.options ?? [];

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
      <div role="radiogroup" aria-label="Seçenekler" className="flex flex-col gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={choice === option}
            disabled={locked}
            onClick={() => setChoice(option)}
            lang="en"
            className={cn(
              "min-h-12 rounded-lg border px-4 py-3 text-left text-base transition-colors disabled:opacity-70",
              choice === option ? "border-primary bg-primary/10 font-medium" : "border-border bg-background",
            )}
          >
            {option}
          </button>
        ))}
      </div>
      {locked ? null : <SubmitButton disabled={choice === null} />}
    </form>
  );
}
