import { connection } from "next/server";
import { ApiError } from "@/lib/api/errors";
import { withApi } from "@/lib/api/respond";
import { cronAuthorized, runDailyCron } from "@/lib/cron/daily";
import { createAdminClient } from "@/lib/db/admin";

export const maxDuration = 60;

// GET /api/cron/daily · Vercel Cron (`Authorization: Bearer CRON_SECRET`) → { ok, ... sayılar }
export async function GET(request: Request) {
  // Cache Components açık: derlemede ön-render edilmesin, her istekte çalışsın.
  await connection();
  return withApi("cron/daily", async () => {
    if (!cronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
      throw new ApiError("unauthenticated");
    }
    const result = await runDailyCron(createAdminClient(), new Date(), { speechifyKey: process.env.SPEECHIFY_API_KEY });
    console.log("[cron/daily]", JSON.stringify(result));
    return Response.json({ ok: true, ...result });
  });
}
