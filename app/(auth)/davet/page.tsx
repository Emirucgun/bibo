import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell, PageLoading } from "@/components/auth/AuthShell";
import { InviteScreen } from "@/components/onboarding/InviteScreen";
import { APP_NAME } from "@/lib/content/app";

export const metadata: Metadata = { title: `Davet · ${APP_NAME}` };

// Kodsuz giriş: giriş yapmış ama davet kodu girmemiş kullanıcı buraya düşer.
export default function InvitePage() {
  return (
    <AuthShell>
      <Suspense fallback={<PageLoading />}>
        <InviteScreen code={null} />
      </Suspense>
    </AuthShell>
  );
}
