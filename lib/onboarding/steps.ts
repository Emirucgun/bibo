// Başlangıç adımları (SPEC Bölüm 3 `profiles.onboarding_step`, Bölüm 7 "Başlangıç kapısı").
// Saf: veritabanı ya da ağ yok. Veritabanındaki `check` kısıtıyla aynı küme
// (tests/onboarding/steps.test.ts göç dosyasıyla karşılaştırır).

export const ONBOARDING_STEPS = ["invite", "consent", "profile", "placement", "done"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

const STEP_PATHS: Record<OnboardingStep, string> = {
  invite: "/davet",
  consent: "/baslangic/onam",
  profile: "/baslangic/profil",
  placement: "/baslangic/yerlestirme",
  done: "/",
};

export function isOnboardingStep(value: unknown): value is OnboardingStep {
  return typeof value === "string" && (ONBOARDING_STEPS as readonly string[]).includes(value);
}

/** Bilinmeyen değer en baştaki adım sayılır: kullanıcı hiçbir kapıyı atlayamaz. */
export function toOnboardingStep(value: unknown): OnboardingStep {
  return isOnboardingStep(value) ? value : "invite";
}

/** Kullanıcının bulunduğu adımın sayfası. */
export function stepPath(step: OnboardingStep): string {
  return STEP_PATHS[step];
}

/** `step`, `required` adımına ulaşmış ya da onu geçmiş mi? */
export function hasReachedStep(step: OnboardingStep, required: OnboardingStep): boolean {
  return ONBOARDING_STEPS.indexOf(step) >= ONBOARDING_STEPS.indexOf(required);
}
