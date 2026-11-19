"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bibo } from "@/components/brand/Bibo";
import { Button } from "@/components/ui/button";
import { callApi } from "@/lib/api/client";
import type { ScopeView } from "@/lib/session/service";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long", timeZone: "Europe/Istanbul" });

// Kapsam dışı ekranı (docs/SPEC.md 4.7): A2 üstü ya da A2'yi bitirmiş öğrenciye hizmet yerine
// "çok yakında senin için de buradayız". Bekleme listesi tercihi ve (A2 üstüyse) bir kez yeniden test.
export function ScopeNotice({ status }: { status: "above_scope" | "graduated" }) {
  const router = useRouter();
  const [scope, setScope] = useState<ScopeView | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void callApi<ScopeView>("/api/scope", { method: "GET" }).then((res) => {
      if (!cancelled && res.ok) setScope(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function optIn() {
    if (pending) return;
    setPending(true);
    setError(null);
    const res = await callApi("/api/waitlist", { method: "POST", body: { optIn: true } });
    if (res.ok) setScope((s) => (s ? { ...s, notified: true } : s));
    else setError(res.message);
    setPending(false);
  }

  async function retest() {
    if (pending) return;
    setPending(true);
    setError(null);
    const res = await callApi("/api/placement/retest", { method: "POST", body: {} });
    if (res.ok) {
      router.replace("/baslangic/yerlestirme");
      router.refresh();
      return;
    }
    setError(res.message);
    setPending(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Bibo state={status === "graduated" ? "tebrikler" : "varsayilan"} size={140} className="size-32" />
        <h1 className="text-2xl font-semibold">
          {status === "graduated" ? "Tebrikler, A2'yi tamamladın" : "İngilizcen bizim seviyemizin üstünde"}
        </h1>
        <p className="text-base leading-relaxed">
          {status === "graduated"
            ? "Cevapların artık A2'nin üstünde olduğunu gösteriyor. Şu an yalnızca A1–A2 için çalışıyoruz; sana yeni bir şey öğretemeyiz."
            : "Cevapların A2'nin üstünde olduğunu gösteriyor. Şu an yalnızca A1–A2 seviyesindeki öğrencilere hizmet veriyoruz; sana boşuna kolay oturumlar hazırlamak istemiyoruz."}
        </p>
        <p className="text-base font-medium">Çok yakında senin seviyen için de buradayız.</p>
      </header>

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="text-base font-semibold">Hazır olunca haber verelim mi?</h2>
        {scope?.notified ? (
          <p role="status" className="text-sm">
            Tamam, hazır olunca sana haber vereceğiz.
          </p>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Yalnızca bu tercihini ve tarihini kaydederiz; haber vermek için hesabındaki e-posta adresini kullanırız. İstediğin
              zaman hesabını silerek vazgeçebilirsin (
              <Link href="/gizlilik" className="underline">
                gizlilik
              </Link>
              ).
            </p>
            <Button type="button" disabled={pending || !scope} onClick={() => void optIn()} className="h-12 w-full text-base">
              Hazır olunca haber ver
            </Button>
          </>
        )}
      </section>

      {status === "above_scope" && scope ? (
        scope.canRetest ? (
          <section className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">Sonucun sana yanlış geldiyse testi bir kez daha çözebilirsin.</p>
            <Button type="button" variant="outline" disabled={pending} onClick={() => void retest()} className="h-12 w-full text-base">
              Testi yeniden çöz
            </Button>
          </section>
        ) : scope.retestAt ? (
          <p className="text-sm text-muted-foreground">
            Sonucun sana yanlış geldiyse {fmtDate(scope.retestAt)} tarihinden sonra testi bir kez daha çözebilirsin.
          </p>
        ) : null
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
