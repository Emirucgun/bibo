import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { PageLoading } from "@/components/auth/AuthShell";
import { getViewer } from "@/lib/auth/viewer";
import { Logo } from "@/components/brand/Logo";

// Yönetim kapısı (PRD F11, F12): yalnızca `teacher` ve `admin`. Veri erişimi ayrıca
// Route Handler'larda ve sayfalarda `requireRole()` ile korunur.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/" className="flex min-h-11 items-center gap-2 text-xl font-semibold">
          <Logo width={96} className="h-auto w-24" />
          <span className="text-muted-foreground">· Yönetim</span>
        </Link>
        <nav className="flex gap-1 text-sm">
          <Link href="/yonetim" className="flex min-h-11 items-center rounded-md px-2.5 font-medium hover:bg-muted">
            Özet
          </Link>
          <Link href="/yonetim/inceleme" className="flex min-h-11 items-center rounded-md px-2.5 font-medium hover:bg-muted">
            İnceleme
          </Link>
          <Link href="/" className="flex min-h-11 items-center rounded-md px-2.5 font-medium hover:bg-muted">
            Uygulama
          </Link>
        </nav>
      </header>
      <Suspense fallback={<PageLoading />}>
        <Gate>{children}</Gate>
      </Suspense>
    </main>
  );
}

async function Gate({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/giris");
  const role = viewer.profile?.role;
  if (role !== "teacher" && role !== "admin") redirect("/");
  return children;
}
