import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AccountProblem } from "@/components/auth/AccountProblem";
import { AuthHeading } from "@/components/auth/AuthShell";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { Bibo } from "@/components/brand/Bibo";
import { InviteForm } from "@/components/onboarding/InviteForm";
import { INVITE_COOKIE, isValidInviteCode } from "@/lib/auth/paths";
import { getViewer } from "@/lib/auth/viewer";
import { tryAutoJoin } from "@/lib/onboarding/auto-join";
import { stepPath } from "@/lib/onboarding/steps";

// /davet ve /davet/[code] ortak içeriği. Girişsiz: Google düğmesi. Giriş yapmış ve
// adımı `invite`: kod formu. Daha ileri adımdaki kullanıcı kendi adımına gider.
export async function InviteScreen({ code }: { code: string | null }) {
  const viewer = await getViewer();

  if (!viewer) {
    return (
      <>
        <AuthHeading
          visual={<Bibo state="merhaba" size={120} className="size-28" />}
          title="bibo'ya davetlisin"
          lead="Devam etmek için Google hesabınla giriş yap. Davet kodun bir sonraki adımda hazır gelecek."
        />
        <GoogleButton />
      </>
    );
  }

  if (!viewer.profile) return <AccountProblem />;
  if (viewer.profile.onboardingStep !== "invite") redirect(stepPath(viewer.profile.onboardingStep));
  // Açık deneme açıksa kod sorulmaz (PLAN karar 34).
  if (!code && (await tryAutoJoin(viewer.userId))) redirect(stepPath("consent"));

  const fromCookie = (await cookies()).get(INVITE_COOKIE)?.value;
  const defaultCode = code ?? (isValidInviteCode(fromCookie) ? fromCookie : "");

  return (
    <>
      <AuthHeading
        title="Davet kodunu gir"
        lead="bibo şu an yalnızca davetle açık. Kod, sana gönderilen davet linkinin sonundadır."
      />
      <InviteForm defaultCode={defaultCode} />
      <SignOutButton label="Farklı bir hesapla gir" />
    </>
  );
}
