import { withApi } from "@/lib/api/respond";
import { requireLearner } from "@/lib/auth/require";
import { createSessionDeps } from "@/lib/session/deps";
import { startPlacement } from "@/lib/session/service";

// POST /api/placement → { sessionId } · sabit bankadan yerleştirme oturumu (dil modeli yok).
export async function POST() {
  return withApi("placement", async () => {
    const { userId } = await requireLearner();
    return Response.json(await startPlacement(createSessionDeps(), { userId }));
  });
}
