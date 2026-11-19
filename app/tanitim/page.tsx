import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  Clock,
  Headphones,
  Languages,
  Mic,
  PenLine,
  ShieldCheck,
  Target,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { APP_DOMAIN, APP_NAME, APP_TAGLINE } from "@/lib/content/app";

// Tanıtım sayfası (bibolearn.com kökü). Girişsiz ziyaretçi `/` adresinde bunu görür: proxy.ts
// adresi değiştirmeden buraya yönlendirir (lib/auth/paths.ts `LANDING_PATH`); `/tanitim` dışarıdan
// açılırsa `/` adresine gider, tek adres bibolearn.com. Statik; veri okumaz.
// Metinler PRD (Bölüm 0–6) ve SCOPE'tan; sayılar oradaki değerlerle aynı tutulur.

const DESCRIPTION =
  "Türkçe konuşan A1–A2 hazırlık öğrencileri için günde 15–20 dakikalık İngilizce oturumları. bibo hatanın konudan mı yoksa beceriden mi geldiğini bulur.";

export const metadata: Metadata = {
  metadataBase: new URL(`https://${APP_DOMAIN}`),
  title: `${APP_NAME} · ${APP_TAGLINE}`,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: APP_NAME,
    locale: "tr_TR",
    title: `${APP_NAME} · ${APP_TAGLINE}`,
    description: DESCRIPTION,
  },
};

const COMPARISON: { problem: string; answer: string }[] = [
  {
    problem: "Her sohbette sıfırdan başlıyor.",
    answer: "Seni hatırlar: her konu ve beceride ne kadar ilerlediğini, hangi hataları tekrarladığını bilir.",
  },
  {
    problem: "Öğrenip öğrenmediğimi bilmiyor.",
    answer: "Aynı konuyu birkaç gün sonra ve başka bir beceride yeniden sorar; gerçekten oturdu mu, görürsün.",
  },
  {
    problem: "Cevaplar ya çok uzun ya çok kısa.",
    answer: "Geri bildirim en fazla 2 cümle. Yetmezse “Daha fazla açıkla” dersin.",
  },
  {
    problem: "Okulda görmediğim şeyi anlatıyor.",
    answer: "Haftada bir “Bu hafta okulda ne gördün?” diye sorar; plan ona göre şekillenir.",
  },
  {
    problem: "Doğru komutu ben yazmak zorundayım.",
    answer: "Komut yok. Bugün ne çalışacağını sistem hazırlar, sen yalnızca başlarsın.",
  },
  {
    problem: "Konuşurken sözümü kesiyor.",
    answer: "Bas-konuş: sen bitirene kadar dinler, sessizlikte bile kesmez.",
  },
];

const STEPS: { title: string; body: string }[] = [
  {
    title: "Kısa yerleştirme",
    body: "Çoğunlukla 14–19 soruluk uyarlamalı bir test. Seviyeni ve zorlanabileceğin konuları tahmin eder.",
  },
  {
    title: "Günde 15–20 dakika",
    body: "8–10 etkinlikten oluşan, okuma, yazma, dinleme ve konuşmayı karıştıran bir oturum. İçerik ilgi alanlarından gelir.",
  },
  {
    title: "Anında Türkçe geri bildirim",
    body: "Doğru biçim, kısa bir açıklama ve mümkünse Türkçeyle karşılaştırma. Takılırsan “İpucu” her zaman orada.",
  },
  {
    title: "Teşhis kartı",
    body: "Yeterince kanıt toplanınca hatanın kaynağını söyler. “Doğru” ya da “Bence değil” diyerek sen de katkı verirsin.",
  },
];

const ACTIVITIES: { icon: ReactNode; skill: string; items: string[] }[] = [
  { icon: <BookOpen aria-hidden />, skill: "Okuma", items: ["Oku ve seç"] },
  {
    icon: <PenLine aria-hidden />,
    skill: "Yazma",
    items: ["Boşluk doldur", "Cümle diz", "Türkçeden çevir", "Kısa yaz"],
  },
  { icon: <Headphones aria-hidden />, skill: "Dinleme", items: ["Dinle ve seç", "Dikte"] },
  { icon: <Mic aria-hidden />, skill: "Konuşma", items: ["Sesli cevapla"] },
];

