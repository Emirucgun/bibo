import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { isValidInviteCode } from "@/lib/auth/paths";
import { AUTO_JOIN_SETTING } from "./schemas";
import { createOnboardingStore } from "./store";

/**
 * Açık deneme (PLAN karar 34): `app_settings.auto_join_invite_code` doluysa davet adımındaki
 * kullanıcı o koda katılır; kapasite ve geçerlilik yine `claim_invite`'ta denetlenir. Ayar boşsa
 * ya da katılım olmazsa `false` (kullanıcı kod formunu görür). Davet kapısının kendisi kalkmaz.
 */
export async function tryAutoJoin(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("app_settings").select("value").eq("key", AUTO_JOIN_SETTING).maybeSingle();
  if (error) return false;
  const code = data?.value;
  if (typeof code !== "string" || !isValidInviteCode(code)) return false;
  try {
    const res = await createOnboardingStore(admin).claimInvite(userId, code);
    return res.status === "ok" || res.status === "already_joined";
  } catch {
    return false;
  }
}
