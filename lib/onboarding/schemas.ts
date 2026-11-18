// API girdileri (SPEC Bölüm 6 "Kimlik ve başlangıç", "İlerleme ve hesap"). Zod ile doğrulanır.
import { z } from "zod";
import { INTERESTS, MIN_INTERESTS } from "@/lib/content/interests";

export const InviteInput = z.object({
  code: z.string().trim().min(1).max(64),
});
export type InviteInput = z.infer<typeof InviteInput>;

export const ConsentInput = z.object({
  adult: z.literal(true),
  consentVersion: z.string().min(1).max(64),
});
export type ConsentInput = z.infer<typeof ConsentInput>;

export const ACCOUNT_DELETE_CONFIRM = "SİL";

export const AccountDeleteInput = z.object({
  confirm: z.literal(ACCOUNT_DELETE_CONFIRM),
});
export type AccountDeleteInput = z.infer<typeof AccountDeleteInput>;

export const LEVEL_SELF = ["A1", "A2", "unsure"] as const;

export const STUDY_MODES = ["school", "self"] as const;
export const GOALS = ["communication", "exam", "work_travel"] as const;

export const ProfileInput = z.object({
  levelSelf: z.enum(LEVEL_SELF),
  interests: z.array(z.enum(INTERESTS)).min(MIN_INTERESTS).max(INTERESTS.length),
  /** Okul programını mı izliyor, kendi programıyla mı çalışıyor (docs/arastirma/mufredat-onerisi.md). */
  studyMode: z.enum(STUDY_MODES).optional(),
  goal: z.enum(GOALS).optional(),
  /** Okul programı haritası (`programs.id`); yalnızca okul modunda. */
  programId: z.string().trim().min(1).max(64).nullable().optional(),
});
export type ProfileInput = z.infer<typeof ProfileInput>;

/** `auto_join_invite_code` ayarı: doluysa davet adımındaki kullanıcı bu koda katılır (PLAN karar 34). */
export const AUTO_JOIN_SETTING = "auto_join_invite_code";
