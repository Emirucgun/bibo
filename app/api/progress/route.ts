import { connection } from "next/server";
import { withApi } from "@/lib/api/respond";
import { requireOnboarded } from "@/lib/auth/require";
import { loadProgress } from "@/lib/progress/load";

// GET /api/progress → { grid, weekSessions, topErrors, diagnoses } · kullanıcının istemcisiyle (RLS).
export async function GET() {
  // Cache Components açık: derlemede ön-render edilmesin, her istekte çalışsın.
  await connection();
  return withApi("progress", async () => {
    const { userId } = await requireOnboarded();
    return Response.json(await loadProgress(userId, new Date()));
  });
}
