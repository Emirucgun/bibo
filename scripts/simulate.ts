// Uçtan uca simülasyon (ROADMAP M4): "yazmada bilen, konuşmada bilmeyen" sentetik öğrenci,
// sahte değerlendirme, 6 oturum. Ağ/veritabanı/API çağrısı yok; para harcamaz.
// Çalıştır: npx tsx scripts/simulate.ts [--seed 42] [--sessions 6]
import { diagnosisMessage } from "@/lib/engine/diagnosis";
import { loadL1Codes, loadTopics } from "./lib/seed";
import { simulate } from "./lib/simulate";

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}

const topics = loadTopics();
const titles = new Map(topics.map((t) => [t.id, t.title_tr]));
const result = simulate({
  topics,
  l1_codes: loadL1Codes(),
  seed: arg("seed", 42),
  sessions: arg("sessions", 6),
});

for (const s of result.sessions) {
  const right = s.slots.filter((x) => x.correct).length;
  console.log(
    `\nOturum ${s.index} · odak ${s.focus_topic_id} · ${s.slots.length} etkinlik · ${s.total_seconds} sn · ${right}/${s.slots.length} doğru`,
  );
  for (const x of s.slots) {
    console.log(`  ${x.correct ? "✓" : "✗"} ${x.purpose.padEnd(7)} ${x.skill.padEnd(9)} ${x.activity_type.padEnd(15)} ${x.topic_id}`);
  }
  for (const d of s.new_diagnoses) {
    console.log(`  → ${d.kind}(${d.weak_skill ?? d.weak_activity}) güven ${d.confidence}: ${diagnosisMessage(d, titles.get(d.topic_id) ?? d.topic_id)}`);
  }
}

const ok = result.speaking_gap_session !== null && result.speaking_gap_session <= 5;
console.log(
  `\nskill_gap(speaking) ≥ 0,6 ilk oturum: ${result.speaking_gap_session ?? "yok"} → ${ok ? "GEÇTİ (≤ 5)" : "KALDI"}`,
);
process.exit(ok ? 0 : 1);
