// Yerel değerlendirme (docs/SPEC.md 4.6). Dil modeli çağrısı yok.
import { answersMatch, normalizeAnswer, tokenizeWords } from "./normalize";
import type {
  ItemKey,
  LocalGradeInput,
  LocalGradeResult,
  LocalResponse,
  TaggedError,
} from "./types";

export const DICTATION_PASS_SCORE = 0.9;
export const FALLBACK_CODE = "GEN.OTHER";
const MAX_ERRORS = 5;

export function gradeLocal(input: LocalGradeInput): LocalGradeResult {
  const { activity_type, key, response, l1_target } = input;
  switch (activity_type) {
    case "mcq_read":
    case "listen_choose":
      return gradeChoice(key, field(response, "choice"), l1_target);
    case "gap_fill":
      return gradeGapFill(key, field(response, "text"), l1_target);
    case "word_order":
      return gradeWordOrder(key, field(response, "order"), l1_target);
    case "dictation":
      return gradeDictation(key, field(response, "text"), l1_target);
  }
}

function field<K extends "choice" | "text" | "order">(
  response: LocalResponse,
  name: K,
): K extends "order" ? string[] : string {
  if (!(name in response)) throw new Error(`yanıtta '${name}' alanı yok`);
  return (response as Record<string, unknown>)[name] as K extends "order" ? string[] : string;
}

const pass = (score = 1): LocalGradeResult => ({ is_correct: true, score, errors: [] });

function gradeChoice(key: ItemKey, choice: string, l1Target: string | null): LocalGradeResult {
  if (key.correct === undefined) throw new Error("anahtarda 'correct' yok");
  if (choice.trim() === key.correct.trim()) return pass();
  const d = key.distractors?.find((x) => x.option.trim() === choice.trim());
  const error: TaggedError = d
    ? { l1_code: d.code, wrong_span: choice, correction: key.correct, source: "distractor", feedback_tr: d.feedback_tr }
    : { l1_code: l1Target ?? FALLBACK_CODE, wrong_span: choice, correction: key.correct, source: "rule" };
  return { is_correct: false, score: 0, errors: [error] };
}

function gradeGapFill(key: ItemKey, text: string, l1Target: string | null): LocalGradeResult {
  const accepted = key.accepted ?? [];
  if (accepted.length === 0) throw new Error("anahtarda 'accepted' yok");
  if (accepted.some((a) => answersMatch(a, text))) return pass();
  const pattern = key.wrong_patterns?.find((p) => answersMatch(p.answer, text));
  return {
    is_correct: false,
    score: 0,
    errors: [{
      l1_code: pattern?.code ?? l1Target ?? FALLBACK_CODE,
      wrong_span: text,
      correction: accepted[0],
      source: "rule",
    }],
  };
}

function gradeWordOrder(key: ItemKey, order: string[], l1Target: string | null): LocalGradeResult {
  const accepted = key.accepted ?? [];
  if (accepted.length === 0) throw new Error("anahtarda 'accepted' yok");
  const sentence = order.join(" ");
  if (accepted.some((a) => answersMatch(a, sentence))) return pass();
  return {
    is_correct: false,
    score: 0,
    errors: [{ l1_code: l1Target ?? FALLBACK_CODE, wrong_span: sentence, correction: accepted[0], source: "rule" }],
  };
}

type Op =
  | { kind: "sub"; target: string; answer: string }
  | { kind: "del"; target: string }
  | { kind: "ins"; answer: string };

/** Kelime düzeyi Levenshtein hizalaması: düzenleme işlemleri (eşleşmeler hariç). */
export function alignWords(target: string[], answer: string[]): Op[] {
  const n = target.length;
  const m = answer.length;
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = target[i - 1] === answer[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  const ops: Op[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (target[i - 1] === answer[j - 1] ? 0 : 1)) {
      if (target[i - 1] !== answer[j - 1]) ops.push({ kind: "sub", target: target[i - 1], answer: answer[j - 1] });
      i--;
      j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      ops.push({ kind: "del", target: target[i - 1] });
      i--;
    } else {
      ops.push({ kind: "ins", answer: answer[j - 1] });
      j--;
    }
  }
  return ops.reverse();
}

function gradeDictation(key: ItemKey, text: string, l1Target: string | null): LocalGradeResult {
  const sentence = key.correct ?? key.accepted?.[0];
  if (!sentence) throw new Error("dikte anahtarında hedef cümle yok ('correct' / 'accepted')");
  const target = tokenizeWords(sentence);
  const answer = tokenizeWords(text);
  const ops = alignWords(target, answer);
  const wer = target.length === 0 ? 0 : ops.length / target.length;
  const score = Math.round(Math.max(0, 1 - wer) * 100) / 100;
  const is_correct = score >= DICTATION_PASS_SCORE;

  const targetWords = new Set((key.target_words ?? []).map((w) => normalizeAnswer(w)));
  const codeFor = (word: string) =>
    targetWords.has(word) ? (l1Target ?? FALLBACK_CODE) : FALLBACK_CODE;
  const errors: TaggedError[] = ops.slice(0, MAX_ERRORS).map((op) => {
    if (op.kind === "ins") return { l1_code: FALLBACK_CODE, wrong_span: op.answer, correction: "", source: "rule" };
    return {
      l1_code: codeFor(op.target),
      wrong_span: op.kind === "sub" ? op.answer : "",
      correction: op.target,
      source: "rule",
    };
  });
  return { is_correct, score, errors };
}
