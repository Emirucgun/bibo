/**
 * M1 tek seferlik "merhaba" çağrıları: Anthropic, Speechify, Azure Speech.
 * M5'te silinir (yerini lib/ai, lib/tts, lib/stt alır).
 *
 * Guard muafiyeti: llm_usage (M3) ve lib/ai/guard.ts (M5) henüz yok. Bu betik
 * uygulama kodundan çağrılmaz, yalnızca elle çalıştırılır. Gerçek API çağırır;
 * tahmini toplam maliyet < 0,01 $.
 *
 * Çalıştırma:
 *   npx tsx --env-file=.env.local scripts/hello-providers.ts
 *   npx tsx --env-file=.env.local scripts/hello-providers.ts --voice <id> --wav <yol>
 *
 * Çıktı yalnızca durum, süre ve sayılardır; anahtar ya da yanıt gövdesi yazılmaz.
 */
import { readFile } from "node:fs/promises";

const SENTENCE = "She plays football every day.";

type Result = { name: string; ok: boolean; ms: number; info: string };

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} tanımlı değil (.env.local)`);
  return v;
}

async function timed(
  name: string,
  fn: () => Promise<string>,
): Promise<Result> {
  const t0 = performance.now();
  try {
    const info = await fn();
    return { name, ok: true, ms: Math.round(performance.now() - t0), info };
  } catch (err) {
    const info = err instanceof Error ? err.message : String(err);
    return { name, ok: false, ms: Math.round(performance.now() - t0), info };
  }
}

async function failOnHttp(res: Response, label: string): Promise<void> {
  if (res.ok) return;
  // Gövdenin yalnızca hata kodu kısmını göster; içerik yazma.
  let code = "";
  try {
    const body = (await res.json()) as { error?: { type?: string; code?: string } };
    code = body.error?.type ?? body.error?.code ?? "";
  } catch {
    /* gövde JSON değil */
  }
  throw new Error(`${label} HTTP ${res.status}${code ? ` (${code})` : ""}`);
}

// --- Anthropic ----------------------------------------------------------------
async function helloAnthropic(): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env("ANTHROPIC_API_KEY"),
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    // temperature / top_p / top_k gönderilmez (Haiku 5.5 kabul etmez).
    body: JSON.stringify({
      model: "claude-haiku-5-5",
      max_tokens: 64,
      thinking: { type: "disabled" },
      messages: [{ role: "user", content: "Reply with the single word: hello" }],
    }),
  });
  await failOnHttp(res, "anthropic");
  const data = (await res.json()) as {
    stop_reason?: string;
    content?: { type: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const hasText = data.content?.some((b) => b.type === "text") ?? false;
  if (!hasText) throw new Error(`metin bloğu yok (stop_reason=${data.stop_reason})`);
  return `in=${data.usage?.input_tokens} out=${data.usage?.output_tokens} stop=${data.stop_reason}`;
}

// --- Speechify ----------------------------------------------------------------
type Voice = {
  id: string;
  locale?: string;
  language?: string;
  models?: { name?: string; languages?: { locale?: string }[] }[];
};

function isEnUs(v: Voice): boolean {
  const locales = [
    v.locale,
    v.language,
    ...(v.models ?? []).flatMap((m) => (m.languages ?? []).map((l) => l.locale)),
  ];
  return locales.some((l) => l?.toLowerCase() === "en-us");
}

async function pickVoice(key: string): Promise<string> {
  const override = arg("voice");
  if (override) return override;
  const res = await fetch("https://api.speechify.ai/v1/voices", {
    headers: { Authorization: `Bearer ${key}` },
  });
  await failOnHttp(res, "speechify voices");
  const voices = (await res.json()) as Voice[];
  const voice = voices.find(isEnUs);
  if (!voice) throw new Error(`en-US ses bulunamadı (${voices.length} ses); --voice ile ver`);
  return voice.id;
}

let speechifyAudio: Buffer | undefined;

async function helloSpeechify(): Promise<string> {
  const key = env("SPEECHIFY_API_KEY");
  const voiceId = await pickVoice(key);
  const res = await fetch("https://api.speechify.ai/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      input: SENTENCE,
      voice_id: voiceId,
      model: "simba-3.5",
      audio_format: "mp3",
      language: "en-US",
    }),
  });
  await failOnHttp(res, "speechify speech");
  const data = (await res.json()) as {
    audio_data?: string;
    billable_characters_count?: number;
  };
  if (!data.audio_data) throw new Error("audio_data yok");
  speechifyAudio = Buffer.from(data.audio_data, "base64");
  return `voice=${voiceId} chars=${data.billable_characters_count} bytes=${speechifyAudio.length}`;
}

// --- Azure Speech (MAI-Transcribe-2) -----------------------------------------
function wordAccuracy(expected: string, actual: string): number {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z' ]/g, " ").split(/\s+/).filter(Boolean);
  const exp = norm(expected);
  const act = new Set(norm(actual));
  return exp.filter((w) => act.has(w)).length / exp.length;
}

async function helloAzure(): Promise<string> {
  const wavPath = arg("wav");
  let audio: Blob;
  let filename: string;
  if (wavPath) {
    audio = new Blob([new Uint8Array(await readFile(wavPath))], { type: "audio/wav" });
    filename = "hello.wav";
  } else if (speechifyAudio) {
    audio = new Blob([new Uint8Array(speechifyAudio)], { type: "audio/mpeg" });
    filename = "hello.mp3";
  } else {
    throw new Error("ses yok: Speechify başarısız; --wav <yol> ile 3 sn'lik WAV ver");
  }

  const form = new FormData();
  form.append("audio", audio, filename);
  // transcribeStyle gönderilmez (varsayılan verbatim).
  form.append(
    "definition",
    JSON.stringify({
      locales: ["en"],
      enhancedMode: { enabled: true, model: "MAI-Transcribe-2" },
    }),
  );

  const endpoint = env("AZURE_SPEECH_ENDPOINT").replace(/\/+$/, "");
  const res = await fetch(
    `${endpoint}/speechtotext/transcriptions:transcribe?api-version=2025-10-15`,
    {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": env("AZURE_SPEECH_KEY") },
      body: form,
    },
  );
  await failOnHttp(res, "azure");
  const data = (await res.json()) as {
    durationMilliseconds?: number;
    combinedPhrases?: { text?: string }[];
  };
  const transcript = data.combinedPhrases?.map((p) => p.text ?? "").join(" ") ?? "";
  if (!transcript) throw new Error("boş transkript");
  const source = wavPath ? "wav" : "speechify-mp3";
  const acc = wavPath ? "n/a" : wordAccuracy(SENTENCE, transcript).toFixed(2);
  return `source=${source} audio_ms=${data.durationMilliseconds} words=${transcript.split(/\s+/).length} word_match=${acc}`;
}

// --- main ---------------------------------------------------------------------
async function main() {
  const results = [
    await timed("anthropic", helloAnthropic),
    await timed("speechify", helloSpeechify),
    await timed("azure", helloAzure),
  ];
  for (const r of results) {
    console.log(`${r.ok ? "OK  " : "FAIL"} ${r.name.padEnd(10)} ${String(r.ms).padStart(6)} ms  ${r.info}`);
  }
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

main();
