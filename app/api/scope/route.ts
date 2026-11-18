import { withApi } from "@/lib/api/respond";
import { requireOnboarded } from "@/lib/auth/require";
import { createSessionDeps } from "@/lib/session/deps";
import { getScope } from "@/lib/session/service";

// GET /api/scope → { status, notified, canRetest, retestAt } (docs/SPEC.md 4.7 kapsam kapısı).
export async function GET() {
  return withApi("scope", async () => {
    const { userId } = await requireOnboarded();
    return Response.json(await getScope(createSessionDeps(), { userId }));
  });
}
