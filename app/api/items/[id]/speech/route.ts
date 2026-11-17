import { ApiError } from "@/lib/api/errors";
import { withApi } from "@/lib/api/respond";
import { requireLearner } from "@/lib/auth/require";
import { MAX_AUDIO_BYTES } from "@/lib/audio/wav";
import { createSessionDeps } from "@/lib/session/deps";
import { submitSpeech } from "@/lib/session/service";

// Transkript (15 sn) + değerlendirme (20 sn), her biri bir yeniden denemeyle.
export const maxDuration = 60;

/** Çok parçalı gövdenin üst sınırı: WAV (≤ 2 MB) + alanlar için pay. */
const MAX_BODY_BYTES = MAX_AUDIO_BYTES + 64 * 1024;

// POST /api/items/:id/speech · multipart: audio (WAV ≤ 2 MB, ≤ 45 sn), timeMs, tryNo
// → { attemptId, transcript, isCorrect, score, feedbackShortTr, correction, errorNameTr, tryNo, canRerecord }
// Ses yalnızca bellekte işlenir; diske, Storage'a ya da günlüğe yazılmaz (SPEC 10, 11).
export async function POST(request: Request, { params }: RouteContext<"/api/items/[id]/speech">) {
  return withApi("items/speech", async () => {
    const { userId } = await requireLearner();
    const { id } = await params;
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > MAX_BODY_BYTES) throw new ApiError("invalid_input");

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ApiError("invalid_input");
    }
    const file = form.get("audio");
    const audio =
      file instanceof Blob && file.size <= MAX_AUDIO_BYTES ? new Uint8Array(await file.arrayBuffer()) : null;
    return Response.json(
      await submitSpeech(createSessionDeps(), { userId }, id, {
        audio,
        timeMs: form.get("timeMs"),
        tryNo: form.get("tryNo"),
      }),
    );
  });
}
