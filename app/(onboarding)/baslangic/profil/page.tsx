import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthHeading, AuthShell, PageLoading } from "@/components/auth/AuthShell";
import { ProfileForm } from "@/components/onboarding/ProfileForm";
import { StepGate } from "@/components/onboarding/StepGate";
import { APP_NAME } from "@/lib/content/app";

export const metadata: Metadata = { title: `Profil · ${APP_NAME}` };

// Başlangıç adımı 3/4: seviye beyanı ve ilgi alanları (PRD F2, SPEC 6 `POST /api/onboarding/profile`).
export default function ProfilePage() {
  return (
    <AuthShell>
      <Suspense fallback={<PageLoading />}>
        <StepGate step="profile">
          <AuthHeading title="Seni biraz tanıyalım" lead="Adım 1/2 · Bir dakikadan kısa sürer." />
          <ProfileForm />
        </StepGate>
      </Suspense>
    </AuthShell>
  );
}
