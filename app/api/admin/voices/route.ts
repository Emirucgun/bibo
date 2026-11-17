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
    const db = createAdminClient();
    const { data } = await db.from("app_settings").select("key, value").in("key", ["tts_model", "tts_voice"]);
    const map = new Map((data ?? []).map((r) => [r.key as string, r.value]));
    const model = typeof map.get("tts_model") === "string" ? (map.get("tts_model") as string) : "simba-3.5";
    const all = await listVoices(key);
    // Ses hiç seçilmemişse önerilen ses atanır (PLAN karar 37; cron da aynısını yapar). Panelden değişir.
    const suggestedVoice = pickDefaultVoice(all, model);
    let assigned: string | null = null;
    if (!map.get("tts_voice") && suggestedVoice) {
      await db.from("app_settings").update({ value: suggestedVoice.id, updated_at: new Date().toISOString() }).eq("key", "tts_voice");
      assigned = suggestedVoice.id;
    }
    const voices = all
      .filter((v) => supportsModelEnUs(v, model))
      .map((v) => ({ id: v.id, name: v.display_name ?? v.id, gender: v.gender ?? null, tags: (v.tags ?? []).slice(0, 4) }));
    return Response.json({ voices, suggested: suggestedVoice?.id ?? null, assigned });
  });
}
