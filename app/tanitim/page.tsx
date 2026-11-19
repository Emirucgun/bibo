import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDown, ArrowRight, BookOpen, Clock, Headphones, Languages, Mic, PenLine, ShieldCheck } from "lucide-react";
import { Bibo } from "@/components/brand/Bibo";
import { Logo } from "@/components/brand/Logo";
import { Compare } from "@/components/landing/Compare";
import { DiagnosisDemo } from "@/components/landing/DiagnosisDemo";
import { HeroBibo } from "@/components/landing/HeroBibo";
import { Reveal } from "@/components/landing/Reveal";
import { TryIt } from "@/components/landing/TryIt";
import { buttonVariants } from "@/components/ui/button";
import { APP_DOMAIN, APP_NAME, APP_TAGLINE } from "@/lib/content/app";
import { TOPICS } from "@/lib/content/taxonomy";

// Tanıtım sayfası (bibolearn.com kökü). Girişsiz ziyaretçi `/` adresinde bunu görür: proxy.ts
// adresi değiştirmeden buraya yönlendirir (lib/auth/paths.ts `LANDING_PATH`); `/tanitim` dışarıdan
// açılırsa `/` adresine gider, tek adres bibolearn.com. Statik; veri okumaz.
// Metinler PRD (Bölüm 0–6) ve SCOPE'tan; görsel kimlik Figma "Bibo — Marka Kimliği" v0.1'den.
// Gradyan yok: düz renk blokları, mürekkep kontur ve logodaki mercan nokta motifi.

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

const MARQUEE_TOPICS = TOPICS.filter((t) => t.kind === "grammar").map((t) => t.title_tr);

const STEPS: { title: string; body: string; tone: string }[] = [
  {
    title: "Kısa yerleştirme",
    body: "Çoğunlukla 14–19 soruluk uyarlamalı bir test. Seviyeni ve zorlanabileceğin konuları tahmin eder.",
    tone: "bg-brand text-ink",
  },
  {
    title: "Günde 15–20 dakika",
    body: "8–10 etkinlik; okuma, yazma, dinleme ve konuşma karışık. İçerik seçtiğin ilgi alanlarından gelir.",
    tone: "bg-coral text-ink",
  },
  {
    title: "Anında Türkçe geri bildirim",
    body: "Doğru biçim, en fazla 2 cümle açıklama ve mümkünse Türkçeyle karşılaştırma. Takılırsan “İpucu” orada.",
    tone: "bg-sun text-ink",
  },
  {
    title: "Teşhis kartı",
    body: "Kanıt yeterince birikince hatanın kaynağını söyler. “Doğru” ya da “Bence değil” diyerek sen de katılırsın.",
    tone: "bg-ink text-cream",
  },
];

const ACTIVITIES: { icon: ReactNode; skill: string; items: string[] }[] = [
  { icon: <BookOpen aria-hidden />, skill: "Okuma", items: ["Oku ve seç"] },
  { icon: <PenLine aria-hidden />, skill: "Yazma", items: ["Boşluk doldur", "Cümle diz", "Türkçeden çevir", "Kısa yaz"] },
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
  { q: "Ücretli mi?", a: "Hayır. Pilot iki ay boyunca bütün özellikleriyle ücretsiz. Uygulama içinde ödeme yok." },
  {
    q: "Kimler katılabilir?",
    a: "18 yaşından büyük, anadili Türkçe, hazırlıkta A1–A2 seviyesinde İngilizce okuyan öğrenciler. Pilot 50 kişilik ve yalnızca davetle açık.",
  },
  {
    q: "Seviyem A2'nin üstündeyse?",
    a: "Yerleştirme bunu gösterirse sana şimdilik oturum açmayız; tek dokunuşla bekleme listesine girersin. 7 gün sonra bir kez yeniden test olabilirsin.",
  },
  {
    q: "Uygulama indirmem gerekiyor mu?",
    a: "Hayır. Telefonunun tarayıcısında çalışır; istersen ana ekrana ekleyip uygulama gibi açarsın. Konuşma etkinlikleri için mikrofon gerekir, dinleme için kulaklık önerilir.",
  },
  {
    q: "Yapay zekâ teşhis mi koyuyor?",
    a: "Hayır. İçeriği yapay zekâ üretir ve serbest cevaplarını etiketler; teşhisi ise test edilmiş, kurala dayalı kod koyar. Etiketler bir İngilizce öğretmeni tarafından düzenli olarak denetlenir.",
  },
  {
    q: "Verilerim ne oluyor?",
    a: (
      <>
        Yalnızca teşhis için gereken veriyi tutarız; reklam için kullanmayız, satmayız. Ayrıntılar{" "}
        <Link href="/gizlilik" className="font-medium text-primary underline underline-offset-4">
          gizlilik ve aydınlatma metninde
        </Link>
        .
      </>
    ),
  },
];

