import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/auth/AuthShell";
import { SessionRunner } from "@/components/session/SessionRunner";
import { getViewer } from "@/lib/auth/viewer";
import { APP_NAME } from "@/lib/content/app";
import { createClient } from "@/lib/db/server";

export const metadata: Metadata = { title: `Oturum · ${APP_NAME}` };

// Oturum ekranı. Etkinlikler istemcide `GET /api/sessions/:id` ile (anahtarsız) okunur.
export default function SessionPage({ params }: PageProps<"/oturum/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-6">
      <Suspense fallback={<PageLoading />}>
        <Session params={params} />
      </Suspense>
    </main>
  );
}

async function Session({ params }: Pick<PageProps<"/oturum/[id]">, "params">) {
  const { id } = await params;
  // Açıklama modu profilden, kullanıcının kendi istemcisiyle (RLS).
  const viewer = await getViewer();
  let explainMode: "short" | "long" = "short";
  if (viewer) {
    const supabase = await createClient();
    const { data } = await supabase.from("profiles").select("explain_mode").eq("id", viewer.userId).maybeSingle();
    if (data?.explain_mode === "long") explainMode = "long";
  }
  return <SessionRunner sessionId={id} explainMode={explainMode} />;
}
