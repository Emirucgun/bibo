import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { readJson, withApi } from "@/lib/api/respond";
import { requireInScope } from "@/lib/auth/require";
import { TOPICS } from "@/lib/content/taxonomy";
import { createAdminClient } from "@/lib/db/admin";
import { istanbulWeek } from "@/lib/progress/progress";

const Input = z.object({ topicId: z.string().max(64).nullable() });

// POST /api/school-topic · { topicId | null } → { ok } (PRD F10). `null` = hatırlamıyor / atla.
export async function POST(request: Request) {
  return withApi("school-topic", async () => {
    const { userId } = await requireInScope();
    const parsed = Input.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError("invalid_input");
    const { topicId } = parsed.data;
    if (topicId !== null && !TOPICS.some((t) => t.id === topicId && t.active && t.kind === "grammar")) {
      throw new ApiError("invalid_input");
    }
    const admin = createAdminClient();
    const { error } = await admin
      .from("school_topics")
      .upsert({ user_id: userId, week_start: istanbulWeek(new Date()).date, topic_id: topicId });
    if (error) throw new Error(`school_topics: ${error.code}`);
    if (topicId !== null) {
      // Konu seçilmeden önce hazırlanmış (henüz başlamamış) oturum bırakılır; sonraki oturum konuyu
      // içerecek şekilde yeniden planlanır (PRD F10, PLAN karar 35).
      await admin.from("sessions").update({ status: "abandoned" }).eq("user_id", userId).eq("kind", "daily").eq("status", "ready");
    }
    return Response.json({ ok: true });
  });
}
