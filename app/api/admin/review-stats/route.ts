import { connection } from "next/server";
import { withApi } from "@/lib/api/respond";
import { reviewStats } from "@/lib/admin/service";
import { requireRole } from "@/lib/auth/require";
import { createAdminClient } from "@/lib/db/admin";

// GET /api/admin/review-stats → haftalık uyum yüzdesi, koda göre kırılım, örneklem oranı.
export async function GET() {
  // Cache Components açık: derlemede ön-render edilmesin, her istekte çalışsın.
  await connection();
  return withApi("admin/review-stats", async () => {
    await requireRole("teacher", "admin");
    return Response.json(await reviewStats(createAdminClient(), new Date()));
  });
}
