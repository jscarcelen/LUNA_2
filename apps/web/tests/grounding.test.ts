import { describe, expect, it } from "vitest";
// @ts-ignore - plain JS modules
import { claimText, groundBlocks, groundItem, groundItems, matchQuote, ungroundedNumbers } from "../modules/ai-tools/pipeline/grounding.js";
// @ts-ignore - plain JS modules
import { citedSentences, groundChatAnswer } from "../modules/chat/groundChat.js";
// @ts-ignore - plain JS modules
import { buildActivity } from "../modules/activities/engine/activity";

const chunks = [
  { content: "The holding period return is the payoff minus the price paid, divided by the price paid. A stock bought at 50 and sold at 55 earns 10%." },
  { content: "Risk is measured by the standard deviation of returns. Diversification lowers risk without lowering the expected return." }
];
const none: any = async () => ({ verdicts: new Map(), skipped: true });
const judgeWith = (verdicts: Record<number, [string, string]>): any => async () => ({ verdicts: new Map(Object.entries(verdicts).map(([k, [verdict, reason]]) => [Number(k), { verdict, reason }])), skipped: false });

describe("matchQuote", () => {
  it("finds an exact quote, tolerates small changes, rejects an invented one", () => {
    expect(matchQuote("payoff minus the price paid, divided by the price paid", chunks[0].content).status).toBe("exact");
    expect(matchQuote("the payoff minus price paid divided by the price you paid", chunks[0].content).status).not.toBe("exact");
    expect(matchQuote("bonds pay semi annual coupons to investors", chunks[0].content).status).toBe("none");
    expect(matchQuote("too short", chunks[0].content).status).toBe("none");
  });
});

describe("groundItem", () => {
  it("verifies a stated item whose quote is in the cited passage", () => {
    const g = groundItem({ q: "x", _source: "S1", _quote: "A stock bought at 50 and sold at 55 earns 10%", _support: "stated" }, chunks);
    expect(g.level).toBe("verified");
  });
  it("marks a stated item with an invented quote as unverified", () => {
    const g = groundItem({ q: "x", _source: "S1", _quote: "Bonds always beat stocks over long horizons", _support: "stated" }, chunks);
    expect(g.level).toBe("unverified");
    expect(g.reasons.join(" ")).toMatch(/not found/);
  });
  it("accepts an inferred item that rests on a real passage, rejects one that cites nothing", () => {
    expect(groundItem({ _source: "S2", _quote: "", _support: "inferred" }, chunks).level).toBe("inferred");
    expect(groundItem({ _source: "", _quote: "", _support: "inferred" }, chunks).level).toBe("unverified");
  });
  it("notes a quote that is real but was filed under the wrong passage", () => {
    const g = groundItem({ _source: "S1", _quote: "Diversification lowers risk without lowering the expected return", _support: "stated" }, chunks);
    expect(g.level).toBe("verified");
    expect(g.reasons.join(" ")).toMatch(/not in the passage cited/);
  });
  it("only notes an unmatched figure; wrong options and worked steps do not count against an item", () => {
    const g = groundItem({ question: "HPR?", options: ["12", "99"], answer: "10%", worked_solution: "5/50 = 0.10", _source: "S1", _quote: "A stock bought at 50 and sold at 55 earns 10%", _support: "stated" }, chunks);
    expect(g.level).toBe("verified");
    expect(g.numbers).toEqual([]);
  });
});

describe("ungroundedNumbers and claimText", () => {
  it("lists figures missing from the material and ignores single digits", () => {
    expect(ungroundedNumbers("returns of 10% and 37% on 3 stocks", chunks[0].content)).toEqual(["37"]);
  });
  it("leaves bookkeeping fields out of the claim", () => {
    expect(claimText({ question: "Why?", _source: "S1", _quote: "secret", options: ["a", "b"] })).toBe("Why? | a | b");
  });
});

