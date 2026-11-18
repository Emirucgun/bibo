import { describe, expect, it } from "vitest";
import { simulate } from "@/scripts/lib/simulate";
import { L1_CODES, TOPICS } from "./fixtures";

describe("simulate (docs/SPEC.md Bölüm 12)", () => {
  it("her simüle oturum planlayıcı değişmezlerini korur", () => {
    const r = simulate({ topics: TOPICS, l1_codes: L1_CODES, seed: 42 });
    for (const s of r.sessions) {
      expect(s.slots.length).toBeGreaterThanOrEqual(8);
      expect(s.slots.length).toBeLessThanOrEqual(10);
      expect(s.total_seconds).toBeGreaterThanOrEqual(900);
      expect(s.total_seconds).toBeLessThanOrEqual(1200);
    }
  });

  it("'yazmada bilen, konuşmada bilmeyen' öğrenci: tohumların ≥ %50'sinde 8. oturuma kadar skill_gap(speaking)", () => {
    let ok = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const r = simulate({ topics: TOPICS, l1_codes: L1_CODES, seed, sessions: 8 });
      if (r.speaking_gap_session !== null) ok++;
    }
    expect(ok / 40).toBeGreaterThanOrEqual(0.5);
  });

  it("kesinlik: her becerisi %97 olan öğrenci 40 oturumda hiç teşhis almaz", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const r = simulate({ topics: TOPICS, l1_codes: L1_CODES, seed, sessions: 40, profile: { reading: 0.97, listening: 0.97, writing: 0.97, speaking: 0.97 } });
      expect(r.sessions.flatMap((s) => s.new_diagnoses)).toHaveLength(0);
    }
  });

  it("kesinlik: her becerisi %90 olan öğrencide yanlış teşhis kişi başı ≤ 0,3 (eski motor: 5,6)", () => {
    let n = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const r = simulate({ topics: TOPICS, l1_codes: L1_CODES, seed, sessions: 40, profile: { reading: 0.9, listening: 0.9, writing: 0.9, speaking: 0.9 } });
      n += r.sessions.flatMap((s) => s.new_diagnoses).length;
    }
    expect(n / 20).toBeLessThanOrEqual(0.3);
  });

  it("müfredat: öğrenen sanal öğrencide 40 oturumda ön koşul ihlali yok", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const r = simulate({
        topics: TOPICS, l1_codes: L1_CODES, seed, sessions: 40, learns: true,
        profile: { reading: 0.95, listening: 0.85, writing: 0.9, speaking: 0.8 }, prior: { mu: -0.8, sd: 0.4 },
      });
      expect(r.prerequisite_violations).toBe(0);
      expect(r.focused_topics[0]).toBe("g.be_present");
    }
  });
});
