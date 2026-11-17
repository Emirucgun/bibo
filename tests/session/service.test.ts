import { describe, expect, it } from "vitest";
import { AiCallError } from "@/lib/ai/client";
import { GRADE_UNAVAILABLE_TR } from "@/lib/ai/grade";
import { ApiError, type ApiErrorCode } from "@/lib/api/errors";
import {
  finishSession,
  GAP_VALID_OTHER_TR,
  GENERATING_STALE_MS,
  getExplanation,
  getHint,
  getSessionView,
  nextSession,
  patchProfile,
  prefetchNext,
  recordEvent,
  RESUME_WINDOW_MS,
  startSession,
  submitAttempt,
  submitDiagnosisFeedback,
  getItemAudio,
  submitSpeech,
  UNCLEAR_TR,
} from "@/lib/session/service";
import { wavOf } from "../media/fakes";
import { validItem } from "../ai/fixtures";
import { splitGeneratedItem } from "@/lib/session/save-items";
import { ACTIVITY_TYPE_INFO, type ActivityType } from "@/lib/content/activity-types";
import type { ItemRow } from "@/lib/session/types";
import { masteryFrom } from "../engine/fixtures";
import { L1_CODES as TAXONOMY_CODES } from "@/lib/content/taxonomy";
import { GRADE_OK, GRADE_WRONG, OTHER, setup, USER, uuid } from "./fake-store";

const actor = { userId: USER };
const HOUR = 3_600_000;
const TOPIC = "g.present_simple_3sg";

async function codeOf(promise: Promise<unknown>): Promise<ApiErrorCode | "resolved"> {
  try {
    await promise;
    return "resolved";
  } catch (err) {
    if (err instanceof ApiError) return err.code;
    throw err;
  }
}

type Env = ReturnType<typeof setup>;

/** `next` → arka plan üretimi → `start`: açık bir oturum. */
async function openSession(env: Env) {
  const res = await nextSession(env.deps, actor);
  await res.background?.();
  await startSession(env.deps, actor, res.sessionId);
  return res.sessionId;
}

const itemsOf = (env: Env, sessionId: string) =>
  env.store.items.filter((i) => i.session_id === sessionId).sort((a, b) => a.position - b.position);

/** Türe uygun doğru ya da yanlış cevap (fikstürdeki anahtarlara göre). */
function responseFor(item: ItemRow, correct: boolean) {
  switch (item.activity_type) {
    case "mcq_read":
    case "listen_choose":
      return { choice: correct ? "He plays football." : "He play football." };
    case "dictation":
      return { text: correct ? "She plays football every day." : "She play football every day." };
    case "gap_fill":
      return { text: correct ? "plays" : "play" };
    case "word_order":
      return { order: correct ? ["He", "plays", "football."] : ["football", "He", "plays."] };
    default:
      return { text: correct ? "He plays football every day." : "He play football every day." };
  }
}

const answer = async (env: Env, item: ItemRow, correct = true, extra: { hintUsed?: boolean } = {}) => {
  if (item.activity_type === "speak_answer") {
    // Konuşma ayrı uç noktadan; değerlendirme sahte modelden (doğru/yanlış yalnızca bu cevap için).
    const saved = env.llm.grade;
    env.llm.grade = correct ? GRADE_OK : GRADE_WRONG;
    try {
      return await submitSpeech(env.deps, actor, item.id, { audio: wavOf(2), timeMs: 4200, tryNo: 1 });
    } finally {
      env.llm.grade = saved;
    }
  }
  return submitAttempt(env.deps, actor, item.id, {
    response: responseFor(item, correct),
    timeMs: 4200,
    hintUsed: extra.hintUsed ?? false,
  });
};

/** Yapay zekâ ile değerlendirilen ilk etkinlik (çeviri ya da kısa yazma; plan tohuma göre değişir). */
const firstFree = (env: Env, sessionId: string) => {
  const item = itemsOf(env, sessionId).find((i) => i.activity_type === "translate_tr_en" || i.activity_type === "short_write");
  if (!item) throw new Error("oturumda serbest cevaplı etkinlik yok");
  return item;
};

const firstOfType = (env: Env, sessionId: string, type: string) => {
  const item = itemsOf(env, sessionId).find((i) => i.activity_type === type);
  if (!item) throw new Error(`oturumda ${type} yok`);
  return item;
};

describe("nextSession (POST /api/sessions/next)", () => {
  it("hazır oturum yokken `generating` açar; arka plan işi oturumu `ready` yapar", async () => {
    const env = setup();
    const res = await nextSession(env.deps, actor);
    expect(res.status).toBe("generating");
    expect(env.store.sessions[0].status).toBe("generating");
    await res.background!();
    const s = env.store.sessions[0];
    expect(s.status).toBe("ready");
    expect(itemsOf(env, s.id).length).toBeGreaterThanOrEqual(8);
    expect(s.plan).toBeTruthy();
    // Her etkinliğin anahtarı ayrı tabloda.
    expect(itemsOf(env, s.id).every((i) => env.store.keys.has(i.id))).toBe(true);
  });

  it("M7–M8: seslendirme açıkken dört beceri de planlanır; dinleme ve konuşma türleri üretilir", async () => {
    const env = setup();
    const res = await nextSession(env.deps, actor);
    await res.background!();
    const items = itemsOf(env, res.sessionId);
    expect(new Set(items.map((i) => i.skill))).toEqual(new Set(["reading", "listening", "writing", "speaking"]));
    expect(items.some((i) => i.activity_type === "speak_answer")).toBe(true);
    expect(items.some((i) => i.activity_type === "listen_choose" || i.activity_type === "dictation")).toBe(true);
  });

  for (const [label, change] of [
    ["`tts_enabled = false`", (env: Env) => void (env.tts.settings.tts_enabled = false)],
    ["`tts_voice` seçilmemiş (P9)", (env: Env) => void (env.tts.settings.tts_voice = null)],
  ] as const) {
    it(`${label}: dinleme slotları metne düşer, konuşma kalır`, async () => {
      const env = setup();
      change(env);
      const res = await nextSession(env.deps, actor);
      await res.background!();
      const items = itemsOf(env, res.sessionId);
      expect(items.some((i) => i.skill === "listening")).toBe(false);
      expect(items.some((i) => i.activity_type === "speak_answer")).toBe(true);
    });
  }

  it("`generating` ya da `ready` oturum varken yenisini üretmez (çift üretim yok)", async () => {
    const env = setup();
    const first = await nextSession(env.deps, actor);
    const second = await nextSession(env.deps, actor);
    expect(second).toEqual({ sessionId: first.sessionId, status: "generating" });
    expect(second.background).toBeUndefined();
    await first.background!();
    const third = await nextSession(env.deps, actor);
    expect(third).toEqual({ sessionId: first.sessionId, status: "ready" });
    expect(env.store.sessions).toHaveLength(1);
    expect(env.llm.generateCalls).toBe(2); // 5 + 5 ya da 5 + 4: tek tur
  });

  it("açık (`active`) oturum varsa onu döner", async () => {
    const env = setup();
    const id = await openSession(env);
    expect(await nextSession(env.deps, actor)).toEqual({ sessionId: id, status: "active" });
  });

  it("24 saatten eski `active` oturum `abandoned` olur, yenisi hazırlanır", async () => {
    const env = setup();
    const id = await openSession(env);
    env.advance(RESUME_WINDOW_MS + 60_000);
    const res = await nextSession(env.deps, actor);
    expect(res.sessionId).not.toBe(id);
    expect(env.store.sessions.find((s) => s.id === id)!.status).toBe("abandoned");
  });

  it("ölü `generating` satırı `failed` olur ve yeniden denenir", async () => {
    const env = setup();
    const dead = await nextSession(env.deps, actor); // arka plan hiç çalışmadı
    env.advance(GENERATING_STALE_MS + 1000);
    const res = await nextSession(env.deps, actor);
    expect(res.sessionId).not.toBe(dead.sessionId);
    expect(env.store.sessions.find((s) => s.id === dead.sessionId)!.status).toBe("failed");
  });

  it("günlük sınır doluyken öğrencinin istediği üretim 429 `daily_limit` + `limit_hit`", async () => {
    const env = setup();
    env.aiStore.settings.daily_session_limit = 1;
    const id = await openSession(env);
    await finishSession(env.deps, actor, id, {}); // ön üretim çalıştırılmadı
    expect(await codeOf(nextSession(env.deps, actor))).toBe("daily_limit");
    expect(env.store.events.some((e) => e.name === "limit_hit")).toBe(true);
    expect(env.store.sessions).toHaveLength(1);
  });

  it("acil durdurma açıkken 503 `ai_unavailable`, oturum satırı açılmaz", async () => {
    const env = setup();
    env.aiStore.settings.kill_switch = true;
    expect(await codeOf(nextSession(env.deps, actor))).toBe("ai_unavailable");
    expect(env.store.sessions).toHaveLength(0);
    expect(env.llm.calls).toHaveLength(0);
  });

  it("üretim başarısız olursa oturum `failed`; sonraki `next` yeniden dener", async () => {
    const env = setup();
    env.llm.failGeneration = true;
    const res = await nextSession(env.deps, actor);
    await res.background!();
    expect(env.store.sessions[0].status).toBe("failed");
    env.llm.failGeneration = false;
    const again = await nextSession(env.deps, actor);
    expect(again.status).toBe("generating");
    expect(again.sessionId).not.toBe(res.sessionId);
  });
});

