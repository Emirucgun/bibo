import { readJson, withApi } from "@/lib/api/respond";
import { requireOnboarded } from "@/lib/auth/require";
import { createSessionDeps } from "@/lib/session/deps";
import { submitDiagnosisFeedback } from "@/lib/session/service";

// POST /api/diagnoses/:id/feedback · { feedback: 'agree' | 'disagree' } → { ok }
export async function POST(request: Request, { params }: RouteContext<"/api/diagnoses/[id]/feedback">) {
  return withApi("diagnoses/feedback", async () => {
    const { userId } = await requireOnboarded();
    const { id } = await params;
    const body = await readJson(request);
    return Response.json(await submitDiagnosisFeedback(createSessionDeps(), { userId }, id, body));
  });
}
