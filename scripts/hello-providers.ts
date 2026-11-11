/**
 * M1 tek seferlik "merhaba" çağrıları (M5'te silinir; yerini lib/ai, lib/tts, lib/stt alır).
 *
 * Sağlayıcı düzeni (SCOPE.md günlüğü, 11.11.2026):
 *   - Claude Haiku 5.5      → OpenRouter (`anthropic/claude-haiku-5.5`, yalnızca Anthropic altyapısı)
 *   - MAI-Transcribe-2      → OpenRouter (`microsoft/mai-transcribe-2`)
 *   - Speechify Simba 3.5   → doğrudan Speechify (OpenRouter'da yok)
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
const OPENROUTER = "https://openrouter.ai/api/v1";

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

async function timed(name: string, fn: () => Promise<string>): Promise<Result> {
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
  // Gövdenin yalnızca hata kodu/türü kısmını göster; içerik yazma.
  let code = "";
  try {
    const body = (await res.json()) as {
      error?: { type?: string; code?: string | number; message?: string };
    };
    code = String(body.error?.type ?? body.error?.code ?? "");
  } catch {
    /* gövde JSON değil */
  }
  throw new Error(`${label} HTTP ${res.status}${code ? ` (${code})` : ""}`);
}

function openRouterHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${env("OPENROUTER_API_KEY")}`,
    "content-type": "application/json",
  };
}

// --- Claude Haiku 5.5 (OpenRouter) ------------------------------------------
async function helloClaude(): Promise<string> {
  const res = await fetch(`${OPENROUTER}/chat/completions`, {
    method: "POST",
    headers: openRouterHeaders(),
    // temperature / top_p / top_k gönderilmez (Haiku 5.5 kabul etmez).
    body: JSON.stringify({
      model: "anthropic/claude-haiku-5.5",
      // Veri işleyen listesi değişmesin diye yalnızca Anthropic altyapısı; eğitimde kullanım yok.
      provider: { only: ["anthropic"], data_collection: "deny" },
      reasoning: { effort: "low" },
      max_tokens: 512,
      messages: [{ role: "user", content: "Reply with the single word: hello" }],
    }),
  });
  await failOnHttp(res, "openrouter chat");
  const data = (await res.json()) as {
    provider?: string;
    choices?: { finish_reason?: string; message?: { content?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  };
  const choice = data.choices?.[0];
  if (!choice?.message?.content) {
    throw new Error(`boş yanıt (finish_reason=${choice?.finish_reason})`);
  }
  const u = data.usage;
  return `via=${data.provider} in=${u?.prompt_tokens} out=${u?.completion_tokens} cost=$${u?.cost ?? "?"} finish=${choice.finish_reason}`;
}

// --- Speechify Simba 3.5 (doğrudan) -----------------------------------------
type Voice = {
  id: string;
  locale?: string;
  language?: string;
  models?: { name?: string; languages?: { locale?: string }[] }[];
};

// simba-3.5 modelini en-US'de destekleyen ses.
function isSimbaEnUs(v: Voice): boolean {
  return (v.models ?? []).some(
    (m) =>
      m.name === "simba-3.5" &&
      (m.languages ?? []).some((l) => l.locale?.toLowerCase() === "en-us"),
  );
}

async function pickVoice(key: string): Promise<string> {
  const override = arg("voice");
  if (override) return override;
  const res = await fetch("https://api.speechify.ai/v1/voices", {
    headers: { Authorization: `Bearer ${key}` },
  });
  await failOnHttp(res, "speechify voices");
  // Yanıt sayfalı: { voices, next_cursor, has_more }. Merhaba için ilk sayfa yeterli.
  const body = (await res.json()) as { voices?: Voice[] } | Voice[];
  const voices = Array.isArray(body) ? body : (body.voices ?? []);
  const voice = voices.find(isSimbaEnUs);
  if (!voice) {
    throw new Error(`ilk sayfada simba-3.5 en-US ses yok (${voices.length} ses); --voice ile ver`);
  }
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

// --- MAI-Transcribe-2 (OpenRouter) ------------------------------------------
function wordAccuracy(expected: string, actual: string): number {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z' ]/g, " ").split(/\s+/).filter(Boolean);
  const exp = norm(expected);
  const act = new Set(norm(actual));
  return exp.filter((w) => act.has(w)).length / exp.length;
}

async function helloTranscribe(): Promise<string> {
  const wavPath = arg("wav");
  let audio: Buffer;
  let format: "wav" | "mp3";
  if (wavPath) {
    audio = await readFile(wavPath);
    format = "wav";
  } else if (speechifyAudio) {
    audio = speechifyAudio;
    format = "mp3";
  } else {
    throw new Error("ses yok: Speechify başarısız; --wav <yol> ile 3 sn'lik WAV ver");
  }

  const res = await fetch(`${OPENROUTER}/audio/transcriptions`, {
    method: "POST",
    headers: openRouterHeaders(),
    body: JSON.stringify({
      model: "microsoft/mai-transcribe-2",
      input_audio: { data: audio.toString("base64"), format },
      language: "en",
      provider: { data_collection: "deny" },
    }),
  });
  await failOnHttp(res, "openrouter transcribe");
  const data = (await res.json()) as {
    text?: string;
    usage?: { seconds?: number; cost?: number };
  };
  const transcript = data.text?.trim() ?? "";
  if (!transcript) throw new Error("boş transkript");
  const acc = wavPath ? "n/a" : wordAccuracy(SENTENCE, transcript).toFixed(2);
  return `source=${wavPath ? "wav" : "speechify-mp3"} words=${transcript.split(/\s+/).length} word_match=${acc} usage=${JSON.stringify(data.usage ?? {})}`;
}

// --- main ---------------------------------------------------------------------
async function main() {
  const results = [
    await timed("claude", helloClaude),
    await timed("speechify", helloSpeechify),
    await timed("transcribe", helloTranscribe),
  ];
  for (const r of results) {
    console.log(`${r.ok ? "OK  " : "FAIL"} ${r.name.padEnd(10)} ${String(r.ms).padStart(6)} ms  ${r.info}`);
  }
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

main();
