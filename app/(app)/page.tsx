import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { AppHeader } from "@/components/home/AppHeader";
import { HomeOptionsCard } from "@/components/home/HomeOptionsCard";
import { TodayCard } from "@/components/session/TodayCard";
import { getViewer } from "@/lib/auth/viewer";
import { APP_TAGLINE } from "@/lib/content/app";

// Ana sayfa: bugünkü oturum (SPEC Bölüm 2 dizin yapısı, PRD A2), "Bugün ne çalışalım?" seçenekleri
// ve haftalık okul konusu sorusu (F10). Kapsam dışı öğrenci "çok yakında" sayfasına gider.
export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <ScopeRedirect>
        <Home />
      </ScopeRedirect>
    </Suspense>
  );
}

async function ScopeRedirect({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  if (viewer?.profile && viewer.profile.scopeStatus !== "in_scope") redirect("/kapsam");
  return children;
}

function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <Suspense fallback={<div className="h-11" />}>
        <AppHeader />
      </Suspense>
      <p className="text-sm text-muted-foreground">{APP_TAGLINE}</p>
      <TodayCard />
      <HomeOptionsCard />
    </main>
  );
}
