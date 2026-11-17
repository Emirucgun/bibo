import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { cn } from "cn";
import { PageLoading } from "@/components/auth/AuthShell";
import { SettingsPanel } from "@/components/admin/SettingsPanel";
import { getEditableSettings, getOverview } from "@/lib/admin/service";
import { getViewer } from "@/lib/auth/viewer";
import { APP_NAME } from "@/lib/content/app";
import { createAdminClient } from "@/lib/db/admin";

export const metadata: Metadata = { title: `Yönetim · ${APP_NAME}` };

const pct = (x: number | null) => (x === null ? "—" : `%${Math.round(x * 100)}`);
const usd = (x: number | null, d = 2) => (x === null ? "—" : `${x.toFixed(d)} $`);

const PURPOSE_TR: Record<string, string> = {
  generate: "Oturum üretimi",
  grade: "Değerlendirme",
  transcribe: "Transkript",
  tts: "Seslendirme",
  placement: "Yerleştirme (konuşma)",
};

// Yönetim özeti (SPEC 6 `GET /api/admin/overview`, PRD F12).
export default function AdminPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Overview />
    </Suspense>
  );
}

async function Overview() {
  await connection();
  const viewer = await getViewer();
  const isAdmin = viewer?.profile?.role === "admin";
  const db = createAdminClient();
  const [o, settings] = await Promise.all([getOverview(db, new Date()), isAdmin ? getEditableSettings(db) : null]);
  const e = o.engagement;
  const stat = (label: string, value: string, note?: string) => (
    <div className="rounded-lg border border-border p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold">{value}</dd>
      {note ? <dd className="text-xs text-muted-foreground">{note}</dd> : null}
    </div>
  );
  return (
    <div className="flex flex-col gap-8">
      {o.alerts.length > 0 ? (
        <section className="flex flex-col gap-2" aria-label="Uyarılar">
          {o.alerts.map((a) => (
            <p
              key={a.text}
              role={a.level === "danger" ? "alert" : undefined}
              className={cn(
                "rounded-lg border px-4 py-3 text-sm font-medium",
                a.level === "danger" && "border-red-300 bg-red-50 text-red-900",
                a.level === "warning" && "border-amber-300 bg-amber-50 text-amber-900",
                a.level === "info" && "border-border bg-muted",
              )}
            >
              {a.level === "danger" ? "⛔ " : a.level === "warning" ? "⚠️ " : "ℹ️ "}
              {a.text}
            </p>
          ))}
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Kullanım</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stat("Kayıtlı öğrenci", String(e.registered), `${o.funnel.signedUp} giriş yapan`)}
          {stat("Aktif (7 gün)", String(e.active7d), `${e.sessions7d} oturum`)}
          {stat("Haftada ≥ 4 oturum", pct(e.fourPerWeekRate))}
          {stat("W4 tutma", pct(e.w4Rate), `${e.w4Eligible} kişi uygun`)}
        </dl>
        <p className="text-sm text-muted-foreground">
          Başlangıç hunisi: davet {o.funnel.byStep.invite} · onam {o.funnel.byStep.consent} · profil {o.funnel.byStep.profile} ·
          yerleştirme {o.funnel.byStep.placement} · tamam {o.funnel.byStep.done}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Bu ayın maliyeti</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stat("Toplam", usd(o.cost.totalUsd), `tavan ${o.budgetUsd} $ · plan ${o.ttsPlanUsd} $`)}
          {stat("Oturum başı", usd(o.cost.perSessionUsd, 4), `${o.cost.sessionsThisMonth} oturum`)}
          {stat("Seslendirme karakteri", o.cost.ttsChars.toLocaleString("tr-TR"))}
          {stat("İstem önbelleği", pct(o.cost.cacheHitRate), "okunan girdi payı")}
        </dl>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 font-medium">Çağrı</th>
              <th className="py-1 font-medium">Adet</th>
              <th className="py-1 font-medium">Hatalı</th>
              <th className="py-1 text-right font-medium">Maliyet</th>
            </tr>
          </thead>
          <tbody>
            {o.cost.byPurpose.map((p) => (
              <tr key={p.purpose} className="border-t border-border">
                <td className="py-1.5">{PURPOSE_TR[p.purpose] ?? p.purpose}</td>
                <td>{p.calls}</td>
                <td>{p.failed}</td>
                <td className="text-right">{usd(p.usd, 4)}</td>
              </tr>
            ))}
            {o.cost.byProvider.map((p) => (
              <tr key={`p-${p.provider}`} className="border-t border-border text-muted-foreground">
                <td className="py-1.5">Sağlayıcı: {p.provider}</td>
                <td>{p.calls}</td>
                <td />
                <td className="text-right">{usd(p.usd, 4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Kohortlar ve davet linkleri</h2>
        <ul className="flex flex-col gap-2">
          {o.cohorts.map((c) => (
            <li key={c.id as string} className="flex flex-col gap-1 rounded-lg border border-border p-3 text-sm">
              <span className="font-medium">
                {c.name as string} · {c.members}/{c.capacity as number} kişi
              </span>
              <code className="break-all text-xs">/davet/{c.invite_code as string}</code>
            </li>
          ))}
        </ul>
      </section>

      {settings ? <SettingsPanel initial={settings} /> : null}
    </div>
  );
}
