import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell, PageLoading } from "@/components/auth/AuthShell";
import { InviteScreen } from "@/components/onboarding/InviteScreen";
import { isValidInviteCode } from "@/lib/auth/paths";
import { APP_NAME } from "@/lib/content/app";

export const metadata: Metadata = { title: `Davet · ${APP_NAME}` };

// Davet linki. Kodu çereze proxy.ts yazar (Server Component'te çerez yazılmaz).
export default function InviteCodePage({ params }: PageProps<"/davet/[code]">) {
  return (
    <AuthShell>
      <Suspense fallback={<PageLoading />}>
        <InviteWithCode params={params} />
      </Suspense>
    </AuthShell>
  );
}

async function InviteWithCode({ params }: Pick<PageProps<"/davet/[code]">, "params">) {
  const { code } = await params;
  return <InviteScreen code={isValidInviteCode(code) ? code : null} />;
}
