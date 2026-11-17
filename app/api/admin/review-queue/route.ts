import { connection } from "next/server";
import { withApi } from "@/lib/api/respond";
import { reviewQueue } from "@/lib/admin/service";
import { requireRole } from "@/lib/auth/require";
import { createAdminClient } from "@/lib/db/admin";

// GET /api/admin/review-queue?limit=20 → incelenmemiş `review_sampled` hatalar + bağlam.
export async function GET(request: Request) {
  // Cache Components açık: derlemede ön-render edilmesin, her istekte çalışsın.
  await connection();
  return withApi("admin/review-queue", async () => {
    await requireRole("teacher", "admin");
    const raw = Number(new URL(request.url).searchParams.get("limit") ?? 20);
    const limit = Number.isFinite(raw) ? Math.min(100, Math.max(1, Math.round(raw))) : 20;
    return Response.json({ items: await reviewQueue(createAdminClient(), limit) });
  });
}