describe("startSession (POST /api/sessions/:id/start)", () => {
  it("`ready` → `active`, `started_at` ve `session_start` olayı", async () => {
    const env = setup();
    const id = await openSession(env);
    const s = env.store.sessions[0];
    expect(s.status).toBe("active");
    expect(s.started_at).toEqual(env.store.clock.now);
    expect(env.store.events.filter((e) => e.name === "session_start")).toHaveLength(1);
    // Yeniden çağrı zararsız.
    expect(await startSession(env.deps, actor, id)).toEqual({ ok: true });
    expect(env.store.events.filter((e) => e.name === "session_start")).toHaveLength(1);
  });

  it("bugün başlatılan oturum sayısı sınırdaysa 429 `daily_limit` + `limit_hit`; oturum `ready` kalır", async () => {
    const env = setup();
    env.aiStore.settings.daily_session_limit = 1;
    const id = await openSession(env);
    const fin = await finishSession(env.deps, actor, id, {});
    await fin.background!(); // ön üretim sınıra takılmaz
    const next = env.store.sessions.find((s) => s.status === "ready")!;
    expect(next).toBeTruthy();
    expect(await codeOf(startSession(env.deps, actor, next.id))).toBe("daily_limit");
    expect(next.status).toBe("ready");
    expect(env.store.events.filter((e) => e.name === "limit_hit")).toHaveLength(1);
    // Ertesi gün (İstanbul) açılır.
    env.advance(24 * HOUR);
    expect(await startSession(env.deps, actor, next.id)).toEqual({ ok: true });
  });

  it("hazırlanan (`generating`) oturum başlatılamaz", async () => {
    const env = setup();
    const res = await nextSession(env.deps, actor);
    expect(await codeOf(startSession(env.deps, actor, res.sessionId))).toBe("session_not_ready");
  });

  it("başkasının oturumu 404", async () => {
    const env = setup();
    const id = await openSession(env);
    expect(await codeOf(startSession(env.deps, { userId: OTHER }, id))).toBe("not_found");
    expect(await codeOf(getSessionView(env.store, { userId: OTHER }, id))).toBe("not_found");
    expect(await codeOf(finishSession(env.deps, { userId: OTHER }, id, {}))).toBe("not_found");
  });
});

describe("getSessionView (GET /api/sessions/:id)", () => {
  it("etkinlikler sırayla ve cevap anahtarı olmadan döner", async () => {
    const env = setup();
    const id = await openSession(env);
    await answer(env, itemsOf(env, id)[0], false);
    const view = await getSessionView(env.store, actor, id);
    expect(view.session.status).toBe("active");
    expect(view.session.estSeconds).toBeGreaterThan(0);
    expect(view.items.map((i) => i.position)).toEqual([...view.items.map((i) => i.position)].sort((a, b) => a - b));
    expect(view.attempts).toHaveLength(1);

    const json = JSON.stringify(view);
    for (const field of [
      "key",
      "l1_target",
      "accepted",
      "distractors",
      "wrong_patterns",
      "model_answer_en",
      "hint_tr",
      "explanation_long_tr",
      "explanation_short_tr",
      "target_words",
    ]) {
      expect(json, field).not.toContain(`"${field}"`);
    }
    // Anahtardaki metinler de yanıtta yok (yanlış cevabın doğru biçimi hariç: o cevaptan sonra görünür).
    for (const item of view.items.slice(1)) {
      const key = env.store.keys.get(item.id)!;
      for (const secret of [key.model_answer_en, key.hint_tr, ...(key.accepted ?? [])]) {
        if (secret && secret.length > 6) expect(JSON.stringify(item)).not.toContain(secret);
      }
    }
  });

  it("hazırlanan oturumda etkinlik dönmez", async () => {
    const env = setup();
    const res = await nextSession(env.deps, actor);
    const view = await getSessionView(env.store, actor, res.sessionId);
    expect(view.session.status).toBe("generating");
    expect(view.items).toEqual([]);
  });

  it("geçersiz kimlik 404", async () => {
    const env = setup();
    expect(await codeOf(getSessionView(env.store, actor, "abc"))).toBe("not_found");
  });
});

