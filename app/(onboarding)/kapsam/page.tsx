import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AccountProblem } from "@/components/auth/AccountProblem";
import { AuthShell, PageLoading } from "@/components/auth/AuthShell";
import { ScopeNotice } from "@/components/onboarding/ScopeNotice";
import { getViewer } from "@/lib/auth/viewer";
import { APP_NAME } from "@/lib/content/app";
import { stepPath } from "@/lib/onboarding/steps";

export const metadata: Metadata = { title: `Çok yakında · ${APP_NAME}` };

// Kapsam dışı öğrencinin sayfası (docs/SPEC.md 4.7). Kapsam içindeyse ana sayfaya döner.
export default function ScopePage() {
  return (
    <AuthShell>
      <Suspense fallback={<PageLoading />}>
        <ScopeGate />
      </Suspense>
    </AuthShell>
  );
}

async function ScopeGate() {
  const viewer = await getViewer();
  if (!viewer) redirect("/giris");
  if (!viewer.profile) return <AccountProblem />;
  if (viewer.profile.onboardingStep !== "done") redirect(stepPath(viewer.profile.onboardingStep));
  if (viewer.profile.scopeStatus === "in_scope") redirect("/");
  return (
    <div className="flex flex-col gap-6">
      <ScopeNotice status={viewer.profile.scopeStatus} />
      <Link href="/ayarlar" className="text-sm text-muted-foreground underline">
        Hesap ayarları
      </Link>
    </div>
  );
}
