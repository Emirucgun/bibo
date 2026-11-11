import { describe, expect, it } from "vitest";
import { simulate } from "@/scripts/lib/simulate";
import { L1_CODES, TOPICS } from "./fixtures";

describe("simulate (ROADMAP M4, SPEC Bölüm 12)", () => {
  it("'yazmada bilen, konuşmada bilmeyen' öğrenci: en geç 5. oturumda güveni ≥ 0,6 skill_gap(speaking)", () => {
    const r = simulate({ topics: TOPICS, l1_codes: L1_CODES, seed: 42, sessions: 6 });
    expect(r.sessions).toHaveLength(6);
    expect(r.speaking_gap_session).not.toBeNull();
    expect(r.speaking_gap_session!).toBeLessThanOrEqual(5);
    const gap = r.sessions.flatMap((s) => s.new_diagnoses).find((d) => d.kind === "skill_gap" && d.weak_skill === "speaking")!;
    expect(gap.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("her simüle oturum planlayıcı değişmezlerini korur", () => {
    const r = simulate({ topics: TOPICS, l1_codes: L1_CODES, seed: 42 });
    for (const s of r.sessions) {
      expect(s.slots.length).toBeGreaterThanOrEqual(8);
      expect(s.slots.length).toBeLessThanOrEqual(10);
      expect(s.total_seconds).toBeGreaterThanOrEqual(900);
      expect(s.total_seconds).toBeLessThanOrEqual(1200);
    }
  });

  it("tohumların çoğunda (≥ %70) 5. oturuma kadar teşhis", () => {
    let ok = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const r = simulate({ topics: TOPICS, l1_codes: L1_CODES, seed });
      if (r.speaking_gap_session !== null && r.speaking_gap_session <= 5) ok++;
    }
    expect(ok / 50).toBeGreaterThanOrEqual(0.7);
  });
});
