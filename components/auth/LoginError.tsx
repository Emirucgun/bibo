"use client";

import { useSearchParams } from "next/navigation";

const MESSAGES: Record<string, string> = {
  oauth: "Google ile giriş tamamlanamadı. Yeniden dener misin?",
};

export function LoginError() {
  const code = useSearchParams().get("hata");
  const message = code ? MESSAGES[code] : undefined;
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}
