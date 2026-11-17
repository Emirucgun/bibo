import { connection } from "next/server";
import { withApi } from "@/lib/api/respond";
import { requireRole } from "@/lib/auth/require";
import { createAdminClient } from "@/lib/db/admin";
import { listVoices, pickDefaultVoice, supportsModelEnUs } from "@/lib/tts/voices";

// GET /api/admin/voices → Simba en-US sesleri (ses seçimi, P9) · yalnızca admin. Karakter harcamaz.
export async function GET() {
  // Cache Components açık: derlemede ön-render edilmesin, her istekte çalışsın.
  await connection();
  return withApi("admin/voices", async () => {
    await requireRole("admin");
    const key = process.env.SPEECHIFY_API_KEY;
    if (!key) return Response.json({ voices: [], suggested: null });
    const { data } = await createAdminClient().from("app_settings").select("value").eq("key", "tts_model").maybeSingle();
    const model = typeof data?.value === "string" ? data.value : "simba-3.5";
    const all = await listVoices(key);
    const voices = all
      .filter((v) => supportsModelEnUs(v, model))
      .map((v) => ({ id: v.id, name: v.display_name ?? v.id, gender: v.gender ?? null, tags: (v.tags ?? []).slice(0, 4) }));
    return Response.json({ voices, suggested: pickDefaultVoice(all, model)?.id ?? null });
  });
}
