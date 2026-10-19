import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as count from "../../modules/ai-tools/pipeline/itemCount.js";
import { createConceptFlashcardsSpec } from "../../modules/agent-studio/engine/model";
import { runConfigFromSpec } from "../../modules/agent-studio/engine/migrate";

const c: any = count;

vi.mock("../../modules/ai-tools/pipeline/workspaceSource.js", () => ({
  loadWorkspaceTreeForAi: async () => [{
    id: "w",
    subjects: [{ id: "s", documents: [{ id: "doc", name: "Accounting.docx", sourceType: "uploaded", reviewStatus: "approved", tags: [], content: Array.from({ length: 12 }, (_, k) => `# Concept ${k + 1}\n\nConcept ${k + 1} is defined in the material as idea number ${k + 1} of accounting.`).join("\n\n") }] }]
  }]
}));

describe("how many items were asked for", () => {
  const spec: any = createConceptFlashcardsSpec();
  const countInput = spec.inputs[0];
  it("reads the count input of a count rule, then the answers, then its default", () => {
    expect(c.requestedCount({ spec, inputValues: { [countInput.id]: "20" } })).toBe(20);
    expect(c.requestedCount({ spec, questionAnswers: [{ question: countInput.name, answer: 12 }] })).toBe(12);
    expect(c.requestedCount({ spec })).toBe(20);
    expect(c.requestedCount({ questionAnswers: [{ question: "How many questions?", answer: "6" }] })).toBe(6);
    expect(c.requestedCount({ questionAnswers: [{ question: "Language", answer: "English" }] })).toBe(0);
  });
  it("replaces the count in the answers for a follow-up call", () => {
    const answers = c.withCount({ spec, questionAnswers: [{ question: countInput.name, answer: "20" }, { question: "Language", answer: "English" }] }, 12);
    expect(answers).toEqual([{ question: countInput.name, answer: "12" }, { question: "Language", answer: "English" }]);
  });
  it("gives a call room to write the set (never below 6,000 tokens, never above the model's limit)", () => {
    expect(c.outputTokenBudget(100)).toBe(c.MIN_OUTPUT_TOKENS);
    expect(c.outputTokenBudget(6000)).toBe(6000 * 1.6 + 1500);
    expect(c.outputTokenBudget(50000)).toBe(c.MAX_OUTPUT_TOKENS);
  });
});

describe("topping up a short set", () => {
  it("keeps only items that are new (by their first field, ignoring case and accents)", () => {
    const have = [{ front: "Opportunity cost", back: "x" }];
    const fresh = c.freshItems(have, [{ front: "opportunity  COST", back: "y" }, { front: "Elasticity", back: "z" }, { front: "Elasticity", back: "again" }, { front: "Café", back: "w" }]);
    expect(fresh.map((item: any) => item.front)).toEqual(["Elasticity", "Café"]);
    expect(c.freshItems([{ front: "Cafe" }], [{ front: "Café" }])).toEqual([]);
  });
  it("tells the model how many more and lists what exists, allowing fewer when the material runs out", () => {
    const note = c.topUpInstruction(12, [{ front: "Opportunity cost" }, { question: "What is GDP?" }]);
    expect(note).toMatch(/Write 12 NEW items/);
    expect(note).toMatch(/- Opportunity cost/);
    expect(note).toMatch(/- What is GDP\?/);
    expect(note).toMatch(/fewer/);
  });
  it("describes the outcome: exact, short (and whether the material ran out) or no count", () => {
    expect(c.countOutcome({ requested: 20, made: 20 }).kind).toBe("exact");
    expect(c.countOutcome({ requested: 20, made: 8, exhausted: true })).toMatchObject({ kind: "short", missing: 12, exhausted: true });
    expect(c.countOutcome({ requested: 0, made: 8 }).kind).toBe("none");
  });
  it("treats a count shortfall as information and anything else as a real problem", () => {
    const checks = [{ rule: "valid_json", ok: true }, { rule: "count_matches_input", ok: false, message: "8 items, 20 requested" }, { rule: "no_duplicates", ok: false, message: "1 duplicate front" }];
    const split = c.splitChecks(checks);
    expect(split.count.map((check: any) => check.rule)).toEqual(["count_matches_input"]);
    expect(split.problems.map((check: any) => check.rule)).toEqual(["no_duplicates"]);
    expect(c.shortfallOf({ items: new Array(8).fill({}), countOutcome: { kind: "short", requested: 20, made: 8, missing: 12, exhausted: true } })).toEqual({ made: 8, requested: 20, missing: 12, exhausted: true });
    expect(c.shortfallOf({ items: new Array(8).fill({}), checks }, { questionAnswers: [{ question: "Number of cards", answer: "20" }] })).toEqual({ made: 8, requested: 20, missing: 12, exhausted: false });
    expect(c.shortfallOf({ items: [], isBlockOutput: true, checks })).toBeNull();
    expect(c.countNoun("Concept Flashcards")).toBe("cards");
    expect(c.countNoun("Quiz Generator")).toBe("questions");
    expect(c.countNoun("My agent")).toBe("items");
  });
});