describe("submitAttempt (POST /api/items/:id/attempt)", () => {
  it("yerel doğru cevap: `attempts` + `mastery`, hata yok, model çağrısı yok", async () => {
    const env = setup();
    const id = await openSession(env);
    const item = firstOfType(env, id, "gap_fill");
    const gradeCallsBefore = env.llm.gradeCalls;
    const res = await answer(env, item, true);
    expect(res).toMatchObject({ isCorrect: true, score: 1, correction: null });
    expect(res.feedbackShortTr).toBeTruthy();
    expect(env.store.attempts).toHaveLength(1);
    expect(env.store.attempts[0]).toMatchObject({ graded_by: "local", time_ms: 4200, hint_used: false, try_no: 1 });
    expect(env.store.errorEvents).toHaveLength(0);
    expect(env.llm.gradeCalls).toBe(gradeCallsBefore);
    const m = env.store.mastery.get(USER)!.find((r) => r.topic_id === item.topic_id && r.skill === "writing")!;
    expect(m).toMatchObject({ n: 1, correct: 1 });
    expect(m.next_review_at).toBeInstanceOf(Date);
  });

  it("yerel yanlış cevap: `error_events` kural/çeldirici koduyla, doğru biçim döner", async () => {
    const env = setup();
    const id = await openSession(env);
    const gap = firstOfType(env, id, "gap_fill");
    const res = await answer(env, gap, false);
    expect(res).toMatchObject({ isCorrect: false, score: 0, correction: "plays" });
    expect(env.store.errorEvents).toHaveLength(1);
    expect(env.store.errorEvents[0]).toMatchObject({
      attempt_id: res.attemptId,
      user_id: USER,
      topic_id: gap.topic_id,
      skill: "writing",
      activity_type: "gap_fill",
      mode: "controlled",
      l1_code: "L1.3SG_S",
      wrong_span: "play",
      review_sampled: false,
    });

    const mcq = firstOfType(env, id, "mcq_read");
    const res2 = await answer(env, mcq, false);
    expect(res2.feedbackShortTr).toBe("He ile fiile -s gelir."); // çeldiricinin kendi geri bildirimi
    expect(env.store.errorEvents[1]).toMatchObject({ source: "distractor", l1_code: "L1.3SG_S", skill: "reading" });
  });

  it("tek cevap ustalığı en çok 0,25 değiştirir; ipuçlu doğru cevap en çok 0,5 sayılır", async () => {
    const plain = setup();
    const hinted = setup();
    for (const env of [plain, hinted]) {
      const id = await openSession(env);
      const item = firstOfType(env, id, "gap_fill");
      if (env === hinted) await getHint(env.deps, actor, item.id);
      // İstemci bayrağı göndermese de sunucu ipucunun açıldığını bilir.
      await answer(env, item, true);
    }
    const score = (env: Env) => env.store.mastery.get(USER)!.find((r) => r.skill === "writing")!.score;
    const topicId = firstOfType(hinted, hinted.store.sessions[0].id, "gap_fill").topic_id;
    const prior = masteryFrom(topicId, "writing", []).score;
    expect(hinted.store.attempts[0].hint_used).toBe(true);
    expect(score(plain)).toBeGreaterThan(score(hinted));
    expect(Math.abs(score(plain) - prior)).toBeLessThanOrEqual(0.25 + 1e-9);
    // o = min(1, 0.5) → m + 0.25 × (0.5 − m)
    expect(score(hinted)).toBeCloseTo(prior + 0.25 * (0.5 - prior), 3);
  });

  it("yapay zekâ değerlendirmesi: hatalar `llm` kaynağıyla, yan kanıt ayrı konuya yarım ağırlıkla", async () => {
    const env = setup();
    env.deps.rng = () => 0.05; // < review_sample_rate
    env.llm.grade = GRADE_WRONG;
    const id = await openSession(env);
    const item = firstFree(env, id);
    const res = await answer(env, item, false);
    expect(res).toMatchObject({ isCorrect: false, score: 0.4, correction: "He plays football every day." });
    expect(env.llm.gradeCalls).toBe(1);
    expect(env.store.attempts[0]).toMatchObject({ graded_by: "llm", explanation_long_tr: GRADE_WRONG.explanation_long_tr });
    expect(env.store.errorEvents[0]).toMatchObject({
      source: "llm",
      l1_code: "L1.3SG_S",
      topic_id: TOPIC,
      wrong_span: "play",
      correction: "plays",
      review_sampled: true,
    });
    const rows = env.store.mastery.get(USER)!;
    const incidental = rows.find((r) => r.topic_id === "g.be_present");
    if (item.topic_id !== "g.be_present") {
      expect(incidental).toMatchObject({ n: 1, correct: 1, skill: "writing" });
      const before = masteryFrom("g.be_present", "writing", []).score;
      expect(incidental!.score).toBeCloseTo(before + 0.125 * (1 - before), 3);
    }
    expect(rows.find((r) => r.topic_id === item.topic_id)).toMatchObject({ n: 1, correct: 0 });
  });

  it("yalnızca büyük harf / noktalama farkı hata sayılmaz: cevap doğru kabul edilir (deneme, 16.11.2026)", async () => {
    const env = setup();
    // Modelin gerçek denemede döndürdüğü biçim: doğru çeviri, cümle başında küçük `she`.
    env.llm.grade = {
      ...GRADE_WRONG,
      score: 0.8,
      corrected: "He plays football every day.",
      errors: [{ span: "he", correction: "He", l1_code: "GEN.SPELLING", topic_id: TOPIC }],
      evidence: [],
    };
    const id = await openSession(env);
    const item = firstFree(env, id);
    const res = await submitAttempt(env.deps, actor, item.id, {
      response: { text: "he plays football every day" },
      timeMs: 1000,
      hintUsed: false,
    });
    expect(res).toMatchObject({ isCorrect: true, score: 1, correction: null });
    expect(env.store.errorEvents).toHaveLength(0);
    expect(env.store.mastery.get(USER)!.find((m) => m.topic_id === item.topic_id)).toMatchObject({ n: 1, correct: 1 });
  });

  it("kesme işareti farkı hata olayı yazmaz ama gerçek hatalar kalır", async () => {
    const env = setup();
    env.llm.grade = {
      ...GRADE_WRONG,
      errors: [
        { span: "I dont like rap", correction: "I don't like rap", l1_code: "GEN.SPELLING", topic_id: TOPIC },
        { span: "play", correction: "plays", l1_code: "L1.3SG_S", topic_id: TOPIC },
      ],
    };
    const id = await openSession(env);
    const res = await answer(env, firstFree(env, id), false);
    expect(res.isCorrect).toBe(false);
    expect(env.store.errorEvents.map((e) => e.l1_code)).toEqual(["L1.3SG_S"]);
  });

  describe("boşluk doldurmada anahtarda olmayan cevap (SPEC 4.6 boşluk hakemliği, rev. 4)", () => {
    const gapAnswer = (env: Env, item: ItemRow, text: string) =>
      submitAttempt(env.deps, actor, item.id, { response: { text }, timeMs: 1000, hintUsed: false });

    it("tamamlanan cümle doğruysa yanlış sayılmaz: ustalık ve hata yazılmaz, aranan cevap gösterilir", async () => {
      const env = setup();
      env.llm.grade = { ...GRADE_OK, evidence: [] };
      const id = await openSession(env);
      const item = firstOfType(env, id, "gap_fill");
      const res = await gapAnswer(env, item, "sometimes plays");
      expect(res).toMatchObject({ isCorrect: null, score: null, correction: "plays", errorNameTr: null });
      expect(res.feedbackShortTr).toContain(GAP_VALID_OTHER_TR);
      expect(env.store.errorEvents).toHaveLength(0);
      expect(env.store.mastery.get(USER) ?? []).toHaveLength(0);
      // Model tamamlanmış cümleyi görür; görev boşluklu cümledir.
      const call = env.llm.calls.at(-1)!;
      expect(call.schemaName).toBe("grade_result");
      expect(call.user).toContain("Activity: gap_fill");
      expect(call.user).toContain("<student_answer>She sometimes plays tennis on Sundays.</student_answer>");
      expect(call.user).toContain("Model answer: She plays tennis on Sundays.");
    });

    it("cümle yanlışsa hata etiketi modelden gelir, puan 0", async () => {
      const env = setup();
      env.llm.grade = GRADE_WRONG;
      const id = await openSession(env);
      const item = firstOfType(env, id, "gap_fill");
      const res = await gapAnswer(env, item, "playing");
      expect(res).toMatchObject({ isCorrect: false, score: 0, correction: "plays" });
      expect(res.errorNameTr).toBe(TAXONOMY_CODES.find((c) => c.code === "L1.3SG_S")!.name_tr);
      expect(env.store.errorEvents).toHaveLength(1);
      expect(env.store.errorEvents[0]).toMatchObject({ source: "llm", l1_code: "L1.3SG_S", activity_type: "gap_fill" });
      // Yan kanıt yazılmaz: yalnızca hedef konu.
      expect(env.store.mastery.get(USER)!.map((m) => m.topic_id)).toEqual([item.topic_id]);
    });

    it("bilinen yanlış (wrong_patterns) ve doğru cevap modele sorulmaz", async () => {
      const env = setup();
      const id = await openSession(env);
      const gaps = itemsOf(env, id).filter((i) => i.activity_type === "gap_fill");
      const before = env.llm.gradeCalls;
      const wrong = await gapAnswer(env, gaps[0], "play");
      expect(wrong).toMatchObject({ isCorrect: false, errorNameTr: TAXONOMY_CODES.find((c) => c.code === "L1.3SG_S")!.name_tr });
      if (gaps[1]) expect((await gapAnswer(env, gaps[1], "Plays ")).isCorrect).toBe(true);
      expect(env.llm.gradeCalls).toBe(before);
    });

    it("model yanıt veremezse yerel sonuç geçerli kalır", async () => {
      const env = setup();
      env.llm.grade = "refusal";
      const id = await openSession(env);
      const res = await gapAnswer(env, firstOfType(env, id, "gap_fill"), "to play");
      expect(res).toMatchObject({ isCorrect: false, score: 0, correction: "plays" });
      expect(env.store.errorEvents).toHaveLength(1);
      expect(env.store.errorEvents[0].source).toBe("rule");
    });
  });

  it("çeldirici hatasında hatanın adı döner; doğru cevapta dönmez", async () => {
    const env = setup();
    const id = await openSession(env);
    const mcqs = itemsOf(env, id).filter((i) => i.activity_type === "mcq_read");
    expect((await answer(env, mcqs[0], false)).errorNameTr).toBe(TAXONOMY_CODES.find((c) => c.code === "L1.3SG_S")!.name_tr);
    if (mcqs[1]) expect((await answer(env, mcqs[1], true)).errorNameTr).toBeNull();
  });

  it("örneklem oranı: rng ≥ oran ise `review_sampled = false`", async () => {
    const env = setup();
    env.llm.grade = GRADE_WRONG;
    const id = await openSession(env);
    await answer(env, firstFree(env, id), false);
    expect(env.store.errorEvents[0].review_sampled).toBe(false);
  });

  it.each([
    ["model reddetti", "refusal" as const],
    ["sağlayıcı hatası", new AiCallError("http_500", true)],
  ])("değerlendirilemeyen cevap (%s): mesaj döner, ustalık ve hata yazılmaz", async (_name, grade) => {
    const env = setup();
    env.llm.grade = grade;
    const id = await openSession(env);
    const item = firstFree(env, id);
    const res = await answer(env, item, true);
    expect(res).toMatchObject({ isCorrect: null, score: null, feedbackShortTr: GRADE_UNAVAILABLE_TR });
    expect(env.store.attempts).toHaveLength(1);
    expect(env.store.mastery.get(USER) ?? []).toHaveLength(0);
    expect(env.store.errorEvents).toHaveLength(0);
  });

  it("acil durdurma oturum ortasında açılırsa serbest cevap değerlendirilemez ama oturum kırılmaz", async () => {
    const env = setup();
    const id = await openSession(env);
    env.aiStore.settings.kill_switch = true;
    const res = await answer(env, firstFree(env, id), true);
    expect(res.isCorrect).toBeNull();
    expect(env.llm.gradeCalls).toBe(0);
    // Yerel etkinlik çalışmaya devam eder.
    expect((await answer(env, firstOfType(env, id, "gap_fill"), true)).isCorrect).toBe(true);
  });

  it("aynı etkinliğe ikinci gönderim yeni satır yazmaz, ilk sonucu döner", async () => {
    const env = setup();
    const id = await openSession(env);
    const item = firstOfType(env, id, "gap_fill");
    const first = await answer(env, item, false);
    const second = await answer(env, item, true);
    // Sonuç aynı; hata adı yalnızca ilk yanıtta hesaplanır.
    expect(second).toEqual({ ...first, errorNameTr: null });
    expect(env.store.attempts).toHaveLength(1);
    expect(env.store.mastery.get(USER)![0].n).toBe(1);
  });

  it("cevap biçimi türe uymuyorsa ya da gövde bozuksa 400", async () => {
    const env = setup();
    const id = await openSession(env);
    const gap = firstOfType(env, id, "gap_fill");
    const post = (body: unknown) => codeOf(submitAttempt(env.deps, actor, gap.id, body));
    expect(await post({ response: { choice: "plays" }, timeMs: 1, hintUsed: false })).toBe("invalid_input");
    expect(await post({ response: { text: "plays" }, timeMs: -1, hintUsed: false })).toBe("invalid_input");
    expect(await post({ response: { text: "x".repeat(1001) }, timeMs: 1, hintUsed: false })).toBe("invalid_input");
    expect(await post({ response: { text: "plays", key: 1 }, timeMs: 1, hintUsed: false })).toBe("invalid_input");
    expect(await post(null)).toBe("invalid_input");
    expect(env.store.attempts).toHaveLength(0);
  });

  it("başkasının etkinliği 404; açık olmayan oturumun etkinliği 409", async () => {
    const env = setup();
    const res = await nextSession(env.deps, actor);
    await res.background!();
    const item = itemsOf(env, res.sessionId)[0];
    const body = { response: responseFor(item, true), timeMs: 1, hintUsed: false };
    expect(await codeOf(submitAttempt(env.deps, actor, item.id, body))).toBe("session_not_active"); // henüz `ready`
    await startSession(env.deps, actor, res.sessionId);
    expect(await codeOf(submitAttempt(env.deps, { userId: OTHER }, item.id, body))).toBe("not_found");
    expect(await codeOf(getHint(env.deps, { userId: OTHER }, item.id))).toBe("not_found");
    await finishSession(env.deps, actor, res.sessionId, {});
    expect(await codeOf(submitAttempt(env.deps, actor, item.id, body))).toBe("session_not_active");
  });

  it("tekrar (`retest`) cevabı ≥ 48 saat önceki farklı türdeki odak etkinliğini kredilendirir", async () => {
    const env = setup();
    const id = await openSession(env);
    const retest = firstOfType(env, id, "gap_fill");
    retest.purpose = "retest";
    const focusId = uuid();
    env.store.items.push({
      ...retest,
      id: focusId,
      session_id: uuid(),
      position: 1,
      activity_type: "translate_tr_en",
      mode: "free",
      purpose: "focus",
      credited: false,
      created_at: new Date(env.store.clock.now.getTime() - 49 * HOUR),
    });
    await answer(env, retest, true);
    expect(env.store.items.find((i) => i.id === focusId)!.credited).toBe(true);
    expect(env.store.stats.get(USER)).toEqual([{ activity_type: "translate_tr_en", taught_n: 1, retained_n: 1 }]);
  });
});

