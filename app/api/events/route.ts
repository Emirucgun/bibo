import { readJson, withApi } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/require";
import { createSessionDeps } from "@/lib/session/deps";
import { recordEvent } from "@/lib/session/service";

// POST /api/events · { name, props? } → { ok } · ad listeden, props ≤ 1 KB, öğrenci metni yok.
export async function POST(request: Request) {
  return withApi("events", async () => {
    const { userId } = await requireUser();
    const body = await readJson(request);
    return Response.json(await recordEvent(createSessionDeps().store, { userId }, body));
  });
}
