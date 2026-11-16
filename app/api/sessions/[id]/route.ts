import { withApi } from "@/lib/api/respond";
import { requireOnboarded } from "@/lib/auth/require";
import { createReadStore } from "@/lib/session/deps";
import { getSessionView } from "@/lib/session/service";

// GET /api/sessions/:id → { session, items (anahtarsız), attempts } · kullanıcının istemcisiyle (RLS).
export async function GET(_request: Request, { params }: RouteContext<"/api/sessions/[id]">) {
  return withApi("sessions/get", async () => {
    const { userId } = await requireOnboarded();
    const { id } = await params;
    return Response.json(await getSessionView(await createReadStore(), { userId }, id));
  });
}
