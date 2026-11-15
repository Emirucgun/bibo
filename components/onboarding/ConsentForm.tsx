"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { callApi } from "@/lib/api/client";

// POST /api/onboarding/consent. İki kutu da işaretlenmeden devam edilemez (PRD F1).
export function ConsentForm({ consentVersion }: { consentVersion: string }) {
  const router = useRouter();
  const [adult, setAdult] = useState(false);
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !adult || !consent) return;
    setPending(true);
    setError(null);
    const result = await callApi<{ ok: true }>("/api/onboarding/consent", {
      method: "POST",
      body: { adult: true, consentVersion },
    });
    if (result.ok) {
      router.replace("/baslangic/profil");
      return;
    }
    setError(result.message);
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={adult}
          onChange={(event) => setAdult(event.target.checked)}
          className="mt-0.5 size-5 shrink-0"
        />
        <span>18 yaşından büyüğüm.</span>
      </label>
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          className="mt-0.5 size-5 shrink-0"
        />
        <span>
          <Link href="/gizlilik" target="_blank" className="underline underline-offset-4">
            Aydınlatma metnini
          </Link>{" "}
          okudum. Kişisel verilerimin metinde anlatıldığı şekilde işlenmesine ve yurt dışındaki hizmet
          sağlayıcılara aktarılmasına açık rıza veriyorum.
        </span>
      </label>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending || !adult || !consent} className="h-12 w-full text-base">
        {pending ? "Kaydediliyor…" : "Onaylıyorum, devam et"}
      </Button>
    </form>
  );
}
