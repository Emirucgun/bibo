import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { Logo } from "@/components/brand/Logo";
import { LoginError } from "@/components/auth/LoginError";
import { APP_NAME, APP_TAGLINE } from "@/lib/content/app";

export const metadata: Metadata = { title: `Giriş · ${APP_NAME}` };

// Giriş yapmış kullanıcıyı proxy.ts ana sayfaya yönlendirir; bu sayfa yalnızca girişsiz görünür.
export default function LoginPage() {
  return (
    <AuthShell>
      <header className="flex flex-col gap-3">
        <h1>
          <Logo width={192} className="h-auto w-48" />
        </h1>
        <p className="text-base text-muted-foreground">{APP_TAGLINE}</p>
      </header>
      <Suspense fallback={null}>
        <LoginError />
      </Suspense>
      <GoogleButton />
      <p className="text-sm text-muted-foreground">
        {APP_NAME} şu an yalnızca davetle açık. Davet linkin varsa önce onu aç; kodun hazır gelir.
      </p>
      <p className="text-sm">
        <Link href="/gizlilik" className="underline underline-offset-4">
          Gizlilik ve aydınlatma metni
        </Link>
      </p>
    </AuthShell>
  );
}
