import { describe, expect, it } from "vitest";
import {
  buildReadingParts as buildJs, documentSections as sectionsJs, readingCoverage as coverageJs, partsToBlocks as blocksJs,
  runReadingSplit as runJs, splitOptions as optionsJs, bodyUnits as unitsJs, focusSections as focusJs, LIGHT_BATCH_PARTS
} from "../../modules/ai-tools/pipeline/readingParts.js";
import { createReadingPartsSpec } from "../../modules/agent-studio/engine/model";
import { READING_SPLITTER_AGENT } from "../../modules/ai-tools/tools/reading-splitter/readingAgent.js";
import { isReadingSplit } from "../../modules/ai-tools/pipeline/agentBuilder.js";

const buildReadingParts: any = buildJs;
const documentSections: any = sectionsJs;
const readingCoverage: any = coverageJs;
const partsToBlocks: any = blocksJs;
const runReadingSplit: any = runJs;
const splitOptions: any = optionsJs;
const bodyUnits: any = unitsJs;
const focusSections: any = focusJs;

/** A long Accounting document: 12 chapters × 3 sections, some sections only a heading over sub-sections (like 2.2), tables, formulas, lists, pages. */
function accountingDocument() {
  const sentence = (c: number, s: number, k: number) => `In chapter ${c} section ${s} sentence ${k} the ledger records debit and credit entries so that assets equal liabilities plus equity.`;
  const paragraph = (c: number, s: number, n = 8) => Array.from({ length: n }, (_, k) => sentence(c, s, k)).join(" ");
  let md = "<!-- page 1 -->\nThis handbook introduces financial accounting from first principles.\n\n";
  const headings: string[] = [];
  for (let c = 1; c <= 12; c += 1) {
    md += `<!-- page ${c * 3} -->\n# ${c}. Chapter ${c} on accounting topic ${c}\n\n${paragraph(c, 0, 4)}\n\n`;
    headings.push(`${c}. Chapter ${c} on accounting topic ${c}`);
    for (let s = 1; s <= 3; s += 1) {
      const heading = `${c}.${s} Section ${c}.${s}`;
      headings.push(heading);
      md += `## ${heading}\n\n`;
      if (s === 2) {
        // A heading with no text of its own: its text is in the sub-sections.
        for (let u = 1; u <= 2; u += 1) {
          const sub = `${c}.${s}.${u} Sub-section ${c}.${s}.${u}`;
          headings.push(sub);
          md += `### ${sub}\n\n${paragraph(c, s * 10 + u, 5)}\n\n`;
        }
        continue;
      }
      md += `${paragraph(c, s)}\n\n| Account | Debit | Credit |\n| --- | --- | --- |\n| Cash ${c}.${s} | 100 | 0 |\n| Revenue ${c}.${s} | 0 | 100 |\n\n$$\nA_{${c}${s}} = L + E\n$$\n\n- First rule of ${c}.${s}\n- Second rule of ${c}.${s}\n\n${paragraph(c, s + 50, 3)}\n\n`;
    }
  }
  return { document: { id: "acc", name: "Accounting.docx", content: md }, headings };
}

const textOfBlocks = (blocks: any[]) => blocks.map((block) => [block.text, block.title, ...(block.items || [])].filter(Boolean).join(" ")).join(" ");

describe("Reading Splitter: the whole document, in order", () => {
  const { document, headings } = accountingDocument();

  it("reads the structure: every heading, text before the first heading, headings inside fences are text", () => {
    const sections = documentSections(document.content);
    expect(sections.filter((section: any) => section.heading).map((section: any) => section.heading)).toEqual(headings);
    expect(sections[0]).toMatchObject({ heading: "", level: 0 });
    const fenced = documentSections("# A\n\n```\n# not a heading\n```\n\ntext");
    expect(fenced).toHaveLength(1);
    expect(fenced[0].body).toContain("# not a heading");
  });

  it.each(["topic", "time", "difficulty"])("split by %s: 100%% of headings, every word in order, no empty part", (splitBy) => {
    const { parts } = buildReadingParts([document], { minutes: 15, splitBy });
    expect(parts.length).toBeGreaterThan(3);
    const coverage = readingCoverage([document], parts);
    expect(coverage.headingsCovered).toBe(coverage.headings);
    expect(coverage.headings).toBe(headings.length);
    expect(coverage.emptyParts).toBe(0);
    expect(coverage.inOrder).toBe(true);
    expect(coverage.complete).toBe(true);
    for (const part of parts) expect(part.segments.some((segment: any) => String(segment.body || "").trim())).toBe(true);
  });

  it("sizes the parts by the minutes asked for (by reading time: about the target, never far above it)", () => {
    const { parts } = buildReadingParts([document], { minutes: 10, splitBy: "time" });
    for (const part of parts.slice(0, -1)) expect(part.minutes).toBeLessThanOrEqual(14);
    const fewer = buildReadingParts([document], { minutes: 40, splitBy: "time" }).parts;
    expect(fewer.length).toBeLessThan(parts.length);
  });

  it("never cuts inside a table, a formula block or a list", () => {
    const units = bodyUnits("Intro.\n\n| a | b |\n|---|---|\n\n| 1 | 2 |\n\n$$\nx\n\ny\n$$\n\n- one\n\n- two\n\nEnd.");
    expect(units).toEqual(["Intro.", "| a | b |\n|---|---|\n| 1 | 2 |", "$$\nx\n\ny\n$$", "- one\n- two", "End."]);
  });

  it("writes blocks where every heading appears, every part has text after its header, and the material's words are all there", () => {
    const { parts } = buildReadingParts([document], { minutes: 15 });
    const blocks = partsToBlocks(parts);
    const headingTexts = blocks.filter((block: any) => block.type === "heading").map((block: any) => block.text);
    for (const heading of headings) expect(headingTexts).toContain(heading);
    // No part is "a heading with an empty body": after each section header comes passage text before the next one.
    blocks.forEach((block: any, index: number) => {
      if (block.type !== "section_header") return;
      const next = blocks.slice(index + 1).findIndex((entry: any) => entry.type === "section_header");
      const body = blocks.slice(index + 1, next === -1 ? undefined : index + 1 + next);
      expect(body.some((entry: any) => ["paragraph", "bullet_list"].includes(entry.type))).toBe(true);
    });
    const all = textOfBlocks(blocks);
    for (const word of ["2.2.1", "2.2.2", "12.3", "A_{123}", "Revenue 12.3", "Second rule of 7.1", "first principles"]) expect(all).toContain(word);
    expect(blocks[1]).toMatchObject({ type: "section_header" });
    expect(blocks[1].intro).toMatch(/min/);
  });

  it("with a focus, keeps only the sections about it (and says so when nothing matches)", () => {
    const sections = documentSections(document.content);
    const picked = focusSections(sections, ["Section 3.1"]);
    expect(picked.map((section: any) => section.heading)).toEqual(["3.1 Section 3.1"]);
    expect(focusSections(sections, ["photosynthesis"])).toBeNull();
  });
});

