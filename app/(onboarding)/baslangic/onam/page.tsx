import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthHeading, AuthShell, PageLoading } from "@/components/auth/AuthShell";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { ConsentForm } from "@/components/onboarding/ConsentForm";
import { StepGate } from "@/components/onboarding/StepGate";
import { APP_NAME } from "@/lib/content/app";

export const metadata: Metadata = { title: `Onam · ${APP_NAME}` };

// 18+ beyanı ve açık rıza (PRD F1, A1 adım 3). Sürüm CONSENT_VERSION'dan gelir ve
// rıza ile birlikte kaydedilir.
export default function ConsentPage() {
  return (
    <AuthShell>
      <Suspense fallback={<PageLoading />}>
        <StepGate step="consent">
          <Consent />
        </StepGate>
      </Suspense>
    </AuthShell>
  );
}

function Consent() {
  const consentVersion = process.env.CONSENT_VERSION;
  if (!consentVersion) {
    return (
      <AuthHeading
        title="Şu an devam edemiyoruz"
        lead="Onam adımı geçici olarak kullanılamıyor. Biraz sonra yeniden dene."
      />
    );
  }

  return (
    <>
      <AuthHeading
        title="Başlamadan önce"
        lead="bibo, hatalarının kaynağını bulmak için cevaplarını kaydeder ve yapay zekâ ile değerlendirir."
      />
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
        <li>Adın, e-posta adresin, seviyen, ilgi alanların ve cevapların saklanır.</li>
        <li>Yazılı cevapların ve konuşma kayıtlarının yazıya dökülmüş hâli yapay zekâya gönderilir.</li>
        <li>Ses kaydın saklanmaz; yalnızca yazıya dökmek için kullanılır.</li>
        <li>Verini istediğin zaman silebilirsin.</li>
      </ul>
      <ConsentForm consentVersion={consentVersion} />
      <SignOutButton />
    </>
  );
}
