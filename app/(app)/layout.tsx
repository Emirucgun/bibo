import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { AccountProblem } from "@/components/auth/AccountProblem";
import { AuthShell, PageLoading } from "@/components/auth/AuthShell";
import { getViewer } from "@/lib/auth/viewer";
import { stepPath } from "@/lib/onboarding/steps";

// Başlangıç kapısı (SPEC Bölüm 7): onboarding_step 'done' değilse ilgili adıma yönlendirir.
// Bu kapı yalnızca yönlendirmedir; veri erişimi Route Handler'larda requireUser() /
// requireOnboarded() ve RLS ile korunur.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense
      fallback={
        <AuthShell>
          <PageLoading />
        </AuthShell>
      }
    >
      <OnboardingGate>{children}</OnboardingGate>
    </Suspense>
  );
}

async function OnboardingGate({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/giris");
  if (!viewer.profile) {
    return (
      <AuthShell>
        <AccountProblem />
      </AuthShell>
    );
  }
  if (viewer.profile.onboardingStep !== "done") redirect(stepPath(viewer.profile.onboardingStep));
  return children;
}
