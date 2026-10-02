import { describe, expect, it } from "vitest";
import { buildOutputDocument, itemsToBlocks, planOutput } from "../../modules/template-studio/output/outputDocument";

const items: any[] = [
  { type: "multiple-choice", question: "2 + 2?", options: ["3", "4", "5", "6"], answer: "4", explanation: "Basic sum.", topic: "Arithmetic", difficulty: "easy" },
  { type: "short-answer", question: "Define mean.", options: [], answer: "The average.", explanation: "", topic: "Statistics", difficulty: "medium" }
];

describe("restyling a saved resource", () => {
  it("rebuilds the document from the stored items with a different format and colour", () => {
    const blocks: any = itemsToBlocks(items);
    const plan: any = planOutput({ blocks, title: "Quiz", framed: true });
    expect(plan?.components.length).toBeGreaterThan(0);
    const key = plan.components[0].key;
    const first = JSON.stringify(buildOutputDocument(plan, {}));
    const recoloured = JSON.stringify(buildOutputDocument(plan, { [key]: { accentId: "green" } }));
    expect(recoloured).not.toBe(first);
  });
});
