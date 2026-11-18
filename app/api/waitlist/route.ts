import { readJson, withApi } from "@/lib/api/respond";
import { requireOnboarded } from "@/lib/auth/require";
import { createSessionDeps } from "@/lib/session/deps";
import { joinWaitlist } from "@/lib/session/service";

// POST /api/waitlist · { optIn: true } → { ok } · kapsam dışı öğrenci "hazır olunca haber ver".
export async function POST(request: Request) {
  return withApi("waitlist", async () => {
    const { userId } = await requireOnboarded();
    return Response.json(await joinWaitlist(createSessionDeps(), { userId }, await readJson(request)));
  });
}