describe("ipucu ve açıklama", () => {
  it("ipucu metnini döner ve `hint_open` olayını yazar", async () => {
    const env = setup();
    const id = await openSession(env);
    const item = itemsOf(env, id)[0];
    expect(await getHint(env.deps, actor, item.id)).toEqual({ hintTr: "Özne kim?" });
    expect(env.store.events.at(-1)).toMatchObject({ name: "hint_open", props: { item_id: item.id } });
  });

  it("yerel cevapta uzun açıklama anahtardan, yapay zekâ cevabında `attempts`'ten gelir; tıklama kaydedilir", async () => {
    const env = setup();
    env.llm.grade = GRADE_WRONG;
    const id = await openSession(env);
    const local = await answer(env, firstOfType(env, id, "gap_fill"), false);
    const llm = await answer(env, firstFree(env, id), false);
    expect(await getExplanation(env.deps, actor, local.attemptId)).toEqual({
      explanationLongTr: "Üçüncü tekil şahısta fiile -s eklenir.",
    });
    expect(await getExplanation(env.deps, actor, llm.attemptId)).toEqual({
      explanationLongTr: GRADE_WRONG.explanation_long_tr,
    });
    expect(env.store.attempts.every((a) => a.explain_opened)).toBe(true);
    expect(env.store.events.filter((e) => e.name === "explain_open")).toHaveLength(2);
    // Yeniden açmak olayı çoğaltmaz.
    await getExplanation(env.deps, actor, local.attemptId);
    expect(env.store.events.filter((e) => e.name === "explain_open")).toHaveLength(2);
    expect(await codeOf(getExplanation(env.deps, { userId: OTHER }, local.attemptId))).toBe("not_found");
  });

  it("`dismiss` (Kısa yeter) işareti geri alır", async () => {
    const env = setup();
    const id = await openSession(env);
    const res = await answer(env, firstOfType(env, id, "gap_fill"), false);
    await getExplanation(env.deps, actor, res.attemptId);
    await getExplanation(env.deps, actor, res.attemptId, "dismiss");
    expect(env.store.attempts[0].explain_opened).toBe(false);
  });

  it("uzun modda kendiliğinden gösterim (`auto`) işaretler ama `explain_open` olayı yazmaz; sonraki tıklama yazar", async () => {
    const env = setup();
    const id = await openSession(env);
    const res = await answer(env, firstOfType(env, id, "gap_fill"), false);
    const opens = () => env.store.events.filter((e) => e.name === "explain_open");
    await getExplanation(env.deps, actor, res.attemptId, "auto");
    expect(env.store.attempts[0].explain_opened).toBe(true);
    expect(opens()).toHaveLength(0);
    // "Kısa yeter" → kapandı; ardından "Daha fazla açıkla" gerçek bir tıklamadır.
    await getExplanation(env.deps, actor, res.attemptId, "dismiss");
    await getExplanation(env.deps, actor, res.attemptId, "click");
    expect(env.store.attempts[0].explain_opened).toBe(true);
    expect(opens()).toHaveLength(1);
  });
});

