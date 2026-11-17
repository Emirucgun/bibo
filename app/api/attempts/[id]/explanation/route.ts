import { withApi } from "@/lib/api/respond";
import { requireLearner } from "@/lib/auth/require";
import { createSessionDeps } from "@/lib/session/deps";
import { getExplanation, type ExplanationVia } from "@/lib/session/service";

// GET /api/attempts/:id/explanation → { explanationLongTr } · explain_opened = true.
// `?via=auto`: uzun modda kendiliğinden gösterildi (olay yazılmaz).
// `?via=dismiss`: kendiliğinden gösterilen açıklama "Kısa yeter" ile kapatıldı.
const toVia = (v: string | null): ExplanationVia => (v === "auto" || v === "dismiss" ? v : "click");

export async function GET(request: Request, { params }: RouteContext<"/api/attempts/[id]/explanation">) {
  return withApi("attempts/explanation", async () => {
    const { userId } = await requireLearner();
    const { id } = await params;
    const via = toVia(new URL(request.url).searchParams.get("via"));
    return Response.json(await getExplanation(createSessionDeps(), { userId }, id, via));
  });
}
