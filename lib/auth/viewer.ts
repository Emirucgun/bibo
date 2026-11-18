import "server-only";
import { cache } from "react";
import { ROLES, type Role } from "@/lib/content/activity-types";
import { createClient } from "@/lib/db/server";
import { toOnboardingStep, type OnboardingStep } from "@/lib/onboarding/steps";

export type { Role };

export type ScopeStatus = "in_scope" | "above_scope" | "graduated";

export interface ViewerProfile {
  displayName: string | null;
  role: Role;
  cohortId: string | null;
  onboardingStep: OnboardingStep;
  /** A2 üstü (`above_scope`) ya da A2'yi bitirmiş (`graduated`) öğrenciye günlük oturum yok. */
  scopeStatus: ScopeStatus;
}

const toScope = (v: unknown): ScopeStatus => (v === "above_scope" || v === "graduated" ? v : "in_scope");

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
    .select("display_name, role, cohort_id, onboarding_step, scope_status")
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
          scopeStatus: toScope(row.scope_status),
        }
      : null,
  };
});
