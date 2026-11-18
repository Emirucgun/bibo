// Uyarlamalı yerleştirme (docs/SPEC.md 4.7, 6 `POST /api/placement`; PRD F2).
import { describe, expect, it } from "vitest";
import { DEFAULT_PLACEMENT_CONFIG } from "@/lib/engine/placement-cat";
import {
  bankItemRow,
  nextPlacement,
  PLACEMENT_BANK,
  PLACEMENT_SPEAKING,
  placementAnswers,
  placementConfig,
} from "@/lib/session/placement";
import {
  finishSession,
  getSessionView,
  skipPlacementItem,
  startPlacement,
  startSession,
  submitAttempt,
  submitSpeech,
} from "@/lib/session/service";
import type { AttemptRow, ItemRow } from "@/lib/session/types";
import { wavOf } from "../media/fakes";
import { GRADE_OK, setup, USER } from "./fake-store";

const actor = { userId: USER };
const CEFR = new Map(PLACEMENT_BANK.map((b) => [b.id, b.cefr]));
type Env = ReturnType<typeof setup>;

const rowOf = (raw: (typeof PLACEMENT_BANK)[number], position: number): ItemRow => {
  const row = bankItemRow(raw, position, () => 0.3);
  return {
    position: row.position,
    topic_id: row.topic_id,
    activity_type: row.activity_type,
    skill: row.skill,
    mode: row.mode,
    purpose: row.purpose,
    interest: row.interest,
    l1_target: row.l1_target,
    payload: row.payload,
    bank_item_id: row.bank_item_id ?? null,
    id: `i${position}`,
    session_id: "s",
    user_id: USER,
  };
};
const attemptOf = (itemId: string, score: number | null): AttemptRow => ({
  id: `a-${itemId}`,
  item_id: itemId,
  user_id: USER,
  try_no: 1,
  response: {},
  is_correct: score === null ? null : score >= 1,
  score,
  hint_used: false,
  explain_opened: false,
  graded_by: "local",
  feedback_short_tr: null,
  explanation_long_tr: null,
  correction: null,
});

describe("yerleştirme maddeleri (saf)", () => {
  it("dinleme metni anahtarda, şıklar karıştırılır, bankadaki kimlik saklanır", () => {
    const listen = PLACEMENT_BANK.find((b) => b.activity_type === "listen_choose")!;
    const row = bankItemRow(listen, 3, () => 0.1);
    expect(row).toMatchObject({ position: 3, purpose: "placement", interest: null, bank_item_id: listen.id, skill: "listening" });
    expect(row.payload.text_en).toBeUndefined();
    expect(row.key.text_en).toBe(listen.payload.text_en ?? listen.key.correct);
    expect([...row.payload.options!].sort()).toEqual([...listen.payload.options!].sort());
    const firsts = new Set<boolean>();
    const mcq = PLACEMENT_BANK.find((b) => b.activity_type === "mcq_read")!;
    for (let seed = 1; seed < 20; seed++) firsts.add(bankItemRow(mcq, 1, () => seed / 20).payload.options![0] === mcq.key.correct);
    expect(firsts).toEqual(new Set([true, false]));
  });

  it("ayarlar yalnızca bilinen alanları ezer", () => {
    const c = placementConfig({ stop_p: 0.9, max_items: "x", unknown: 3 } as never);
    expect(c.stop_p).toBe(0.9);
    expect(c.max_items).toBe(DEFAULT_PLACEMENT_CONFIG.max_items);
    expect("unknown" in c).toBe(false);
  });

  it("cevapsız madde varken bekler; ilk madde kolay ısınma maddesi", () => {
    const args = { sessionId: "s", levelSelf: "A1", ttsAvailable: true, config: DEFAULT_PLACEMENT_CONFIG };
    const first = nextPlacement({ ...args, items: [], attempts: [] });
    expect(first.kind).toBe("item");
    if (first.kind !== "item") return;
    expect(["preA1", "A1"]).toContain(CEFR.get(first.row.bank_item_id!));
    const item = rowOf(PLACEMENT_BANK.find((b) => b.id === first.row.bank_item_id)!, 1);
    expect(nextPlacement({ ...args, items: [item], attempts: [] }).kind).toBe("wait");
  });

  it("atlanan madde (ses yok) karara girmez ve testin geri kalanında dinleme sorulmaz", () => {
    const listen = PLACEMENT_BANK.find((b) => b.activity_type === "listen_choose")!;
    const items = [rowOf(listen, 1)];
    const attempts = [attemptOf("i1", null)];
    expect(placementAnswers(items, attempts)).toEqual([]);
    let all = items;
    let atts = attempts;
    for (let k = 0; k < 10; k++) {
      const next = nextPlacement({ sessionId: "s", items: all, attempts: atts, levelSelf: null, ttsAvailable: true, config: DEFAULT_PLACEMENT_CONFIG });
      if (next.kind !== "item") break;
      expect(next.row.skill).not.toBe("listening");
      const raw = PLACEMENT_BANK.find((b) => b.id === next.row.bank_item_id)!;
      const row = rowOf(raw, next.row.position);
      all = [...all, row];
      atts = [...atts, attemptOf(row.id, k % 2)];
    }
  });

  it("sınıflama bitince konuşma sorusu eklenir; kapsam kapısında eklenmez", () => {
    const run = (correct: (cefr: string) => boolean) => {
      let items: ItemRow[] = [];
      let attempts: AttemptRow[] = [];
      for (let k = 0; k < 40; k++) {
        const next = nextPlacement({ sessionId: "s2", items, attempts, levelSelf: "unsure", ttsAvailable: true, config: DEFAULT_PLACEMENT_CONFIG });
        if (next.kind !== "item") return { next, items };
        if (!next.row.bank_item_id || next.row.bank_item_id === PLACEMENT_SPEAKING.id) return { next, items };
        const row = rowOf(PLACEMENT_BANK.find((b) => b.id === next.row.bank_item_id)!, next.row.position);
        items = [...items, row];
        attempts = [...attempts, attemptOf(row.id, correct(CEFR.get(row.bank_item_id!)!) ? 1 : 0)];
      }
      throw new Error("bitmedi");
    };
    const a1 = run((c) => c === "preA1" || c === "A1");
    expect(a1.next.kind).toBe("item");
    if (a1.next.kind === "item") expect(a1.next.row.activity_type).toBe("speak_answer");
    expect(a1.items.length).toBeGreaterThanOrEqual(DEFAULT_PLACEMENT_CONFIG.min_items);
    expect(a1.items.length).toBeLessThanOrEqual(DEFAULT_PLACEMENT_CONFIG.max_items + DEFAULT_PLACEMENT_CONFIG.extension_items);

    const strong = run(() => true);
    expect(strong.next.kind).toBe("complete");
    if (strong.next.kind === "complete") expect(strong.next.outcome).toMatchObject({ level: "B1+", gate: true });
  });
});

