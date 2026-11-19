import { cn } from "cn";
import { SKILL_LABELS_TR, SKILLS } from "@/lib/content/activity-types";
import type { GridRow, MasteryLevel } from "@/lib/progress/progress";

// Konu × beceri ızgarası (PRD F9). Dört seviye renkle ve simgeyle ayrılır (renk körlüğü, gri tonlama).
// Doğrudan cevabı olmayan ama diğer kanıtlardan tahmin edilen hücre kesik çerçeveli ve soluk.
export const LEVEL_STYLE: Record<MasteryLevel, { label: string; icon: string; cell: string }> = {
  unknown: { label: "Henüz bilinmiyor", icon: "·", cell: "border border-dashed border-border bg-background text-muted-foreground" },
  // Figma ustalık ölçeği (--mastery-1…3): kırmızı değil, açıktan koyuya turkuaz. Simgeler aynı kalır.
  weak: { label: "Zayıf", icon: "✕", cell: "bg-mastery-1 text-accent-foreground border border-mastery-2" },
  developing: { label: "Gelişiyor", icon: "◐", cell: "bg-mastery-2 text-ink border border-mastery-3" },
  solid: { label: "Sağlam", icon: "✓", cell: "bg-mastery-3 text-primary-foreground border border-mastery-3" },
};

const PREDICTED = "opacity-60 border-dashed";

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
      <li className="col-span-2 flex items-center gap-2">
        <span aria-hidden className={cn("flex size-7 items-center justify-center rounded-md text-sm font-bold", LEVEL_STYLE.solid.cell, PREDICTED)}>
          {LEVEL_STYLE.solid.icon}
        </span>
        Soluk: henüz sormadık, diğer cevaplarından tahmin
      </li>
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
              const c = r.cells[s];
              if (!c) return <td key={s} aria-label="Ölçülmez" />;
              const st = LEVEL_STYLE[c.level];
              return (
                <td key={s} className="p-0">
                  <span
                    role="img"
                    aria-label={`${r.titleTr}, ${SKILL_LABELS_TR[s]}: ${st.label}${c.predicted ? " (tahmin)" : ""}`}
                    className={cn("flex h-9 w-full items-center justify-center rounded-md text-sm font-bold", st.cell, c.predicted && PREDICTED)}
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
