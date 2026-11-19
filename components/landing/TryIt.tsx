"use client";

import { useState } from "react";
import { ArrowRight, Check, Lightbulb, RotateCcw, Search } from "lucide-react";
import { Bibo, type BiboState } from "@/components/brand/Bibo";
import { buttonVariants } from "@/components/ui/button";

// Tanıtım sayfasında üç soruluk deneme (oturum gibi, ama yerel ve kayıtsız: veri gönderilmez).
// Sorular ve açıklamalar supabase/seed/l1_codes.csv'deki Türkçe kaynaklı hata kodlarından.
// Geri bildirim en çok 2 cümle, Türkçe karşılaştırmalı (PRD ilke 2–3). Bibo cevaba göre hal değiştirir.

type Option = { text: string; label?: string; feedback?: string };
type Question = {
  before: string;
  after: string;
  options: Option[];
  answer: string;
  hint: string;
  code: string;
  codeName: string;
};

const QUESTIONS: Question[] = [
  {
    before: "My sister",
    after: "football every Saturday.",
    options: [
      { text: "play", feedback: "İngilizcede he / she / it ile fiile -s gelir; my sister = she. Doğrusu: My sister plays football." },
      { text: "plays" },
      { text: "is play", feedback: "Burada be fiili gerekmez; alışkanlık için geniş zaman kullanılır ve she ile fiil -s alır." },
    ],
    answer: "plays",
    hint: "Kız kardeşin için hangi zamiri kullanırsın: he mi, she mi, they mi?",
    code: "L1.3SG_S",
    codeName: "Üçüncü tekil -s",
  },
  {
    before: "Where",
    after: "you live?",
    options: [
      { text: "do" },
      { text: "", label: "boş bırak", feedback: "Türkçede soru -mı eki ve tonlamayla kurulur; İngilizcede yardımcı fiil gerekir. Doğrusu: Where do you live?" },
      { text: "are", feedback: "are, be fiilidir; live gibi eylem fiilleriyle soru do / does ile kurulur." },
    ],
    answer: "do",
    hint: "live bir eylem fiili. Soruda yanına bir yardımcı fiil ister.",
    code: "L1.Q_INVERSION",
    codeName: "Soru yapısı",
  },
  {
    before: "I have",
    after: "car.",
    options: [
      { text: "a" },
      { text: "the", feedback: "the, ikimizin de bildiği belirli bir şey için. İlk kez söz ettiğin tekil bir şey için a kullanılır." },
      { text: "", label: "boş bırak", feedback: "Türkçede “bir” çoğu zaman söylenmez; İngilizcede tekil sayılabilir isim artikelsiz kalmaz." },
    ],
    answer: "a",
    hint: "Türkçede “bir arabam var” derken “bir”i çoğu zaman söylemeyiz. İngilizcede?",
    code: "L1.ART_OMIT",
    codeName: "Artikel atlama",
  },
];

type Status = "idle" | "hint" | "wrong" | "right";

