import { describe, expect, it } from "vitest";
// @ts-ignore - plain JS modules
import { collectCoverageRefs, coverageSummary, groupByActivity, matchReferences } from "../modules/reader/coverageMap.js";

const doc = (id: string, tags: string[], content: unknown) => ({ id, name: id, tags, content: JSON.stringify(content) });
const resource = (id: string, body: any) => doc(id, ["resource"], { kind: "resource", name: `Resource ${id}`, meta: {}, ...body });
const plan = (id: string, name: string, resourceIds: string[]) => doc(id, ["study-plan"], { kind: "study-plan", name, items: resourceIds.map((resourceId) => ({ resourceId })) });

const quiz = resource("quiz1", { activity: { questions: [
  { id: "q1", kind: "multiple-choice", source: { documentId: "doc", extract: "The balance sheet lists assets, liabilities and equity at one date." } },
  { id: "q2", kind: "multiple-choice", source: { documentId: "other", extract: "Something in another document entirely, long enough." } },
  { id: "q3", kind: "short-answer" }
] } });
const summary = resource("sum1", { data: { sources: [{ documentId: "doc", content: "Depreciation spreads the cost of an asset over its useful life. It is not a cash expense." }] } });

describe("collecting what points into a document", () => {
  const docs = [quiz, summary, plan("p1", "Midterm", ["quiz1"])];
  it("takes the questions that cite it and the passages a written output was made from, nothing else", () => {
    const refs = collectCoverageRefs("doc", docs);
    expect(refs.map((ref: any) => [ref.activityName, ref.label])).toEqual([["Resource quiz1", "Question 1"], ["Resource sum1", "Written from this part"]]);
    expect(refs[0].plans).toEqual(["Midterm"]);
    expect(refs[1].plans).toEqual([]);
  });
  it("names flashcards as cards", () => {
    const cards = resource("fc", { activity: { questions: [{ kind: "flashcard", source: { documentId: "doc", extract: "A long enough extract to be matched against the page." } }] } });
    expect(collectCoverageRefs("doc", [cards])[0].label).toBe("Card 1");
  });
});

describe("matching them to the paragraphs on screen", () => {
  const texts = [
    "Introduction",
    "The balance sheet lists assets, liabilities and equity at one date.",
    "Depreciation spreads the cost of an asset over its useful life. It is not a cash expense, and it never involves paying anyone.",
    "Nothing in the activities touches this paragraph about something else."
  ];
  const refs = collectCoverageRefs("doc", [quiz, summary]);
  const matches = matchReferences(texts, refs);
  it("finds the paragraph a question came from, even when a quote or a line break differs", () => {
    expect(matches[1]).toEqual([0]);
    expect(matchReferences(["The “balance sheet” lists assets,\nliabilities and equity at one date."], refs)[0]).toEqual([0]);
  });
  it("finds a paragraph that contains a passage's sentences, and leaves the rest uncovered", () => {
    expect(matches[2]).toEqual([1]); // the paragraph continues past the passage's text; it still holds all of it
    expect(matches[3]).toEqual([]);
    expect(matches[0]).toEqual([]); // a heading too short to match on its own
  });
  it("counts how much of the text is covered", () => {
    const summaryOf = coverageSummary(texts, matches, refs);
    expect(summaryOf.activities).toBe(2);
    expect(summaryOf.share).toBeGreaterThan(0);
    expect(summaryOf.share).toBeLessThan(1);
  });
  it("groups a paragraph's refs by activity for the popover", () => {
    const both = collectCoverageRefs("doc", [resource("quiz2", { activity: { questions: [
      { kind: "short-answer", source: { documentId: "doc", extract: "The balance sheet lists assets, liabilities and equity at one date." } },
      { kind: "short-answer", source: { documentId: "doc", extract: "Assets, liabilities and equity are listed on the balance sheet at a single date, always." } }
    ] } })]);
    const groups = groupByActivity(matchReferences([texts[1]], both)[0], both);
    expect(groups).toHaveLength(1);
    expect(groups[0].labels).toEqual(["Question 1"]);
  });
});
