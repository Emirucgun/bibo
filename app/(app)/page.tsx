import { SignOutButton } from "@/components/auth/SignOutButton";
import { TodayCard } from "@/components/session/TodayCard";
import { APP_NAME, APP_TAGLINE } from "@/lib/content/app";

// Ana sayfa: bugünkü oturum (SPEC Bölüm 2 dizin yapısı, PRD A2).
export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{APP_NAME}</h1>
        <p className="text-sm text-muted-foreground">{APP_TAGLINE}</p>
      </header>
      <TodayCard />
      <div className="mt-auto">
        <SignOutButton />
      </div>
    </main>
  );
}
