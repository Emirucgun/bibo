import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell, PageLoading } from "@/components/auth/AuthShell";
import { PlacementFlow } from "@/components/onboarding/PlacementFlow";
import { StepGate } from "@/components/onboarding/StepGate";
import { APP_NAME } from "@/lib/content/app";

export const metadata: Metadata = { title: `Yerleştirme · ${APP_NAME}` };

// Başlangıç adımı 4/4: 14 soruluk sabit yerleştirme testi (PRD F2, SPEC Ek C).
export default function PlacementPage() {
  return (
    <AuthShell>
      <Suspense fallback={<PageLoading />}>
        <StepGate step="placement">
          <PlacementFlow />
        </StepGate>
      </Suspense>
    </AuthShell>
  );
}
