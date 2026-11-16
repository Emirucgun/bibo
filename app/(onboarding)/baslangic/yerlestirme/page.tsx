import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthHeading, AuthShell, PageLoading } from "@/components/auth/AuthShell";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { StepGate } from "@/components/onboarding/StepGate";
import { APP_NAME } from "@/lib/content/app";

export const metadata: Metadata = { title: `Yerleştirme · ${APP_NAME}` };

// Yer tutucu: bu adımın gerçek sayfası M9'da gelir (docs/ROADMAP.md).
export default function PlacementPlaceholderPage() {
  return (
    <AuthShell>
      <Suspense fallback={<PageLoading />}>
        <StepGate step="placement">
          <AuthHeading
            title="Kaydın tamam"
            lead="Rızan kaydedildi. Bir sonraki adım çok yakında burada olacak; hazır olduğunda sana haber vereceğiz."
          />
          <SignOutButton />
        </StepGate>
      </Suspense>
    </AuthShell>
  );
}
