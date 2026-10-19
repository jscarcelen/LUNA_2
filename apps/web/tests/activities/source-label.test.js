import { describe, expect, it } from "vitest";
import { tEn } from "../../lib/i18n/index.js";
import { feedbackSource, feedbackSourceLabel, sectionOf } from "../../modules/activities/sourceLabel.js";
import { attachSources, buildActivity } from "../../modules/activities/engine/activity";

const label = (question, result) => feedbackSourceLabel(feedbackSource(question, result), tEn);

describe("where a checked answer came from", () => {
  it("a maths problem says which section of the notes it is based on, with a link", () => {
    const question = { kind: "number", prompt: "Calculate the current ratio given assets 120 and liabilities 80.", answer: "1.5", source: { documentName: "Accounting.pdf", documentId: "doc1", chunkIndex: 2, heading: "2. Balance sheet › 2.5. Current ratio", locator: "2. Balance sheet › 2.5. Current ratio · page 3", extract: "", grounding: { level: "unverified", reasons: ["No supporting quote was given."] } } };
    const info = feedbackSource(question, { quantitative: true });
    expect(info.kind).toBe("maths");
    expect(label(question, { quantitative: true })).toBe("Maths problem based on this section of the notes: 2. Balance sheet › 2.5. Current ratio");
    expect(info.href).toContain("/source?d=doc1");
    expect(info.href).toContain("s=2.5.%20Current%20ratio");
    expect(info.reasons).toEqual([]);
  });

  it("a question without a quote names its section, never 'no quote'", () => {
    const question = { kind: "text", prompt: "Define liquidity.", answer: "Ability to pay short-term debts", source: { documentName: "Accounting.pdf", locator: "Liquidity · page 4", extract: "", grounding: { level: "unverified", reasons: ["No supporting quote was given."] } } };
    const text = label(question, { quantitative: false });
    expect(text).toBe("From this section of the notes: Liquidity");
    expect(text.toLowerCase()).not.toContain("quote");
    expect(feedbackSource(question, { quantitative: false }).reasons).toEqual([]);
  });

  it("a quote is shown as a quote, and a bare document or nothing at all degrade quietly", () => {
    expect(feedbackSource({ kind: "choice", prompt: "Which?", source: { documentName: "A.pdf", extract: "Revenue is recognised when earned.", grounding: { level: "verified" } } }).kind).toBe("quote");
    expect(label({ kind: "text", prompt: "Define x", source: { documentName: "Notes.pdf", locator: "page 2", extract: "" } })).toBe("From your notes: Notes.pdf");
    expect(feedbackSource({ kind: "text", prompt: "Define x" }).kind).toBe("none");
    expect(label({ kind: "number", prompt: "Compute 3 × 4", answer: "12" })).toBe("Maths problem based on your notes");
  });

  it("falls back to the question's group or topic for the section", () => {
    expect(sectionOf({ group: "Part B", source: { locator: "page 3" } })).toBe("Part B");
    expect(sectionOf({ topic: "Ratios" })).toBe("Ratios");
  });

  it("the generator gives every question the section it came from, even with nothing to quote", () => {
    const fields = [{ id: "i", name: "items", type: "array", children: [{ id: "q", name: "question", type: "text" }, { id: "a", name: "answer", type: "text" }] }];
    const passages = [{ documentId: "doc1", documentName: "Accounting.pdf", chunkIndex: 2, heading: "2.5. Current ratio", page: 3, content: "## 2.5. Current ratio\n\nThe current ratio compares current assets with current liabilities." }];
    const activity = attachSources(buildActivity(fields, { items: [{ question: "Assets are 120 and liabilities 80: compute the current ratio.", answer: "1.5" }, { question: "Zzz qqq?", answer: "Www" }] }, { title: "Quiz" }), passages);
    expect(activity.questions[0].source?.heading).toBe("2.5. Current ratio");
    // No term in common at all, but the material is one document: its section is still named, and no quote is invented.
    expect(activity.questions[1].source?.heading).toBe("2.5. Current ratio");
    expect(activity.questions[1].source?.extract).toBe("");
  });
});