export function TryIt() {
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [picked, setPicked] = useState<string | null>(null);
  const [missed, setMissed] = useState<string[]>([]);
  const done = index >= QUESTIONS.length;
  const q = QUESTIONS[Math.min(index, QUESTIONS.length - 1)];

  const pick = (option: Option) => {
    if (status === "right") return;
    setPicked(option.text);
    if (option.text === q.answer) {
      setStatus("right");
    } else {
      setStatus("wrong");
      setMissed((m) => (m.includes(q.code) ? m : [...m, q.code]));
    }
  };

  const next = () => {
    setIndex((i) => i + 1);
    setStatus("idle");
    setPicked(null);
  };

  const restart = () => {
    setIndex(0);
    setStatus("idle");
    setPicked(null);
    setMissed([]);
  };

  const bibo: BiboState = done
    ? missed.length
      ? "buldum"
      : "tebrikler"
    : { idle: "varsayilan", hint: "ipucu", wrong: "tekrar-bakalim", right: "tebrikler" }[status] as BiboState;

  const wrongFeedback = q.options.find((o) => o.text === picked)?.feedback;
  const missedNames = QUESTIONS.filter((x) => missed.includes(x.code)).map((x) => x.codeName);

  return (
    <div className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
      <div className="flex min-h-[22rem] flex-col gap-5 rounded-3xl border-2 border-ink bg-white p-5 shadow-[6px_6px_0_var(--bibo-ink-900)] sm:p-7">
        {/* İlerleme */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-1.5" aria-hidden>
            {QUESTIONS.map((x, i) => (
              <span
                key={x.code}
                className={`h-2 w-10 rounded-full transition-colors duration-300 ${
                  i < index || (i === index && status === "right") ? "bg-brand" : i === index ? "bg-ink/25" : "bg-muted"
                }`}
              />
            ))}
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {done ? "Bitti" : `Soru ${index + 1} / ${QUESTIONS.length} · Boşluk doldur`}
          </span>
        </div>

        {done ? (
          <div key="done" className="flex flex-1 flex-col justify-center gap-4 animate-pop">
            <p className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Search className="size-4" aria-hidden /> {missed.length ? "Buldum!" : "Üçü de doğru"}
            </p>
            <p className="text-2xl font-semibold tracking-tight text-balance">
              {missed.length
                ? `Tahminim: ${missedNames.join(" ve ")}.`
                : "Bu üç kalıp sende oturmuş görünüyor."}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Üç soru teşhis için yetmez; bu yalnızca bir tahmin. Gerçek oturumda bibo aynı konuyu birkaç gün sonra,
              başka becerilerde (dinleme, konuşma, yazma) yeniden dener ve kanıt yeterince birikince söyler.
            </p>
            <div>
              <button type="button" onClick={restart} className={buttonVariants({ variant: "outline", size: "lg", className: "h-10 px-4" })}>
                <RotateCcw data-icon="inline-start" aria-hidden /> Baştan dene
              </button>
            </div>
          </div>
        ) : (
          <div key={index} className="flex flex-1 flex-col gap-5 animate-pop">
            <p className="text-2xl leading-relaxed font-medium sm:text-3xl" lang="en">
              {q.before}{" "}
              <span
                className={`inline-block min-w-20 rounded-lg border-b-4 px-2 text-center transition-colors ${
                  status === "right"
                    ? "border-correct bg-correct-bg text-correct"
                    : status === "wrong"
                      ? "border-retry bg-retry-bg text-retry"
                      : "border-ink/30 bg-muted/60 text-muted-foreground"
                }`}
              >
                {picked === null ? "___" : picked || "—"}
              </span>{" "}
              {q.after}
            </p>

            <div className="flex flex-wrap gap-2" role="group" aria-label="Seçenekler">
              {q.options.map((o) => {
                const isPicked = picked === o.text;
                const tone =
                  isPicked && status === "right"
                    ? "border-correct bg-correct-bg text-correct"
                    : isPicked && status === "wrong"
                      ? "border-retry bg-retry-bg text-retry"
                      : "border-ink/15 bg-background hover:-translate-y-0.5 hover:border-ink hover:shadow-[3px_3px_0_var(--bibo-ink-900)]";
                return (
                  <button
                    key={o.label ?? o.text}
                    type="button"
                    onClick={() => pick(o)}
                    disabled={status === "right"}
                    lang={o.label ? "tr" : "en"}
                    className={`min-h-11 rounded-xl border-2 px-4 text-base font-medium transition-all duration-150 disabled:cursor-default ${tone} ${o.label ? "italic" : ""}`}
                  >
                    {o.label ?? o.text}
                  </button>
                );
              })}
            </div>

            <div aria-live="polite" className="min-h-20">
              {status === "right" ? (
                <div className="flex flex-col gap-3 rounded-xl bg-correct-bg p-4 text-correct animate-pop">
                  <p className="flex items-center gap-2 font-semibold">
                    <Check className="size-4" aria-hidden /> Doğru
                  </p>
                  <div>
                    <button type="button" onClick={next} className={buttonVariants({ size: "lg", className: "h-10 px-4" })}>
                      {index === QUESTIONS.length - 1 ? "Sonucu gör" : "Sonraki"}
                      <ArrowRight data-icon="inline-end" aria-hidden />
                    </button>
                  </div>
                </div>
              ) : status === "wrong" ? (
                <div className="flex flex-col gap-1 rounded-xl bg-retry-bg p-4 text-retry animate-pop">
                  <p className="font-semibold">Tekrar bakalım</p>
                  <p className="text-sm leading-relaxed text-foreground">{wrongFeedback}</p>
                </div>
              ) : status === "hint" ? (
                <div className="flex flex-col gap-1 rounded-xl bg-hint-bg p-4 text-hint animate-pop">
                  <p className="flex items-center gap-2 font-semibold">
                    <Lightbulb className="size-4" aria-hidden /> İpucu
                  </p>
                  <p className="text-sm leading-relaxed text-foreground">{q.hint}</p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setStatus("hint")}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-medium text-hint underline-offset-4 hover:underline"
                >
                  <Lightbulb className="size-4" aria-hidden /> İpucu
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-center" aria-hidden>
        <Bibo key={bibo} state={bibo} size={220} className="size-44 animate-pop sm:size-56" />
      </div>
    </div>
  );
}