describe("finishSession (POST /api/sessions/:id/finish)", () => {
  it("özet: doğru sayısı, süre, konular; oturum `done`; puan ve not kaydedilir", async () => {
    const env = setup();
    const id = await openSession(env);
    const items = itemsOf(env, id);
    for (const [i, item] of items.entries()) {
      env.advance(60_000);
      await answer(env, item, i % 2 === 0);
    }
    const res = await finishSession(env.deps, actor, id, { rating: 4, comment: "  iyiydi " });
    const correct = env.store.attempts.filter((a) => a.is_correct).length;
    expect(res.summary).toMatchObject({ correct, answered: items.length, total: items.length, durationSec: items.length * 60 });
    expect(res.summary.topics.length).toBeGreaterThan(0);
    expect(res.summary.topics[0].titleTr).toBeTruthy();
    const s = env.store.sessions[0];
    expect(s).toMatchObject({ status: "done", rating: 4, comment: "iyiydi" });
    expect(s.finished_at).toEqual(env.store.clock.now);
  });

  it("bitişten sonra `background` sonraki oturumu `ready` yapar; günlük sınır ön üretimi engellemez", async () => {
    const env = setup();
    env.aiStore.settings.daily_session_limit = 1;
    const id = await openSession(env);
    const res = await finishSession(env.deps, actor, id, {});
    expect(res.background).toBeTypeOf("function");
    await res.background!();
    const next = env.store.sessions.find((s) => s.id !== id)!;
    expect(next.status).toBe("ready");
    expect(itemsOf(env, next.id).length).toBeGreaterThanOrEqual(8);
  });

  it("bitmiş oturumda yeniden çağrı: özet aynı, ikinci ön üretim yok, puan sonradan eklenir", async () => {
    const env = setup();
    const id = await openSession(env);
    await answer(env, itemsOf(env, id)[0], true);
    const first = await finishSession(env.deps, actor, id, {});
    env.advance(5 * 60_000);
    const again = await finishSession(env.deps, actor, id, { rating: 5 });
    expect(again.background).toBeUndefined();
    expect(again.summary).toEqual(first.summary);
    expect(env.store.sessions[0].rating).toBe(5);
  });

  it("puan ve not ayrı gönderilirse biri ötekini silmez", async () => {
    const env = setup();
    const id = await openSession(env);
    await finishSession(env.deps, actor, id, { comment: "güzeldi" });
    await finishSession(env.deps, actor, id, { rating: 3 });
    expect(env.store.sessions[0]).toMatchObject({ rating: 3, comment: "güzeldi" });
    await finishSession(env.deps, actor, id, { comment: "  " });
    expect(env.store.sessions[0]).toMatchObject({ rating: 3, comment: null });
  });

  it("ön üretimin ilk adımı hata verirse `after()` işi fırlatmaz", async () => {
    const env = setup();
    env.store.abandonReady = async () => {
      throw new Error("sessions.abandon: 08006");
    };
    await expect(prefetchNext(env.deps, USER)).resolves.toBeUndefined();
    expect(env.store.sessions).toHaveLength(0);
  });

  it("hazır bekleyen eski oturum ön üretimde `abandoned` olur", async () => {
    const env = setup();
    const a = await nextSession(env.deps, actor);
    await a.background!();
    await prefetchNext(env.deps, USER);
    expect(env.store.sessions.find((s) => s.id === a.sessionId)!.status).toBe("abandoned");
    expect(env.store.sessions.filter((s) => s.status === "ready")).toHaveLength(1);
  });

  it("yazma 5/6 + konuşma 1/4 birikmişken oturum biterse `skill_gap(speaking)` kartı kanıtıyla döner", async () => {
    const env = setup();
    const id = await openSession(env);
    const item = firstOfType(env, id, "gap_fill");
    // Konunun geçmişi: yazma oturmuş, konuşma zayıf (M4 fikstürü).
    env.store.mastery.set(USER, [
      masteryFrom(item.topic_id, "writing", [1, 1, 1, 1, 0, 1]),
      masteryFrom(item.topic_id, "speaking", [0, 0, 1, 0], "free"),
    ]);
    await answer(env, item, true);
    const res = await finishSession(env.deps, actor, id, {});
    expect(res.diagnosis).toBeDefined();
    expect(res.diagnosis).toMatchObject({ status: "active", userFeedback: null });
    expect(res.diagnosis!.messageTr).toContain("konuşma");
    expect(res.diagnosis!.evidence).toEqual(
      expect.arrayContaining([
        { skill: "konuşma", correct: 1, n: 4 },
        { skill: "yazma", correct: 6, n: 7 },
      ]),
    );
    const stored = env.store.diagnoses[0];
    expect(stored).toMatchObject({ kind: "skill_gap", weak_skill: "speaking", status: "active" });
    expect(stored.confidence).toBeGreaterThanOrEqual(0.6);
    expect(stored.shown_at).toEqual(env.store.clock.now);

    // Sayfa yenilenince aynı kart; geri bildirim kaydedilir.
    const again = await finishSession(env.deps, actor, id, {});
    expect(again.diagnosis?.id).toBe(res.diagnosis!.id);
    await submitDiagnosisFeedback(env.deps, actor, res.diagnosis!.id, { feedback: "disagree" });
    expect(stored.user_feedback).toBe("disagree");
    expect(env.store.events.at(-1)).toMatchObject({ name: "diag_feedback" });
    expect(await codeOf(submitDiagnosisFeedback(env.deps, { userId: OTHER }, res.diagnosis!.id, { feedback: "agree" }))).toBe("not_found");
    expect(await codeOf(submitDiagnosisFeedback(env.deps, actor, res.diagnosis!.id, { feedback: "maybe" }))).toBe("invalid_input");
  });

  it("güveni düşük ya da kanıtı az konuda teşhis kartı dönmez", async () => {
    const env = setup();
    const id = await openSession(env);
    await answer(env, itemsOf(env, id)[0], false);
    const res = await finishSession(env.deps, actor, id, {});
    expect(res.diagnosis).toBeUndefined();
    expect(env.store.diagnoses).toHaveLength(0);
  });

  it("açıklama modu: yanlışların ≥ %50'sinde açıklama açıldıysa `long`; sonra < %20 ise `short`", async () => {
    const env = setup();
    const id = await openSession(env);
    const gaps = itemsOf(env, id).filter((i) => i.activity_type === "gap_fill" || i.activity_type === "mcq_read").slice(0, 2);
    for (const item of gaps) {
      const res = await answer(env, item, false);
      await getExplanation(env.deps, actor, res.attemptId);
    }
    const fin = await finishSession(env.deps, actor, id, {});
    expect(env.store.learners.get(USER)!.explain_mode).toBe("long");

    // İki oturum boyunca yanlışlarda açıklama kapatılırsa (Kısa yeter) kısa moda döner.
    await fin.background!();
    for (let n = 0; n < 2; n++) {
      env.advance(25 * HOUR);
      const next = env.store.sessions.find((s) => s.status === "ready")!;
      await startSession(env.deps, actor, next.id);
      for (const item of itemsOf(env, next.id).slice(0, 3)) await answer(env, item, false);
      const f = await finishSession(env.deps, actor, next.id, {});
      await f.background!();
    }
    expect(env.store.learners.get(USER)!.explain_mode).toBe("short");
  });

  it("açık olmayan oturum bitirilemez; bozuk puan 400", async () => {
    const env = setup();
    const res = await nextSession(env.deps, actor);
    await res.background!();
    expect(await codeOf(finishSession(env.deps, actor, res.sessionId, {}))).toBe("session_not_active");
    await startSession(env.deps, actor, res.sessionId);
    expect(await codeOf(finishSession(env.deps, actor, res.sessionId, { rating: 6 }))).toBe("invalid_input");
    expect(await codeOf(finishSession(env.deps, actor, res.sessionId, { comment: "x".repeat(501) }))).toBe("invalid_input");
  });
});