describe("yerleştirme oturumu (servis)", () => {
  async function answer(env: Env, item: ItemRow, correct: boolean) {
    if (item.activity_type === "speak_answer") {
      env.llm.grade = GRADE_OK;
      return submitSpeech(env.deps, actor, item.id, { audio: wavOf(3), timeMs: 20_000, tryNo: 1 });
    }
    const key = env.store.keys.get(item.id)!;
    const right = key.correct ?? key.accepted![0];
    const response =
      item.activity_type === "word_order"
        ? { order: correct ? right.replace(/[.?!]$/, "").split(" ") : [...right.replace(/[.?!]$/, "").split(" ")].reverse() }
        : item.activity_type === "mcq_read" || item.activity_type === "listen_choose"
          ? { choice: correct ? right : key.distractors![0].option }
          : { text: correct ? right : "zzz" };
    return submitAttempt(env.deps, actor, item.id, { response, timeMs: 3000, hintUsed: false });
  }

  /** Testi `correct(cefr)` kuralıyla sonuna kadar çözer. */
  async function runPlacement(env: Env, correct: (cefr: string) => boolean) {
    const { sessionId } = await startPlacement(env.deps, actor);
    await startSession(env.deps, actor, sessionId);
    for (let k = 0; k < 40; k++) {
      const view = await getSessionView(env.store, actor, sessionId);
      const answered = new Set(view.attempts.map((a) => a.item_id));
      const pending = env.store.items.find((i) => i.session_id === sessionId && !answered.has(i.id));
      if (!pending) break;
      const res = await answer(env, pending, pending.bank_item_id ? correct(CEFR.get(pending.bank_item_id) ?? "B2") : true);
      // Yerleştirmede maddeye özel geri bildirim gösterilmez.
      expect(res).toMatchObject({ isCorrect: null, feedbackShortTr: null, correction: null });
      if (res.placement === "done") break;
    }
    return sessionId;
  }

  it("uçtan uca A1: maddeler tek tek eklenir, dil modeli yalnızca konuşmada, profil ve ilk günlük oturum", async () => {
    const env = setup();
    const { sessionId } = await startPlacement(env.deps, actor);
    // Çift dokunuş aynı oturumu döner; başta tek madde var.
    expect((await startPlacement(env.deps, actor)).sessionId).toBe(sessionId);
    expect((await getSessionView(env.store, actor, sessionId)).items).toHaveLength(1);
    expect(env.llm.generateCalls).toBe(0);

    await runPlacement(env, (c) => c === "preA1" || c === "A1");
    const items = env.store.items.filter((i) => i.session_id === sessionId);
    expect(items.at(-1)!.activity_type).toBe("speak_answer");
    expect(items.length).toBeLessThanOrEqual(DEFAULT_PLACEMENT_CONFIG.max_items + DEFAULT_PLACEMENT_CONFIG.extension_items + 1);
    expect(env.llm.gradeCalls).toBe(1);
    expect(env.aiStore.rows.filter((r) => r.purpose === "placement")).toHaveLength(1);
    expect(env.aiStore.rows.filter((r) => r.purpose === "grade")).toHaveLength(0);
    // Her cevaptan önce modelin tahmini yazıldı.
    expect(env.store.attempts.filter((a) => a.score !== null).every((a) => typeof a.pred_p === "number")).toBe(true);

    const res = await finishSession(env.deps, actor, sessionId, {});
    expect(res.placement).toMatchObject({ level: "A1", levelEst: "A1", gate: false });
    expect(res.placement!.weakPoints.length).toBeGreaterThan(0);
    expect(res.placement!.weakPoints.length).toBeLessThanOrEqual(3);
    // Sorulmamış konu zayıf nokta sayılmaz.
    const asked = new Set(items.map((i) => i.topic_id));
    for (const w of res.placement!.weakPoints) expect(asked.has(w.topicId)).toBe(true);
    for (const t of res.placement!.toClarify) expect(asked.has(t.topicId)).toBe(false);
    expect(env.store.onboarding.get(USER)).toBe("done");
    expect(env.store.placementResults.get(USER)).toMatchObject({ level_est: "A1", scope_status: "in_scope" });
    expect(env.store.learnerStates.get(USER)).toBeDefined();
    expect(res.background).toBeDefined();
    await res.background!();
    expect(env.store.sessions.some((s) => s.kind === "daily" && s.status === "ready")).toBe(true);

    // Özet yeniden açılınca adım yeniden kapanmaz, ikinci üretim başlamaz.
    const again = await finishSession(env.deps, actor, sessionId, {});
    expect(again.background).toBeUndefined();
    expect(again.placement?.level).toBe("A1");
  });

  it("A2 üstü: konuşma sorusu yok, kapsam dışı yazılır, günlük oturum hazırlanmaz; 1 kez yeniden test", async () => {
    const env = setup();
    const sessionId = await runPlacement(env, () => true);
    expect(env.store.items.some((i) => i.session_id === sessionId && i.activity_type === "speak_answer")).toBe(false);
    expect(env.llm.gradeCalls).toBe(0);
    const res = await finishSession(env.deps, actor, sessionId, {});
    expect(res.placement).toMatchObject({ level: "B1+", gate: true, levelEst: "A2" });
    expect(res.background).toBeUndefined();
    expect(env.store.learners.get(USER)!.scope_status).toBe("above_scope");
    expect(await env.store.countPlacements(USER)).toBe(1);

    // Yeniden teste açılınca yeni oturum açılır (bitmiş oturum dönmez).
    expect(await env.store.reopenPlacement(USER)).toBe(true);
    const second = await startPlacement(env.deps, actor);
    expect(second.sessionId).not.toBe(sessionId);
  });

  it("sesi çalınamayan dinleme maddesi atlanır; değerlendirilmez, sıradaki madde gelir", async () => {
    const env = setup();
    const { sessionId } = await startPlacement(env.deps, actor);
    await startSession(env.deps, actor, sessionId);
    let listening: ItemRow | undefined;
    for (let k = 0; k < 25 && !listening; k++) {
      const pending = env.store.items.find((i) => i.session_id === sessionId && !env.store.attempts.some((a) => a.item_id === i.id))!;
      if (pending.skill === "listening") listening = pending;
      else await answer(env, pending, k % 2 === 0);
    }
    expect(listening).toBeDefined();
    const res = await skipPlacementItem(env.deps, actor, listening!.id);
    expect(res.placement).toBe("item");
    expect(env.store.attempts.find((a) => a.item_id === listening!.id)).toMatchObject({ is_correct: null, score: null });
    const after = env.store.items.filter((i) => i.session_id === sessionId && i.position > listening!.position);
    expect(after.length).toBe(1);
    expect(after[0].skill).not.toBe("listening");
  });
});
