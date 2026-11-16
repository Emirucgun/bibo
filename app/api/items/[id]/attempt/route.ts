import { readJson, withApi } from "@/lib/api/respond";
import { requireOnboarded } from "@/lib/auth/require";
import { createSessionDeps } from "@/lib/session/deps";
import { submitAttempt } from "@/lib/session/service";

// Yapay zekâ değerlendirmesi: 20 sn zaman aşımı + bir yeniden deneme.
export const maxDuration = 60;

// POST /api/items/:id/attempt · { response, timeMs, hintUsed }
// → { attemptId, isCorrect, score, feedbackShortTr, correction }
export async function POST(request: Request, { params }: RouteContext<"/api/items/[id]/attempt">) {
  return withApi("items/attempt", async () => {
    const { userId } = await requireOnboarded();
    const { id } = await params;
    const body = await readJson(request);
    return Response.json(await submitAttempt(createSessionDeps(), { userId }, id, body));
  });
}
