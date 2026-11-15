import { cookies } from "next/headers";
import { readJson, withApi } from "@/lib/api/respond";
import { INVITE_COOKIE } from "@/lib/auth/paths";
import { requireUser } from "@/lib/auth/require";
import { createAdminClient } from "@/lib/db/admin";
import { submitInvite } from "@/lib/onboarding/service";
import { createOnboardingStore } from "@/lib/onboarding/store";

// POST /api/onboarding/invite · { code } → { ok, cohortName } · geçersiz kod 404, kapasite dolu 409.
export async function POST(request: Request) {
  return withApi("onboarding/invite", async () => {
    const { userId, profile } = await requireUser();
    const body = await readJson(request);
    const result = await submitInvite(
      createOnboardingStore(createAdminClient()),
      { userId, onboardingStep: profile.onboardingStep },
      body,
    );
    (await cookies()).delete(INVITE_COOKIE);
    return Response.json(result);
  });
}
