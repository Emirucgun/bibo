import { AuthHeading } from "@/components/auth/AuthShell";
import { SignOutButton } from "@/components/auth/SignOutButton";

// Oturum var ama profil satırı yok (ör. hesap başka bir cihazdan silindi).
export function AccountProblem() {
  return (
    <>
      <AuthHeading
        title="Hesabını bulamadık"
        lead="Oturumun açık görünüyor ama hesabın kayıtlı değil. Çıkış yapıp yeniden giriş yapmayı dene."
      />
      <SignOutButton />
    </>
  );
}
