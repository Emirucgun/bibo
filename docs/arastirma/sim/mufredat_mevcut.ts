// Araştırma betiği (ürün kodu değil): MEVCUT planlayıcının konuları hangi sırayla açtığını ölçer.
// Her konunun ilk kez "odak" olduğu oturumu bulur ve ön koşulundan ÖNCE açılan konuları sayar
// ("sıra ihlali": ön koşulu henüz hiç odak olmamış ya da hiç çalışılmamış bir konuya geçmek).
// Ağ, veritabanı ve API çağrısı yok.
// Çalıştır (depo kökünden): npx tsx docs/arastirma/sim/mufredat_mevcut.ts [oturum=40] [tohum_sayısı=20]
import { applyEvidence, emptyMastery } from "@/lib/engine/mastery";
import { planSession } from "@/lib/engine/planner";
import { createRng } from "@/lib/engine/random";
import type { EngineTopic, Level, Mode, MasteryRow, RecentError, Skill } from "@/lib/engine/types";
import { loadL1Codes, loadTopics } from "@/scripts/lib/seed";

const SESSIONS = Number(process.argv[2] ?? 40);
const SEEDS = Number(process.argv[3] ?? 20);
const DAY = 86_400_000;
const topics = loadTopics();
const l1 = loadL1Codes();
const byId = new Map(topics.map((t) => [t.id, t]));
const key = (t: string, s: Skill) => `${t}|${s}`;

/** Öğrenci: konunun "öğrenilme" durumuna göre doğru olasılığı (öğretildikçe artar). */
function run(seed: number, level: Level, startP: number, verbose: boolean) {
  const rng = createRng(seed);
  const t0 = new Date("2026-12-01T09:00:00Z");
  const mastery = new Map<string, MasteryRow>();
  const practice = new Map<string, number>();
  const apply = (topicId: string, skill: Skill, mode: Mode, ok: boolean, at: Date) => {
    const t = byId.get(topicId)!;
    const prev = mastery.get(key(topicId, skill)) ?? { ...emptyMastery(t), topic_id: topicId, skill };
    const next = applyEvidence(prev, { topic_id: topicId, skill, mode, score: ok ? 1 : 0, is_correct: ok, hint_used: false, incidental: false }, at);
    mastery.set(key(topicId, skill), { ...next, topic_id: topicId, skill });
  };
  const errors: RecentError[] = [];
  const firstFocus = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  for (let s = 0; s < SESSIONS; s++) {
    const now = new Date(t0.getTime() + (s + 1) * DAY);
    const plan = planSession({
      now, rng, level_est: level, interests: ["music"], topics, l1_codes: l1, mastery: [...mastery.values()],
      activity_stats: [], active_diagnoses: [], recent_errors: errors, school_topic_id: null,
      settings: { tts_enabled: true, general_content_rate: 0.2 },
    });
    if (plan.focus_topic_id && !firstFocus.has(plan.focus_topic_id)) firstFocus.set(plan.focus_topic_id, s + 1);
    plan.slots.forEach((slot, i) => {
      if (!firstSeen.has(slot.topic_id)) firstSeen.set(slot.topic_id, s + 1);
      const n = practice.get(slot.topic_id) ?? 0;
      practice.set(slot.topic_id, n + 1);
      const p = Math.min(0.95, startP + 0.04 * n); // pratikle yavaşça artan başarı
      const ok = rng() < p;
      const at = new Date(now.getTime() + (i + 1) * 90_000);
      apply(slot.topic_id, slot.skill, slot.mode, ok, at);
      if (!ok) errors.push({ topic_id: slot.topic_id, skill: slot.skill, l1_code: slot.l1_target ?? "GEN.OTHER", created_at: at });
    });
  }
  // Sıra ihlali: konu odak olduğunda ön koşullarından biri o ana kadar hiç odak olmamış.
  const violations: string[] = [];
  for (const [id, sess] of firstFocus) {
    const t: EngineTopic = byId.get(id)!;
    for (const p of t.prereqs) {
      const ps = firstFocus.get(p);
      if (ps === undefined || ps > sess) violations.push(`${id} (oturum ${sess}) ← ön koşul ${p} ${ps === undefined ? "hiç odak olmadı" : `oturum ${ps}`}`);
    }
  }
  const order = [...firstFocus.entries()].sort((a, b) => a[1] - b[1]);
  if (verbose) {
    console.log(`\n== Seviye ${level}, başlangıç başarısı ${startP}: odak konularının ilk görünme sırası`);
    console.log(order.map(([id, s]) => `${s}:${id.replace("g.", "")}(r${byId.get(id)!.l1_risk})`).join("  "));
    console.log(`Sıra ihlalleri (${violations.length}):`);
    for (const v of violations) console.log("  - " + v);
    const neverFocused = topics.filter((t) => t.kind === "grammar" && (level === "A2" || t.level === "A1") && !firstFocus.has(t.id)).map((t) => t.id);
    console.log(`${SESSIONS} oturumda hiç odak olmayan açık konular (${neverFocused.length}): ${neverFocused.join(", ")}`);
  }
  return violations.length;
}

for (const [level, p] of [["A1", 0.45], ["A2", 0.6]] as [Level, number][]) {
  run(7, level, p, true);
  const v = Array.from({ length: SEEDS }, (_, i) => run(i + 1, level, p, false));
  console.log(`${SEEDS} tohum: sıra ihlali sayısı ortalama ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)} (min ${Math.min(...v)}, maks ${Math.max(...v)})`);
}
