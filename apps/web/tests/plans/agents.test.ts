import { describe, expect, it } from "vitest";
import { customPlanAgents, generateKeys, generateLabel, planAgentCatalog, scopeFromIds } from "../../modules/plans/agents.js";
import { plannedKinds } from "../../modules/plans/revise.js";
import { STEP_RECIPES } from "../../modules/plans/execute.js";

const agentDoc: any = { id: "d1", name: "Vocabulary.agent.json", sourceType: "generated", tags: ["ai-agent"], content: JSON.stringify({ name: "Vocabulary trainer", tagline: "Word lists with examples" }) };

describe("plan agent scope", () => {
  it("lists the AI-tab agents: every built-in agent of the Create tab plus every saved agent", () => {
    const catalog = planAgentCatalog([agentDoc, { id: "x", sourceType: "uploaded", tags: [] }]);
    expect(catalog.map((agent: any) => agent.id)).toEqual(["quiz", "flashcards", "summary", "math", "concept-flashcards", "document-summarizer", "formulas", "level-test", "agent:d1"]);
    expect(customPlanAgents([agentDoc])[0]).toMatchObject({ label: "Vocabulary trainer", purpose: "Word lists with examples", custom: true });
  });

  it("can build everything it offers: every built-in plan agent has a recipe for each key it makes", () => {
    for (const agent of planAgentCatalog([]) as any[]) for (const key of agent.makes) expect((STEP_RECIPES as Record<string, unknown>)[key], key).toBeTruthy();
  });

  it("turns the chosen agents into the generate keys the planner may use", () => {
    const scope = scopeFromIds(["quiz", "agent:d1"], planAgentCatalog([agentDoc]));
    expect(generateKeys(scope)).toEqual(["quiz", "exam", "worksheet", "agent:d1"]);
    expect(generateLabel("agent:d1", scope)).toBe("Vocabulary trainer");
    expect(generateLabel("exam", scope)).toBe("practice exam");
  });

  it("keeps re-planning inside the scope, including 'no agents'", () => {
    expect(plannedKinds({ items: [], agentScope: scopeFromIds(["flashcards"], planAgentCatalog([])) })).toEqual(["flashcards"]);
    expect(plannedKinds({ items: [], agentScope: [] })).toEqual([]);
    expect(plannedKinds({ items: [{ generate: "summary" }] })).toEqual(["summary"]); // plans from before scopes existed
  });
});
