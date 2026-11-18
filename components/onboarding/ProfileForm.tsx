"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { callApi } from "@/lib/api/client";
import { INTEREST_LABELS_TR, INTERESTS, MIN_INTERESTS, type Interest } from "@/lib/content/interests";

const LEVELS = [
  { value: "A1", label: "A1", note: "Yeni başladım; basit cümleler kurabiliyorum." },
  { value: "A2", label: "A2", note: "Günlük konularda kısa konuşabiliyor, yazabiliyorum." },
  { value: "unsure", label: "Emin değilim", note: "Kısa testle birlikte bakarız." },
] as const;

type LevelSelf = (typeof LEVELS)[number]["value"];

const MODES = [
  { value: "school", label: "Okuldaki derslerime destek", note: "Hazırlık programını izliyorum; oturumlar okuldaki konulara uyum sağlar." },
  { value: "self", label: "Kendi programım", note: "Okula bağlı değilim; konuları baştan sona sırayla, kendi hızımda çalışırım." },
] as const;
type StudyMode = (typeof MODES)[number]["value"];

const GOALS = [
  { value: "communication", label: "Günlük iletişim" },
  { value: "exam", label: "Hazırlık / yeterlik sınavı" },
  { value: "work_travel", label: "İş ya da seyahat" },
] as const;
type Goal = (typeof GOALS)[number]["value"];

function Choice({ name, checked, onChange, label, note }: { name: string; checked: boolean; onChange: () => void; label: string; note?: string }) {
  return (
    <label
      className={cn(
        "flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border px-4 py-3",
        checked ? "border-primary bg-primary/5" : "border-border",
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-1 size-4 shrink-0" />
      <span className="flex flex-col">
        <span className="text-base font-medium">{label}</span>
        {note ? <span className="text-sm text-muted-foreground">{note}</span> : null}
      </span>
    </label>
  );
}

// POST /api/onboarding/profile (PRD F2): seviye beyanı, çalışma modu, hedef ve en az 2 ilgi alanı.
export function ProfileForm({ programs = [] }: { programs?: { id: string; name: string }[] }) {
  const router = useRouter();
  const [level, setLevel] = useState<LevelSelf | null>(null);
  const [mode, setMode] = useState<StudyMode | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [programId, setProgramId] = useState("");
  const [interests, setInterests] = useState<Interest[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = level !== null && mode !== null && goal !== null && interests.length >= MIN_INTERESTS;

  function toggle(i: Interest) {
    setInterests((xs) => (xs.includes(i) ? xs.filter((x) => x !== i) : [...xs, i]));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || pending) return;
    setPending(true);
    setError(null);
    const res = await callApi<{ ok: true }>("/api/onboarding/profile", {
      method: "POST",
      body: {
        levelSelf: level,
        interests,
        studyMode: mode,
        goal,
        ...(mode === "school" && programId ? { programId } : {}),
      },
    });
    if (res.ok) {
      router.replace("/baslangic/yerlestirme");
      return;
    }
    setError(res.message);
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-base font-medium">İngilizcen şu an hangi seviyede?</legend>
        {LEVELS.map((l) => (
          <label
            key={l.value}
            className={cn(
              "flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border px-4 py-3",
              level === l.value ? "border-primary bg-primary/5" : "border-border",
            )}
          >
            <input
              type="radio"
              name="level"
              value={l.value}
              checked={level === l.value}
              onChange={() => setLevel(l.value)}
              className="mt-1 size-4 shrink-0"
            />
            <span className="flex flex-col">
              <span className="text-base font-medium">{l.label}</span>
              <span className="text-sm text-muted-foreground">{l.note}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-base font-medium">Nasıl çalışmak istiyorsun?</legend>
        {MODES.map((m) => (
          <Choice key={m.value} name="mode" checked={mode === m.value} onChange={() => setMode(m.value)} label={m.label} note={m.note} />
        ))}
        {mode === "school" && programs.length > 0 ? (
          <label className="mt-1 flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Programın listede varsa seç; haftanın konusunu sormamıza gerek kalmaz.</span>
            <select
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
              className="h-12 w-full rounded-lg border border-input bg-background px-3 text-base"
            >
              <option value="">Listede yok / bilmiyorum</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-base font-medium">İngilizceyi en çok ne için istiyorsun?</legend>
        {GOALS.map((g) => (
          <Choice key={g.value} name="goal" checked={goal === g.value} onChange={() => setGoal(g.value)} label={g.label} />
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-base font-medium">Neler ilgini çekiyor?</legend>
        <p className="mb-2 text-sm text-muted-foreground">
          En az {MIN_INTERESTS} tane seç. Etkinlikleri bu konularla hazırlayacağız.
        </p>
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

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={!ready || pending} className="h-12 w-full text-base">
        {pending ? "Kaydediliyor…" : ready ? "Devam et" : `Soruları cevapla ve en az ${MIN_INTERESTS} ilgi alanı seç`}
      </Button>
    </form>
  );
}
