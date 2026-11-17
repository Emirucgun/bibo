import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { cn } from "cn";
import { PageLoading } from "@/components/auth/AuthShell";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { AppHeader } from "@/components/home/AppHeader";
import { DeleteAccount, SettingsForm } from "@/components/settings/SettingsForm";
import { buttonVariants } from "@/components/ui/button";
import { getViewer } from "@/lib/auth/viewer";
import { APP_NAME } from "@/lib/content/app";
import { isInterest } from "@/lib/content/interests";
import { createClient } from "@/lib/db/server";

export const metadata: Metadata = { title: `Ayarlar · ${APP_NAME}` };

// Ayarlar: profil, açıklama modu, verimi indir, hesabımı sil (PRD F13), çıkış.
export default function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <Suspense fallback={<div className="h-11" />}>
        <AppHeader />
      </Suspense>
      <h1 className="text-2xl font-semibold">Ayarlar</h1>
      <Suspense fallback={<PageLoading />}>
        <Body />
      </Suspense>
    </main>
  );
}

async function Body() {
  const viewer = await getViewer();
  if (!viewer) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("display_name, interests, explain_mode")
    .eq("id", viewer.userId)
    .maybeSingle();
  return (
    <div className="flex flex-col gap-8">
      <SettingsForm
        initial={{
          displayName: data?.display_name ?? "",
          interests: ((data?.interests as string[] | null) ?? []).filter(isInterest),
          explainMode: data?.explain_mode === "long" ? "long" : "short",
        }}
      />
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Verilerin</h2>
        <p className="text-sm text-muted-foreground">
          Hakkındaki tüm kayıtları JSON dosyası olarak indirebilir ya da hesabını silebilirsin.{" "}
          <Link href="/gizlilik" className="underline underline-offset-4">
            Aydınlatma metni
          </Link>
        </p>
        <a href="/api/account/export" download className={cn(buttonVariants({ variant: "outline" }), "h-12 w-full text-base")}>
          Verimi indir
        </a>
        <DeleteAccount />
      </section>
      <SignOutButton />
    </div>
  );
}
