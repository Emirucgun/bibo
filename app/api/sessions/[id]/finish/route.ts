import { after } from "next/server";
import { withApi } from "@/lib/api/respond";
import { requireOnboarded } from "@/lib/auth/require";
import { createSessionDeps } from "@/lib/session/deps";
import { finishSession } from "@/lib/session/service";

// Sonraki oturum `after()` ile üretilir; bu iş aynı fonksiyon süresine dahildir (SPEC Bölüm 2).
export const maxDuration = 300;

// POST /api/sessions/:id/finish · { rating?, comment? } → { summary, diagnosis? }
export async function POST(request: Request, { params }: RouteContext<"/api/sessions/[id]/finish">) {
  return withApi("sessions/finish", async () => {
    const { userId } = await requireOnboarded();
    const { id } = await params;
    // Gövde isteğe bağlı: boş gövde `{}` sayılır.
    const text = await request.text();
    let body: unknown = {};
    if (text.trim() !== "") {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    const { background, ...result } = await finishSession(createSessionDeps(), { userId }, id, body);
    if (background) after(background);
    return Response.json(result);
  });
}
