import { readJson, withApi } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/require";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { deleteAccount } from "@/lib/onboarding/service";
import { createOnboardingStore } from "@/lib/onboarding/store";

// DELETE /api/account · { confirm: "SİL" } → { ok }
// auth.admin.deleteUser → `on delete cascade` ile tüm öğrenci verisi silinir; oturum kapanır.
export async function DELETE(request: Request) {
  return withApi("account/delete", async () => {
    const { userId } = await requireUser();
    const body = await readJson(request);
    const result = await deleteAccount(createOnboardingStore(createAdminClient()), { userId }, body);

    // Kullanıcı artık yok; yalnızca bu tarayıcıdaki oturum çerezleri temizlenir.
    try {
      const supabase = await createClient();
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // Çerez temizlenemese de hesap silindi; token bir sonraki istekte geçersiz.
    }
    return Response.json(result);
  });
}
