"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { callApi } from "@/lib/api/client";
import { INTEREST_LABELS_TR, INTERESTS, MIN_INTERESTS, type Interest } from "@/lib/content/interests";

export interface SettingsInitial {
  displayName: string;
  interests: Interest[];
  explainMode: "short" | "long";
}

// PATCH /api/profile: ad, ilgi alanları, açıklama modu (SPEC 6).
export function SettingsForm({ initial }: { initial: SettingsInitial }) {
  const [name, setName] = useState(initial.displayName);
  const [interests, setInterests] = useState<Interest[]>(initial.interests);
  const [mode, setMode] = useState(initial.explainMode);
  const [state, setState] = useState<"idle" | "pending" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const valid = name.trim().length > 0 && interests.length >= MIN_INTERESTS;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || state === "pending") return;
    setState("pending");
    setError(null);
    const res = await callApi("/api/profile", {
      method: "PATCH",
      body: { displayName: name.trim(), interests, explainMode: mode },
    });
    if (res.ok) setState("saved");
    else {
      setError(res.message);
      setState("idle");
    }
  }

  const toggle = (i: Interest) => {
    setState("idle");
    setInterests((xs) => (xs.includes(i) ? xs.filter((x) => x !== i) : [...xs, i]));
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Adın</span>
        <input
          value={name}
          maxLength={80}
          onChange={(e) => {
            setName(e.target.value);
            setState("idle");
          }}
          className="h-12 rounded-lg border border-input bg-background px-3 text-base"
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">İlgi alanların (en az {MIN_INTERESTS})</legend>
        <div className="flex flex-wrap gap-2">
          {INTERESTS.map((i) => {
            const on = interests.includes(i);
            return (
              <button
                key={i}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(i)}
                className={cn(
                  "min-h-11 rounded-full border px-4 text-sm font-medium",
                  on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
                )}
              >
                {on ? "✓ " : ""}
                {INTEREST_LABELS_TR[i]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Yanlış cevapta açıklama</legend>
        {(
          [
            ["short", "Kısa", "Bir iki cümle; istersen fazlasını açarsın."],
            ["long", "Uzun", "Açıklamanın tamamı kendiliğinden açılır."],
          ] as const
        ).map(([v, label, note]) => (
          <label key={v} className={cn("flex min-h-12 items-start gap-3 rounded-lg border px-4 py-3", mode === v ? "border-primary bg-primary/5" : "border-border")}>
            <input
              type="radio"
              name="explain"
              checked={mode === v}
              onChange={() => {
                setMode(v);
                setState("idle");
              }}
              className="mt-1 size-4"
            />
            <span className="flex flex-col">
              <span className="text-sm font-medium">{label}</span>
              <span className="text-sm text-muted-foreground">{note}</span>
            </span>
          </label>
        ))}
        <p className="text-xs text-muted-foreground">Uygulama, açıklamaları ne sıklıkla açtığına göre bunu kendisi de değiştirebilir.</p>
      </fieldset>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={!valid || state === "pending"} className="h-12 w-full text-base">
        {state === "pending" ? "Kaydediliyor…" : state === "saved" ? "Kaydedildi ✓" : "Kaydet"}
      </Button>
    </form>
  );
}

// DELETE /api/account · { confirm: "SİL" } (PRD F13): geri alınamaz uyarısıyla.
export function DeleteAccount() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (text !== "SİL" || pending) return;
    setPending(true);
    setError(null);
    const res = await callApi("/api/account", { method: "DELETE", body: { confirm: "SİL" } });
    if (res.ok) {
      router.replace("/giris");
      router.refresh();
      return;
    }
    setError(res.message);
    setPending(false);
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)} className="h-12 w-full text-base text-destructive">
        Hesabımı sil
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-destructive/40 p-4">
      <p className="text-sm leading-relaxed">
        <strong>Bu işlem geri alınamaz.</strong> Hesabın, cevapların, puanların ve teşhislerin kalıcı olarak silinir.
        Devam etmek için kutuya büyük harflerle <strong>SİL</strong> yaz.
      </p>
      <input
        aria-label="Onay"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="h-12 rounded-lg border border-input bg-background px-3 text-base"
        autoCapitalize="characters"
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={() => setOpen(false)} className="h-11">
          Vazgeç
        </Button>
        <Button type="button" variant="destructive" disabled={text !== "SİL" || pending} onClick={remove} className="h-11">
          {pending ? "Siliniyor…" : "Kalıcı olarak sil"}
        </Button>
      </div>
    </div>
  );
}
