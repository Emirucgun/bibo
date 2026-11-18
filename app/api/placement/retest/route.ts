import { withApi } from "@/lib/api/respond";
import { requireOnboarded } from "@/lib/auth/require";
import { createSessionDeps } from "@/lib/session/deps";
import { retestPlacement } from "@/lib/session/service";

// POST /api/placement/retest → { ok } · kapsam dışı öğrenci süre dolunca testi bir kez daha çözer.
export async function POST() {
  return withApi("placement/retest", async () => {
    const { userId } = await requireOnboarded();
    return Response.json(await retestPlacement(createSessionDeps(), { userId }));
  });
}
