import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthHeading, AuthShell, PageLoading } from "@/components/auth/AuthShell";
import { ProfileForm } from "@/components/onboarding/ProfileForm";
import { StepGate } from "@/components/onboarding/StepGate";
import { APP_NAME } from "@/lib/content/app";
import { createClient } from "@/lib/db/server";

export const metadata: Metadata = { title: `Profil · ${APP_NAME}` };

// Başlangıç adımı 3/4: seviye beyanı, çalışma modu, hedef ve ilgi alanları (PRD F2, SPEC 6
// `POST /api/onboarding/profile`; docs/arastirma/mufredat-onerisi.md).
export default function ProfilePage() {
  return (
    <AuthShell>
      <Suspense fallback={<PageLoading />}>
        <StepGate step="profile">
          <AuthHeading title="Seni biraz tanıyalım" lead="Adım 1/2 · Bir dakikadan kısa sürer." />
          <ProfileFormWithPrograms />
        </StepGate>
      </Suspense>
    </AuthShell>
  );
}

/** Okul programı haritaları (pedagoji sahibi doldurur); yoksa soru gösterilmez. */
async function ProfileFormWithPrograms() {
  const supabase = await createClient();
  const { data } = await supabase.from("programs").select("id, name").eq("active", true).order("name");
  return <ProfileForm programs={(data ?? []).map((p) => ({ id: p.id, name: p.name }))} />;
}
