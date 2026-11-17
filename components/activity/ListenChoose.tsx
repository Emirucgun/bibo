"use client";

import { useState, type FormEvent } from "react";
import { AudioPlayer } from "./AudioPlayer";
import { ChoiceList, SubmitButton, type ActivityProps } from "./shared";

// Dinle ve seç (`listen_choose`): ses (metin gösterilmez), soru, 3–4 şık. Cevap `{ choice }`.
export function ListenChoose({ itemId, payload, locked, onSubmit, onAudioUnavailable }: ActivityProps) {
  const [choice, setChoice] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked || choice === null) return;
    onSubmit({ choice });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <AudioPlayer itemId={itemId} onUnavailable={onAudioUnavailable} />
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
