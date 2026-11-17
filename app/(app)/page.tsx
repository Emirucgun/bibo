import { Suspense } from "react";
import { AppHeader } from "@/components/home/AppHeader";
import { SchoolTopicCard } from "@/components/home/SchoolTopicCard";
import { TodayCard } from "@/components/session/TodayCard";
import { getViewer } from "@/lib/auth/viewer";
import { APP_TAGLINE } from "@/lib/content/app";
import { TOPICS } from "@/lib/content/taxonomy";
import { createClient } from "@/lib/db/server";
import { schoolTopicAnswered } from "@/lib/progress/load";

// Ana sayfa: bugünkü oturum (SPEC Bölüm 2 dizin yapısı, PRD A2) ve haftalık okul konusu sorusu (F10).
export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <Suspense fallback={<div className="h-11" />}>
        <AppHeader />
      </Suspense>
      <p className="text-sm text-muted-foreground">{APP_TAGLINE}</p>
      <TodayCard />
      <Suspense fallback={null}>
        <SchoolTopic />
      </Suspense>
    </main>
  );
}

async function SchoolTopic() {
  const viewer = await getViewer();
  if (!viewer) return null;
  const now = new Date();
  if (await schoolTopicAnswered(viewer.userId, now)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("level_est").eq("id", viewer.userId).maybeSingle();
  const a2 = data?.level_est === "A2";
  const topics = TOPICS.filter((t) => t.active && t.kind === "grammar" && (a2 || t.level === "A1")).map((t) => ({
    id: t.id,
    titleTr: t.title_tr,
  }));
  return <SchoolTopicCard topics={topics} />;
}
