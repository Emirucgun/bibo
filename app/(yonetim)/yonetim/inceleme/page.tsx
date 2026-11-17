import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageLoading } from "@/components/auth/AuthShell";
import { ReviewQueue } from "@/components/admin/ReviewQueue";
import { reviewQueue, reviewStats } from "@/lib/admin/service";
import { APP_NAME } from "@/lib/content/app";
import { L1_CODES } from "@/lib/content/taxonomy";
import { createAdminClient } from "@/lib/db/admin";

export const metadata: Metadata = { title: `İnceleme · ${APP_NAME}` };

const pct = (x: number | null) => (x === null ? "—" : `%${Math.round(x * 100)}`);

// Öğretmen inceleme kuyruğu (PRD F11): yapay zekâ etiketli hatalardan örneklem, karar, haftalık uyum.
export default function ReviewPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Body />
    </Suspense>
  );
}

async function Body() {
  await connection();
  const db = createAdminClient();
  const [queue, stats] = await Promise.all([reviewQueue(db, 20), reviewStats(db, new Date())]);
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">İnceleme kuyruğu</h1>
        <p className="text-sm text-muted-foreground">
          Son 60 günde yapay zekâ {stats.llmErrors60d} hata etiketledi; {stats.sampled60d} tanesi ({pct(stats.sampleRate)}) kuyruğa alındı.
          Uyum = &quot;Doğru&quot; / tüm kararlar ({stats.total} karar, genel {pct(stats.overall)}).
        </p>
        {stats.weekly.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="font-medium">Hafta</th>
                <th className="font-medium">Karar</th>
                <th className="text-right font-medium">Uyum</th>
              </tr>
            </thead>
            <tbody>
              {stats.weekly.map((w) => (
                <tr key={w.week} className="border-t border-border">
                  <td className="py-1.5">{w.week}</td>
                  <td>{w.total}</td>
                  <td className="text-right">{pct(w.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {stats.byCode.length > 0 ? (
          <details className="text-sm">
            <summary className="cursor-pointer py-2 font-medium">Koda göre uyum</summary>
            <ul className="flex flex-col gap-1">
              {stats.byCode.map((c) => (
                <li key={c.code}>
                  {c.nameTr} ({c.code}): {c.agree}/{c.total} · {pct(c.rate)}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>
      <ReviewQueue initial={queue} codes={L1_CODES.map((c) => ({ code: c.code, nameTr: c.name_tr }))} />
    </div>
  );
}
