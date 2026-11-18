// M9: ilerleme ekranı (PRD F9, SPEC 4.1).
import { describe, expect, it } from "vitest";
import type { Skill } from "@/lib/content/activity-types";
import { TOPICS } from "@/lib/content/taxonomy";
import { emptyState, observe } from "@/lib/engine/learner-model";
import { buildProgress, istanbulWeek, masteryLevel } from "@/lib/progress/progress";
import { modelContextFor } from "@/lib/session/learner";
import { TOPICS as ENGINE_TOPICS } from "../engine/fixtures";

const CTX = modelContextFor(ENGINE_TOPICS);

function stateWith(answers: [string, Skill, number[]][]) {
  const state = emptyState(CTX, { mu: -0.5, sd: 1.6 });
  let i = 0;
  for (const [topicId, skill, list] of answers) {
    for (const score of list) {
      const mode = skill === "reading" || skill === "listening" ? "recognition" : skill === "speaking" ? "free" : "controlled";
      observe(CTX, state, { topic_id: topicId, skill, mode, score, weight: 1, at: new Date(Date.UTC(2026, 11, 1, 9, i++)) });
    }
  }
  return state;
}

describe("masteryLevel (modelin etiketi → ızgara)", () => {
  it("needs_work zayıf; diğerleri aynı", () => {
    expect(masteryLevel("needs_work")).toBe("weak");
    expect(masteryLevel("solid")).toBe("solid");
    expect(masteryLevel("developing")).toBe("developing");
    expect(masteryLevel("unknown")).toBe("unknown");
  });
});

describe("buildProgress", () => {
  const p = buildProgress({
    levelEst: "A1",
    model: {
      ctx: CTX,
      state: stateWith([
        ["g.be_present", "writing", [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]],
        ["g.be_present", "reading", [1, 1, 1, 1]],
      ]),
    },
    weekSessions: 3,
    errorCodes: ["L1.3SG_S", "L1.3SG_S", "GEN.OTHER", "GEN.OTHER", "GEN.OTHER", "L1.BE_OMIT", "L1.ART_OMIT", "L1.ART_OMIT", "L1.HE_SHE"],
    diagnoses: [],
  });

  it("A1 öğrencide yalnızca A1 konular (ölçme konuları yok); kanıtlı hücreler etiketli", () => {
    expect(p.grid.every((r) => r.level === "A1")).toBe(true);
    expect(p.grid.length).toBe(TOPICS.filter((t) => t.active && t.level === "A1" && t.kind !== "measure").length);
    const be = p.grid.find((r) => r.topicId === "g.be_present")!;
    expect(be.cells.writing).toEqual({ level: "solid", predicted: false });
    const weak = buildProgress({
      levelEst: "A1",
      model: { ctx: CTX, state: stateWith([["g.plurals", "writing", [0, 0, 0, 0, 0]]]) },
      weekSessions: 0,
      errorCodes: [],
      diagnoses: [],
    });
    expect(weak.grid.find((r) => r.topicId === "g.plurals")!.cells.writing).toEqual({ level: "weak", predicted: false });
    // Doğrudan kanıtı olan hücre "bilinmiyor" görünmez.
    const mixed = buildProgress({
      levelEst: "A1",
      model: { ctx: CTX, state: stateWith([["g.plurals", "writing", [1, 1]]]) },
      weekSessions: 0,
      errorCodes: [],
      diagnoses: [],
    });
    expect(mixed.grid.find((r) => r.topicId === "g.plurals")!.cells.writing!.level).toBe("developing");
  });

  it("kanıt yoksa hüküm yok: hiç sorulmamış ve belirsiz hücre bilinmiyor", () => {
    const empty = buildProgress({ levelEst: "A1", model: null, weekSessions: 0, errorCodes: [], diagnoses: [] });
    expect(empty.grid.every((r) => Object.values(r.cells).every((c) => c === null || (c.level === "unknown" && !c.predicted)))).toBe(true);
    const fresh = buildProgress({ levelEst: "A1", model: { ctx: CTX, state: emptyState(CTX) }, weekSessions: 0, errorCodes: [], diagnoses: [] });
    expect(fresh.grid.every((r) => Object.values(r.cells).every((c) => c === null || c.level === "unknown"))).toBe(true);
  });

  it("doğrudan cevabı olmayan ama tahmin edilen hücre `predicted`", () => {
    const strong = stateWith(
      ENGINE_TOPICS.filter((t) => t.kind === "grammar" && t.level === "A1" && t.id !== "g.can").flatMap(
        (t) => [[t.id, "writing", [1, 1, 1, 1]], [t.id, "reading", [1, 1, 1]]] as [string, Skill, number[]][],
      ),
    );
    const res = buildProgress({ levelEst: "A1", model: { ctx: CTX, state: strong }, weekSessions: 0, errorCodes: [], diagnoses: [] });
    const can = res.grid.find((r) => r.topicId === "g.can")!.cells.writing!;
    expect(can.predicted).toBe(can.level !== "unknown");
    expect(res.grid.some((r) => Object.values(r.cells).some((c) => c?.predicted))).toBe(true);
  });

  it("sesletim konuları yalnızca dinlemede", () => {
    const pron = p.grid.find((r) => r.kind === "pron")!;
    expect(pron.cells.listening?.level).toBe("unknown");
    expect(pron.cells.reading).toBeNull();
  });

  it("en sık 3 hata Türkçe adıyla, GEN.OTHER hariç", () => {
    expect(p.topErrors.map((e) => e.code)).toEqual(["L1.3SG_S", "L1.ART_OMIT", "L1.BE_OMIT"]);
    expect(p.topErrors[0].count).toBe(2);
    expect(p.topErrors[0].nameTr).not.toBe("L1.3SG_S");
    expect(p.weekSessions).toBe(3);
  });

  it("A2 öğrencide A2 konular da var", () => {
    const a2 = buildProgress({ levelEst: "A2", model: null, weekSessions: 0, errorCodes: [], diagnoses: [] });
    expect(a2.grid.some((r) => r.level === "A2")).toBe(true);
  });
});

describe("istanbulWeek", () => {
  it("pazartesi başlar, İstanbul saatine göre", () => {
    // Pazar 23:30 İstanbul = Pazar 20:30 UTC → hafta önceki pazartesi.
    expect(istanbulWeek(new Date("2026-12-20T20:30:00Z")).date).toBe("2026-12-14");
    // Pazartesi 00:30 İstanbul = Pazar 21:30 UTC → yeni hafta.
    const w = istanbulWeek(new Date("2026-12-20T21:30:00Z"));
    expect(w.date).toBe("2026-12-21");
    expect(w.start.toISOString()).toBe("2026-12-20T21:00:00.000Z");
  });
});
