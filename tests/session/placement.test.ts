// M9: yerleştirme testi (SPEC 6 `POST /api/placement`, Ek C; PRD F2; PLAN karar 22, 31–33).
import { describe, expect, it } from "vitest";
import { buildPlacementItems, estimateLevel, PLACEMENT_BANK, weakPoints } from "@/lib/session/placement";
import {
  finishSession,
  getSessionView,
  startPlacement,
  startSession,
  submitAttempt,
  submitSpeech,
} from "@/lib/session/service";
import type { ItemRow } from "@/lib/session/types";
import { wavOf } from "../media/fakes";
import { GRADE_OK, setup, USER } from "./fake-store";
import { TOPICS } from "../engine/fixtures";

const actor = { userId: USER };

describe("buildPlacementItems", () => {
  it("14 soru, hepsi `placement` amaçlı, genel içerik; dinleme metni anahtarda", () => {
    const rows = buildPlacementItems({ ttsAvailable: true, rng: () => 0.3 });
    expect(rows).toHaveLength(14);
    expect(PLACEMENT_BANK).toHaveLength(14);
    expect(rows.every((r) => r.purpose === "placement" && r.interest === null)).toBe(true);
    expect(rows.map((r) => r.position)).toEqual([...Array(14)].map((_, i) => i + 1));
    for (const r of rows.filter((r) => r.activity_type === "listen_choose")) {
      expect(r.payload.text_en).toBeUndefined();
      expect(r.key.text_en).toBe(r.key.correct);
      expect([...r.payload.options!].sort()).toEqual(
        [...PLACEMENT_BANK.find((b) => b.topic_id === r.topic_id)!.payload.options!].sort(),
      );
    }
    // Dört beceri de var.
    expect(new Set(rows.map((r) => r.skill))).toEqual(new Set(["reading", "writing", "listening", "speaking"]));
  });

  it("seslendirme kullanılamıyorsa dinleme soruları çıkar, sıralar ardışık kalır", () => {
    const rows = buildPlacementItems({ ttsAvailable: false, rng: () => 0.3 });
    expect(rows).toHaveLength(12);
    expect(rows.some((r) => r.skill === "listening")).toBe(false);
    expect(rows.map((r) => r.position)).toEqual([...Array(12)].map((_, i) => i + 1));
  });

  it("doğru şık her zaman ilk sırada değil", () => {
    const firsts = new Set<boolean>();
    for (let seed = 0; seed < 20; seed++) {
      let x = seed / 20;
      const rng = () => (x = (x * 9301 + 0.49297) % 1);
      const mcq = buildPlacementItems({ ttsAvailable: true, rng }).find((r) => r.activity_type === "mcq_read")!;
      firsts.add(mcq.payload.options![0] === mcq.key.correct);
    }
    expect(firsts).toEqual(new Set([true, false]));
  });
});

describe("estimateLevel / weakPoints", () => {
  it("A2 beyanı ya da ≥ %60 doğru → A2", () => {
    expect(estimateLevel("A2", 0, 14)).toBe("A2");
    expect(estimateLevel("A1", 9, 14)).toBe("A2");
    expect(estimateLevel("unsure", 8, 14)).toBe("A1");
    expect(estimateLevel("A1", 0, 0)).toBe("A1");
  });

  it("en düşük ustalıklı üç konu; satırı olmayan konu başlangıç değeriyle", () => {
    const ids = ["g.be_present", "g.present_simple_3sg", "g.articles_a_an", "g.plurals"];
    const res = weakPoints(
      ids,
      [
        { topic_id: "g.be_present", score: 0.8 },
        { topic_id: "g.present_simple_3sg", score: 0.1 },
        { topic_id: "g.plurals", score: 0.6 },
      ],
      TOPICS,
    );
    expect(res).toHaveLength(3);
    expect(res[0].topicId).toBe("g.present_simple_3sg");
    expect(res.map((r) => r.topicId)).not.toContain("g.be_present");
    expect(res[0].titleTr.length).toBeGreaterThan(0);
  });
});

describe("yerleştirme oturumu (servis)", () => {
  const answer = async (env: ReturnType<typeof setup>, item: ItemRow, correct: boolean) => {
    if (item.activity_type === "speak_answer") {
      env.llm.grade = GRADE_OK;
      return submitSpeech(env.deps, actor, item.id, { audio: wavOf(3), timeMs: 20_000, tryNo: 1 });
    }
    const key = env.store.keys.get(item.id)!;
    const right = key.correct ?? key.accepted![0];
    const response =
      item.activity_type === "word_order"
        ? { order: correct ? right.split(" ") : [...right.split(" ")].reverse() }
        : item.activity_type === "mcq_read" || item.activity_type === "listen_choose"
          ? { choice: correct ? right : key.distractors![0].option }
          : { text: correct ? right : (key.wrong_patterns?.[0]?.answer ?? "zzz") };
    return submitAttempt(env.deps, actor, item.id, { response, timeMs: 3000, hintUsed: false });
  };

  it("uçtan uca: dil modeli yalnızca konuşmada, seviye ve zayıf noktalar, ilk günlük oturum hazırlanır", async () => {
    const env = setup();
    const { sessionId } = await startPlacement(env.deps, actor);
    // Çift dokunuş aynı oturumu döner.
    expect((await startPlacement(env.deps, actor)).sessionId).toBe(sessionId);
    expect(env.llm.generateCalls).toBe(0);

    const view = await getSessionView(env.store, actor, sessionId);
    expect(view.session.kind).toBe("placement");
    expect(view.items).toHaveLength(14);
    // Günlük sınır yerleştirmeyi engellemez.
    await startSession(env.deps, actor, sessionId);

    const items = env.store.items.filter((i) => i.session_id === sessionId).sort((a, b) => a.position - b.position);
    // Boşluk doldurmada anahtarda olmayan yanlış cevap hakemliğe gitmez.
    for (const [i, item] of items.entries()) await answer(env, item, i % 2 === 0);
    expect(env.llm.gradeCalls).toBe(1);
    const grades = env.aiStore.rows.filter((r) => r.purpose !== "tts");
    expect(grades.filter((r) => r.purpose === "placement")).toHaveLength(1);
    expect(grades.filter((r) => r.purpose === "grade")).toHaveLength(0);

    const res = await finishSession(env.deps, actor, sessionId, {});
    expect(res.placement?.weakPoints).toHaveLength(3);
    expect(res.placement?.levelEst).toBe("A1"); // 8/14 < %60
    expect(env.store.onboarding.get(USER)).toBe("done");
    expect(res.background).toBeDefined();
    await res.background!();
    expect(env.store.sessions.some((s) => s.kind === "daily" && s.status === "ready")).toBe(true);
    // Ustalık tohumlandı.
    expect((await env.store.listMastery(USER)).length).toBeGreaterThan(5);

    // Özet yeniden açılınca adım yeniden kapanmaz, ikinci üretim başlamaz.
    const again = await finishSession(env.deps, actor, sessionId, {});
    expect(again.background).toBeUndefined();
    expect(again.placement?.weakPoints).toHaveLength(3);
  });
});
