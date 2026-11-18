import { readJson, withApi } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/require";
import { createSessionDeps } from "@/lib/session/deps";
import { patchProfile } from "@/lib/session/service";

// PATCH /api/profile · { displayName?, interests?: string[≥2], explainMode?, studyMode?, goal? } → { ok }
// Yalnızca bu alanlar (SPEC RLS tablosu).
export async function PATCH(request: Request) {
  return withApi("profile/patch", async () => {
    const { userId } = await requireUser();
    const body = await readJson(request);
    return Response.json(await patchProfile(createSessionDeps().store, { userId }, body, new Date()));
  });
}