describe("patchProfile ve recordEvent", () => {
  it("yalnızca üç alan güncellenir; fazladan alan ve < 2 ilgi alanı reddedilir", async () => {
    const env = setup();
    const now = new Date(env.store.clock.now);
    await patchProfile(env.store, actor, { displayName: " Ada ", interests: ["gaming", "food"], explainMode: "long" }, now);
    expect(env.store.learners.get(USER)).toMatchObject({ display_name: "Ada", interests: ["gaming", "food"], explain_mode: "long" });
    const patch = (body: unknown) => codeOf(patchProfile(env.store, actor, body, now));
    expect(await patch({ role: "admin" })).toBe("invalid_input");
    expect(await patch({ displayName: "Ada", onboardingStep: "done" })).toBe("invalid_input");
    expect(await patch({ interests: ["gaming"] })).toBe("invalid_input");
    expect(await patch({ interests: ["gaming", "chess"] })).toBe("invalid_input");
    expect(await patch({})).toBe("invalid_input");
  });

  it("olay adı listeden olmalı; `props` kısa değerler ve ≤ 1 KB", async () => {
    const env = setup();
    expect(await recordEvent(env.store, actor, { name: "app_open" })).toEqual({ ok: true });
    expect(await recordEvent(env.store, actor, { name: "session_resume", props: { session_id: "abc", n: 3 } })).toEqual({ ok: true });
    expect(env.store.events).toHaveLength(2);
    const post = (body: unknown) => codeOf(recordEvent(env.store, actor, body));
    expect(await post({ name: "custom" })).toBe("invalid_input");
    expect(await post({ name: "app_open", props: { text: "x".repeat(65) } })).toBe("invalid_input");
    expect(await post({ name: "app_open", props: { nested: { a: 1 } } })).toBe("invalid_input");
    const big = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, "v".repeat(60)]));
    expect(await post({ name: "app_open", props: big })).toBe("invalid_input");
    expect(env.store.events).toHaveLength(2);
  });
});

