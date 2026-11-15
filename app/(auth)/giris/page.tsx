import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthHeading, AuthShell } from "@/components/auth/AuthShell";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { LoginError } from "@/components/auth/LoginError";
import { APP_NAME, APP_TAGLINE } from "@/lib/content/app";

export const metadata: Metadata = { title: `Giriş · ${APP_NAME}` };

// Giriş yapmış kullanıcıyı proxy.ts ana sayfaya yönlendirir; bu sayfa yalnızca girişsiz görünür.
export default function LoginPage() {
  return (
    <AuthShell>
      <AuthHeading title={APP_NAME} lead={APP_TAGLINE} />
      <Suspense fallback={null}>
        <LoginError />
      </Suspense>
      <GoogleButton />
      <p className="text-sm text-muted-foreground">
        Kaynak şu an yalnızca davetle açık. Davet linkin varsa önce onu aç; kodun hazır gelir.
      </p>
      <p className="text-sm">
        <Link href="/gizlilik" className="underline underline-offset-4">
          Gizlilik ve aydınlatma metni
        </Link>
      </p>
    </AuthShell>
  );
}
