"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { callApi } from "@/lib/api/client";
import { EDITABLE_KEYS, SETTING_LABELS_TR, type EditableKey } from "@/lib/admin/settings";

type Voice = { id: string; name: string; gender: string | null; tags: string[] };

// Ayarlar (ROADMAP M10, yalnızca admin): her anahtar ayrı kaydedilir; acil durdurma tek dokunuş.
export function SettingsPanel({ initial }: { initial: Record<EditableKey, unknown> }) {
  const [values, setValues] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [suggested, setSuggested] = useState<string | null>(null);

  useEffect(() => {
    void callApi<{ voices: Voice[]; suggested: string | null; assigned: string | null }>("/api/admin/voices", { method: "GET" }).then((r) => {
      if (r.ok) {
        setVoices(r.data.voices);
        setSuggested(r.data.suggested);
        if (r.data.assigned) {
          setValues((v) => ({ ...v, tts_voice: r.data.assigned }));
          setMsg(`Seslendirme sesi seçilmemişti; önerilen ses atandı (${r.data.assigned}). Dinleme etkinlikleri açıldı.`);
        }
      } else setVoices([]);
    });
  }, []);

  async function save(key: EditableKey, value: unknown) {
    setMsg(null);
    const res = await callApi("/api/admin/settings", { method: "PATCH", body: { key, value } });
    if (res.ok) {
      setValues((v) => ({ ...v, [key]: value }));
      setMsg(`${SETTING_LABELS_TR[key]} kaydedildi.`);
    } else setMsg(`${SETTING_LABELS_TR[key]}: ${res.message}`);
  }

  const kill = values.kill_switch === true;
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Ayarlar</h2>
      <Button
        type="button"
        variant={kill ? "outline" : "destructive"}
        className="h-12 w-full text-base"
        onClick={() => {
          if (kill || window.confirm("Tüm yapay zekâ, transkript ve seslendirme çağrıları durdurulsun mu?")) void save("kill_switch", !kill);
        }}
      >
        {kill ? "Acil durdurmayı kapat (çağrılar yeniden açılsın)" : "ACİL DURDUR"}
      </Button>
      {msg ? (
        <p role="status" className="text-sm">
          {msg}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {EDITABLE_KEYS.filter((k) => k !== "kill_switch").map((k) => (
          <SettingRow
            key={`${k}:${String(values[k])}`}
            k={k}
            value={values[k]}
            onSave={save}
            voices={k === "tts_voice" ? voices : null}
            suggested={k === "tts_voice" ? suggested : null}
          />
        ))}
      </div>
    </section>
  );
}

function SettingRow({
  k,
  value,
  onSave,
  voices,
  suggested,
}: {
  k: EditableKey;
  value: unknown;
  onSave: (k: EditableKey, v: unknown) => Promise<void>;
  voices: Voice[] | null;
  suggested: string | null;
}) {
  const [draft, setDraft] = useState(value === null || value === undefined ? "" : String(value));
  const [busy, setBusy] = useState(false);
  const isBool = typeof value === "boolean";
  const isNum = typeof value === "number";

  async function submit(v: unknown) {
    setBusy(true);
    await onSave(k, v);
    setBusy(false);
  }

  if (isBool) {
    return (
      <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
        <span>{SETTING_LABELS_TR[k]}</span>
        <input type="checkbox" checked={value as boolean} disabled={busy} onChange={(e) => void submit(e.target.checked)} className="size-5" />
      </label>
    );
  }
  return (
    <form
      className="flex flex-col gap-1.5 rounded-lg border border-border px-3 py-2 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(isNum ? Number(draft) : draft.trim() === "" ? null : draft.trim());
      }}
    >
      <span>{SETTING_LABELS_TR[k]}</span>
      <div className="flex gap-2">
        {voices && voices.length > 0 ? (
          <select value={draft} onChange={(e) => setDraft(e.target.value)} className="h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-2">
            <option value="">(seçilmedi: dinleme kapalı)</option>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} · {v.gender ?? "?"}
                {v.id === suggested ? " · önerilen" : ""}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={draft}
            inputMode={isNum ? "decimal" : "text"}
            onChange={(e) => setDraft(e.target.value)}
            className="h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-2"
          />
        )}
        <Button type="submit" variant="outline" disabled={busy} className="h-11">
          Kaydet
        </Button>
      </div>
    </form>
  );
}