/**
 * Plan tohuma göre her türü içermeyebilir: istenen tür yoksa aynı beceriden (yoksa ilk) bir etkinliği
 * fikstürdeki geçerli etkinlikle değiştirir (kayıt yolu `splitGeneratedItem`, anahtar ayrı).
 */
const ensured = new WeakMap<Env, Set<string>>();
function ensureType(env: Env, sessionId: string, type: ActivityType) {
  const items = itemsOf(env, sessionId);
  const found = items.find((i) => i.activity_type === type);
  if (found) {
    if (!ensured.has(env)) ensured.set(env, new Set());
    ensured.get(env)!.add(found.id);
    return found;
  }
  const used = ensured.get(env) ?? new Set<string>();
  ensured.set(env, used);
  const free = items.filter((i) => !used.has(i.id) && !env.store.attempts.some((a) => a.item_id === i.id));
  const target = free.find((i) => i.skill === ACTIVITY_TYPE_INFO[type].skill) ?? free[0];
  used.add(target.id);
  const slot = { position: target.position, topic_id: target.topic_id, skill: ACTIVITY_TYPE_INFO[type].skill,
    activity_type: type, mode: ACTIVITY_TYPE_INFO[type].mode, purpose: target.purpose, l1_target: null,
    interest: null, reason: "test" } as const;
  const { key, ...row } = splitGeneratedItem(validItem(target.position, type, target.topic_id), slot, () => 0.5);
  Object.assign(target, row);
  env.store.keys.set(target.id, key);
  return target;
}

describe("M7 dinleme: GET /api/items/:id/audio ve dikte", () => {
  it("yanıtta yalnızca imzalı URL var; seslendirilen metin ve anahtar yok", async () => {
    const env = setup();
    const id = await openSession(env);
    for (const type of ["listen_choose", "dictation"]) {
      const item = ensureType(env, id, type as ActivityType);
      expect(item.payload.text_en).toBeUndefined(); // metin item_keys'te
      const res = await getItemAudio(env.deps, actor, item.id);
      expect(Object.keys(res)).toEqual(["url"]);
      const json = JSON.stringify(res);
      const key = env.store.keys.get(item.id)!;
      expect(json).not.toContain(key.text_en!);
      expect(json).not.toMatch(/plays|football/i);
    }
    // Seslendirilen metin anahtardan; A1 öğrencisinde hız 0,9.
    expect(env.speech.calls.every((c) => c.rate === 0.9 && c.text.length > 0)).toBe(true);
  });

  it("aynı etkinlik yeniden açılınca seslendirme tekrar çağrılmaz", async () => {
    const env = setup();
    const id = await openSession(env);
    const item = ensureType(env, id, "dictation");
    await getItemAudio(env.deps, actor, item.id);
    await getItemAudio(env.deps, actor, item.id);
    expect(env.speech.calls).toHaveLength(1);
    expect(env.aiStore.rows.filter((r) => r.purpose === "tts")).toHaveLength(1);
  });

  it("A2 öğrencisinde hız 1,0", async () => {
    const env = setup();
    env.store.learners.get(USER)!.level_est = "A2";
    const id = await openSession(env);
    await getItemAudio(env.deps, actor, ensureType(env, id, "dictation").id);
    expect(env.speech.calls[0].rate).toBe(1);
  });

  it("dinleme dışı tür, başkasının etkinliği ve kapalı oturum", async () => {
    const env = setup();
    const id = await openSession(env);
    expect(await codeOf(getItemAudio(env.deps, actor, ensureType(env, id, "mcq_read").id))).toBe("not_found");
    expect(await codeOf(getItemAudio(env.deps, { userId: OTHER }, ensureType(env, id, "dictation").id))).toBe("not_found");
    await finishSession(env.deps, actor, id, {});
    expect(await codeOf(getItemAudio(env.deps, actor, ensureType(env, id, "dictation").id))).toBe("session_not_active");
  });

  it("M7 Bitti testi 4: sahte 402 → açık oturum kırılmaz, sonraki oturum dinlemesiz planlanır", async () => {
    const env = setup();
    const id = await openSession(env);
    env.speech.failStatus = 402;
    const listening = itemsOf(env, id).filter((i) => i.skill === "listening");
    expect(listening.length).toBeGreaterThan(0);
    expect(await codeOf(getItemAudio(env.deps, actor, listening[0].id))).toBe("tts_unavailable");
    // Açık oturum devam eder: diğer etkinlikler cevaplanır, dinleme atlanır, bitiş çalışır.
    for (const item of itemsOf(env, id)) if (item.skill !== "listening") await answer(env, item, true);
    const finished = await finishSession(env.deps, actor, id, {});
    expect(finished.summary.answered).toBe(itemsOf(env, id).length - listening.length);
    expect(env.store.attempts.some((a) => listening.some((l) => l.id === a.item_id))).toBe(false);
    // Sonraki oturum (ön üretim) dinlemesiz; pron konuları da yok.
    await finished.background!();
    const next = env.store.sessions.find((s) => s.id !== id && s.status === "ready")!;
    const nextItems = itemsOf(env, next.id);
    expect(nextItems.length).toBeGreaterThanOrEqual(8);
    expect(nextItems.some((i) => i.skill === "listening")).toBe(false);
  });

  it("M7 Bitti testi 3: dikte puanı M4 kuralıyla aynı (1/5 kelime hata → 0,80, yanlış)", async () => {
    const env = setup();
    const id = await openSession(env);
    const item = ensureType(env, id, "dictation");
    const res = await submitAttempt(env.deps, actor, item.id, {
      response: { text: "She play football every day" },
      timeMs: 1,
      hintUsed: false,
    });
    expect(res).toMatchObject({ isCorrect: false, score: 0.8, correction: "She plays football every day." });
    const ok = await submitAttempt(env.deps, actor, ensureType(env, id, "listen_choose").id, {
      response: { choice: "He plays football." },
      timeMs: 1,
      hintUsed: false,
    });
    expect(ok.isCorrect).toBe(true);
  });
});

