// `app_settings` satırları → türlü ayarlar (docs/SPEC.md Bölüm 3). Değerler koda sabit
// yazılmaz; eksik ya da geçersiz anahtar sessizce varsayılana düşmez, hata verir.
import { z } from "zod";

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

export const AiSettingsSchema = z.object({
  kill_switch: z.boolean(),
  monthly_budget_usd: z.number().nonnegative(),
  daily_session_limit: z.number().int().nonnegative(),
  model_generate: z.string().min(1),
  model_grade: z.string().min(1),
  effort_generate: z.enum(EFFORTS),
  effort_grade: z.enum(EFFORTS),
  thinking_grade: z.enum(["adaptive", "disabled"]),
  tts_plan_usd: z.number().nonnegative(),
  /** OpenRouter kredi komisyonu (SPEC rev. 3); 0,5 üstü yazım hatası sayılır. */
  openrouter_fee_rate: z.number().min(0).max(0.5),
});
export type AiSettings = z.infer<typeof AiSettingsSchema>;

export const AI_SETTING_KEYS = Object.keys(AiSettingsSchema.shape) as (keyof AiSettings)[];

export function parseAiSettings(rows: { key: string; value: unknown }[]): AiSettings {
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const parsed = AiSettingsSchema.safeParse(map);
  if (!parsed.success) {
    const keys = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`app_settings eksik ya da geçersiz: ${keys}`);
  }
  return parsed.data;
}
