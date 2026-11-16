import { readJson, withApi } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/require";
import { createAdminClient } from "@/lib/db/admin";
import { submitConsent } from "@/lib/onboarding/service";
import { createOnboardingStore } from "@/lib/onboarding/store";

// POST /api/onboarding/consent · { adult: true, consentVersion } → { ok }
// Davetsiz kullanıcı 403; sayfadaki sürüm CONSENT_VERSION ile aynı değilse 409.
export async function POST(request: Request) {
  return withApi("onboarding/consent", async () => {
    const { userId, profile } = await requireUser();
    const body = await readJson(request);
    const result = await submitConsent(
      createOnboardingStore(createAdminClient()),
      { userId, onboardingStep: profile.onboardingStep },
      body,
      { expectedVersion: process.env.CONSENT_VERSION, now: new Date() },
    );
    return Response.json(result);
  });
}