const PRINCIPLES: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <Languages aria-hidden />,
    title: "Önce Türkçe",
    body: "Türkçe konuşanların tipik hataları baştan bilinir. “Türkçede ‘o’ hem he hem she’dir; İngilizcede ayrılır.”",
  },
  {
    icon: <Mic aria-hidden />,
    title: "Aksan hata değildir",
    body: "Konuşmada yalnızca dilbilgisi ve kelimeye bakılır. Anlaşılır konuşman cezalandırılmaz.",
  },
  {
    icon: <Clock aria-hidden />,
    title: "Baskı yok",
    body: "Seri kaybetme korkusu, sahte aciliyet, süre baskısı yok. Yarıda bırakırsan 24 saat içinde kaldığın yerden devam edersin.",
  },
  {
    icon: <ShieldCheck aria-hidden />,
    title: "Asgari veri",
    body: "Ses kaydın saklanmaz, doğum tarihin sorulmaz. Verini istediğin an indirir ya da hesabını tamamen silersin.",
  },
];

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: "Ücretli mi?",
    a: "Hayır. Pilot iki ay boyunca bütün özellikleriyle ücretsiz. Uygulama içinde ödeme yok.",
  },
  {
    q: "Kimler katılabilir?",
    a: "18 yaşından büyük, anadili Türkçe, hazırlıkta A1–A2 seviyesinde İngilizce okuyan öğrenciler. Pilot 50 kişilik ve yalnızca davetle açık.",
  },
  {
    q: "Seviyem A2'nin üstündeyse?",
    a: "Yerleştirme bunu gösterirse sana şimdilik oturum açmayız; tek dokunuşla bekleme listesine girersin; 7 gün sonra bir kez yeniden test olabilirsin.",
  },
  {
    q: "Uygulama indirmem gerekiyor mu?",
    a: "Hayır. Telefonunun tarayıcısında çalışır; istersen ana ekrana ekleyip uygulama gibi açarsın. Konuşma etkinlikleri için mikrofon gerekir, dinleme için kulaklık önerilir.",
  },
  {
    q: "Yapay zekâ teşhisi mi koyuyor?",
    a: "Hayır. İçeriği yapay zekâ üretir ve serbest cevaplarını etiketler; teşhisi ise test edilmiş, kurala dayalı kod koyar. Etiketler bir İngilizce öğretmeni tarafından düzenli olarak denetlenir.",
  },
  {
    q: "Verilerim ne oluyor?",
    a: (
      <>
        Yalnızca teşhis için gereken veriyi tutarız; reklam için kullanmayız, satmayız. Ayrıntılar{" "}
        <Link href="/gizlilik" className="underline underline-offset-4">
          gizlilik ve aydınlatma metninde
        </Link>
        .
      </>
    ),
  },
];