/** Logodaki "i" noktası: mercan daire. Sayfanın tekrar eden motifi. */
function Dot({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`inline-block shrink-0 rounded-full bg-coral ${className}`} />;
}

/** Maskottaki güneş yıldızı (İpucu, Buldum!, Tebrikler hallerindeki ✦). */
function Sparkle({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className}>
      <path d="M12 0C13 7 17 11 24 12C17 13 13 17 12 24C11 17 7 13 0 12C7 11 11 7 12 0Z" fill="var(--bibo-sun-400)" />
    </svg>
  );
}

function Eyebrow({ children, tone = "text-primary" }: { children: ReactNode; tone?: string }) {
  return (
    <p className={`flex items-center gap-2 text-xs font-bold tracking-[0.14em] uppercase ${tone}`}>
      <Dot className="size-2" />
      {children}
    </p>
  );
}

function SectionHeading({
  eyebrow,
  title,
  lead,
  dark = false,
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: string;
  dark?: boolean;
}) {
  return (
    <header className="flex max-w-2xl flex-col gap-3">
      <Eyebrow tone={dark ? "text-brand" : "text-primary"}>{eyebrow}</Eyebrow>
      <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {lead ? <p className={`text-lg text-pretty ${dark ? "text-cream/75" : "text-muted-foreground"}`}>{lead}</p> : null}
    </header>
  );
}

