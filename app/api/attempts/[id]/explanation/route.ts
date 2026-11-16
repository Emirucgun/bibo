import { withApi } from "@/lib/api/respond";
import { requireOnboarded } from "@/lib/auth/require";
import { createSessionDeps } from "@/lib/session/deps";
import { getExplanation } from "@/lib/session/service";

// GET /api/attempts/:id/explanation → { explanationLongTr } · explain_opened = true.
// `?opened=0`: uzun modda kendiliğinden gösterilen açıklama "Kısa yeter" ile kapatıldı.
export async function GET(request: Request, { params }: RouteContext<"/api/attempts/[id]/explanation">) {
  return withApi("attempts/explanation", async () => {
    const { userId } = await requireOnboarded();
    const { id } = await params;
    const opened = new URL(request.url).searchParams.get("opened") !== "0";
    return Response.json(await getExplanation(createSessionDeps(), { userId }, id, opened));
  });
}
