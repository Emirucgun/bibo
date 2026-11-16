import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AccountProblem } from "@/components/auth/AccountProblem";
import { AuthHeading } from "@/components/auth/AuthShell";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { InviteForm } from "@/components/onboarding/InviteForm";
import { INVITE_COOKIE, isValidInviteCode } from "@/lib/auth/paths";
import { getViewer } from "@/lib/auth/viewer";
import { stepPath } from "@/lib/onboarding/steps";

// /davet ve /davet/[code] ortak içeriği. Girişsiz: Google düğmesi. Giriş yapmış ve
// adımı `invite`: kod formu. Daha ileri adımdaki kullanıcı kendi adımına gider.
export async function InviteScreen({ code }: { code: string | null }) {
  const viewer = await getViewer();

  if (!viewer) {
    return (
      <>
        <AuthHeading
          title="Kaynak'a davetlisin"
          lead="Devam etmek için Google hesabınla giriş yap. Davet kodun bir sonraki adımda hazır gelecek."
        />
        <GoogleButton />
      </>
    );
  }

  if (!viewer.profile) return <AccountProblem />;
  if (viewer.profile.onboardingStep !== "invite") redirect(stepPath(viewer.profile.onboardingStep));

  const fromCookie = (await cookies()).get(INVITE_COOKIE)?.value;
  const defaultCode = code ?? (isValidInviteCode(fromCookie) ? fromCookie : "");

  return (
    <>
      <AuthHeading
        title="Davet kodunu gir"
        lead="Kaynak şu an yalnızca davetle açık. Kod, sana gönderilen davet linkinin sonundadır."
      />
      <InviteForm defaultCode={defaultCode} />
      <SignOutButton label="Farklı bir hesapla gir" />
    </>
  );
}
