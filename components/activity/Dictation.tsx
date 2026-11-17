"use client";

import { useState, type FormEvent } from "react";
import { AudioPlayer } from "./AudioPlayer";
import { ANSWER_FIELD_CLASS, ANSWER_INPUT_PROPS, SubmitButton, type ActivityProps } from "./shared";

// Dikte (`dictation`): tek cümle dinlenir ve yazılır. Cevap `{ text }`; kelime düzeyinde puanlanır
// (≥ 0,9 doğru, SPEC 4.6).
export function Dictation({ itemId, locked, onSubmit, onAudioUnavailable }: ActivityProps) {
  const [text, setText] = useState("");
  const ready = text.trim().length > 0;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked || !ready) return;
    onSubmit({ text: text.trim() });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <AudioPlayer itemId={itemId} onUnavailable={onAudioUnavailable} />
      <textarea
        {...ANSWER_INPUT_PROPS}
        autoCapitalize="sentences"
        aria-label="Duyduğun cümle"
        placeholder="Duyduğunu yaz"
        rows={2}
        maxLength={300}
        value={text}
        disabled={locked}
        onChange={(event) => setText(event.target.value)}
        className={`${ANSWER_FIELD_CLASS} resize-none`}
      />
      {locked ? null : <SubmitButton disabled={!ready} />}
    </form>
  );
}
