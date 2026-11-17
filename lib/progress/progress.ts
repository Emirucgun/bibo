// İlerleme ekranı (PRD F9, SPEC 4.1 "Dört renk seviyesi", 6 `GET /api/progress`). Saf: satırlar ve
// zaman parametre olarak gelir.
import { SKILLS, type Skill } from "@/lib/content/activity-types";
import { L1_CODES, TOPICS } from "@/lib/content/taxonomy";

export type MasteryLevel = "unknown" | "weak" | "developing" | "solid";

/** SPEC 4.1: `n = 0` bilinmiyor · `m < 0.45` zayıf · `0.45–0.7` gelişiyor · `≥ 0.7` sağlam. */
export function masteryLevel(score: number | null, n: number): MasteryLevel {
  if (n <= 0 || score === null) return "unknown";
  if (score < 0.45) return "weak";
  if (score < 0.7) return "developing";
  return "solid";
}

export interface GridRow {
  topicId: string;
  titleTr: string;
  level: "A1" | "A2";
  kind: "grammar" | "pron";
  /** Sesletim konuları yalnızca dinlemede ölçülür; diğer hücreler `null`. */
  cells: Record<Skill, MasteryLevel | null>;
}

export interface Progress {
  grid: GridRow[];
  weekSessions: number;
  topErrors: { code: string; nameTr: string; count: number }[];
  diagnoses: { id: string; topicTitleTr: string; messageTr: string }[];
}

/** En sık hatalar sayılırken genel kodlar (öğrenciye bir şey söylemeyenler) dışarıda. */
const SKIP_CODES = new Set(["GEN.OTHER"]);
/** "En sık 3 hata" son 4 haftaya bakar. */
export const TOP_ERROR_DAYS = 28;

export function buildProgress(input: {
  levelEst: "A1" | "A2";
  mastery: { topic_id: string; skill: string; score: number; n: number }[];
  weekSessions: number;
  errorCodes: string[];
  diagnoses: { id: string; topic_id: string; message_tr: string }[];
}): Progress {
  const byKey = new Map(input.mastery.map((m) => [`${m.topic_id}|${m.skill}`, m]));
  const grid = TOPICS.filter((t) => t.active && (input.levelEst === "A2" || t.level === "A1")).map((t) => {
    const cells = {} as Record<Skill, MasteryLevel | null>;
    for (const s of SKILLS) {
      if (t.kind === "pron" && s !== "listening") {
        cells[s] = null;
        continue;
      }
      const m = byKey.get(`${t.id}|${s}`);
      cells[s] = masteryLevel(m ? m.score : null, m?.n ?? 0);
    }
    return { topicId: t.id, titleTr: t.title_tr, level: t.level, kind: t.kind, cells };
  });

  const counts = new Map<string, number>();
  for (const c of input.errorCodes) if (!SKIP_CODES.has(c)) counts.set(c, (counts.get(c) ?? 0) + 1);
  const names = new Map(L1_CODES.map((c) => [c.code, c.name_tr]));
  const topErrors = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([code, count]) => ({ code, nameTr: names.get(code) ?? code, count }));

  const titles = new Map(TOPICS.map((t) => [t.id, t.title_tr]));
  return {
    grid,
    weekSessions: input.weekSessions,
    topErrors,
    diagnoses: input.diagnoses.map((d) => ({
      id: d.id,
      topicTitleTr: titles.get(d.topic_id) ?? d.topic_id,
      messageTr: d.message_tr,
    })),
  };
}

/** Europe/Istanbul haftasının (pazartesi) başlangıcı, UTC an olarak ve `YYYY-MM-DD` tarihi. */
export function istanbulWeek(now: Date): { start: Date; date: string } {
  const offset = 3 * 3_600_000;
  const local = new Date(now.getTime() + offset);
  const dow = (local.getUTCDay() + 6) % 7;
  const day = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - dow * 86_400_000;
  return { start: new Date(day - offset), date: new Date(day).toISOString().slice(0, 10) };
}