const ctaPrimary = buttonVariants({
  size: "lg",
  className:
    "h-12 rounded-xl border-2 border-ink px-5 text-base shadow-[4px_4px_0_var(--bibo-ink-900)] transition-all hover:-translate-y-0.5 hover:bg-primary hover:shadow-[6px_6px_0_var(--bibo-ink-900)] active:translate-y-0 active:shadow-none",
});

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col overflow-x-clip bg-background">
      <header className="sticky top-0 z-30 border-b border-ink/10 bg-background/95">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" aria-label={`${APP_NAME} ana sayfa`} className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <Logo width={104} className="h-auto w-[104px]" />
          </Link>
          <nav className="flex items-center gap-1 text-sm font-medium sm:gap-2">
            <a href="#dene" className="hidden rounded-lg px-3 py-2 hover:bg-muted sm:block">
              Dene
            </a>
            <a href="#nasil" className="hidden rounded-lg px-3 py-2 hover:bg-muted sm:block">
              Nasıl çalışır?
            </a>
            <a href="#sss" className="hidden rounded-lg px-3 py-2 hover:bg-muted md:block">
              SSS
            </a>
            <Link
              href="/giris"
              className="ml-1 rounded-xl border-2 border-ink px-4 py-2 font-semibold transition-colors hover:bg-ink hover:text-cream"
            >
              Giriş yap
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex flex-col">
        {/* Giriş */}
        <section className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pt-12 pb-20 sm:px-6 md:grid-cols-[1.15fr_1fr] md:pt-20 md:pb-28">
          <div className="flex flex-col gap-6">
            <p className="flex w-fit items-center gap-2 rounded-full border-2 border-ink bg-white px-3 py-1.5 text-xs font-semibold">
              <Dot className="size-2.5 motion-safe:animate-pulse" />
              Ücretsiz pilot · 50 kişi · 2 ay · davetle
            </p>
            <h1 className="text-[2.6rem] leading-[1.05] font-bold tracking-tight text-balance sm:text-6xl">
              Hatanın{" "}
              <span className="relative inline-block whitespace-nowrap">
                <span aria-hidden className="absolute inset-x-[-0.12em] bottom-[0.08em] h-[0.42em] -rotate-1 rounded-sm bg-sun" />
                <span className="relative">kaynağını</span>
              </span>{" "}
              bulan İngilizce öğretmeni
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
              Hazırlıkta zorlanıyor musun? {APP_NAME} her cevabını konu ve beceriye göre izler; sorunun past
              simple&apos;ı bilmemek mi, yoksa konuşurken onu kullanamamak mı, sayılarla söyler.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/giris" className={ctaPrimary}>
                Davetinle başla
                <ArrowRight data-icon="inline-end" aria-hidden />
              </Link>
              <a
                href="#dene"
                className="inline-flex h-12 items-center gap-2 rounded-xl px-4 font-semibold text-ink underline-offset-4 hover:underline"
              >
                Önce dene
                <ArrowDown className="size-4 motion-safe:animate-bounce" aria-hidden />
              </a>
            </div>
            <dl className="mt-2 grid max-w-md grid-cols-3 gap-3">
              {[
                ["15–20", "dakika / gün"],
                ["8", "etkinlik türü"],
                ["A1–A2", "seviye"],
              ].map(([value, label]) => (
                <div key={label} className="flex flex-col border-l-2 border-ink/15 pl-3">
                  <dt className="order-2 text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-xl font-bold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative flex justify-center pt-6 md:justify-end md:pt-0">
            {/* Düz renk sahne: Bibo'nun arkasında krem üstüne turkuaz 50 bir daire, mercan nokta ve güneş yıldızları. */}
            <div aria-hidden className="absolute top-1/2 left-1/2 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-50 sm:size-96 md:left-auto md:right-0 md:translate-x-0" />
            <Dot className="absolute top-2 right-[18%] size-9 motion-safe:animate-float md:right-[8%]" />
            <Sparkle className="absolute top-[18%] left-[12%] size-8 motion-safe:animate-float [animation-delay:-2s] md:left-[6%]" />
            <Sparkle className="absolute right-[10%] bottom-[16%] size-5 motion-safe:animate-float [animation-delay:-4s] md:right-0" />
            <span aria-hidden className="absolute bottom-[6%] left-[16%] h-4 w-12 rotate-[-24deg] rounded-full bg-brand motion-safe:animate-float [--float-rotate:-24deg] [animation-delay:-1s]" />
            <div className="relative md:mr-6">
              <HeroBibo />
            </div>
          </div>
        </section>

        {/* Konu şeridi */}
        <section aria-label="Kapsanan konular" className="group overflow-hidden border-y-2 border-ink bg-brand-700 py-4 text-cream">
          <div className="flex w-max motion-safe:animate-marquee group-hover:[animation-play-state:paused]">
            {[0, 1].map((copy) => (
              <ul key={copy} aria-hidden={copy === 1} className="flex shrink-0 items-center">
                {MARQUEE_TOPICS.map((t) => (
                  <li key={t} className="flex items-center gap-6 pr-6 text-lg font-semibold whitespace-nowrap">
                    {t}
                    <Dot className="size-2.5" />
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </section>

        {/* Dene */}
        <section id="dene" className="scroll-mt-20 bg-white">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-20 sm:px-6 md:py-28">
            <Reveal>
              <SectionHeading
                eyebrow="Kendin dene"
                title="Üç soru, Türkçe konuşanların en sık üç hatası"
                lead="Bir şık seç; yanlış yaparsan bibo nedenini Türkçeyle karşılaştırarak söyler. Kayıt yok, hiçbir şey gönderilmez."
              />
            </Reveal>
            <Reveal delay={100}>
              <TryIt />
            </Reveal>
          </div>
        </section>

        {/* ChatGPT'den farkı */}
        <section className="bg-ink-950 text-cream">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-20 sm:px-6 md:py-28">
            <Reveal>
              <SectionHeading
                dark
                eyebrow="Neden bibo?"
                title="ChatGPT seni tanımıyor. bibo tanır."
                lead="Hazırlık öğrencilerinin yapay zekâyla çalışırken yaşadığı altı sorundan yola çıktık. Anahtarla iki tarafa da bak."
              />
            </Reveal>
            <Reveal delay={100}>
              <Compare />
            </Reveal>
          </div>
        </section>

        {/* Konu mu, beceri mi */}
        <section id="nasil" className="scroll-mt-20">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 md:grid-cols-2 md:py-28">
            <Reveal className="flex flex-col gap-6">
              <SectionHeading
                eyebrow="Konu mu, beceri mi?"
                title="Aynı yanlış, iki farklı sebep"
                lead="Past simple'ı yazarken doğru, konuşurken yanlış kullanıyorsan sorun konu değil, beceridir. bibo aynı konuyu dört beceride yeniden test ederek bu farkı görür."
              />
              <ul className="flex flex-col gap-3 text-sm leading-relaxed">
                {[
                  "Her cevap konu, beceri ve etkinlik türüne göre etiketlenir.",
                  "Türkçe kaynaklı tipik hatalar baştan bilindiği için ilk gün bile tahmin yapar.",
                  "Teşhisi kurallar koyar; kanıt yeterli değilse kart gösterilmez.",
                ].map((item) => (
                  <li key={item} className="flex gap-3">
                    <Dot className="mt-1.5 size-2" />
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={120}>
              <DiagnosisDemo />
            </Reveal>
          </div>
        </section>

        {/* Adımlar */}
        <section className="border-y-2 border-ink bg-brand-50">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-20 sm:px-6 md:py-28">
            <Reveal>
              <SectionHeading eyebrow="Nasıl çalışır?" title="Davetten ilk oturuma on dakika" />
            </Reveal>
            <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map(({ title, body, tone }, i) => (
                <Reveal as="li" key={title} delay={i * 90} className="flex h-full flex-col gap-4 rounded-2xl border-2 border-ink bg-white p-5 transition-transform duration-200 hover:-translate-y-1 hover:shadow-[5px_5px_0_var(--bibo-ink-900)]">
                    <span className={`flex size-11 items-center justify-center rounded-xl text-lg font-bold ${tone}`}>{i + 1}</span>
                    <h3 className="text-lg font-bold">{title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
                  </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* Etkinlikler */}
        <section>
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 md:grid-cols-[1fr_1.4fr] md:py-28">
            <Reveal className="flex flex-col gap-6">
              <SectionHeading
                eyebrow="Etkinlikler"
                title="Dört beceri, sekiz etkinlik"
                lead="Dinleme metinleri doğal bir sesle okunur, A1'de biraz yavaşlatılır. Konuşmada bas-konuş ile cevap verirsin; bibo sen bitirene kadar dinler."
              />
              <Bibo state="dinliyor" size={200} className="size-40 self-start sm:size-48" />
            </Reveal>
            <ul className="grid grid-cols-2 gap-3">
              {ACTIVITIES.map(({ icon, skill, items }, i) => (
                <Reveal as="li" key={skill} delay={i * 80} className="flex h-full flex-col gap-3 rounded-2xl border-2 border-ink/10 bg-white p-5 transition-colors hover:border-ink">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-primary [&_svg]:size-5">{icon}</span>
                    <h3 className="font-bold">{skill}</h3>
                    <ul className="flex flex-wrap gap-1.5">
                      {items.map((item) => (
                        <li key={item} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* İlkeler */}
        <section className="bg-white">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-20 sm:px-6 md:py-28">
            <Reveal>
              <SectionHeading eyebrow="İlkelerimiz" title="Ağlamaz, küsmez, suçlamaz" lead="Bibo'nun en “olumsuz” hali sakin bir “Tekrar bakalım”dır." />
            </Reveal>
            <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {PRINCIPLES.map(({ icon, title, body }, i) => (
                <Reveal as="li" key={title} delay={i * 80} className="flex gap-4">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl border-2 border-ink bg-sun-200 [&_svg]:size-5">{icon}</span>
                    <div className="flex flex-col gap-1">
                      <h3 className="text-lg font-bold">{title}</h3>
                      <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
                    </div>
                  </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* SSS */}
        <section id="sss" className="scroll-mt-20 border-t-2 border-ink">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-20 sm:px-6 md:py-28">
            <Reveal>
              <SectionHeading eyebrow="Sık sorulanlar" title="Aklındaki sorular" />
            </Reveal>
            <div className="flex flex-col gap-3">
              {FAQ.map(({ q, a }) => (
                <details
                  key={q}
                  className="group rounded-2xl border-2 border-ink/15 bg-white px-5 py-4 transition-colors open:border-ink open:shadow-[4px_4px_0_var(--bibo-ink-900)]"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                    {q}
                    <span
                      aria-hidden
                      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-lg leading-none transition-transform duration-300 group-open:rotate-45 group-open:bg-coral"
                    >
                      +
                    </span>
                  </summary>
                  <p className="pt-3 text-sm leading-relaxed text-muted-foreground">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Kapanış */}
        <section className="border-t-2 border-ink bg-brand">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-8 px-4 py-16 sm:px-6 md:grid-cols-[auto_1fr] md:py-20">
            <Reveal className="flex justify-center">
              {/* Turkuaz zeminde turkuaz Bibo kaybolur; krem disk üstünde durur. */}
              <span className="flex size-56 items-center justify-center rounded-full border-2 border-ink bg-cream sm:size-72">
                <Bibo state="merhaba" size={240} className="size-44 sm:size-56" />
              </span>
            </Reveal>
            <Reveal delay={100} className="flex flex-col items-center gap-5 text-center text-ink md:items-start md:text-left">
              <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-5xl">Davet linkin var mı? İlk oturumun on dakika uzağında.</h2>
              <p className="max-w-xl text-lg text-pretty">Google hesabınla giriş yap, kısa yerleştirmeyi tamamla, ilk oturumun hazır olsun.</p>
              <Link
                href="/giris"
                className="inline-flex h-12 items-center gap-2 rounded-xl border-2 border-ink bg-ink px-6 text-base font-semibold text-cream shadow-[4px_4px_0_var(--bibo-cream)] transition-all hover:-translate-y-0.5 hover:shadow-[6px_6px_0_var(--bibo-cream)] active:translate-y-0 active:shadow-none"
              >
                Davetinle başla
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="bg-ink-950 text-cream">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-4">
            <Logo tone="dark" width={96} className="h-auto w-24" />
            <p className="text-cream/70">{APP_DOMAIN} · Ücretsiz, ticari olmayan pilot çalışma</p>
          </div>
          <Link href="/gizlilik" className="text-cream/90 underline underline-offset-4 hover:text-cream">
            Gizlilik ve aydınlatma metni
          </Link>
        </div>
      </footer>
    </div>
  );
}
