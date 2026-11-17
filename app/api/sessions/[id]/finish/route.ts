import { after } from "next/server";
import { readOptionalJson, withApi } from "@/lib/api/respond";
import { requireLearner } from "@/lib/auth/require";
import { createSessionDeps } from "@/lib/session/deps";
import { finishSession } from "@/lib/session/service";

// Sonraki oturum `after()` ile üretilir; bu iş aynı fonksiyon süresine dahildir (SPEC Bölüm 2).
export const maxDuration = 300;

// POST /api/sessions/:id/finish · { rating?, comment? } → { summary, diagnosis? }
export async function POST(request: Request, { params }: RouteContext<"/api/sessions/[id]/finish">) {
  return withApi("sessions/finish", async () => {
    const { userId } = await requireLearner();
    const { id } = await params;
    // Gövde isteğe bağlı: boş gövde `{}`, bozuk JSON 400.
    const body = await readOptionalJson(request);
    const { background, ...result } = await finishSession(createSessionDeps(), { userId }, id, body);
    if (background) after(background);
    return Response.json(result);
  });
}
