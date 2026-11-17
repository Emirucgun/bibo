/**
 * M8 Bitti testi 1, 2 ve 5: transkript sadakati, aksan cezası ve transkript + değerlendirme gecikmesi
 * (docs/SPEC.md Bölüm 12, PRD F6).
 *
 * Kayıtlar (P6, pedagoji sahibi): scripts/data/verbatim/*.wav + manifest.json
 * (biçim: manifest.example.json). Kayıtlar kişisel veridir ve repoya girmez (.gitignore).
 *   - kind "error": bilerek hatalı okunmuş cümle; her hata için transkriptte `expect` geçmeli, `not` geçmemeli.
 *   - kind "accent": aksanlı ama dilbilgisi doğru cevap; transkript + değerlendirme, puan ≥ 0,9 ve doğru.
 * Telefonla kaydedilmiş WAV (44,1/48 kHz, stereo) 16 kHz mono'ya çevrilir (uygulamanın gönderdiği biçim).
 *
 * GERÇEK API, PARA HARCAR. Tahmin: 30 kayıt × ≈ 5 sn ≈ 2,5 dk transkript (≈ 0,005 $) + 10 değerlendirme
 * (≈ 0,007 $) → toplam < 0,02 $. Çalıştırmadan önce onay al.
 *
 *   npx tsx --env-file=.env.local scripts/eval-verbatim.ts [--dir <klasör>] [--no-db]
 *
 * Hedefler: hataların ≥ %85'i korunur; aksanlı doğru cevaplarda 0 ceza; transkript + değerlendirme p90 ≤ 6 sn.
 * Sadakat tutmazsa SPEC 5.1: `lib/stt` arkasında talimat verilebilen yedek sağlayıcı denenir.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gradeFreeAnswer } from "@/lib/ai/grade";
import { parseWav, toTargetWav } from "@/lib/audio/wav";
import { transcribe } from "@/lib/stt";
import { createMaiTranscriber } from "@/lib/stt/mai";
import { percentile, summarizeUsage } from "./lib/eval";
import { arg, fmtSec, fmtUsd, setupDeps } from "./lib/eval-env";
import { ACCENT_MIN_SCORE, errorKept, VERBATIM_TARGET, VerbatimManifest } from "./lib/verbatim";

async function main() {
  const dir = arg("dir") ?? new URL("./data/verbatim/", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
  let raw: string;
  try {
    raw = readFileSync(join(dir, "manifest.json"), "utf8");
  } catch {
    throw new Error(`kayıt listesi yok: ${join(dir, "manifest.json")} (P6; biçim: manifest.example.json)`);
  }
  const clips = VerbatimManifest.parse(JSON.parse(raw));
  const deps = setupDeps();
  const stt = { ai: deps.store, stt: createMaiTranscriber() };
  const now = new Date();

  const errorRows: { id: string; kept: number; total: number; transcript: string }[] = [];
  const accentRows: { id: string; ok: boolean; score: number | null; errors: string[]; transcript: string; total_ms: number }[] = [];

  for (const clip of clips) {
    const wav = toTargetWav(new Uint8Array(readFileSync(join(dir, clip.file))));
    const info = wav ? parseWav(wav) : null;
    if (!wav || !info) {
      console.log(`${clip.id.padEnd(6)} ATLANDI: 16 bit PCM WAV değil`);
      continue;
    }
    const t0 = performance.now();
    const heard = await transcribe(stt, { userId: null, sessionId: null, now }, { wav, durationSec: info.durationSec });

    if (clip.kind === "error") {
      const kept = clip.errors.filter((e) => errorKept(heard.transcript, e)).length;
      errorRows.push({ id: clip.id, kept, total: clip.errors.length, transcript: heard.transcript });
      console.log(`${clip.id.padEnd(6)} ${kept}/${clip.errors.length} hata korundu  okunan: "${clip.read_text}"  duyulan: "${heard.transcript}"`);
      continue;
    }
    const graded = await gradeFreeAnswer(
      { store: deps.store, llm: deps.llm },
      { userId: null, sessionId: null, now },
      {
        activity_type: "speak_answer",
        topic_id: clip.topic_id,
        level: clip.level,
        task: clip.prompt_en,
        model_answer_en: clip.model_answer_en,
        accepted: [],
        student_text: heard.transcript,
      },
    );
    const total = Math.round(performance.now() - t0);
    const score = graded.kind === "ok" ? graded.result.score : null;
    const ok = graded.kind === "ok" && graded.result.is_correct && graded.result.score >= ACCENT_MIN_SCORE;
    const codes = graded.kind === "ok" ? graded.result.errors.map((e) => e.l1_code) : [graded.reason];
    accentRows.push({ id: clip.id, ok, score, errors: codes, transcript: heard.transcript, total_ms: total });
    console.log(`${clip.id.padEnd(6)} ${ok ? "✓" : "✗"} puan ${score ?? "-"}  hatalar [${codes.join(", ")}]  duyulan: "${heard.transcript}"  ${fmtSec(total)}`);
  }

  const kept = errorRows.reduce((a, r) => a + r.kept, 0);
  const total = errorRows.reduce((a, r) => a + r.total, 0);
  const fidelity = total > 0 ? kept / total : null;
  const lat = accentRows.map((r) => r.total_ms);
  const usage = summarizeUsage(deps.store.rows);
  const summary = {
    error_clips: errorRows.length,
    errors_total: total,
    errors_kept: kept,
    fidelity,
    accent_clips: accentRows.length,
    accent_penalized: accentRows.filter((r) => !r.ok).length,
    transcribe_grade_p50_ms: lat.length ? percentile(lat, 50) : null,
    transcribe_grade_p90_ms: lat.length ? percentile(lat, 90) : null,
    usage,
    llm_usage_in_db: deps.db,
  };

  console.log("\n— Özet —");
  if (fidelity !== null) {
    console.log(`Sadakat: ${(fidelity * 100).toFixed(1)}% (${kept}/${total}, hedef ≥ %${VERBATIM_TARGET * 100})`);
  }
  if (accentRows.length) {
    console.log(`Aksan: ${summary.accent_penalized}/${accentRows.length} cevapta puan düştü (hedef 0)`);
    console.log(`Transkript + değerlendirme p50 ${fmtSec(summary.transcribe_grade_p50_ms!)}, p90 ${fmtSec(summary.transcribe_grade_p90_ms!)} (hedef p90 ≤ 6 sn)`);
  }
  console.log(`Toplam: ${fmtUsd(usage.cost_usd)} · ${usage.calls} çağrı`);

  const outDir = new URL("./out/", import.meta.url);
  mkdirSync(outDir, { recursive: true });
  // Transkriptler yalnızca yerel çıktı dosyasına (pedagoji incelemesi için); `llm_usage`'a yazılmaz.
  writeFileSync(new URL("eval-verbatim.json", outDir), JSON.stringify({ summary, errorRows, accentRows }, null, 2));
  console.log("Yazıldı: scripts/out/eval-verbatim.json");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
