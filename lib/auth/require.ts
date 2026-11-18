import "server-only";
import { ApiError } from "@/lib/api/errors";
import { getViewer, type Role, type ViewerProfile } from "@/lib/auth/viewer";

export interface AuthedUser {
  userId: string;
  profile: ViewerProfile;
}

/**
 * Route Handler'ların ilk satırı (SPEC Bölüm 7). Giriş yoksa ya da hesap silinmişse
 * (`profiles` satırı yok) 401. Servis istemcisiyle yazma bundan sonra yapılır.
 */
export async function requireUser(): Promise<AuthedUser> {
  const viewer = await getViewer();
  if (!viewer || !viewer.profile) throw new ApiError("unauthenticated");
  return { userId: viewer.userId, profile: viewer.profile };
}

/** `requireUser()` + rol kontrolü; rol tutmuyorsa 403. Rol ataması yalnızca SQL ile. */
export async function requireRole(...roles: Role[]): Promise<AuthedUser> {
  const user = await requireUser();
  if (!roles.includes(user.profile.role)) throw new ApiError("forbidden");
  return user;
}

/** `requireUser()` + başlangıç tamamlanmış mı; değilse 403 (oturum uç noktaları için, M6+). */
export async function requireOnboarded(): Promise<AuthedUser> {
  const user = await requireUser();
  if (user.profile.onboardingStep !== "done") throw new ApiError("onboarding_incomplete");
  return user;
}

/** `requireOnboarded()` + kapsam içi; A2 üstü ya da A2'yi bitirmiş öğrenciye günlük akış kapalı (403). */
export async function requireInScope(): Promise<AuthedUser> {
  const user = await requireOnboarded();
  if (user.profile.scopeStatus !== "in_scope") throw new ApiError("out_of_scope");
  return user;
}

/**
 * Oturum ve etkinlik uç noktaları: başlangıcı bitmiş ya da yerleştirme adımındaki kullanıcı
 * (yerleştirme testi aynı oturum akışını kullanır, PLAN karar 31). Günlük oturum üretimi
 * (`POST /api/sessions/next`) yine `requireOnboarded()` ister.
 */
export async function requireLearner(): Promise<AuthedUser> {
  const user = await requireUser();
  const step = user.profile.onboardingStep;
  if (step !== "done" && step !== "placement") throw new ApiError("onboarding_incomplete");
  return user;
}
