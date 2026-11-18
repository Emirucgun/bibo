import { readJson, withApi } from "@/lib/api/respond";
import { requireInScope } from "@/lib/auth/require";
import { createSessionDeps } from "@/lib/session/deps";
import { setFocusChoice } from "@/lib/session/service";

// POST /api/focus-choice · { topicId | null } → { ok } · sonraki oturumun odağı öğrencinin seçimi.
export async function POST(request: Request) {
  return withApi("focus-choice", async () => {
    const { userId } = await requireInScope();
    return Response.json(await setFocusChoice(createSessionDeps(), { userId }, await readJson(request)));
  });
}
