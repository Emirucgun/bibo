import { connection } from "next/server";
import { withApi } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/require";
import { exportUserData } from "@/lib/account/export";
import { createAdminClient } from "@/lib/db/admin";

// GET /api/account/export → JSON dosyası (tüm kişisel kayıtlar, PRD F13). Servis istemcisi
// `requireUser()` sonrası ve yalnızca bu kullanıcının kimliğiyle süzülerek okur (`llm_usage` öğrenciye
// RLS ile kapalı olduğu için).
export async function GET() {
  // Cache Components açık: derlemede ön-render edilmesin, her istekte çalışsın.
  await connection();
  return withApi("account/export", async () => {
    const { userId } = await requireUser();
    const now = new Date();
    const data = await exportUserData(createAdminClient(), userId, now);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="kaynak-verilerim-${now.toISOString().slice(0, 10)}.json"`,
        "cache-control": "no-store",
      },
    });
  });
}
