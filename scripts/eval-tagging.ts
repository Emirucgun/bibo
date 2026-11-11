/**
 * M5 Bitti testi: etiketleme uyumu ve değerlendirme gecikmesi (docs/SPEC.md Bölüm 12).
 * Altın set (P4, pedagoji sahibi): scripts/data/golden.json — biçim için golden.example.json.
 * GERÇEK API, PARA HARCAR (40 cümle ≈ 0,03 $). Çalıştırmadan önce onay al.
 *
 *   npx tsx --env-file=.env.local scripts/eval-tagging.ts [--golden <yol>] [--limit N] [--no-db]
 *
 * Hedef: öğretmen etiketiyle ≥ %80 uyum, değerlendirme p90 ≤ 6 sn.
 * Tutmazsa (ROADMAP M5): önce effort_grade = medium, sonra model_grade bir üst model;
 * gecikme tutmazsa thinking_grade = disabled ile tekrar ölç.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gradeFreeAnswer } from "@/lib/ai/grade";
import { GoldenSet, percentile, summarizeUsage, tagAgrees } from "./lib/eval";
import { arg, fmtSec, fmtUsd, setupDeps } from "./lib/eval-env";

async function main() {
  const path = arg("golden") ?? new URL("./data/golden.json", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(`altın set bulunamadı: ${path} (P4; biçim: scripts/data/golden.example.json)`);
  }
  const golden = GoldenSet.parse(JSON.parse(raw)).slice(0, Number(arg("limit") ?? Infinity));
  const deps = setupDeps();
  const now = new Date();

  const results: { id: string; agree: boolean; latency_ms: number; expected: string[]; got: string[]; outcome: string }[] = [];
  for (const g of golden) {
    const t0 = performance.now();
    const out = await gradeFreeAnswer(
      deps,
      { userId: null, sessionId: null, now },
      {
        activity_type: g.activity_type,
        topic_id: g.topic_id,
        level: g.level,
        task: g.task,
        model_answer_en: g.model_answer_en,
        accepted: [],
        student_text: g.student_text,
      },
    );
    const latency = Math.round(performance.now() - t0);
    const got = out.kind === "ok" ? out.result.errors.map((e) => e.l1_code) : [];
    const agree = out.kind === "ok" && tagAgrees(g.expected, out.result);
    results.push({ id: g.id, agree, latency_ms: latency, expected: g.expected.l1_codes, got, outcome: out.kind === "ok" ? "ok" : out.reason });
    console.log(`${g.id.padEnd(10)} ${agree ? "✓" : "✗"}  beklenen [${g.expected.l1_codes.join(", ")}]  model [${got.join(", ")}]  ${fmtSec(latency)}`);
  }

  const usage = summarizeUsage(deps.store.rows);
  const lat = results.map((r) => r.latency_ms);
  const agreement = results.filter((r) => r.agree).length / results.length;
  const summary = {
    n: results.length,
    agreement,
    latency_p50_ms: percentile(lat, 50),
    latency_p90_ms: percentile(lat, 90),
    unavailable: results.filter((r) => r.outcome !== "ok").length,
    usage,
    llm_usage_in_db: deps.db,
  };
  console.log("\n— Özet —");
  console.log(`Uyum: ${(agreement * 100).toFixed(1)}% (${results.filter((r) => r.agree).length}/${results.length}, hedef ≥ %80)`);
  console.log(`Değerlendirme p50 ${fmtSec(summary.latency_p50_ms)}, p90 ${fmtSec(summary.latency_p90_ms)} (hedef p90 ≤ 6 sn)`);
  console.log(`Toplam: ${fmtUsd(usage.cost_usd)} · ${usage.calls} çağrı · önbellek isabeti ${(usage.cache_hit_rate_after_first * 100).toFixed(0)}%`);

  const outDir = new URL("./out/", import.meta.url);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(new URL("eval-tagging.json", outDir), JSON.stringify({ summary, results }, null, 2));
  console.log("Yazıldı: scripts/out/eval-tagging.json");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
