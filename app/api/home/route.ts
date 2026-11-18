import { withApi } from "@/lib/api/respond";
import { requireInScope } from "@/lib/auth/require";
import { createSessionDeps } from "@/lib/session/deps";
import { getHomeOptions } from "@/lib/session/service";

// GET /api/home → { focusChoices, focusChoice, school } · "Bugün ne çalışalım?" ve haftalık okul sorusu.
export async function GET() {
  return withApi("home", async () => {
    const { userId } = await requireInScope();
    return Response.json(await getHomeOptions(createSessionDeps(), { userId }));
  });
}
