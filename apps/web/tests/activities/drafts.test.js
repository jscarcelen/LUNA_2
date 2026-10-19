import { describe, expect, it } from "vitest";
import { countAnswered, draftProgress, draftStorageKey, firstUnanswered, isAnswered, isDraftEmpty, makeDraft, mergeDrafts, parseDraft, resumeState } from "../../modules/activities/drafts.js";

const activity = {
  id: "act_1",
  title: "Ratios",
  questions: [
    { id: "q1", kind: "choice", prompt: "Pick one", options: ["A", "B", "C"], answer: "B" },
    { id: "q2", kind: "boolean", prompt: "True?", answer: "true" },
    { id: "q3", kind: "number", prompt: "Compute 2 + 2", answer: "4" },
    { id: "q4", kind: "text", prompt: "Define liquidity", answer: "Paying short-term debts" },
    { id: "q5", kind: "match", prompt: "Match", pairs: [{ left: "a", right: "1" }, { left: "b", right: "2" }], answer: { a: "1", b: "2" } },
    { id: "q6", kind: "tiles", prompt: "Rebuild", tiles: [{}, {}, {}, {}], answer: "0,1,2,3" }
  ]
};

describe("progress counting", () => {
  it("counts only complete answers (every pair of a match, every slot of a tile puzzle)", () => {
    expect(isAnswered(activity.questions[0], "")).toBe(false);
    expect(isAnswered(activity.questions[4], { a: "1" })).toBe(false);
    expect(isAnswered(activity.questions[4], { a: "1", b: "2" })).toBe(true);
    expect(isAnswered(activity.questions[5], [0, null, 2, 3])).toBe(false);
    expect(countAnswered(activity.questions, { q1: "A", q2: "false", q3: "4", q5: { a: "1" } })).toBe(3);
    expect(firstUnanswered(activity.questions, { q1: "A", q2: "false" })).toBe(2);
  });
});

describe("making and resuming a draft", () => {
  const now = new Date("2026-10-19T10:00:00Z");
  const draft = makeDraft(activity, {
    answers: { q1: "C", q3: "4", q4: "When a firm can pay", gone: "x" },
    confidence: { q1: "high", q2: "" },
    work: { q3: { text: "2+2", image: "data:image/jpeg;base64,AAAA", full: true } },
    index: 3,
    elapsedMs: 90500,
    durations: { q1: 12000, q3: 5000 }
  }, now);

  it("keeps the answers of existing questions, drops photos, records counts and the place", () => {
    expect(draft.answers).toEqual({ q1: "C", q3: "4", q4: "When a firm can pay" });
    expect(draft.work.q3).toEqual({ text: "2+2", image: "", full: true });
    expect(draft.confidence).toEqual({ q1: "high" });
    expect(draft.answered).toBe(3);
    expect(draft.total).toBe(6);
    expect(draft.index).toBe(3);
    expect(draft.updatedAt).toBe("2026-10-19T10:00:00.000Z");
    expect(isDraftEmpty(draft)).toBe(false);
    expect(isDraftEmpty(makeDraft(activity, {}))).toBe(true);
  });

  it("resumes on the same question with the same answers and time", () => {
    const state = resumeState(JSON.parse(JSON.stringify(draft)), activity);
    expect(state.index).toBe(3);
    expect(state.answers).toEqual(draft.answers);
    expect(state.elapsedMs).toBe(90500);
    expect(state.answered).toBe(3);
    expect(state.durations).toEqual({ q1: 12000, q3: 5000 });
  });

  it("keeps only what still fits a quiz that changed since", () => {
    const changed = { ...activity, questions: [{ ...activity.questions[0], options: ["A", "B", "D"] }, activity.questions[2]] };
    const state = resumeState(draft, changed);
    expect(state.answers).toEqual({ q3: "4" });
    expect(state.index).toBe(1);
    expect(resumeState({ answers: {} }, activity)).toBeNull();
    expect(resumeState("not json", activity)).toBeNull();
  });

  it("stores under one key per account and activity", () => {
    expect(draftStorageKey("acc-1", "doc-9")).toBe("luna.draft.v1:acc-1:doc-9");
    expect(draftStorageKey("", "doc-9")).toBe("luna.draft.v1:guest:doc-9");
  });
});

describe("merging this browser's copy with the server's", () => {
  const older = { answers: { q1: "A" }, updatedAt: "2026-10-19T09:00:00Z" };
  const newer = { answers: { q1: "B" }, updatedAt: "2026-10-19T09:05:00Z" };
  it("takes the most recent, the server's on a tie, and whichever exists", () => {
    expect(mergeDrafts(older, newer).answers.q1).toBe("B");
    expect(mergeDrafts(newer, older).answers.q1).toBe("B");
    expect(mergeDrafts({ ...older, answers: { q1: "local" } }, older).answers.q1).toBe("A");
    expect(mergeDrafts(null, older)).toBe(older);
    expect(mergeDrafts(JSON.stringify(older), null).answers.q1).toBe("A");
    expect(mergeDrafts(null, null)).toBeNull();
    expect(parseDraft({ nope: true })).toBeNull();
  });
});

describe("what the Practice list says", () => {
  it("reads 3/6 answered from the stored counts, or recounts against the quiz", () => {
    expect(draftProgress({ answers: { q1: "A" }, answered: 3, total: 6 })).toEqual({ answered: 3, total: 6 });
    expect(draftProgress({ answers: { q1: "A", q2: "true", q3: "7" }, answered: 9, total: 9 }, activity)).toEqual({ answered: 3, total: 6 });
    expect(draftProgress(null)).toBeNull();
  });
});
