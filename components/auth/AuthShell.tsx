import type { ReactNode } from "react";

// Giriş, davet ve başlangıç sayfalarının ortak iskeleti: tek sütun, telefon genişliği.
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-10">
      {children}
    </main>
  );
}

export function AuthHeading({ title, lead, visual }: { title: ReactNode; lead?: ReactNode; visual?: ReactNode }) {
  return (
    <header className="flex flex-col gap-2">
      {visual ? <div className="mb-2">{visual}</div> : null}
      <h1 className="text-2xl font-semibold">{title}</h1>
      {lead ? <p className="text-sm text-muted-foreground">{lead}</p> : null}
    </header>
  );
}

export function PageLoading() {
  return (
    <p role="status" className="text-sm text-muted-foreground">
      Yükleniyor…
    </p>
  );
}
