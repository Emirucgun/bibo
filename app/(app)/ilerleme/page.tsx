import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/auth/AuthShell";
import { AppHeader } from "@/components/home/AppHeader";
import { LevelLegend, ProgressGrid } from "@/components/progress/ProgressGrid";
import { getViewer } from "@/lib/auth/viewer";
import { APP_NAME } from "@/lib/content/app";
import { loadProgress } from "@/lib/progress/load";

export const metadata: Metadata = { title: `İlerleme · ${APP_NAME}` };

// İlerleme ekranı (PRD F9): konu × beceri ızgarası, bu haftaki oturum sayısı, en sık 3 hata.
export default function ProgressPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <Suspense fallback={<div className="h-11" />}>
        <AppHeader />
      </Suspense>
      <h1 className="text-2xl font-semibold">İlerlemen</h1>
      <Suspense fallback={<PageLoading />}>
        <ProgressBody />
      </Suspense>
    </main>
  );
}

async function ProgressBody() {
  const viewer = await getViewer();
  if (!viewer) return null;
  let p;
  try {
    p = await loadProgress(viewer.userId, new Date());
  } catch {
    return (
      <p role="alert" className="text-base">
        İlerlemeni şu an yükleyemedik. Biraz sonra sayfayı yenile.
      </p>
    );
  }
  const measured = p.grid.some((r) => Object.values(r.cells).some((c) => c && c !== "unknown"));
  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border p-4">
          <dt className="text-sm text-muted-foreground">Bu hafta</dt>
          <dd className="text-2xl font-semibold">{p.weekSessions} oturum</dd>
        </div>
        <div className="rounded-lg border border-border p-4">
          <dt className="text-sm text-muted-foreground">Aktif teşhis</dt>
          <dd className="text-2xl font-semibold">{p.diagnoses.length}</dd>
        </div>
      </dl>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">En sık hataların (son 4 hafta)</h2>
        {p.topErrors.length === 0 ? (
          <p className="text-sm text-muted-foreground">Henüz sayılacak kadar hata yok. Oturum yaptıkça burada göreceksin.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {p.topErrors.map((e, i) => (
              <li key={e.code} className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
                <span className="text-sm">
                  <span className="font-semibold">{i + 1}.</span> {e.nameTr}
                </span>
                <span className="shrink-0 text-sm text-muted-foreground">{e.count} kez</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {p.diagnoses.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Şu an üzerinde çalıştıklarımız</h2>
          {p.diagnoses.map((d) => (
            <p key={d.id} className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm leading-relaxed">
              <span className="font-medium">{d.topicTitleTr}: </span>
              {d.messageTr}
            </p>
          ))}
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Konular ve beceriler</h2>
        {!measured ? (
          <p className="text-sm text-muted-foreground">İlk oturumlarından sonra kareler dolmaya başlar.</p>
        ) : null}
        <LevelLegend />
        <ProgressGrid rows={p.grid} />
      </section>
    </div>
  );
}
