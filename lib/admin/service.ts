import "server-only";
// Yönetim uç noktalarının veritabanı işleri (SPEC 6 "Yönetim"). Servis istemcisi `requireRole()`
// sonrası verilir (PLAN karar 36: öğretmen `llm_usage`'ı RLS ile okuyamaz; panel özetini ikisi de görür).
// Öğrenci metni yalnızca inceleme kuyruğunda, öğretmene/admin'e gösterilir; günlüğe yazılmaz.
import type { SupabaseClient } from "@supabase/supabase-js";
import { utcMonthStart } from "@/lib/ai/guard";
import { L1_CODES, TOPICS } from "@/lib/content/taxonomy";
import { istanbulWeek } from "@/lib/progress/progress";
import { alerts, costSummary, engagement, reviewAgreement, type UsageRow } from "./metrics";
import { EDITABLE_KEYS, parseSettingValue, type EditableKey } from "./settings";

const fail = (what: string, error: { code?: string } | null): never => {
  throw new Error(`${what}: ${error?.code ?? "unknown"}`);
};

async function all<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { code?: string } | null }>, what: string) {
  const out: T[] = [];
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) fail(what, error);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function loadSettings(db: SupabaseClient): Promise<Record<string, unknown>> {
  const { data, error } = await db.from("app_settings").select("key, value");
  if (error) fail("app_settings", error);
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
}

export async function getOverview(db: SupabaseClient, now: Date) {
  const monthStart = utcMonthStart(now);
  const since60 = new Date(now.getTime() - 60 * 86_400_000);
  const [settings, students, sessions, usage, monthDone, cohorts] = await Promise.all([
    loadSettings(db),
    all<{ id: string; created_at: string; onboarding_step: string }>(
      (f, t) => db.from("profiles").select("id, created_at, onboarding_step").eq("role", "student").range(f, t),
      "profiles",
    ),
    all<{ user_id: string; finished_at: string }>(
      (f, t) =>
        db.from("sessions").select("user_id, finished_at").eq("kind", "daily").eq("status", "done").gte("finished_at", since60.toISOString()).range(f, t),
      "sessions",
    ),
    db.rpc("admin_usage_since", { since: monthStart.toISOString() }),
    db
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("kind", "daily")
      .eq("status", "done")
      .gte("finished_at", monthStart.toISOString()),
    db.from("cohorts").select("id, name, invite_code, capacity, starts_on, ends_on"),
  ]);
  if (usage.error) fail("admin_usage_since", usage.error);
  if (monthDone.error) fail("sessions.count", monthDone.error);
  if (cohorts.error) fail("cohorts", cohorts.error);

  const onboarded = students.filter((s) => s.onboarding_step === "done");
  const eng = engagement({
    students: onboarded.map((s) => ({ id: s.id, created_at: new Date(s.created_at) })),
    sessions: sessions.map((s) => ({ user_id: s.user_id, finished_at: new Date(s.finished_at) })),
    now,
  });
  const usageRows: UsageRow[] = ((usage.data ?? []) as Record<string, unknown>[]).map((r) => ({
    provider: String(r.provider),
    purpose: String(r.purpose),
    calls: Number(r.calls),
    ok_calls: Number(r.ok_calls),
    cost_usd: Number(r.cost_usd),
    tts_chars: Number(r.tts_chars),
    input_tokens: Number(r.input_tokens),
    cache_read_tokens: Number(r.cache_read_tokens),
  }));
  const cost = costSummary(usageRows, monthDone.count ?? 0);

  const { data: members, error: mErr } = await db.from("profiles").select("cohort_id").not("cohort_id", "is", null);
  if (mErr) fail("profiles.cohort", mErr);
  const memberCount = new Map<string, number>();
  for (const m of members ?? []) memberCount.set(m.cohort_id as string, (memberCount.get(m.cohort_id as string) ?? 0) + 1);

  const num = (k: string, d = 0) => (typeof settings[k] === "number" ? (settings[k] as number) : d);
  return {
    funnel: {
      signedUp: students.length,
      byStep: Object.fromEntries(
        ["invite", "consent", "profile", "placement", "done"].map((s) => [s, students.filter((x) => x.onboarding_step === s).length]),
      ),
    },
    engagement: eng,
    cost: { ...cost, sessionsThisMonth: monthDone.count ?? 0 },
    alerts: alerts({
      killSwitch: settings.kill_switch === true,
      monthCostUsd: cost.totalUsd,
      ttsPlanUsd: num("tts_plan_usd"),
      budgetUsd: num("monthly_budget_usd", 40),
      ttsChars: cost.ttsChars,
      ttsCharAlert: num("tts_monthly_char_alert", 400_000),
      ttsVoice: typeof settings.tts_voice === "string" && settings.tts_voice ? settings.tts_voice : null,
      ttsEnabled: settings.tts_enabled === true,
    }),
    cohorts: (cohorts.data ?? []).map((c) => ({ ...c, members: memberCount.get(c.id as string) ?? 0 })),
    budgetUsd: num("monthly_budget_usd", 40),
    ttsPlanUsd: num("tts_plan_usd"),
  };
}

export type Overview = Awaited<ReturnType<typeof getOverview>>;

export async function patchSetting(db: SupabaseClient, key: EditableKey, value: unknown, now: Date): Promise<boolean> {
  const parsed = parseSettingValue(key, value);
  if (!parsed.ok) return false;
  const { error } = await db.from("app_settings").upsert({ key, value: parsed.value, updated_at: now.toISOString() });
  if (error) fail("app_settings.update", error);
  return true;
}

export async function getEditableSettings(db: SupabaseClient) {
  const s = await loadSettings(db);
  return Object.fromEntries(EDITABLE_KEYS.map((k) => [k, s[k] ?? null])) as Record<EditableKey, unknown>;
}

