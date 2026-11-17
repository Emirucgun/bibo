// Cron kimlik doğrulaması ve süre sınırları (SPEC 6). Saf.
import { timingSafeEqual } from "node:crypto";

export const CRON_LIMITS = {
  readyMs: 72 * 3_600_000,
  activeMs: 24 * 3_600_000,
  generatingMs: 6 * 60_000,
  ttsUnusedMs: 21 * 86_400_000,
} as const;

/** `Authorization: Bearer <CRON_SECRET>`; sır tanımlı değilse her istek reddedilir. */
export function cronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
