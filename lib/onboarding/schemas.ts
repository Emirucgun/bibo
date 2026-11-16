// API girdileri (SPEC Bölüm 6 "Kimlik ve başlangıç", "İlerleme ve hesap"). Zod ile doğrulanır.
import { z } from "zod";

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
