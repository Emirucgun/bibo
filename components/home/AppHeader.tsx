import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { getViewer } from "@/lib/auth/viewer";
import { APP_NAME } from "@/lib/content/app";

// Öğrenci ekranlarının üst çubuğu: ana sayfa, ilerleme, ayarlar; öğretmen/admin için yönetim.
export async function AppHeader() {
  const viewer = await getViewer();
  const staff = viewer?.profile?.role === "teacher" || viewer?.profile?.role === "admin";
  const links = [
    { href: "/ilerleme", label: "İlerleme" },
    { href: "/ayarlar", label: "Ayarlar" },
    ...(staff ? [{ href: "/yonetim", label: "Yönetim" }] : []),
  ];
  return (
    <header className="flex items-center justify-between gap-3">
      <Link href="/" aria-label={`${APP_NAME} ana sayfa`} className="flex min-h-11 items-center">
        <Logo width={96} className="h-auto w-24" />
      </Link>
      <nav className="flex items-center gap-1 text-sm">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="flex min-h-11 items-center rounded-md px-2.5 font-medium hover:bg-muted">
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
