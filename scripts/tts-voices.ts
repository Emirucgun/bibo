/**
 * P9 (seslendirme sesi seçimi) yardımcısı: Speechify'daki Simba 3.5 en-US seslerini listeler ve
 * seçilen adaylar için A1 (0,9) ve A2 (1,0) hızında örnek mp3 üretir. Pedagoji sahibi dinleyip seçer;
 * seçilen kimlik `app_settings.tts_voice`'a yazılır (o zamana kadar dinleme kapalıdır, PLAN karar 26).
 *
 *   npx tsx --env-file=.env.local scripts/tts-voices.ts                      # listele (ücretsiz)
 *   npx tsx --env-file=.env.local scripts/tts-voices.ts --sample id1,id2,id3  # örnek üret
 *
 * Örnekler guard + `llm_usage` (`purpose = tts`) üzerinden; 3 ses × 2 hız × ≈ 120 karakter ≈ 720
 * karakter (Free planda 500.000/ay kotadan düşer, 0 $). `--no-db` ile satırlar yalnızca bellekte.
 * Çıktı: scripts/out/voices/<id>-A1.mp3, <id>-A2.mp3. Seçimden sonra:
 *   update app_settings set value = to_jsonb('<id>'::text) where key = 'tts_voice';
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { withAiCall } from "@/lib/ai/guard";
import { TTS_PROVIDER } from "@/lib/tts/cache";
import { createSpeechifyClient } from "@/lib/tts/speechify";
import { arg, setupDepsWithoutLlm } from "./lib/eval-env";

/** Bir A1 dinleme etkinliğine benzeyen metin: -s eki, can/can't, th, sayı. */
const SAMPLE =
  "Hi, I'm Ella. My brother plays football every Thursday. I can't swim, but I can ride a bike. We have three cats.";

type Voice = {
  id: string;
  display_name?: string;
  gender?: string;
  tags?: string[];
  models?: { name?: string; languages?: { locale?: string }[] }[];
};

const isSimbaEnUs = (v: Voice) =>
  (v.models ?? []).some(
    (m) => m.name === "simba-3.5" && (m.languages ?? []).some((l) => l.locale?.toLowerCase() === "en-us"),
  );

async function listVoices(key: string): Promise<Voice[]> {
  const out: Voice[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const url = new URL("https://api.speechify.ai/v1/voices");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`speechify voices HTTP ${res.status}`);
    const body = (await res.json()) as { voices?: Voice[]; next_cursor?: string; has_more?: boolean } | Voice[];
    if (Array.isArray(body)) return body;
    out.push(...(body.voices ?? []));
    if (!body.has_more || !body.next_cursor) break;
    cursor = body.next_cursor;
  }
  return out;
}

async function main() {
  const key = process.env.SPEECHIFY_API_KEY;
  if (!key) throw new Error("SPEECHIFY_API_KEY tanımlı değil (--env-file)");
  const sample = arg("sample");

  if (!sample) {
    const voices = (await listVoices(key)).filter(isSimbaEnUs);
    console.log(`Simba 3.5 en-US: ${voices.length} ses`);
    for (const v of voices) {
      console.log(`${v.id.padEnd(28)} ${(v.display_name ?? "").padEnd(16)} ${(v.gender ?? "").padEnd(8)} ${(v.tags ?? []).join(", ")}`);
    }
    console.log("\nAdayları dinlemek için: --sample id1,id2,id3");
    return;
  }

  const { store } = setupDepsWithoutLlm();
  const speech = createSpeechifyClient({ apiKey: key });
  const dir = new URL("./out/voices/", import.meta.url);
  mkdirSync(dir, { recursive: true });
  const now = new Date();
  for (const voiceId of sample.split(",").map((s) => s.trim()).filter(Boolean)) {
    for (const [level, rate] of [["A1", 0.9], ["A2", 1]] as const) {
      const audio = await withAiCall(
        store,
        { purpose: "tts", userId: null, sessionId: null, now },
        {
          provider: TTS_PROVIDER,
          model: () => "simba-3.5",
          run: async () => {
            const res = await speech.synthesize({ text: SAMPLE, rate, voiceId, model: "simba-3.5" });
            return { value: res.audio, metrics: { tts_chars: res.billableChars, cost_usd: 0, ok: true } };
          },
        },
      );
      const file = `${voiceId}-${level}.mp3`;
      writeFileSync(new URL(file, dir), audio);
      console.log(`Yazıldı: scripts/out/voices/${file}`);
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
