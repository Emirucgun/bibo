import { withApi } from "@/lib/api/respond";
import { requireLearner } from "@/lib/auth/require";
import { createSessionDeps } from "@/lib/session/deps";
import { skipPlacementItem } from "@/lib/session/service";

// POST /api/items/:id/skip → { placement } · yalnızca yerleştirmede, sesi çalınamayan dinleme maddesi.
export async function POST(_request: Request, { params }: RouteContext<"/api/items/[id]/skip">) {
  return withApi("items/skip", async () => {
    const { userId } = await requireLearner();
    const { id } = await params;
    return Response.json(await skipPlacementItem(createSessionDeps(), { userId }, id));
  });
}
