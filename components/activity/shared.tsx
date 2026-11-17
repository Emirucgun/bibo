"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import type { AttemptResponse } from "@/lib/session/schemas";
import type { ItemPayload } from "@/lib/session/types";

export interface ActivityProps {
  itemId: string;
  payload: ItemPayload;
  /** Cevap gönderildikten sonra ya da gönderilirken `true`: girişler kilitlenir. */
  locked: boolean;
  onSubmit: (response: AttemptResponse) => void;
  /** Dinleme türleri: seslendirme kullanılamıyor (`tts_unavailable`); etkinlik atlanır. */
  onAudioUnavailable?: () => void;
}

/** Dil sınavında tarayıcının otomatik düzeltmesi cevabı değiştirmesin. 16 px: iOS yakınlaştırmasın. */
export const ANSWER_INPUT_PROPS = {
  autoCapitalize: "off",
  autoCorrect: "off",
  autoComplete: "off",
  spellCheck: false,
  lang: "en",
} as const;

export const ANSWER_FIELD_CLASS =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-70";

export function SubmitButton({ disabled, children = "Cevapla" }: { disabled: boolean; children?: ReactNode }) {
  return (
    <Button type="submit" disabled={disabled} className="h-12 w-full text-base">
      {children}
    </Button>
  );
}

/** İngilizce metin kutusu (okuma parçası, soru, görev). */
export function EnglishText({ children }: { children: ReactNode }) {
  return (
    <p lang="en" className="rounded-lg bg-muted px-4 py-3 text-base leading-relaxed">
      {children}
    </p>
  );
}

/** `translate_tr_en` ve `short_write` için ortak serbest metin formu. */
export function FreeTextForm({
  locked,
  onSubmit,
  rows,
  label,
  children,
}: Pick<ActivityProps, "locked" | "onSubmit"> & { rows: number; label: string; children: ReactNode }) {
  const [text, setText] = useState("");
  const ready = text.trim().length > 0;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked || !ready) return;
    onSubmit({ text: text.trim() });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {children}
      <textarea
        {...ANSWER_INPUT_PROPS}
        // Tam cümle yazılan kutuda klavye cümle başını büyütsün; tek kelimelik boşlukta kapalı kalır.
        autoCapitalize="sentences"
        aria-label={label}
        rows={rows}
        maxLength={1000}
        value={text}
        disabled={locked}
        onChange={(event) => setText(event.target.value)}
        className={`${ANSWER_FIELD_CLASS} resize-none`}
      />
      {locked ? null : <SubmitButton disabled={!ready} />}
    </form>
  );
}

/** Şık listesi (`mcq_read`, `listen_choose`). */
export function ChoiceList({
  options,
  choice,
  locked,
  onChoose,
}: {
  options: string[];
  choice: string | null;
  locked: boolean;
  onChoose: (option: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Seçenekler" className="flex flex-col gap-2">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={choice === option}
          disabled={locked}
          onClick={() => onChoose(option)}
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
  );
}
