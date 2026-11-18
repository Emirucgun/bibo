// İlerleme ekranı (PRD F9, SPEC 4.1 "Izgara etiketleri", 6 `GET /api/progress`). Saf: öğrenme
// profili, satırlar ve zaman parametre olarak gelir.
import { SKILLS, type Skill } from "@/lib/content/activity-types";
import { L1_CODES, TOPICS } from "@/lib/content/taxonomy";
import { cell, cellLabel, type CellLabel, type LearnerState, type ModelContext } from "@/lib/engine/learner-model";

export type MasteryLevel = "unknown" | "weak" | "developing" | "solid";

/** Modelin etiketi → ızgara seviyesi ("kanıt yoksa hüküm yok": belirsiz hücre `unknown`). */
export function masteryLevel(label: CellLabel): MasteryLevel {
  return label === "needs_work" ? "weak" : label;
}

export interface GridCell {
  level: MasteryLevel;
  /** Bu hücrede doğrudan cevap yok; seviye diğer kanıtlardan tahmin edildi. */
  predicted: boolean;
}

export interface GridRow {
  topicId: string;
  titleTr: string;
  level: "A1" | "A2";
  kind: "grammar" | "pron";
  /** Sesletim konuları yalnızca dinlemede ölçülür; diğer hücreler `null`. */
  cells: Record<Skill, GridCell | null>;
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
  /** Öğrenme profili; henüz yoksa tüm hücreler "bilinmiyor". */
  model: { ctx: ModelContext; state: LearnerState } | null;
  weekSessions: number;
  errorCodes: string[];
  diagnoses: { id: string; topic_id: string; message_tr: string }[];
}): Progress {
  const grid: GridRow[] = [];
  for (const t of TOPICS) {
    if (!t.active || t.kind === "measure" || t.level === "B1" || t.level === "B2") continue;
    if (input.levelEst === "A1" && t.level !== "A1") continue;
    const cells = {} as Record<Skill, GridCell | null>;
    for (const s of SKILLS) {
      if (t.kind === "pron" && s !== "listening") {
        cells[s] = null;
        continue;
      }
      const view = input.model ? cell(input.model.ctx, input.model.state, t.id, s) : null;
      if (!view || !input.model) {
        cells[s] = { level: "unknown", predicted: false };
        continue;
      }
      const level = masteryLevel(cellLabel(input.model.ctx, input.model.state, view));
      cells[s] = { level, predicted: view.n === 0 && level !== "unknown" };
    }
    grid.push({ topicId: t.id, titleTr: t.title_tr, level: t.level, kind: t.kind, cells });
  }

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