describe("runReadingSplit: the model only writes titles and questions, in batches", () => {
  const { document, headings } = accountingDocument();

  it("batches the parts, applies the model's titles, questions and difficulty, and keeps every heading", async () => {
    const requests: any[] = [];
    const callModel = async (request: any) => {
      requests.push(request);
      const indexes = [...request.user.matchAll(/"index":(\d+)/g)].map((match: any) => Number(match[1]));
      return { parsed: { parts: indexes.map((index) => ({ index, title: `Model title ${index}`, why: `Why ${index}.`, difficulty: index % 2 ? "advanced" : "foundation", questions: [`Question ${index}a?`, `Question ${index}b?`] })) }, usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } };
    };
    const events: any[] = [];
    const result = await runReadingSplit({ documents: [document], options: { minutes: 15, splitBy: "topic", language: "English", focus: [] }, deps: { callModel, emit: (event: any) => events.push(event) } });
    expect(requests.length).toBe(Math.ceil(result.parts.length / LIGHT_BATCH_PARTS));
    expect(requests[0].system).toMatch(/<task>/);
    expect(requests[0].user.indexOf("<parts>")).toBeLessThan(requests[0].user.indexOf("now."));
    expect(result.coverage.complete).toBe(true);
    expect(result.blocks.find((block: any) => block.type === "section_header").title).toBe("Part 1: Model title 1");
    expect(result.blocks.some((block: any) => block.type === "bullet_list" && block.title === "Check yourself")).toBe(true);
    const headingTexts = result.blocks.filter((block: any) => block.type === "heading").map((block: any) => block.text);
    for (const heading of headings) expect(headingTexts).toContain(heading);
    expect(result.usage.total_tokens).toBe(15 * requests.length);
    expect(events.some((event) => event.phase === "split" && event.status === "progress")).toBe(true);
  });

  it("by difficulty puts foundations first without losing any part", async () => {
    const callModel = async (request: any) => {
      const indexes = [...request.user.matchAll(/"index":(\d+)/g)].map((match: any) => Number(match[1]));
      return { parsed: { parts: indexes.map((index) => ({ index, title: `T${index}`, why: "", difficulty: index === 1 ? "advanced" : "foundation", questions: [] })) } };
    };
    const result = await runReadingSplit({ documents: [document], options: { minutes: 15, splitBy: "difficulty", focus: [] }, deps: { callModel } });
    expect(result.parts[result.parts.length - 1].index).toBe(1);
    expect(result.coverage.complete).toBe(true);
  });

  it("works without a model (titles from the headings) and when the model fails", async () => {
    const offline = await runReadingSplit({ documents: [document], options: { minutes: 15 }, deps: {} });
    expect(offline.coverage.complete).toBe(true);
    expect(offline.blocks[0].type).toBe("document_header");
    const failing = await runReadingSplit({ documents: [document], options: { minutes: 15 }, deps: { callModel: async () => { throw new Error("down"); } } });
    expect(failing.coverage.complete).toBe(true);
  });

  it("a focus with nothing on it gives a plain note, not an invented part", async () => {
    const result = await runReadingSplit({ documents: [document], options: { minutes: 15, focus: ["photosynthesis"] }, deps: {} });
    expect(result.parts).toHaveLength(0);
    expect(result.blocks.some((block: any) => block.type === "callout" && /photosynthesis/.test(block.text))).toBe(true);
  });

  it("reads its options from the runner's answers and a plan step's topics", () => {
    const options = splitOptions({ questionAnswers: [{ question: "Language", answer: "Spanish" }, { question: "Split by", answer: "Reading time" }, { question: "Minutes per part", answer: "30" }, { question: "Focus (optional)", answer: "" }], readingFocus: ["Accruals"] });
    expect(options).toEqual({ language: "Spanish", splitBy: "time", minutes: 30, focus: ["Accruals"] });
  });
});

describe("the Reading Splitter agent runs through the whole-document pipeline", () => {
  it("is flagged pipeline: split, so the server does not rank or truncate the material", () => {
    expect(createReadingPartsSpec().pipeline).toBe("split");
    expect((READING_SPLITTER_AGENT as any).spec.pipeline).toBe("split");
    expect(isReadingSplit({ spec: (READING_SPLITTER_AGENT as any).spec })).toBe(true);
    expect(isReadingSplit({ spec: { pipeline: "consolidate" } })).toBe(false);
  });
});
