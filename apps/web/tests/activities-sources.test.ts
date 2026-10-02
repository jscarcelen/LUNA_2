import { describe, expect, it } from "vitest";
import { attachSources, buildActivity, sourceUrl } from "../modules/activities/engine/activity";

const passages = [
  { documentId: "doc1", documentName: "Accounting.pdf", chunkIndex: 2, heading: "2. Balance sheet › 2.5. Current ratio", page: 3, content: "## 2.5. Current ratio\n\nThe current ratio tells you whether a firm can pay its short-term obligations. It is computed as current assets divided by current liabilities. A ratio below one signals liquidity trouble." },
  { documentId: "doc1", documentName: "Accounting.pdf", chunkIndex: 5, heading: "3. Income statement", page: 5, content: "Revenue is recognised when it is earned, regardless of when cash is received." }
];

describe("tracing an answer to its source", () => {
  it("uses the passage the agent cited and quotes the sentences that back the answer", () => {
    const fields: any[] = [{ id: "i", name: "items", type: "array", children: [{ id: "q", name: "question", type: "text" }, { id: "a", name: "answer", type: "text" }] }];
    const items: any[] = [{ question: "How is the current ratio computed?", options: ["Assets / liabilities", "Revenue / cost"], answer: "Assets / liabilities", _sourceResolved: { documentId: "doc1", documentName: "Accounting.pdf", headingPath: "2. Balance sheet > 2.5. Current ratio", chunkIndex: 2, page: 3 } }];
    const activity = attachSources(buildActivity(fields, { items }, { title: "Quiz" }), passages);
    const source: any = activity.questions[0].source;
    expect(source.documentName).toBe("Accounting.pdf");
    expect(source.locator).toContain("page 3");
    expect(source.locator).toContain("passage 2");
    expect(source.extract).toMatch(/current assets divided by current liabilities/i);
    expect(sourceUrl(source, "https://luna.test")).toContain("/source?d=doc1&c=2&q=");
  });

  it("falls back to the best matching passage when nothing was cited", () => {
    const fields: any[] = [{ id: "i", name: "items", type: "array", children: [{ id: "q", name: "question", type: "text" }, { id: "a", name: "answer", type: "text" }] }];
    const activity = attachSources(buildActivity(fields, { items: [{ question: "When is revenue recognised?", answer: "When it is earned" }] }, { title: "Quiz" }), passages);
    expect((activity.questions[0].source as any).chunkIndex).toBe(5);
    expect((activity.questions[0].source as any).locator).toContain("page 5");
  });
});
