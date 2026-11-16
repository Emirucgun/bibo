import { withApi } from "@/lib/api/respond";
import { requireOnboarded } from "@/lib/auth/require";
import { createSessionDeps } from "@/lib/session/deps";
import { getHint } from "@/lib/session/service";

// GET /api/items/:id/hint → { hintTr } · hint_open olayı (ipuçlu cevap en çok 0,5 sayılır).
export async function GET(_request: Request, { params }: RouteContext<"/api/items/[id]/hint">) {
  return withApi("items/hint", async () => {
    const { userId } = await requireOnboarded();
    const { id } = await params;
    return Response.json(await getHint(createSessionDeps(), { userId }, id));
  });
}
