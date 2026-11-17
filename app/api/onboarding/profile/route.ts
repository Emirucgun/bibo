import { readJson, withApi } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/require";
import { createAdminClient } from "@/lib/db/admin";
import { submitProfile } from "@/lib/onboarding/service";
import { createOnboardingStore } from "@/lib/onboarding/store";

// POST /api/onboarding/profile · { levelSelf, interests: string[≥2] } → { ok }
export async function POST(request: Request) {
  return withApi("onboarding/profile", async () => {
    const { userId, profile } = await requireUser();
    const body = await readJson(request);
    const result = await submitProfile(
      createOnboardingStore(createAdminClient()),
      { userId, onboardingStep: profile.onboardingStep },
      body,
      new Date(),
    );
    return Response.json(result);
  });
}