describe("groundItems", () => {
  const items = [
    { n: 1, _source: "S1", _quote: "A stock bought at 50 and sold at 55 earns 10%", _support: "stated" },
    { n: 2, _source: "S1", _quote: "Invented sentence about bond coupons and duration", _support: "stated" },
    { n: 3, _source: "S2", _quote: "Risk is measured by the standard deviation of returns", _support: "stated" }
  ];
  it("drops failures when strict and enough remain, counting them", async () => {
    const { items: kept, summary } = await groundItems(items, chunks, { strict: true, judge: none });
    expect(kept.map((item: any) => item.n)).toEqual([1, 3]);
    expect(summary).toMatchObject({ total: 3, verified: 2, unverified: 1, dropped: 1 });
  });
  it("keeps and flags them when not strict, or when nothing would remain", async () => {
    expect((await groundItems(items, chunks, { strict: false, judge: none })).items).toHaveLength(3);
    const allBad = [{ n: 9, _source: "S1", _quote: "Nothing like this appears anywhere in it", _support: "stated" }];
    const { items: kept } = await groundItems(allBad, chunks, { strict: true, judge: none });
    expect(kept).toHaveLength(1);
    expect(kept[0]._grounding.level).toBe("unverified");
  });
  it("lets the second pass overrule a quote that matched", async () => {
    const { items: kept, summary } = await groundItems(items.slice(0, 1), chunks, { strict: false, judge: judgeWith({ 0: ["unsupported", "Claim says 12%, passage says 10%"] }) });
    expect(kept[0]._grounding.level).toBe("unverified");
    expect(kept[0]._grounding.reasons.join(" ")).toMatch(/12%/);
    expect(summary.judged).toBe(true);
  });
});

describe("groundBlocks", () => {
  const blocks = [
    { type: "heading", text: "Returns" },
    { type: "paragraph", text: "The holding period return is the payoff minus the price paid, divided by the price paid." },
    { type: "paragraph", text: "Over 2019 to 2023 US stocks earned an average of 14.7% a year with a 31% drawdown." }
  ];
  it("flags a paragraph whose figures are not in the material and that the second pass does not vouch for", async () => {
    const { blocks: out, summary } = await groundBlocks(blocks, chunks, { judge: none });
    expect(out[1]._grounding.level).toBe("verified");
    expect(out[2]._grounding.level).toBe("unverified");
    expect(summary).toMatchObject({ total: 2, unverified: 1 });
  });
  it("trusts a paragraph with an unmatched figure when the second pass says supported", async () => {
    const { blocks: out } = await groundBlocks(blocks, chunks, { judge: judgeWith({ 0: ["supported", ""], 1: ["supported", ""] }) });
    expect(out[2]._grounding.level).toBe("verified");
  });
});

describe("chat grounding", () => {
  const passages = [{ n: "P1", content: chunks[0].content }, { n: "P2", content: chunks[1].content }];
  it("finds the sentences that carry a citation", () => {
    expect(citedSentences("HPR is payoff over price [P1]. Not cited here. Risk is the standard deviation [P2][P3].")).toHaveLength(2);
  });
  it("flags unsupported sentences, invalid citations and uncited answers; says nothing without a search", async () => {
    expect(await groundChatAnswer({ text: "anything", passages: [] })).toBeNull();
    const text = "A stock bought at 50 and sold at 55 earns 10% [P1]. Diversification raises returns by 4% [P2]. See also [P9].";
    const out = await groundChatAnswer({ text, passages, judge: judgeWith({ 0: ["supported", ""], 1: ["unsupported", "Passage says it keeps returns, not raises them"] }) });
    expect(out).toMatchObject({ checked: 2, supported: 1, unsupported: 1, invalidCitations: ["P9"], uncited: false });
    expect(out!.flagged[0].reason).toMatch(/keeps returns/);
    expect(await groundChatAnswer({ text: "No citations at all.", passages, judge: none })).toMatchObject({ uncited: true });
  });
});

describe("activity", () => {
  it("shows a verified quote as the question's source and carries the level", () => {
    const fields = [{ id: "i", name: "items", type: "array", children: [{ id: "it", name: "item", type: "object", children: [{ id: "q", name: "question", type: "text" }, { id: "a", name: "answer", type: "text" }] }] }];
    const row = { question: "What is the HPR of a stock bought at 50 and sold at 55?", answer: "10%", _sourceResolved: { documentName: "Notes", documentId: "d1", chunkIndex: 1, headingPath: "Returns" }, _grounding: { level: "verified", quote: "A stock bought at 50 and sold at 55 earns 10%", reasons: [] } };
    const activity: any = buildActivity(fields as any, { items: [row] } as any, { title: "T", agentName: "A" } as any);
    expect(activity.questions[0].source.extract).toBe("A stock bought at 50 and sold at 55 earns 10%");
    expect(activity.questions[0].source.grounding.level).toBe("verified");
  });
});