function SectionHeading({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return (
    <header className="flex max-w-2xl flex-col gap-2">
      <p className="text-xs font-semibold tracking-wide text-primary uppercase">{eyebrow}</p>
      <h2 className="text-2xl font-semibold text-balance sm:text-3xl">{title}</h2>
      {lead ? <p className="text-pretty text-muted-foreground">{lead}</p> : null}
    </header>
  );
}

function DiagnosisCard() {
  return (
    <figure
      aria-label="Örnek teşhis kartı"
      className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-primary">
        <Target className="size-4" aria-hidden />
        Teşhis · Past simple
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-muted p-3">
          <dt className="text-xs text-muted-foreground">Yazma</dt>
          <dd className="text-2xl font-semibold tabular-nums">5/6</dd>
        </div>
        <div className="rounded-xl bg-muted p-3">
          <dt className="text-xs text-muted-foreground">Konuşma</dt>
          <dd className="text-2xl font-semibold tabular-nums">1/4</dd>
        </div>
      </dl>
      <figcaption className="text-sm leading-relaxed">
        Past simple&apos;ı biliyorsun. Zorlandığın yer konuşma: onu konuşurken geri çağırmak. Bu hafta konuşma
        etkinlikleriyle çalışacağız.
      </figcaption>
      <div className="flex gap-2" aria-hidden>
        <span className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">Doğru</span>
        <span className="rounded-lg border px-3 py-1.5 text-xs font-medium">Bence değil</span>
      </div>
    </figure>
  );
}

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="text-xl font-semibold tracking-tight text-primary">
          {APP_NAME}
        </Link>
        <Link href="/giris" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Giriş yap
        </Link>
      </header>

      <main className="flex flex-col">
        {/* Giriş */}
        <section className="mx-auto grid w-full max-w-5xl items-center gap-10 px-4 pt-8 pb-16 sm:px-6 md:grid-cols-[1.2fr_1fr] md:pt-16">
          <div className="flex flex-col gap-5">
            <p className="w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              Ücretsiz pilot · 50 kişi · 2 ay · davetle
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Hatanın kaynağını bulan İngilizce öğretmeni
            </h1>
            <p className="max-w-xl text-lg text-pretty text-muted-foreground">
              Hazırlıkta zorlanıyor musun? {APP_NAME} her cevabını konu ve beceriye göre izler; sorunun past
              simple&apos;ı bilmemek mi, yoksa konuşurken onu kullanamamak mı, sayılarla söyler.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/giris" className={buttonVariants({ size: "lg", className: "h-11 px-5 text-base" })}>
                Davetinle başla
                <ArrowRight data-icon="inline-end" aria-hidden />
              </Link>
              <a href="#nasil" className={buttonVariants({ variant: "ghost", size: "lg", className: "h-11 px-4" })}>
                Nasıl çalışır?
              </a>
            </div>
            <p className="text-sm text-muted-foreground">
              A1–A2 seviyesi · Türkçe açıklamalar · Telefonda çalışır
            </p>
          </div>
          <div className="flex justify-center md:justify-end">
            <DiagnosisCard />
          </div>
        </section>

        {/* ChatGPT'den farkı */}
        <section className="border-y bg-muted/40">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-16 sm:px-6">
            <SectionHeading
              eyebrow="Neden bibo?"
              title="ChatGPT seni tanımıyor. bibo tanır."
              lead="Hazırlık öğrencilerinin yapay zekâyla çalışırken yaşadığı sorunlardan yola çıktık."
            />
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {COMPARISON.map(({ problem, answer }) => (
                <li key={problem} className="flex flex-col gap-2 rounded-xl border bg-card p-5">
                  <p className="text-sm text-muted-foreground line-through decoration-muted-foreground/40">
                    {problem}
                  </p>
                  <p className="text-sm leading-relaxed">{answer}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Nasıl çalışır */}
        <section id="nasil" className="mx-auto flex w-full max-w-5xl scroll-mt-8 flex-col gap-8 px-4 py-16 sm:px-6">
          <SectionHeading
            eyebrow="Nasıl çalışır?"
            title="Konu mu, beceri mi? Aynı konuyu farklı becerilerde dener."
            lead="Past simple'ı yazarken doğru, konuşurken yanlış kullanıyorsan sorun konu değil, beceridir. bibo bu farkı görmek için aynı konuyu dört beceride yeniden test eder."
          />
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ title, body }, i) => (
              <li key={title} className="flex flex-col gap-3 rounded-xl border p-5">
                <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                <h3 className="font-semibold">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Etkinlikler */}
        <section className="border-y bg-muted/40">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-16 sm:px-6">
            <SectionHeading
              eyebrow="Etkinlikler"
              title="Dört beceri, sekiz etkinlik türü"
              lead="Dinleme metinleri doğal bir sesle okunur; A1'de biraz yavaşlatılır. Konuşmada bas-konuş ile cevap verirsin, ne duyduğumuzu sana gösteririz."
            />
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {ACTIVITIES.map(({ icon, skill, items }) => (
                <li key={skill} className="flex flex-col gap-3 rounded-xl border bg-card p-5">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:size-5">
                    {icon}
                  </span>
                  <h3 className="font-semibold">{skill}</h3>
                  <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                    {items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* İlkeler */}
        <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-16 sm:px-6">
          <SectionHeading eyebrow="İlkelerimiz" title="Seni yormadan, kandırmadan" />
          <ul className="grid gap-6 sm:grid-cols-2">
            {PRINCIPLES.map(({ icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:size-5">
                  {icon}
                </span>
                <div className="flex flex-col gap-1">
                  <h3 className="font-semibold">{title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* SSS */}
        <section className="border-t bg-muted/40">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-16 sm:px-6">
            <SectionHeading eyebrow="Sık sorulanlar" title="Aklındaki sorular" />
            <div className="flex flex-col gap-2">
              {FAQ.map(({ q, a }) => (
                <details key={q} className="group rounded-xl border bg-card px-5 py-4">
                  <summary className="cursor-pointer list-none font-medium marker:hidden [&::-webkit-details-marker]:hidden">
                    <span className="flex items-center justify-between gap-4">
                      {q}
                      <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-45">
                        +
                      </span>
                    </span>
                  </summary>
                  <p className="pt-3 text-sm leading-relaxed text-muted-foreground">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Kapanış */}
        <section className="mx-auto flex w-full max-w-5xl flex-col items-center gap-5 px-4 py-20 text-center sm:px-6">
          <h2 className="max-w-2xl text-2xl font-semibold text-balance sm:text-3xl">
            Davet linkin var mı? İlk oturumun 10 dakika uzağında.
          </h2>
          <p className="max-w-xl text-pretty text-muted-foreground">
            Google hesabınla giriş yap, kısa yerleştirmeyi tamamla, ilk oturumun hazır olsun.
          </p>
          <Link href="/giris" className={buttonVariants({ size: "lg", className: "h-11 px-5 text-base" })}>
            Davetinle başla
            <ArrowRight data-icon="inline-end" aria-hidden />
          </Link>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            {APP_NAME} · {APP_DOMAIN} · Ücretsiz, ticari olmayan pilot çalışma
          </p>
          <Link href="/gizlilik" className="underline underline-offset-4">
            Gizlilik ve aydınlatma metni
          </Link>
        </div>
      </footer>
    </div>
  );
}
