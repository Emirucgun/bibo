import { connection } from "next/server";
import { withApi } from "@/lib/api/respond";
import { getOverview } from "@/lib/admin/service";
import { requireRole } from "@/lib/auth/require";
import { createAdminClient } from "@/lib/db/admin";

// GET /api/admin/overview → kayıtlı/aktif, haftada ≥ 4 oturum oranı, W4, ay içi maliyet, TTS karakteri…
export async function GET() {
  // Cache Components açık: derlemede ön-render edilmesin, her istekte çalışsın.
  await connection();
  return withApi("admin/overview", async () => {
    await requireRole("teacher", "admin");
    return Response.json(await getOverview(createAdminClient(), new Date()));
  });
}
