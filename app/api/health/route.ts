import { connection } from "next/server";
import { createAdminClient } from "@/lib/db/admin";

// Veritabanı bağlantısını doğrular. Ayrıntı yanıta yazılmaz, yalnızca sunucu günlüğüne.
export async function GET() {
  // Cache Components açık: derlemede ön-render edilmesin, her istekte çalışsın.
  await connection();

  try {
    const { error } = await createAdminClient()
      .from("app_settings")
      .select("key")
      .limit(1);
    if (error) throw error;
    return Response.json({ db: "ok" });
  } catch (err) {
    console.error("[health] db check failed:", err instanceof Error ? err.message : err);
    return Response.json({ db: "error" }, { status: 503 });
  }
}
