// Oturum uç noktalarının girdi şemaları (docs/SPEC.md Bölüm 6).
import { z } from "zod";
import { INTERESTS, MIN_INTERESTS } from "@/lib/content/interests";

/** `attempts.response`: `{choice}` / `{text}` / `{order}`. */
export const AttemptResponse = z.union([
  z.strictObject({ choice: z.string().min(1).max(200) }),
  z.strictObject({ text: z.string().max(1000) }),
  z.strictObject({ order: z.array(z.string().max(60)).min(1).max(20) }),
]);
export type AttemptResponse = z.infer<typeof AttemptResponse>;

export const AttemptInput = z.object({
  response: AttemptResponse,
  timeMs: z.number().int().min(0).max(3_600_000),
  hintUsed: z.boolean(),
});

export const FinishInput = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().trim().max(500).optional(),
});

export const DiagnosisFeedbackInput = z.object({ feedback: z.enum(["agree", "disagree"]) });

export const ProfilePatchInput = z
  .strictObject({
    displayName: z.string().trim().min(1).max(80).optional(),
    interests: z.array(z.enum(INTERESTS)).min(MIN_INTERESTS).max(INTERESTS.length).optional(),
    explainMode: z.enum(["short", "long"]).optional(),
  })
  .refine((v) => Object.keys(v).length > 0);

/** `events.name` (SPEC Bölüm 3). */
export const EVENT_NAMES = [
  "app_open",
  "session_start",
  "session_resume",
  "hint_open",
  "explain_open",
  "audio_replay",
  "rerecord",
  "diag_feedback",
  "limit_hit",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

export const EVENT_PROPS_MAX_BYTES = 1024;
/** Kısa değerler: kimlik, sayı, bayrak. Serbest metin (öğrenci cevabı) sığmasın diye kısa tutulur. */
const EventPropValue = z.union([z.string().max(64), z.number(), z.boolean(), z.null()]);

export const EventInput = z.object({
  name: z.enum(EVENT_NAMES),
  props: z
    .record(z.string().max(40), EventPropValue)
    .refine((p) => new TextEncoder().encode(JSON.stringify(p)).length <= EVENT_PROPS_MAX_BYTES)
    .optional(),
});

export const Uuid = z.uuid();
