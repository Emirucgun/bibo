import { withApi } from "@/lib/api/respond";
import { requireOnboarded } from "@/lib/auth/require";
import { createSessionDeps } from "@/lib/session/deps";
import { getItemAudio } from "@/lib/session/service";

// Seslendirme: 15 sn zaman aşımı + bir yeniden deneme.
export const maxDuration = 60;

// GET /api/items/:id/audio → { url } (1 saatlik imzalı URL) · seslendirme yoksa 503 tts_unavailable.
// Seslendirilen metin yanıta yazılmaz (cevap anahtarı, SPEC Bölüm 3).
export async function GET(_request: Request, { params }: RouteContext<"/api/items/[id]/audio">) {
  return withApi("items/audio", async () => {
    const { userId } = await requireOnboarded();
    const { id } = await params;
    return Response.json(await getItemAudio(createSessionDeps(), { userId }, id), {
      headers: { "cache-control": "no-store" },
    });
  });
}
