// Araştırma betiği (ürün kodu değil): MEVCUT motorun (lib/engine/*, lib/session/placement.ts,
// lib/progress/progress.ts) güçlü bir öğrenciyi nasıl sınıflandırdığını gerçek kodla yeniden üretir.
// Ağ, veritabanı ve API çağrısı yok; para harcamaz.
// Çalıştır (depo kökünden): npx tsx docs/arastirma/sim/mevcut_motor.ts [doğru_olasılığı=0.97] [oturum=40] [tohum_sayısı=20]
import { SKILLS } from "@/lib/content/activity-types";
import { diagnoseTopic, reconcileDiagnoses, type MasteryBySkill } from "@/lib/engine/diagnosis";
import { applyEvidence, emptyMastery, masteryBand } from "@/lib/engine/mastery";
import { planSession } from "@/lib/engine/planner";
import { createRng } from "@/lib/engine/random";
import type { ExistingDiagnosis, Mode, MasteryRow, RecentError, Skill, TopicAttempt } from "@/lib/engine/types";
import { ACTIVITY_TYPE_INFO, isActivityType } from "@/lib/content/activity-types";
import { buildProgress } from "@/lib/progress/progress";
import { estimateLevel, PLACEMENT_BANK, weakPoints } from "@/lib/session/placement";
import { loadL1Codes, loadTopics } from "@/scripts/lib/seed";

const P = Number(process.argv[2] ?? 0.97);
const SESSIONS = Number(process.argv[3] ?? 40);
const SEEDS = Number(process.argv[4] ?? 20);
const DAY = 86_400_000;
const topics = loadTopics();
const l1 = loadL1Codes();
const byId = new Map(topics.map((t) => [t.id, t]));
const key = (t: string, s: Skill) => `${t}|${s}`;

type Grid = { unknown: number; weak: number; developing: number; solid: number };

function run(seed: number, verbose: boolean) {
  const rng = createRng(seed);
  const t0 = new Date("2026-12-01T09:00:00Z");
  const mastery = new Map<string, MasteryRow>();
  const apply = (topicId: string, skill: Skill, mode: Mode, correct: boolean, at: Date) => {
    const t = byId.get(topicId)!;
    const prev = mastery.get(key(topicId, skill)) ?? { ...emptyMastery(t), topic_id: topicId, skill };
    const next = applyEvidence(
      prev,
      { topic_id: topicId, skill, mode, score: correct ? 1 : 0, is_correct: correct, hint_used: false, incidental: false },
      at,
    );
    mastery.set(key(topicId, skill), { ...next, topic_id: topicId, skill });
  };
  const grid = (levelEst: "A1" | "A2"): Grid => {
    const p = buildProgress({ levelEst, mastery: [...mastery.values()], weekSessions: 0, errorCodes: [], diagnoses: [] });
    const c: Grid = { unknown: 0, weak: 0, developing: 0, solid: 0 };
    for (const r of p.grid) for (const s of SKILLS) { const v = r.cells[s]; if (v) c[v]++; }
    return c;
  };

  // 1) Kusursuz yerleştirme (14/14)
  let correct = 0;
  for (const it of PLACEMENT_BANK) {
    if (!isActivityType(it.activity_type)) continue;
    const info = ACTIVITY_TYPE_INFO[it.activity_type];
    apply(it.topic_id, info.skill, info.mode, true, t0);
    correct++;
  }
  const level = estimateLevel("A1", correct, correct);
  if (verbose) {
    console.log(`Yerleştirme: ${correct}/${correct} doğru → level_est=${level}`);
    console.log("Kusursuz öğrenciye gösterilen 'Tahmini zayıf noktaların':");
    for (const w of weakPoints(PLACEMENT_BANK.map((i) => i.topic_id), [...mastery.values()], topics)) console.log(`  - ${w.titleTr}`);
    console.log("Yerleştirmeden sonra ölçülen hücreler:");
    for (const r of mastery.values()) console.log(`  ${r.topic_id}|${r.skill}: ${r.score} → ${masteryBand(r)}`);
    console.log("Izgara:", grid(level));
  }

  // 2) Günlük oturumlar, her cevap P olasılıkla doğru
  const attempts = new Map<string, TopicAttempt[]>();
  const errors: RecentError[] = [];
  let diagnoses: ExistingDiagnosis[] = [];
  const focus: string[] = [];
  for (let s = 0; s < SESSIONS; s++) {
    const now = new Date(t0.getTime() + (s + 1) * DAY);
    const plan = planSession({
      now, rng, level_est: level, interests: ["music"], topics, l1_codes: l1, mastery: [...mastery.values()],
      activity_stats: [], active_diagnoses: diagnoses, recent_errors: errors, school_topic_id: null,
      settings: { tts_enabled: true, general_content_rate: 0.2 },
    });
    const touched = new Set<string>();
    plan.slots.forEach((slot, i) => {
      const ok = rng() < P;
      const at = new Date(now.getTime() + (i + 1) * 90_000);
      apply(slot.topic_id, slot.skill, slot.mode, ok, at);
      const list = attempts.get(slot.topic_id) ?? [];
      list.push({ skill: slot.skill, activity_type: slot.activity_type, is_correct: ok });
      attempts.set(slot.topic_id, list);
      if (!ok) errors.push({ topic_id: slot.topic_id, skill: slot.skill, l1_code: slot.l1_target ?? "GEN.OTHER", created_at: at });
      touched.add(slot.topic_id);
    });
    for (const topicId of touched) {
      const bySkill: MasteryBySkill = {};
      for (const sk of SKILLS) { const r = mastery.get(key(topicId, sk)); if (r) bySkill[sk] = r; }
      const res = reconcileDiagnoses({
        topic_id: topicId, candidate: diagnoseTopic(topicId, bySkill, attempts.get(topicId)),
        existing: diagnoses, mastery: bySkill, attempts: attempts.get(topicId),
      });
      for (const u of res.updates) diagnoses = diagnoses.map((d) => (d.id === u.id ? { ...d, status: u.status } : d));
      if (res.insert) {
        const c = res.insert;
        diagnoses.push({ id: `d${diagnoses.length}`, topic_id: c.topic_id, kind: c.kind, weak_skill: c.weak_skill, weak_activity: c.weak_activity, status: "active" });
        if (verbose) console.log(`  !! oturum ${s + 1}: YANLIŞ teşhis ${c.kind} → ${c.topic_id} (güven ${c.confidence})`);
      }
    }
    focus.push(plan.focus_topic_id ?? "-");
    if (verbose && (s < 3 || (s + 1) % 10 === 0)) console.log(`Oturum ${s + 1}: odak=${plan.focus_topic_id} ızgara`, grid(level));
  }
  if (verbose) console.log("Odak konuları:", focus.slice(0, 12).join(", "), "…");
  return { diagnoses: diagnoses.length, final: grid(level) };
}

run(7, true);
const results = Array.from({ length: SEEDS }, (_, i) => run(i + 1, false));
const withFalse = results.filter((r) => r.diagnoses > 0).length;
const total = results.reduce((a, r) => a + r.diagnoses, 0);
console.log(`\n${SEEDS} tohum, p=${P}, ${SESSIONS} oturum: en az bir yanlış teşhis alan ${withFalse}/${SEEDS}, toplam ${total} yanlış teşhis`);
console.log("Son ızgaralar (sağlam/gelişiyor/zayıf/bilinmiyor):", results.map((r) => `${r.final.solid}/${r.final.developing}/${r.final.weak}/${r.final.unknown}`).join(" "));
