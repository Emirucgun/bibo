"use client";

import { FreeTextForm, type ActivityProps } from "./shared";

// Kısa yaz (`short_write`): 2–3 cümle, yapay zekâ değerlendirir. Cevap `{ text }`.
export function ShortWrite({ payload, locked, onSubmit }: ActivityProps) {
  return (
    <FreeTextForm locked={locked} onSubmit={onSubmit} rows={5} label="Cevabın (2–3 cümle)">
      {/* Görev Türkçe yönergede tam anlatılır; İngilizcesi ikincil. */}
      <p lang="en" className="text-sm text-muted-foreground">
        {payload.prompt_en}
      </p>
    </FreeTextForm>
  );
}