describe("M8 konuşma: POST /api/items/:id/speech", () => {
  const speak = (env: Env, itemId: string, tryNo: number, audio = wavOf(3)) =>
    submitSpeech(env.deps, actor, itemId, { audio, timeMs: "5000", tryNo: String(tryNo) });

  it("iki adım: transkript → değerlendirme; transkript yanıtta ve `attempts.response`'ta, ses hiçbir yere yazılmaz", async () => {
    const env = setup();
    const id = await openSession(env);
    const item = ensureType(env, id, "speak_answer");
    env.stt.text = "My friend play football on weekends.";
    env.llm.grade = GRADE_WRONG;
    const res = await speak(env, item.id, 1);
    expect(res).toMatchObject({
      transcript: "My friend play football on weekends.",
      isCorrect: false,
      tryNo: 1,
      canRerecord: true,
      correction: GRADE_WRONG.corrected,
    });
    expect(env.stt.calls).toHaveLength(1);
    const attempt = env.store.attempts.find((a) => a.item_id === item.id)!;
    expect(attempt).toMatchObject({ try_no: 1, graded_by: "llm", response: { transcript: res.transcript }, time_ms: 5000 });
    expect(env.store.errorEvents.filter((e) => e.activity_type === "speak_answer")).toHaveLength(1);
    // Sırayla transcribe → grade satırları; ses Storage'a yazılmadı.
    const purposes = env.aiStore.rows.map((r) => r.purpose).filter((p) => p !== "generate" && p !== "tts");
    expect(purposes).toEqual(["transcribe", "grade"]);
    expect(env.tts.objects.size).toBe(0);
  });

  it("karar 18: 1. deneme ustalığa hemen işlenmez; yeniden kayıt gelirse 2. deneme işlenir", async () => {
    const env = setup();
    const id = await openSession(env);
    const item = ensureType(env, id, "speak_answer");
    const speaking = () => (env.store.mastery.get(USER) ?? []).find((m) => m.topic_id === item.topic_id && m.skill === "speaking");
    env.llm.grade = GRADE_WRONG;
    await speak(env, item.id, 1);
    expect(speaking()).toBeUndefined();
    env.llm.grade = GRADE_OK;
    const second = await speak(env, item.id, 2);
    expect(second).toMatchObject({ isCorrect: true, tryNo: 2, canRerecord: false });
    expect(speaking()).toMatchObject({ n: 1, correct: 1 });
    expect(env.store.events.some((e) => e.name === "rerecord")).toBe(true);
    // Üçüncü deneme yok; 2. deneme tekrar gönderilirse ilk sonuç döner.
    expect(await codeOf(speak(env, item.id, 3))).toBe("invalid_input");
    expect((await speak(env, item.id, 2)).attemptId).toBe(second.attemptId);
    expect(env.stt.calls).toHaveLength(2);
    // Özet etkinliği bir kez ve son denemesiyle sayar; finish 1. denemeyi yeniden işlemez.
    const fin = await finishSession(env.deps, actor, id, {});
    expect(fin.summary.answered).toBe(1);
    expect(fin.summary.correct).toBe(1);
    expect(speaking()).toMatchObject({ n: 1, correct: 1 });
  });

  it("karar 18: yeniden kaydedilmeyen 1. deneme `finish`'te işlenir", async () => {
    const env = setup();
    const id = await openSession(env);
    const item = ensureType(env, id, "speak_answer");
    env.llm.grade = GRADE_OK;
    await speak(env, item.id, 1);
    await finishSession(env.deps, actor, id, {});
    const m = (env.store.mastery.get(USER) ?? []).find((r) => r.topic_id === item.topic_id && r.skill === "speaking");
    expect(m).toMatchObject({ n: 1, correct: 1 });
  });

  it("anlaşılmayan kayıt: değerlendirme çağrısı yok, `is_correct = null`, yeniden kayıt hakkı", async () => {
    const env = setup();
    const id = await openSession(env);
    const item = ensureType(env, id, "speak_answer");
    env.stt.text = "Um.";
    const grades = env.llm.gradeCalls;
    const res = await speak(env, item.id, 1);
    expect(res).toMatchObject({ isCorrect: null, score: null, feedbackShortTr: UNCLEAR_TR, canRerecord: true });
    expect(env.llm.gradeCalls).toBe(grades);
  });

  it("transkript yapılamazsa 503, deneme yazılmaz, hak tüketilmez", async () => {
    const env = setup();
    const id = await openSession(env);
    const item = ensureType(env, id, "speak_answer");
    env.stt.fail = new AiCallError("http_500", true);
    expect(await codeOf(speak(env, item.id, 1))).toBe("transcribe_unavailable");
    expect(env.store.attempts.some((a) => a.item_id === item.id)).toBe(false);
    env.stt.fail = null;
    expect((await speak(env, item.id, 1)).tryNo).toBe(1);
  });

  it("geçersiz ses: WAV değil, 48 kHz, 45 sn'den uzun, 2 MB'tan büyük; 1. deneme olmadan 2. deneme; yanlış tür", async () => {
    const env = setup();
    const id = await openSession(env);
    const item = ensureType(env, id, "speak_answer");
    expect(await codeOf(speak(env, item.id, 1, new Uint8Array(1000)))).toBe("invalid_input");
    expect(await codeOf(speak(env, item.id, 1, wavOf(3, 48_000)))).toBe("invalid_input");
    expect(await codeOf(speak(env, item.id, 1, wavOf(46)))).toBe("invalid_input");
    expect(await codeOf(speak(env, item.id, 1, new Uint8Array(2 * 1024 * 1024 + 1)))).toBe("invalid_input");
    expect(await codeOf(submitSpeech(env.deps, actor, item.id, { audio: null, timeMs: "1", tryNo: "1" }))).toBe("invalid_input");
    expect(await codeOf(speak(env, item.id, 2))).toBe("invalid_input");
    expect(await codeOf(speak(env, ensureType(env, id, "mcq_read").id, 1))).toBe("invalid_input");
    expect(env.stt.calls).toHaveLength(0);
    // Konuşma etkinliği metin uç noktasından cevaplanamaz.
    expect(
      await codeOf(submitAttempt(env.deps, actor, item.id, { response: { text: "x" }, timeMs: 1, hintUsed: false })),
    ).toBe("invalid_input");
  });

  it("teşhis her etkinliğin son denemesini sayar (iki deneme çift kanıt değildir)", async () => {
    const env = setup();
    const id = await openSession(env);
    const item = ensureType(env, id, "speak_answer");
    env.llm.grade = GRADE_WRONG;
    await speak(env, item.id, 1);
    env.llm.grade = GRADE_OK;
    await speak(env, item.id, 2);
    const rows = (await env.store.listTopicAttempts(USER, [item.topic_id])).filter((a) => a.activity_type === "speak_answer");
    expect(rows).toEqual([{ topic_id: item.topic_id, skill: "speaking", activity_type: "speak_answer", is_correct: true }]);
  });
});
