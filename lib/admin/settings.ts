// Yönetim panelinden değiştirilebilen `app_settings` anahtarları (SPEC 3, ROADMAP M10). Her değer
// yazılmadan önce doğrulanır; listede olmayan anahtar yazılamaz.
import { z } from "zod";
import { EFFORTS } from "@/lib/ai/settings";
import { isValidInviteCode } from "@/lib/auth/paths";

const nullableText = z.union([z.string().trim().min(1).max(120), z.null()]);

export const EDITABLE_SETTINGS = {
  kill_switch: z.boolean(),
  monthly_budget_usd: z.number().min(0).max(1000),
  daily_session_limit: z.number().int().min(0).max(20),
  model_generate: z.string().trim().min(1).max(120),
  model_grade: z.string().trim().min(1).max(120),
  effort_generate: z.enum(EFFORTS),
  effort_grade: z.enum(EFFORTS),
  thinking_grade: z.enum(["adaptive", "disabled"]),
  model_transcribe: z.string().trim().min(1).max(120),
  tts_enabled: z.boolean(),
  tts_voice: nullableText,
  tts_plan_usd: z.number().min(0).max(1000),
  tts_monthly_char_alert: z.number().int().min(1).max(100_000_000),
  review_sample_rate: z.number().min(0).max(1),
  general_content_rate: z.number().min(0).max(1),
  openrouter_fee_rate: z.number().min(0).max(0.5),
  auto_join_invite_code: z.union([z.string().trim().refine(isValidInviteCode), z.null()]),
} as const;

export type EditableKey = keyof typeof EDITABLE_SETTINGS;
export const EDITABLE_KEYS = Object.keys(EDITABLE_SETTINGS) as EditableKey[];

export const SETTING_LABELS_TR: Record<EditableKey, string> = {
  kill_switch: "Acil durdurma",
  monthly_budget_usd: "Aylık tavan ($)",
  daily_session_limit: "Kişi başı günlük oturum",
  model_generate: "Üretim modeli",
  model_grade: "Değerlendirme modeli",
  effort_generate: "Üretim effort",
  effort_grade: "Değerlendirme effort",
  thinking_grade: "Değerlendirmede düşünme",
  model_transcribe: "Transkript modeli",
  tts_enabled: "Seslendirme açık",
  tts_voice: "Seslendirme sesi (Speechify kimliği)",
  tts_plan_usd: "Speechify plan ücreti ($/ay)",
  tts_monthly_char_alert: "Seslendirme karakter uyarı eşiği",
  review_sample_rate: "İnceleme örneklem oranı",
  general_content_rate: "Genel içerik oranı",
  openrouter_fee_rate: "OpenRouter komisyon oranı",
  auto_join_invite_code: "Açık deneme: otomatik katılım kodu (boş = kapalı)",
};

export const SettingPatch = z.object({ key: z.enum(EDITABLE_KEYS as [EditableKey, ...EditableKey[]]), value: z.unknown() });

/** Doğrulanmış değer ya da `null` (geçersiz). Boş metin `null` sayılır. */
export function parseSettingValue(key: EditableKey, value: unknown): { ok: true; value: unknown } | { ok: false } {
  const v = typeof value === "string" && value.trim() === "" && key in { tts_voice: 1, auto_join_invite_code: 1 } ? null : value;
  const r = EDITABLE_SETTINGS[key].safeParse(v);
  return r.success ? { ok: true, value: r.data } : { ok: false };
}
