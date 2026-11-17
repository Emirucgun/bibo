// M9: ilerleme ekranı (PRD F9, SPEC 4.1).
import { describe, expect, it } from "vitest";
import { buildProgress, istanbulWeek, masteryLevel } from "@/lib/progress/progress";
import { TOPICS } from "@/lib/content/taxonomy";

describe("masteryLevel (dört renk seviyesi)", () => {
  it("n = 0 bilinmiyor, < 0.45 zayıf, 0.45–0.7 gelişiyor, ≥ 0.7 sağlam", () => {
    expect(masteryLevel(0.9, 0)).toBe("unknown");
    expect(masteryLevel(null, 3)).toBe("unknown");
    expect(masteryLevel(0.44, 1)).toBe("weak");
    expect(masteryLevel(0.45, 1)).toBe("developing");
    expect(masteryLevel(0.69, 1)).toBe("developing");
    expect(masteryLevel(0.7, 1)).toBe("solid");
  });
});

describe("buildProgress", () => {
  const p = buildProgress({
    levelEst: "A1",
    mastery: [
      { topic_id: "g.be_present", skill: "writing", score: 0.8, n: 4 },
      { topic_id: "g.be_present", skill: "speaking", score: 0.3, n: 2 },
      { topic_id: "g.plurals", skill: "reading", score: 0.5, n: 1 },
    ],
    weekSessions: 3,
    errorCodes: ["L1.3SG_S", "L1.3SG_S", "GEN.OTHER", "GEN.OTHER", "GEN.OTHER", "L1.BE_OMIT", "L1.ART_OMIT", "L1.ART_OMIT", "L1.HE_SHE"],
    diagnoses: [],
  });

  it("A1 öğrencide yalnızca A1 konular; ızgara hücreleri doğru seviyede", () => {
    expect(p.grid.every((r) => r.level === "A1")).toBe(true);
    expect(p.grid.length).toBe(TOPICS.filter((t) => t.active && t.level === "A1").length);
    const be = p.grid.find((r) => r.topicId === "g.be_present")!;
    expect(be.cells).toEqual({ reading: "unknown", listening: "unknown", writing: "solid", speaking: "weak" });
    expect(p.grid.find((r) => r.topicId === "g.plurals")!.cells.reading).toBe("developing");
  });

  it("sesletim konuları yalnızca dinlemede", () => {
    const pron = p.grid.find((r) => r.kind === "pron")!;
    expect(pron.cells.listening).toBe("unknown");
    expect(pron.cells.reading).toBeNull();
  });

  it("en sık 3 hata Türkçe adıyla, GEN.OTHER hariç", () => {
    expect(p.topErrors.map((e) => e.code)).toEqual(["L1.3SG_S", "L1.ART_OMIT", "L1.BE_OMIT"]);
    expect(p.topErrors[0].count).toBe(2);
    expect(p.topErrors[0].nameTr).not.toBe("L1.3SG_S");
    expect(p.weekSessions).toBe(3);
  });

  it("A2 öğrencide A2 konular da var", () => {
    const a2 = buildProgress({ levelEst: "A2", mastery: [], weekSessions: 0, errorCodes: [], diagnoses: [] });
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
