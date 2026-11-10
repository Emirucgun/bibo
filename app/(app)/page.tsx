import { APP_NAME, APP_TAGLINE } from "@/lib/content/app";

// Yer tutucu ana sayfa. "Bugünkü oturum" kartı M6'da gelir.
export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="text-2xl font-semibold">{APP_NAME}</h1>
      <p className="text-sm opacity-70">{APP_TAGLINE}</p>
      <p className="text-sm opacity-70">Çok yakında burada olacağız.</p>
    </main>
  );
}
