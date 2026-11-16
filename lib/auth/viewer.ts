import "server-only";
import { cache } from "react";
import { ROLES, type Role } from "@/lib/content/activity-types";
import { createClient } from "@/lib/db/server";
import { toOnboardingStep, type OnboardingStep } from "@/lib/onboarding/steps";

export type { Role };

export interface ViewerProfile {
  displayName: string | null;
  role: Role;
  cohortId: string | null;
  onboardingStep: OnboardingStep;
}

/** Giriş yapmış kullanıcı. Token var ama `profiles` satırı yoksa `profile` `null`. */
export interface Viewer {
  userId: string;
  profile: ViewerProfile | null;
}

function toRole(value: string): Role {
  return (ROLES as readonly string[]).includes(value) ? (value as Role) : "student";
}

/**
 * Oturum çerezindeki JWT'yi doğrular (`getClaims`) ve profili kullanıcının kendi istemcisiyle
 * (RLS) okur. Giriş yoksa `null`. Aynı istekte bir kez çalışır.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) return null;

  const { data: row, error: profileError } = await supabase
    .from("profiles")
    .select("display_name, role, cohort_id, onboarding_step")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw new Error(`profil okunamadı: ${profileError.code}`);

  return {
    userId,
    profile: row
      ? {
          displayName: row.display_name,
          role: toRole(row.role),
          cohortId: row.cohort_id,
          onboardingStep: toOnboardingStep(row.onboarding_step),
        }
      : null,
  };
});
