import { cn } from "cn";
import { SKILL_LABELS_TR, SKILLS } from "@/lib/content/activity-types";
import type { GridRow, MasteryLevel } from "@/lib/progress/progress";

// Konu × beceri ızgarası (PRD F9). Dört seviye renkle ve simgeyle ayrılır (renk körlüğü, gri tonlama).
export const LEVEL_STYLE: Record<MasteryLevel, { label: string; icon: string; cell: string }> = {
  unknown: { label: "Henüz bilinmiyor", icon: "·", cell: "border border-dashed border-border bg-background text-muted-foreground" },
  weak: { label: "Zayıf", icon: "✕", cell: "bg-red-100 text-red-900 border border-red-300" },
  developing: { label: "Gelişiyor", icon: "◐", cell: "bg-amber-100 text-amber-900 border border-amber-300" },
  solid: { label: "Sağlam", icon: "✓", cell: "bg-emerald-700 text-white border border-emerald-800" },
};

export function LevelLegend() {
  return (
    <ul className="grid grid-cols-2 gap-2 text-sm" aria-label="Renklerin anlamı">
      {(Object.keys(LEVEL_STYLE) as MasteryLevel[]).map((l) => (
        <li key={l} className="flex items-center gap-2">
          <span aria-hidden className={cn("flex size-7 items-center justify-center rounded-md text-sm font-bold", LEVEL_STYLE[l].cell)}>
            {LEVEL_STYLE[l].icon}
          </span>
          {LEVEL_STYLE[l].label}
        </li>
      ))}
    </ul>
  );
}

const SHORT: Record<string, string> = { reading: "Oku", listening: "Dinle", writing: "Yaz", speaking: "Konuş" };

export function ProgressGrid({ rows }: { rows: GridRow[] }) {
  return (
    <table className="w-full table-fixed border-separate border-spacing-1 text-sm">
      <thead>
        <tr>
          <th scope="col" className="text-left font-medium text-muted-foreground">
            Konu
          </th>
          {SKILLS.map((s) => (
            <th key={s} scope="col" className="w-12 text-center text-xs font-medium text-muted-foreground" title={SKILL_LABELS_TR[s]}>
              {SHORT[s]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.topicId}>
            <th scope="row" className="truncate pr-1 text-left font-normal" title={r.titleTr}>
              {r.titleTr}
            </th>
            {SKILLS.map((s) => {
              const level = r.cells[s];
              if (!level) return <td key={s} aria-label="Ölçülmez" />;
              const st = LEVEL_STYLE[level];
              return (
                <td key={s} className="p-0">
                  <span
                    role="img"
                    aria-label={`${r.titleTr}, ${SKILL_LABELS_TR[s]}: ${st.label}`}
                    className={cn("flex h-9 w-full items-center justify-center rounded-md text-sm font-bold", st.cell)}
                  >
                    {st.icon}
                  </span>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
