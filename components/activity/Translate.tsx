"use client";

import { FreeTextForm, type ActivityProps } from "./shared";

// Türkçeden çevir (`translate_tr_en`): yapay zekâ değerlendirir. Cevap `{ text }`.
export function Translate({ payload, locked, onSubmit }: ActivityProps) {
  return (
    <FreeTextForm locked={locked} onSubmit={onSubmit} rows={3} label="İngilizce çevirin">
      <p className="rounded-lg bg-muted px-4 py-3 text-base leading-relaxed">{payload.source_tr}</p>
    </FreeTextForm>
  );
}
