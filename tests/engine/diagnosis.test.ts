import { describe, expect, it } from "vitest";
import { diagnoseTopic, diagnosisMessage, isResolved, reconcileDiagnoses } from "@/lib/engine/diagnosis";
import type { ExistingDiagnosis, Skill, TopicAttempt } from "@/lib/engine/types";
import { CTX, stateFrom } from "./fixtures";

const T = "g.present_simple";
const repeat = (skill: TopicAttempt["skill"], type: TopicAttempt["activity_type"], answers: number[]): TopicAttempt[] =>
  answers.map((a) => ({ skill, activity_type: type, is_correct: a === 1 }));

/** Konuşması genel olarak zayıf, yazması güçlü öğrenci (diğer konularda da konuşma kanıtı). */
const writerNotSpeaker = (writing: number[], speaking: number[]) =>
  stateFrom(
    [
      ["g.be_present", "speaking", [0, 0]],
      ["g.can", "speaking", [0, 0]],
      [T, "writing", writing],
      [T, "speaking", speaking],
    ],
    { mu: 0.6, sd: 0.4 },
  );

describe("diagnoseTopic — beceri eksiği", () => {
  it("yazma güçlü, konuşma zayıf → skill_gap(speaking), sayılarla kanıt", () => {
    const state = writerNotSpeaker([1, 1, 1, 1, 1, 1], [0, 0, 0, 0]);
    const d = diagnoseTopic(CTX, state, T)!;
    expect(d.kind).toBe("skill_gap");
    expect(d.weak_skill).toBe("speaking");
    expect(d.strong_skill).toBe("writing");
    expect(d.confidence).toBeGreaterThanOrEqual(0.9);
    expect(d.evidence.skills.writing).toMatchObject({ correct: 6, n: 6 });
    expect(d.evidence.skills.speaking).toMatchObject({ correct: 0, n: 4 });
  });

  it("zayıf hücrede doğru oranı %50'nin üstündeyse teşhis yok (kesinlik önce)", () => {
    const state = writerNotSpeaker([1, 1, 1, 1, 1, 1], [1, 0, 1, 1]);
    expect(diagnoseTopic(CTX, state, T)?.kind).not.toBe("skill_gap");
  });

  it("zayıf becerinin kanıtı 3'ten azsa teşhis yok", () => {
    const state = writerNotSpeaker([1, 1, 1, 1, 1, 1], [0, 0]);
    expect(diagnoseTopic(CTX, state, T)).toBeNull();
  });

  it("güçlü beceri yoksa beceri eksiği denmez", () => {
    const state = writerNotSpeaker([0, 1, 0], [0, 0, 0, 0]);
    expect(diagnoseTopic(CTX, state, T)?.kind).not.toBe("skill_gap");
  });
});

describe("diagnoseTopic — konu eksiği", () => {
  it("konu her beceride zayıf ve genel seviyeden beklenenden kötü → topic_gap", () => {
    const answers: [string, Skill, number[]][] = (["reading", "writing", "speaking", "listening"] as Skill[]).map((s) => [T, s, [0, 0, 0]]);
    const d = diagnoseTopic(CTX, stateFrom(answers, { mu: 0.9, sd: 0.3 }), T)!;
    expect(d.kind).toBe("topic_gap");
    expect(d.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("kanıt 4'ten azsa konu eksiği denmez", () => {
    expect(diagnoseTopic(CTX, stateFrom([[T, "writing", [0, 0, 0]]], { mu: 0.9, sd: 0.3 }), T)).toBeNull();
  });
});

describe("diagnoseTopic — etkinlik uyumsuzluğu", () => {
  it("aynı beceride bir tür ≤ %35, diğeri ≥ %70 (tür başına ≥ 4)", () => {
    const attempts = [...repeat("writing", "gap_fill", [0, 0, 0, 1]), ...repeat("writing", "word_order", [1, 1, 1, 1])];
    const d = diagnoseTopic(CTX, stateFrom([[T, "writing", [0, 0, 0, 1, 1, 1, 1, 1]]]), T, attempts)!;
    expect(d.kind).toBe("activity_mismatch");
    expect(d.weak_activity).toBe("gap_fill");
    expect(d.strong_activity).toBe("word_order");
  });

  it("türde 4'ten az cevap varsa uyumsuzluk denmez", () => {
    const attempts = [...repeat("writing", "gap_fill", [0, 0, 0]), ...repeat("writing", "word_order", [1, 1, 1])];
    expect(diagnoseTopic(CTX, stateFrom([[T, "writing", [0, 0, 0, 1, 1, 1]]]), T, attempts)?.kind).not.toBe("activity_mismatch");
  });
});

describe("reconcileDiagnoses ve çözülme", () => {
  const existing: ExistingDiagnosis = { id: "d1", topic_id: T, kind: "skill_gap", weak_skill: "speaking", weak_activity: null, status: "active" };

  it("zayıf beceri toparlanınca teşhis çözülür", () => {
    const weak = writerNotSpeaker([1, 1, 1, 1, 1, 1], [0, 0, 0, 0]);
    expect(isResolved(CTX, weak, existing, [])).toBe(false);
    const recovered = writerNotSpeaker([1, 1, 1, 1, 1, 1], [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(isResolved(CTX, recovered, existing, [])).toBe(true);
  });

  it("aynı teşhis zaten aktifse yeniden eklenmez; farklıysa eskisi superseded", () => {
    const state = writerNotSpeaker([1, 1, 1, 1, 1, 1], [0, 0, 0, 0]);
    const c = diagnoseTopic(CTX, state, T)!;
    expect(reconcileDiagnoses({ ctx: CTX, state, topic_id: T, candidate: c, existing: [existing] }).insert).toBeNull();
    const other: ExistingDiagnosis = { ...existing, id: "d2", kind: "activity_mismatch", weak_skill: "writing", weak_activity: "gap_fill" };
    const r = reconcileDiagnoses({ ctx: CTX, state, topic_id: T, candidate: c, existing: [other] });
    expect(r.insert).not.toBeNull();
    expect(r.updates).toContainEqual({ id: "d2", status: "superseded" });
  });

  it("mesaj şablonu kanıtı sayılarla verir", () => {
    const c = diagnoseTopic(CTX, writerNotSpeaker([1, 1, 1, 1, 1, 1], [0, 0, 0, 0]), T)!;
    const msg = diagnosisMessage(c, "Geniş zaman");
    expect(msg).toContain("yazma etkinliklerinde 6/6 doğru");
    expect(msg).toContain("konuşma: 0/4");
  });
});