describe("runAgentGeneration tops up a short set automatically", () => {
  const original = process.env.OPENAI_API_KEY;
  beforeEach(() => { process.env.OPENAI_API_KEY = "test-key"; });
  afterEach(() => { process.env.OPENAI_API_KEY = original; vi.unstubAllGlobals(); });

  /** A fake model that writes `perCall[n]` cards on call n (new concepts each time), recording the requests. */
  function fakeModel(perCall: number[]) {
    const bodies: any[] = [];
    let made = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      bodies.push(body);
      const n = perCall[bodies.length - 1] ?? 0;
      const items = Array.from({ length: n }, () => { made += 1; return { front: `Concept ${made}`, back: `Idea number ${made}.`, topic: "Accounting", _source: "S1", _quote: "", _support: "stated" }; });
      const content = JSON.stringify({ title: "Accounting", items });
      const usage = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 };
      // The first call streams (server-sent events); the follow-ups do not.
      if (body.stream) return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: "stop" }] })}\n\ndata: ${JSON.stringify({ choices: [], usage })}\n\ndata: [DONE]\n\n`, { status: 200 });
      return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }], usage }), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    return bodies;
  }

  async function run(perCall: number[], want = 20, extra: any = {}) {
    const { runAgentGeneration } = await import("../../modules/ai-tools/pipeline/agentBuilder.js");
    const agent: any = runConfigFromSpec(createConceptFlashcardsSpec());
    const countId = agent.questions[0].id;
    const bodies = fakeModel(perCall);
    const config: any = {
      ...agent, spec: agent.spec, grounding: false,
      inputValues: { [countId]: String(want) },
      questionAnswers: agent.questions.map((question: any) => ({ question: question.text, answer: question.id === countId ? String(want) : question.defaultValue ?? "" })),
      scope: { workspaceId: "w", documentIds: ["doc"] },
      ...extra
    };
    const result: any = await runAgentGeneration(config);
    return { result, bodies };
  }

  it("asks for the missing cards, listing those made, and reaches the requested count", async () => {
    const { result, bodies } = await run([8, 7, 5]);
    expect(result.items).toHaveLength(20);
    expect(bodies).toHaveLength(3);
    expect(bodies[0].max_tokens).toBeGreaterThanOrEqual(6000);
    expect(bodies[1].messages[1].content).toMatch(/Write 12 NEW items/);
    expect(bodies[1].messages[1].content).toMatch(/Concept 8/);
    expect(result.countOutcome).toMatchObject({ kind: "exact", requested: 20, made: 20 });
    expect(result.checks.find((check: any) => check.rule === "count_matches_input").ok).toBe(true);
    expect(result.usage.total_tokens).toBe(450);
  });

  it("stops when a follow-up brings nothing new and accepts fewer (the material ran out)", async () => {
    const { result, bodies } = await run([8, 0]);
    expect(result.items).toHaveLength(8);
    expect(bodies).toHaveLength(2);
    expect(result.countOutcome).toMatchObject({ kind: "short", made: 8, requested: 20, exhausted: true });
  });

  it("never returns more than asked", async () => {
    const { result } = await run([25], 20);
    expect(result.items).toHaveLength(20);
  });

  it("'Make more' keeps the cards already made and asks only for the missing ones", async () => {
    const existing = Array.from({ length: 8 }, (_, k) => ({ front: `Old ${k + 1}`, back: "b", topic: "t" }));
    const { result, bodies } = await run([12], 20, { topUp: { items: existing, root: { title: "Accounting" }, want: 20 } });
    expect(bodies).toHaveLength(1);
    expect(bodies[0].messages[1].content).toMatch(/Old 8/);
    expect(result.items.slice(0, 8).map((item: any) => item.front)).toEqual(existing.map((item) => item.front));
    expect(result.items).toHaveLength(20);
  });
});
