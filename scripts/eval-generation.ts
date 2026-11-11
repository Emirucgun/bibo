/**
 * M5 Bitti testi: üretim kalitesi, maliyet ve gecikme (docs/SPEC.md Bölüm 12).
 * 4 sentetik profil × 5 oturum = 20 gerçek üretim çağrısı. GERÇEK API, PARA HARCAR
 * (tahmin ≈ 0,10–0,25 $). Çalıştırmadan önce onay al.
 *
 *   npx tsx --env-file=.env.local scripts/eval-generation.ts            # llm_usage dev DB'ye
 *   npx tsx --env-file=.env.local scripts/eval-generation.ts --no-db    # yalnızca bellekte
 *   seçenekler: --profiles 4 --sessions 5 --seed 7
 *
 * Çıktı: konsolda özet; scripts/out/eval-generation.json (sayılar) ve
 * scripts/out/review-sample.md (pedagoji sahibinin inceleyeceği rastgele 20 etkinlik).
 * Hedef: %100 şema geçerli (yeniden denemeyle), ortalama ≤ 0,02 $/oturum, p90 ≤ 60 sn.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { generateSession, GenerationError } from "@/lib/ai/generate-session";
import type { GeneratedItem } from "@/lib/ai/schemas";
import { emptyMastery } from "@/lib/engine/mastery";
import { planSession } from "@/lib/engine/planner";
import { createRng } from "@/lib/engine/random";
import type { EngineTopic, Interest, Level, MasteryRow, Skill } from "@/lib/engine/types";
import { SKILLS } from "@/lib/content/activity-types";
import { mean, percentile, sample, summarizeUsage } from "./lib/eval";
import { arg, fmtSec, fmtUsd, setupDeps } from "./lib/eval-env";
import { loadL1Codes, loadTopics } from "./lib/seed";

interface Profile {
  name: string;
  level: Level;
  interests: Interest[];
  /** Bu `sort` değerine kadar olan konularda beceri ustalıkları. */
  known_until_sort: number;
  skill_scores: Record<Skill, number>;
}

const PROFILES: Profile[] = [
  { name: "A1 yeni", level: "A1", interests: ["football", "gaming"], known_until_sort: 0, skill_scores: { reading: 0.5, listening: 0.5, writing: 0.5, speaking: 0.5 } },
  { name: "A1 ilerlemiş", level: "A1", interests: ["music", "food"], known_until_sort: 90, skill_scores: { reading: 0.75, listening: 0.6, writing: 0.7, speaking: 0.55 } },
  { name: "A2 yazıda iyi, konuşmada zayıf", level: "A2", interests: ["series_film", "cars"], known_until_sort: 150, skill_scores: { reading: 0.8, listening: 0.7, writing: 0.85, speaking: 0.3 } },
  { name: "A2 dengeli", level: "A2", interests: ["tech", "travel", "science_space"], known_until_sort: 200, skill_scores: { reading: 0.7, listening: 0.65, writing: 0.65, speaking: 0.6 } },
];

const DAY_MS = 86_400_000;

function masteryFor(p: Profile, topics: EngineTopic[], now: Date): MasteryRow[] {
  const rows: MasteryRow[] = [];
  for (const t of topics) {
    if (t.sort > p.known_until_sort) continue;
    for (const skill of SKILLS) {
      rows.push({
        ...emptyMastery(t),
        topic_id: t.id,
        skill,
        score: p.skill_scores[skill],
        n: 4,
        correct: Math.round(4 * p.skill_scores[skill]),
        last_seen_at: new Date(now.getTime() - 3 * DAY_MS),
        next_review_at: new Date(now.getTime() + ((t.sort % 3) - 1) * DAY_MS),
      });
    }
  }
  return rows;
}

interface SessionReport {
  profile: string;
  index: number;
  ok: boolean;
  error: string | null;
  items: number;
  dropped: number;
  regenerated: number;
  calls: number;
  latency_ms: number;
  cost_usd: number;
}

