import { BookOpen, Headphones, Mic, PenLine } from "lucide-react";
import { ACTIVITY_TYPE_LABELS_TR, SKILL_LABELS_TR, type ActivityType, type Skill } from "@/lib/content/activity-types";

const SKILL_ICON = { reading: BookOpen, listening: Headphones, writing: PenLine, speaking: Mic } as const;

// Üst çubuk: kaçıncı etkinlik, beceri simgesi ve etkinlik türü (PRD A2 adım 2).
export function ProgressBar({
  current,
  total,
  skill,
  activityType,
}: {
  current: number;
  total: number;
  skill: Skill;
  activityType: ActivityType;
}) {
  const Icon = SKILL_ICON[skill];
  const done = Math.min(current, total);
  return (
    <header className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <Icon aria-hidden className="size-4" />
          <span>
            {ACTIVITY_TYPE_LABELS_TR[activityType]} · {SKILL_LABELS_TR[skill]}
          </span>
        </span>
        <span>
          {done + 1} / {total}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Oturum ilerlemesi"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(done / total) * 100}%` }} />
      </div>
    </header>
  );
}
