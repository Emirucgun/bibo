import "server-only";
// Gece kalibrasyonu (docs/arastirma/olcme-ve-ogrenen-modeli.md "Ölçme ve kalibrasyon"): yerleştirme
// maddelerinin zorluğu, öğrencilerin yerleştirme θ tahminlerinden güncellenir. Yalnızca sayı döner.
import type { SupabaseClient } from "@supabase/supabase-js";
import { calibrateItems, type ItemResponse } from "@/lib/engine/calibration";
import { bankPriors } from "@/lib/session/placement";

const PAGE = 1000;

export async function runCalibration(db: SupabaseClient, now: Date): Promise<{ calibrated_items: number; calibration_responses: number }> {
  const theta = new Map<string, number>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("profiles")
      .select("id, placement_result")
      .not("placement_result", "is", null)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`cron.calibration.profiles: ${error.code}`);
    for (const r of data ?? []) {
      const t = (r.placement_result as { theta_mean?: unknown } | null)?.theta_mean;
      if (typeof t === "number") theta.set(r.id as string, t);
    }
    if ((data ?? []).length < PAGE) break;
  }

  const responses: ItemResponse[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("attempts")
      .select("user_id, score, items!inner(bank_item_id)")
      .eq("try_no", 1)
      .not("score", "is", null)
      .not("items.bank_item_id", "is", null)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`cron.calibration.attempts: ${error.code}`);
    for (const r of data ?? []) {
      const item = (Array.isArray(r.items) ? r.items[0] : r.items) as { bank_item_id?: string | null } | undefined;
      const t = theta.get(r.user_id as string);
      if (item?.bank_item_id && t !== undefined) responses.push({ item_id: item.bank_item_id, theta: t, score: Number(r.score) });
    }
    if ((data ?? []).length < PAGE) break;
  }

  const rows = calibrateItems(bankPriors(), responses);
  if (rows.length > 0) {
    const { error } = await db
      .from("item_calibration")
      .upsert(rows.map((r) => ({ ...r, updated_at: now.toISOString() })), { onConflict: "item_id" });
    if (error) throw new Error(`cron.calibration.upsert: ${error.code}`);
  }
  return { calibrated_items: rows.length, calibration_responses: responses.length };
}
