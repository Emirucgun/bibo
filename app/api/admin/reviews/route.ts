import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { readJson, withApi } from "@/lib/api/respond";
import { insertReview } from "@/lib/admin/service";
import { requireRole } from "@/lib/auth/require";
import { L1_CODES } from "@/lib/content/taxonomy";
import { createAdminClient } from "@/lib/db/admin";

const Input = z
  .object({
    errorEventId: z.uuid(),
    verdict: z.enum(["agree", "fix", "not_error"]),
    correctedL1Code: z.string().max(40).nullish(),
    note: z.string().trim().max(500).nullish(),
  })
  .refine((v) => v.verdict !== "fix" || L1_CODES.some((c) => c.code === v.correctedL1Code));

// POST /api/admin/reviews · { errorEventId, verdict, correctedL1Code?, note? } → { ok }
export async function POST(request: Request) {
  return withApi("admin/reviews", async () => {
    const { userId } = await requireRole("teacher", "admin");
    const parsed = Input.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError("invalid_input");
    const res = await insertReview(createAdminClient(), userId, parsed.data);
    if (res === "not_found") throw new ApiError("not_found");
    return Response.json({ ok: true, duplicate: res === "duplicate" });
  });
}