// ---------------------------------------------------------------------------
// Öğretmen inceleme kuyruğu (PRD F11)
// ---------------------------------------------------------------------------

const L1_NAMES = new Map(L1_CODES.map((c) => [c.code, c.name_tr]));
const TOPIC_TITLES = new Map(TOPICS.map((t) => [t.id, t.title_tr]));

export interface QueueEntry {
  id: string;
  createdAt: string;
  l1Code: string;
  l1NameTr: string;
  topicTitleTr: string | null;
  skill: string;
  activityType: string;
  wrongSpan: string | null;
  correction: string | null;
  task: string | null;
  studentText: string | null;
}

export async function reviewQueue(db: SupabaseClient, limit: number): Promise<QueueEntry[]> {
  const { data: reviewed, error: rErr } = await db.from("teacher_reviews").select("error_event_id").limit(50_000);
  if (rErr) fail("teacher_reviews", rErr);
  const done = new Set((reviewed ?? []).map((r) => r.error_event_id as string));
  const { data, error } = await db
    .from("error_events")
    .select("id, attempt_id, topic_id, skill, activity_type, l1_code, wrong_span, correction, created_at")
    .eq("review_sampled", true)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) fail("error_events", error);
  const open = (data ?? []).filter((e) => !done.has(e.id as string)).slice(0, limit);
  if (open.length === 0) return [];
  const { data: attempts, error: aErr } = await db
    .from("attempts")
    .select("id, item_id, response")
    .in("id", open.map((e) => e.attempt_id as string));
  if (aErr) fail("attempts", aErr);
  const att = new Map((attempts ?? []).map((a) => [a.id as string, a]));
  const itemIds = [...new Set((attempts ?? []).map((a) => a.item_id as string))];
  const { data: items, error: iErr } = itemIds.length
    ? await db.from("items").select("id, payload").in("id", itemIds)
    : { data: [], error: null };
  if (iErr) fail("items", iErr);
  const payloads = new Map((items ?? []).map((i) => [i.id as string, i.payload as Record<string, unknown>]));
  return open.map((e) => {
    const a = att.get(e.attempt_id as string);
    const p = a ? payloads.get(a.item_id as string) : undefined;
    const resp = (a?.response ?? {}) as Record<string, unknown>;
    const studentText = typeof resp.text === "string" ? resp.text : typeof resp.transcript === "string" ? resp.transcript : null;
    const task = [p?.source_tr, p?.prompt_en, p?.text_en].find((x) => typeof x === "string") as string | undefined;
    return {
      id: e.id as string,
      createdAt: e.created_at as string,
      l1Code: e.l1_code as string,
      l1NameTr: L1_NAMES.get(e.l1_code as string) ?? (e.l1_code as string),
      topicTitleTr: e.topic_id ? (TOPIC_TITLES.get(e.topic_id as string) ?? null) : null,
      skill: e.skill as string,
      activityType: e.activity_type as string,
      wrongSpan: (e.wrong_span as string | null) ?? null,
      correction: (e.correction as string | null) ?? null,
      task: task ?? null,
      studentText,
    };
  });
}

export async function insertReview(
  db: SupabaseClient,
  reviewerId: string,
  input: { errorEventId: string; verdict: "agree" | "fix" | "not_error"; correctedL1Code?: string | null; note?: string | null },
): Promise<"ok" | "not_found" | "duplicate"> {
  const { data: ev, error } = await db.from("error_events").select("id").eq("id", input.errorEventId).maybeSingle();
  if (error) fail("error_events", error);
  if (!ev) return "not_found";
  const { error: insErr } = await db.from("teacher_reviews").insert({
    error_event_id: input.errorEventId,
    reviewer_id: reviewerId,
    verdict: input.verdict,
    corrected_l1_code: input.verdict === "fix" ? (input.correctedL1Code ?? null) : null,
    note: input.note ?? null,
  });
  if (insErr?.code === "23505") return "duplicate";
  if (insErr) fail("teacher_reviews.insert", insErr);
  return "ok";
}

export async function reviewStats(db: SupabaseClient, now: Date) {
  const reviews = await all<{ verdict: string; created_at: string; error_events: { l1_code: string } | { l1_code: string }[] | null }>(
    (f, t) => db.from("teacher_reviews").select("verdict, created_at, error_events(l1_code)").range(f, t),
    "teacher_reviews",
  );
  const since = new Date(now.getTime() - 60 * 86_400_000).toISOString();
  const [llm, sampled] = await Promise.all([
    db.from("error_events").select("id", { count: "exact", head: true }).eq("source", "llm").gte("created_at", since),
    db.from("error_events").select("id", { count: "exact", head: true }).eq("source", "llm").eq("review_sampled", true).gte("created_at", since),
  ]);
  if (llm.error) fail("error_events.count", llm.error);
  if (sampled.error) fail("error_events.count", sampled.error);
  const agreement = reviewAgreement(
    reviews.map((r) => {
      const ev = Array.isArray(r.error_events) ? r.error_events[0] : r.error_events;
      return { verdict: r.verdict as "agree" | "fix" | "not_error", l1_code: ev?.l1_code ?? "?", created_at: new Date(r.created_at) };
    }),
    (d) => istanbulWeek(d).date,
  );
  return {
    ...agreement,
    byCode: agreement.byCode.map((c) => ({ ...c, nameTr: L1_NAMES.get(c.code) ?? c.code })),
    llmErrors60d: llm.count ?? 0,
    sampled60d: sampled.count ?? 0,
    sampleRate: llm.count ? (sampled.count ?? 0) / llm.count : null,
  };
}

export type ReviewStats = Awaited<ReturnType<typeof reviewStats>>;
