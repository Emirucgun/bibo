"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { callApi } from "@/lib/api/client";

// POST /api/onboarding/invite. Kod linkten geldiyse dolu gelir (PRD A1, adım 2).
export function InviteForm({ defaultCode }: { defaultCode: string }) {
  const router = useRouter();
  const [code, setCode] = useState(defaultCode);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await callApi<{ ok: true; cohortName: string | null }>("/api/onboarding/invite", {
      method: "POST",
      body: { code: code.trim() },
    });
    if (result.ok) {
      router.replace("/baslangic/onam");
      return;
    }
    setError(result.message);
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor="invite-code" className="text-sm font-medium">
          Davet kodu
        </label>
        <input
          id="invite-code"
          name="code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={64}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "invite-error" : undefined}
          className="h-12 rounded-lg border border-border bg-background px-3 font-mono text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
        />
        {error ? (
          <p id="invite-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <Button type="submit" disabled={pending || code.trim() === ""} className="h-12 w-full text-base">
        {pending ? "Kontrol ediliyor…" : "Devam et"}
      </Button>
    </form>
  );
}
