import { connection } from "next/server";
import { ApiError } from "@/lib/api/errors";
import { readJson, withApi } from "@/lib/api/respond";
import { getEditableSettings, patchSetting } from "@/lib/admin/service";
import { SettingPatch } from "@/lib/admin/settings";
import { requireRole } from "@/lib/auth/require";
import { createAdminClient } from "@/lib/db/admin";

// GET /api/admin/settings → değiştirilebilir ayarlar · yalnızca admin.
export async function GET() {
  // Cache Components açık: derlemede ön-render edilmesin, her istekte çalışsın.
  await connection();
  return withApi("admin/settings", async () => {
    await requireRole("admin");
    return Response.json(await getEditableSettings(createAdminClient()));
  });
}

// PATCH /api/admin/settings · { key, value } → { ok }
export async function PATCH(request: Request) {
  return withApi("admin/settings", async () => {
    await requireRole("admin");
    const parsed = SettingPatch.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError("invalid_input");
    const ok = await patchSetting(createAdminClient(), parsed.data.key, parsed.data.value, new Date());
    if (!ok) throw new ApiError("invalid_input");
    return Response.json({ ok: true });
  });
}
