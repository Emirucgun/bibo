// `OnboardingStore`'un Supabase uygulaması. Servis istemcisi parametre olarak gelir
// (Route Handler'da `requireUser()` sonrası `createAdminClient()`).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClaimResult, ClaimStatus, OnboardingStore } from "@/lib/onboarding/service";

const CLAIM_STATUSES: readonly ClaimStatus[] = [
  "ok",
  "already_joined",
  "invalid_code",
  "full",
  "no_profile",
];

export function createOnboardingStore(admin: SupabaseClient): OnboardingStore {
  return {
    async claimInvite(userId, code): Promise<ClaimResult> {
      const { data, error } = await admin.rpc("claim_invite", { p_user_id: userId, p_code: code });
      if (error) throw new Error(`claim_invite: ${error.code}`);
      const row = (Array.isArray(data) ? data[0] : data) as
        | { status?: unknown; cohort_name?: unknown }
        | null
        | undefined;
      const status = CLAIM_STATUSES.find((s) => s === row?.status);
      if (!status) throw new Error("claim_invite: beklenmeyen yanıt");
      return {
        status,
        cohortName: typeof row?.cohort_name === "string" ? row.cohort_name : null,
      };
    },

    async recordConsent(userId, consentVersion, now) {
      const at = now.toISOString();
      const { data, error } = await admin
        .from("profiles")
        .update({
          adult_confirmed_at: at,
          consent_version: consentVersion,
          consent_at: at,
          onboarding_step: "profile",
          updated_at: at,
        })
        .eq("id", userId)
        .eq("onboarding_step", "consent")
        .select("id");
      if (error) throw new Error(`consent: ${error.code}`);
      return (data?.length ?? 0) > 0;
    },

    async saveProfile(userId, profile, now) {
      const { data, error } = await admin
        .from("profiles")
        .update({ ...profile, onboarding_step: "placement", updated_at: now.toISOString() })
        .eq("id", userId)
        .eq("onboarding_step", "profile")
        .select("id");
      if (error) throw new Error(`profile: ${error.code}`);
      return (data?.length ?? 0) > 0;
    },

    async deleteUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw new Error(`deleteUser: ${error.code ?? error.status ?? "unknown"}`);
    },
  };
}