async function main() {
  const nProfiles = Number(arg("profiles") ?? 4);
  const nSessions = Number(arg("sessions") ?? 5);
  const seed = Number(arg("seed") ?? 7);
  const deps = setupDeps();
  const topics = loadTopics();
  const codes = loadL1Codes();
  const start = new Date();
  const reports: SessionReport[] = [];
  const generated: { profile: string; level: Level; item: GeneratedItem }[] = [];

  for (const p of PROFILES.slice(0, nProfiles)) {
    for (let s = 0; s < nSessions; s++) {
      const now = new Date(start.getTime() + s * DAY_MS);
      const rng = createRng(seed * 1000 + reports.length);
      const plan = planSession({
        now,
        rng,
        level_est: p.level,
        interests: p.interests,
        topics,
        l1_codes: codes,
        mastery: masteryFor(p, topics, now),
        activity_stats: [],
        active_diagnoses: [],
        recent_errors: [],
        school_topic_id: null,
        settings: { tts_enabled: true, general_content_rate: 0.2 },
      });
      const rowsBefore = deps.store.rows.length;
      const t0 = performance.now();
      const report: SessionReport = {
        profile: p.name, index: s + 1, ok: false, error: null, items: 0, dropped: 0,
        regenerated: 0, calls: 0, latency_ms: 0, cost_usd: 0,
      };
      try {
        const out = await generateSession(
          deps,
          { userId: null, sessionId: null, now },
          { level: p.level, explainMode: "short", varietySeed: `eval-${seed}-${p.name}-${s}`, slots: plan.slots },
        );
        Object.assign(report, { ok: true, items: out.items.length, dropped: out.dropped.length, regenerated: out.regenerated.length, calls: out.calls });
        for (const item of out.items) generated.push({ profile: p.name, level: p.level, item });
      } catch (err) {
        report.error = err instanceof GenerationError ? err.code : err instanceof Error ? err.name + ":" + err.message.slice(0, 60) : "unknown";
      }
      report.latency_ms = Math.round(performance.now() - t0);
      report.cost_usd = summarizeUsage(deps.store.rows.slice(rowsBefore)).cost_usd;
      reports.push(report);
      console.log(
        `${p.name.padEnd(32)} #${s + 1}  ${report.ok ? "OK " : "ERR"}  ${report.items} etkinlik  ` +
          `düşen ${report.dropped}  yeniden ${report.regenerated}  ${fmtSec(report.latency_ms)}  ${fmtUsd(report.cost_usd)}` +
          (report.error ? `  (${report.error})` : ""),
      );
    }
  }

  const usage = summarizeUsage(deps.store.rows);
  const lat = reports.map((r) => r.latency_ms);
  const okCount = reports.filter((r) => r.ok).length;
  const summary = {
    sessions: reports.length,
    schema_valid_rate: okCount / reports.length,
    avg_cost_per_session_usd: usage.cost_usd / reports.length,
    latency_p50_ms: percentile(lat, 50),
    latency_p90_ms: percentile(lat, 90),
    avg_items: mean(reports.filter((r) => r.ok).map((r) => r.items)),
    dropped_slots: reports.reduce((a, r) => a + r.dropped, 0),
    regenerated_slots: reports.reduce((a, r) => a + r.regenerated, 0),
    usage,
    llm_usage_in_db: deps.db,
  };

  console.log("\n— Özet —");
  console.log(`Şema geçerli oturum: ${okCount}/${reports.length} (hedef %100)`);
  console.log(`Ortalama maliyet: ${fmtUsd(summary.avg_cost_per_session_usd)}/oturum (hedef ≤ 0,02 $)`);
  console.log(`Üretim süresi p50 ${fmtSec(summary.latency_p50_ms)}, p90 ${fmtSec(summary.latency_p90_ms)} (hedef p90 ≤ 60 sn)`);
  console.log(`Çağrı: ${usage.calls}, önbellek isabeti (ilk çağrıdan sonra): ${(usage.cache_hit_rate_after_first * 100).toFixed(0)}%`);
  console.log(`Toplam: ${fmtUsd(usage.cost_usd)} · girdi ${usage.input_tokens}, çıktı ${usage.output_tokens}, önbellek okuma ${usage.cache_read_tokens}, yazma ${usage.cache_write_tokens}`);

  const outDir = new URL("./out/", import.meta.url);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(new URL("eval-generation.json", outDir), JSON.stringify({ summary, reports }, null, 2));
  const picked = sample(generated, 20, seed);
  const md = [
    "# Pedagoji örneklemi — eval-generation",
    "",
    `${new Date().toISOString()} · ${picked.length} etkinlik. Her biri için: seviyeye uygun mu, PRD Bölüm 8 kurallarına uygun mu, etiketler doğru mu?`,
    "",
    ...picked.flatMap(({ profile, level, item }, i) => [
      `## ${i + 1}. ${item.activity_type} · ${item.topic_id} · ${level} (${profile})`,
      "",
      "- [ ] Uygun",
      "",
      "```json",
      JSON.stringify({ payload: item.payload, key: item.key }, null, 2),
      "```",
      "",
    ]),
  ].join("\n");
  writeFileSync(new URL("review-sample.md", outDir), md);
  console.log(`\nYazıldı: scripts/out/eval-generation.json, scripts/out/review-sample.md`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
