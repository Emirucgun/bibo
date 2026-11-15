import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AccountProblem } from "@/components/auth/AccountProblem";
import { getViewer } from "@/lib/auth/viewer";
import { stepPath, type OnboardingStep } from "@/lib/onboarding/steps";

// Başlangıç sayfalarının kapısı: kullanıcı yalnızca bulunduğu adımın sayfasını görür;
// başka adımdaysa oraya yönlendirilir. Bir <Suspense> içinde kullanılır (çerez okur).
export async function StepGate({ step, children }: { step: OnboardingStep; children: ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/giris");
  if (!viewer.profile) return <AccountProblem />;
  if (viewer.profile.onboardingStep !== step) redirect(stepPath(viewer.profile.onboardingStep));
  return children;
}
