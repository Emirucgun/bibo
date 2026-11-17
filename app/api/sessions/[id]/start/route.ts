import { withApi } from "@/lib/api/respond";
import { requireLearner } from "@/lib/auth/require";
import { createSessionDeps } from "@/lib/session/deps";
import { startSession } from "@/lib/session/service";

// POST /api/sessions/:id/start → { ok } · günlük sınır aşılmışsa 429 daily_limit + limit_hit olayı.
export async function POST(_request: Request, { params }: RouteContext<"/api/sessions/[id]/start">) {
  return withApi("sessions/start", async () => {
    const { userId } = await requireLearner();
    const { id } = await params;
    return Response.json(await startSession(createSessionDeps(), { userId }, id));
  });
}
