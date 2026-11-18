// Kapsam kapısı, bekleme listesi, yeniden test ve "Bugün ne çalışalım?" (docs/SPEC.md 4.7;
// docs/arastirma/mufredat-onerisi.md).
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { getHomeOptions, getScope, joinWaitlist, nextSession, retestPlacement, setFocusChoice } from "@/lib/session/service";
import { setup, USER } from "./fake-store";

const actor = { userId: USER };
const DAY = 86_400_000;

async function codeOf(p: Promise<unknown>) {
  try {
    await p;
    return "resolved";
  } catch (e) {
    return e instanceof ApiError ? e.code : String(e);
  }
}

function aboveScope(env: ReturnType<typeof setup>) {
  env.store.onboarding.set(USER, "done");
  env.store.learners.set(USER, {
    ...env.store.learners.get(USER)!,
    onboarding_step: "done",
    scope_status: "above_scope",
    placement_done_at: new Date(env.store.clock.now),
  });
  // Bitmiş bir yerleştirme oturumu.
  env.store.sessions.push({
    id: "00000000-0000-4000-8000-0000000000f1",
    user_id: USER,
    kind: "placement",
    status: "done",
    focus_topic_id: null,
    created_at: new Date(env.store.clock.now),
    started_at: new Date(env.store.clock.now),
    finished_at: new Date(env.store.clock.now),
    rating: null,
  });
}

describe("kapsam kapısı", () => {
  it("kapsam içi öğrencide yeniden test ve bekleme listesi yok", async () => {
    const env = setup();
    expect(await getScope(env.deps, actor)).toEqual({ status: "in_scope", notified: false, canRetest: false, retestAt: null });
    expect(await codeOf(joinWaitlist(env.deps, actor, { optIn: true }))).toBe("invalid_input");
  });

  it("bekleme listesi: tercih bir kez yazılır; yalnızca `optIn: true`", async () => {
    const env = setup();
    aboveScope(env);
    expect(await codeOf(joinWaitlist(env.deps, actor, { optIn: false }))).toBe("invalid_input");
    await joinWaitlist(env.deps, actor, { optIn: true });
    const first = env.store.learners.get(USER)!.notify_opt_in_at;
    expect(first).toBeInstanceOf(Date);
    env.advance(DAY);
    await joinWaitlist(env.deps, actor, { optIn: true });
    expect(env.store.learners.get(USER)!.notify_opt_in_at).toEqual(first);
    expect((await getScope(env.deps, actor)).notified).toBe(true);
  });

  it("yeniden test: retest_after_days dolmadan kapalı, sonra bir kez açık", async () => {
    const env = setup();
    aboveScope(env);
    const before = await getScope(env.deps, actor);
    expect(before.canRetest).toBe(false);
    expect(before.retestAt).toBe(new Date(env.store.clock.now.getTime() + 7 * DAY).toISOString());
    expect(await codeOf(retestPlacement(env.deps, actor))).toBe("retest_unavailable");

    env.advance(7 * DAY);
    expect((await getScope(env.deps, actor)).canRetest).toBe(true);
    await retestPlacement(env.deps, actor);
    expect(env.store.learners.get(USER)).toMatchObject({ scope_status: "in_scope", onboarding_step: "placement" });

    // İkinci yerleştirme de A2 üstü çıktı: hak bitti.
    aboveScope(env);
    env.advance(30 * DAY);
    expect(await getScope(env.deps, actor)).toMatchObject({ canRetest: false, retestAt: null });
  });
});

describe("Bugün ne çalışalım?", () => {
  it("2–3 seçenek; seçim yalnızca seçeneklerden, hazır oturum bırakılır ve sonraki oturumun odağı olur", async () => {
    const env = setup();
    env.store.onboarding.set(USER, "done");
    const home = await getHomeOptions(env.deps, actor);
    expect(home.focusChoices.length).toBeGreaterThanOrEqual(2);
    expect(home.focusChoices.length).toBeLessThanOrEqual(3);
    expect(home.school).not.toBeNull();
    expect(home.school!.suggestions.length).toBeGreaterThan(0);

    const ready = await nextSession(env.deps, actor);
    await ready.background!();
    expect(await codeOf(setFocusChoice(env.deps, actor, { topicId: "m.b1" }))).toBe("invalid_input");
    const pick = home.focusChoices.at(-1)!.topicId;
    await setFocusChoice(env.deps, actor, { topicId: pick });
    expect(env.store.learners.get(USER)!.focus_choice).toBe(pick);
    expect(env.store.sessions.find((s) => s.id === ready.sessionId)!.status).toBe("abandoned");

    const next = await nextSession(env.deps, actor);
    await next.background!();
    expect(env.store.sessions.find((s) => s.id === next.sessionId)!.focus_topic_id).toBe(pick);
  });

  it("kendi programında okul sorusu sorulmaz; okul programı haritalıysa da sorulmaz", async () => {
    const env = setup();
    env.store.learners.set(USER, { ...env.store.learners.get(USER)!, study_mode: "self" });
    expect((await getHomeOptions(env.deps, actor)).school).toBeNull();
    env.store.learners.set(USER, { ...env.store.learners.get(USER)!, study_mode: "school", program_id: "uni-a1" });
    expect((await getHomeOptions(env.deps, actor)).school).toBeNull();
  });

  it("okul programı haritası haftanın konusunu verir", async () => {
    const env = setup();
    env.store.learners.set(USER, { ...env.store.learners.get(USER)!, study_mode: "school", program_id: "uni-a1" });
    // T0 = 2026-12-14 (pazartesi).
    env.store.programWeeks.set("uni-a1|2026-12-14", "g.can");
    const s = await nextSession(env.deps, actor);
    await s.background!();
    const plan = env.store.sessions.find((x) => x.id === s.sessionId)!.plan as { focus_topic_id: string | null; bridge_for: string | null };
    // Okul konusu ya da (ön koşulu hazır değilse) ona köprü.
    expect(plan.focus_topic_id === "g.can" || plan.bridge_for === "g.can").toBe(true);
  });
});
