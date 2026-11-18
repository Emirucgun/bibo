import { after } from "next/server";
import { withApi } from "@/lib/api/respond";
import { requireInScope } from "@/lib/auth/require";
import { createSessionDeps } from "@/lib/session/deps";
import { nextSession } from "@/lib/session/service";

// Hazır oturum yoksa üretim yanıt döndükten sonra `after()` ile yapılır; süre bu fonksiyona dahil.
export const maxDuration = 300;

// POST /api/sessions/next → { sessionId, status } · günlük sınır 429, acil durdurma/tavan 503.
export async function POST() {
  return withApi("sessions/next", async () => {
    const { userId } = await requireInScope();
    const { background, ...result } = await nextSession(createSessionDeps(), { userId });
    if (background) after(background);
    return Response.json(result);
  });
}
