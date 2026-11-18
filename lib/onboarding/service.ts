// Davet, onam ve hesap silme kararları (SPEC Bölüm 6, 7). Veritabanı `OnboardingStore`
// arayüzüyle enjekte edilir; Route Handler'lar yalnızca kimlik doğrular ve bu fonksiyonları çağırır.
// Zaman parametre olarak gelir.
import { ApiError } from "@/lib/api/errors";
import { isValidInviteCode } from "@/lib/auth/paths";
import {
  AccountDeleteInput,
  ConsentInput,
  InviteInput,
  ProfileInput,
} from "@/lib/onboarding/schemas";
import type { OnboardingStep } from "@/lib/onboarding/steps";

export type ClaimStatus = "ok" | "already_joined" | "invalid_code" | "full" | "no_profile";

export interface ClaimResult {
  status: ClaimStatus;
  cohortName: string | null;
}

export interface OnboardingStore {
  /** `public.claim_invite`: kapasite kontrolüyle, yarışsız. */
  claimInvite(userId: string, code: string): Promise<ClaimResult>;
  /** Yalnızca `onboarding_step = 'consent'` iken yazar; yazdıysa `true`. */
  recordConsent(userId: string, consentVersion: string, now: Date): Promise<boolean>;
  /** Yalnızca `onboarding_step = 'profile'` iken yazar ve adımı `placement` yapar; yazdıysa `true`. */
  saveProfile(
    userId: string,
    profile: {
      level_self: string;
      level_est: "A1" | "A2";
      interests: string[];
      study_mode?: "school" | "self";
      goal?: "communication" | "exam" | "work_travel";
      program_id?: string | null;
    },
    now: Date,
  ): Promise<boolean>;
  /** Etkin okul programı var mı (`programs.active`). */
  programExists(programId: string): Promise<boolean>;
  /** `auth.admin.deleteUser`: `on delete cascade` ile tüm öğrenci verisi gider. */
  deleteUser(userId: string): Promise<void>;
}

export interface Actor {
  userId: string;
  onboardingStep: OnboardingStep;
}

function parse<T>(schema: { safeParse(input: unknown): { success: true; data: T } | { success: false } }, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new ApiError("invalid_input");
  return result.data;
}

/** POST /api/onboarding/invite → `{ ok, cohortName }`; geçersiz kod 404, kapasite dolu 409. */
export async function submitInvite(
  store: OnboardingStore,
  actor: Actor,
  body: unknown,
): Promise<{ ok: true; cohortName: string | null }> {
  const { code } = parse(InviteInput, body);
  // Biçimi bozuk kod veritabanına sorulmadan reddedilir.
  if (!isValidInviteCode(code)) throw new ApiError("invalid_code");

  const result = await store.claimInvite(actor.userId, code);
  switch (result.status) {
    case "ok":
    case "already_joined":
      return { ok: true, cohortName: result.cohortName };
    case "invalid_code":
      throw new ApiError("invalid_code");
    case "full":
      throw new ApiError("cohort_full");
    case "no_profile":
      throw new ApiError("unauthenticated");
  }
}

/** POST /api/onboarding/consent → `{ ok }`; davetsiz kullanıcı 403, eski sürüm 409. */
export async function submitConsent(
  store: OnboardingStore,
  actor: Actor,
  body: unknown,
  options: { expectedVersion: string | undefined; now: Date },
): Promise<{ ok: true }> {
  const { consentVersion } = parse(ConsentInput, body);
  if (!options.expectedVersion) throw new ApiError("server_error");
  if (actor.onboardingStep === "invite") throw new ApiError("invite_required");
  if (consentVersion !== options.expectedVersion) throw new ApiError("consent_version_mismatch");
  // Rızası zaten kayıtlı: ilk kayıt (sürüm ve zaman) korunur.
  if (actor.onboardingStep !== "consent") return { ok: true };

  // `false` dönerse adım bu arada değişmiştir (ör. çift tıklama): rıza zaten kayıtlı.
  await store.recordConsent(actor.userId, consentVersion, options.now);
  return { ok: true };
}

/**
 * POST /api/onboarding/profile → `{ ok }` (PRD F2). En az 2 ilgi alanı. Başlangıç tahmini seviye
 * beyandan (A2 → A2, diğerleri A1); yerleştirme sonunda yeniden hesaplanır.
 */
export async function submitProfile(
  store: OnboardingStore,
  actor: Actor,
  body: unknown,
  now: Date,
): Promise<{ ok: true }> {
  const input = parse(ProfileInput, body);
  if (actor.onboardingStep === "invite") throw new ApiError("invite_required");
  if (actor.onboardingStep === "consent") throw new ApiError("onboarding_incomplete");
  // Profil zaten kayıtlı (ör. çift dokunuş): ilk kayıt korunur.
  if (actor.onboardingStep !== "profile") return { ok: true };
  const programId = input.studyMode === "self" ? null : (input.programId ?? null);
  if (programId && !(await store.programExists(programId))) throw new ApiError("invalid_input");
  await store.saveProfile(
    actor.userId,
    {
      level_self: input.levelSelf,
      level_est: input.levelSelf === "A2" ? "A2" : "A1",
      interests: [...new Set(input.interests)],
      ...(input.studyMode ? { study_mode: input.studyMode } : {}),
      ...(input.goal ? { goal: input.goal } : {}),
      ...(programId ? { program_id: programId } : {}),
    },
    now,
  );
  return { ok: true };
}

/** DELETE /api/account → `{ ok }`; `{ confirm: "SİL" }` olmadan silmez. */
export async function deleteAccount(
  store: OnboardingStore,
  actor: Pick<Actor, "userId">,
  body: unknown,
): Promise<{ ok: true }> {
  parse(AccountDeleteInput, body);
  await store.deleteUser(actor.userId);
  return { ok: true };
}
