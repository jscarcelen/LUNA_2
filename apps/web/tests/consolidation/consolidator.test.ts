import { describe, expect, it } from "vitest";
import {
  cleanNoteBlock, citedSources, consolidationOptions, dedupeNotes, extractFormulas, groupChunks, localTopics, markdownToNotes, missingFormulas,
  notesToBlocks, outlineByTitle, parseOutline, parseTopics, prepareSources, runConsolidation, runPool, estimateConsolidationTokens, MAP_GROUP_CHARS
} from "../../modules/ai-tools/pipeline/consolidator.js";
import { BLOCKS, conformBlocks } from "../../modules/ai-tools/blocks/blockRegistry.js";
import { createSummaryNotesConsolidatorSpec } from "../../modules/agent-studio/engine/model";

const run: any = runConsolidation;
const prep: any = prepareSources;
const group: any = groupChunks;
const clean: any = cleanNoteBlock;
const topics: any = parseTopics;
const dedupe: any = dedupeNotes;
const toBlocks: any = notesToBlocks;
const outlineOf: any = parseOutline;
const local: any = localTopics;
const missing: any = missingFormulas;

const biology = {
  id: "doc-bio",
  name: "Biology notes.docx",
  content: "# Osmosis\n\nOsmosis is the passive movement of water across a semipermeable membrane.\n\n# Diffusion\n\nDiffusion moves particles from high to low concentration.\n\nThe rate follows $J = -D \\frac{dC}{dx}$ (Fick's law)."
};
const lab = {
  id: "doc-lab",
  name: "Lab manual.pdf",
  content: "<!-- page 3 -->\n# Osmosis\n\nOsmosis is the passive movement of water across a semipermeable membrane.\n\nIn the potato experiment the mass changes by 12 %.\n\n| Solution | Change |\n| --- | --- |\n| Distilled | +12 % |\n\n![Graph of mass against salt concentration, falling linearly](figure)"
};

/** A scripted stand-in for the model: reads the request, answers from the passages it was given. */
function fakeModel(overrides: Record<string, (request: any) => any> = {}) {
  const calls: any[] = [];
  const callModel = async (request: any) => {
    calls.push(request);
    if (overrides[request.schemaName]) return overrides[request.schemaName](request);
    const input = JSON.parse(request.user);
    if (request.schemaName === "consolidation_notes") {
      // MAP: one topic per passage (titled by where it is), its text as a paragraph citing it.
      const topics = input.passages.map((passage: any) => ({ title: passage.location || passage.document, blocks: String(passage.content).replace(/[#|]/g, "").split(/(?<=[.!?])\s+/).map((sentence: string) => sentence.trim()).filter(Boolean).map((sentence: string) => ({ type: "paragraph", text: sentence, level: null, callout_type: null, bullets: null, term: null, meaning: null, detail: null, sources: [passage.sourceId] })) }));
      return { parsed: { topics }, usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } };
    }
    if (request.schemaName === "consolidation_outline") {
      return { parsed: { title: "Cell transport", sections: [{ title: "All topics", topicIds: input.draftTopics.map((topic: any) => topic.id) }] }, usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } };
    }
    // MERGE: keep every block of every draft (the real model dedupes; the code dedupes exact copies too).
    const blocks = input.drafts.flatMap((draft: any) => draft.blocks).map((block: any) => ({ type: block.type, text: block.text ?? null, level: block.level ?? null, callout_type: block.callout_type ?? null, bullets: block.bullets ?? null, term: block.term ?? null, meaning: block.meaning ?? null, detail: block.detail ?? null, sources: block.sources ?? [] }));
    return { parsed: { topics: [{ title: input.sectionTitle, blocks }] }, usage: { prompt_tokens: 20, completion_tokens: 20, total_tokens: 40 } };
  };
  return { callModel, calls };
}

describe("consolidator: reading every passage", () => {
  it("gives every passage an id and every document a tag, and keeps all of them", () => {
    const { docs, chunks } = prep([biology, lab]);
    expect(docs.map((doc: any) => doc.tag)).toEqual(["D1", "D2"]);
    expect(chunks.map((chunk: any) => chunk.sid)).toEqual(chunks.map((_: any, index: number) => `S${index + 1}`));
    expect(new Set(chunks.map((chunk: any) => chunk.tag))).toEqual(new Set(["D1", "D2"]));
    // nothing is dropped by size: all text is in some passage
    expect(chunks.map((chunk: any) => chunk.content).join(" ")).toContain("potato experiment");
  });

  it("packs passages into groups that fit one model call, starting a new group at a document boundary once mostly full", () => {
    const big = (tag: string, n: number) => Array.from({ length: n }, (_, index) => ({ sid: `${tag}${index}`, tag, content: "x".repeat(5000) }));
    const groups = group([...big("D1", 5), ...big("D2", 2)]);
    expect(groups.every((g: any[]) => g.reduce((sum, c) => sum + c.content.length, 0) <= MAP_GROUP_CHARS)).toBe(true);
    expect(groups.flat()).toHaveLength(7);
    expect(groups.length).toBeGreaterThan(1);
  });
});

describe("consolidator: the draft format", () => {
  const allowed = new Set(["S1", "S2"]);
  it("keeps only known sources and gives a block without any the previous one's", () => {
    const result = topics({ topics: [{ title: "T", blocks: [
      { type: "paragraph", text: "A", sources: ["S1", "S99"], level: null, callout_type: null, bullets: null, term: null, meaning: null, detail: null },
      { type: "paragraph", text: "B", sources: [], level: null, callout_type: null, bullets: null, term: null, meaning: null, detail: null }
    ] }] }, allowed, ["S2"]);
    expect(result[0].blocks.map((block: any) => block.sources)).toEqual([["S1"], ["S1"]]);
  });

  it("rejects unknown types and empty blocks", () => {
    expect(clean({ type: "essay", text: "x", sources: [] }, allowed)).toBeNull();
    expect(clean({ type: "paragraph", text: "  ", sources: [] }, allowed)).toBeNull();
    expect(clean({ type: "table_row", term: "a", meaning: null, detail: null, sources: [] }, allowed)).toBeNull();
  });

  it("clamps heading levels and callout kinds", () => {
    expect(clean({ type: "heading", text: "H", level: 9 }, allowed)).toMatchObject({ level: 4 });
    expect(clean({ type: "callout", text: "x", callout_type: "banana", sources: ["S1"] }, allowed)).toMatchObject({ callout_type: "note" });
  });

  it("removes exact duplicates and unites their sources, bullets included", () => {
    const merged = dedupe([
      { type: "paragraph", text: "Osmosis is passive.", sources: ["S1"] },
      { type: "paragraph", text: "osmosis is passive", sources: ["S4"] },
      { type: "bullet_list", text: "", bullets: [{ text: "Water moves", sources: ["S1"] }, { text: "Solutes stay", sources: ["S1"] }], sources: ["S1"] },
      { type: "bullet_list", text: "", bullets: [{ text: "water moves.", sources: ["S5"] }], sources: ["S5"] }
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].sources.sort()).toEqual(["S1", "S4"]);
    expect(merged[1].bullets.find((b: any) => b.text === "Water moves").sources.sort()).toEqual(["S1", "S5"]);
  });

  it("reads markdown into notes without dropping tables, figures or lists", () => {
    const notes = markdownToNotes(lab.content, "S9");
    expect(notes.some((n: any) => n.type === "table_row" && n.term === "Distilled")).toBe(true);
    expect(notes.some((n: any) => n.type === "callout" && /Graph of mass/.test(n.text))).toBe(true);
    expect(notes.every((n: any) => n.type === "heading" || n.sources.includes("S9"))).toBe(true);
  });

  it("joins equal headings from different documents and collapses what they share (the no-model path)", () => {
    const { chunks } = prep([biology, lab]);
    const result = local(chunks);
    const osmosis = result.filter((topic: any) => topic.title.toLowerCase() === "osmosis");
    expect(osmosis).toHaveLength(1);
    const sentence = osmosis[0].blocks.filter((block: any) => /passive movement of water/.test(block.text || ""));
    expect(sentence).toHaveLength(1);
    expect(sentence[0].sources).toHaveLength(2);
  });
});

describe("consolidator: output blocks", () => {
  const { chunks } = prep([biology, lab]);
  const byId = new Map(chunks.map((chunk: any) => [chunk.sid, chunk]));
  const first = chunks.find((chunk: any) => chunk.tag === "D1").sid;
  const second = chunks.find((chunk: any) => chunk.tag === "D2").sid;

  it("ends every unit with a visible tag naming its documents and places, and keeps the places as data", () => {
    const blocks = toBlocks([
      { type: "paragraph", text: "Osmosis is passive.", sources: [first, second] },
      { type: "bullet_list", text: "Key points", bullets: [{ text: "One", sources: [first] }, { text: "Two", sources: [second] }], sources: [first] },
      { type: "table_row", term: "Distilled", meaning: "+12 %", detail: "", sources: [second] }
    ], byId);
    expect(blocks[0].text).toMatch(/^Osmosis is passive\. \[D1 .*· D2 .*\]$/);
    expect(blocks[0]._tags).toHaveLength(1);
    expect(blocks[0]._refs[0].map((ref: any) => ref.documentName)).toEqual(["Biology notes.docx", "Lab manual.pdf"]);
    expect(blocks[1].items[0]).toMatch(/^One \[D1/);
    expect(blocks[1].items[1]).toMatch(/^Two \[D2/);
    expect(blocks[1]._tags).toHaveLength(2);
    expect(blocks[2]).toMatchObject({ type: "vocabulary", word: "Distilled" });
    expect(blocks[2].translation).toMatch(/\[D2/);
  });

  it("only produces block types and fields the registry defines", () => {
    const blocks = toBlocks([{ type: "heading", text: "H", level: 3 }, { type: "callout", text: "x", callout_type: "tip", sources: [first] }], byId);
    for (const block of blocks) {
      expect((BLOCKS as Record<string, any>)[block.type]).toBeTruthy();
      const allowedKeys = new Set(["type", ...Object.keys((BLOCKS as Record<string, any>)[block.type].aiFields)]);
      for (const key of Object.keys(block)) expect(allowedKeys.has(key) || key.startsWith("_")).toBe(true);
    }
    expect(conformBlocks(blocks)).toHaveLength(blocks.length);
  });
});

describe("consolidator: formulas", () => {
  it("finds display and inline LaTeX and ignores prices", () => {
    expect(extractFormulas("Cost $5 and $10. Then $$E = mc^2$$ and $J = -D\\frac{dC}{dx}$.")).toEqual(["E = mc^2", "J = -D\\frac{dC}{dx}"]);
  });

  it("reports the formulas of the sources that the result lacks, whatever the spacing", () => {
    const chunks = [{ sid: "S1", content: "Fick: $J = -D \\frac{dC}{dx}$ and $$a^2+b^2=c^2$$" }];
    expect(missing(chunks, [{ type: "paragraph", text: "J=-D\\frac{dC}{dx} [D1]" }])).toEqual([{ formula: "a^2+b^2=c^2", sid: "S1" }]);
    expect(missing(chunks, [{ type: "paragraph", text: "$$a^2 + b^2 = c^2$$ and $J = -D \\frac{dC}{dx}$" }])).toEqual([]);
  });
});

describe("consolidator: outline", () => {
  const drafts: any[] = [{ id: "T1", title: "Osmosis" }, { id: "T2", title: "Diffusion" }, { id: "T3", title: "Osmosis" }];
  it("assigns every draft topic to exactly one section: unknown ids dropped, repeats ignored, forgotten topics appended", () => {
    const outline = outlineOf({ sections: [{ title: "Water", topicIds: ["T1", "T3", "T9"] }, { title: "Again", topicIds: ["T1"] }] }, drafts);
    expect(outline).toEqual([{ title: "Water", topicIds: ["T1", "T3"] }, { title: "Diffusion", topicIds: ["T2"] }]);
    expect(outlineOf({ sections: [] }, drafts)).toBeNull();
  });
  it("falls back to joining equal titles", () => {
    expect(outlineByTitle(drafts as any)).toEqual([{ title: "Osmosis", topicIds: ["T1", "T3"] }, { title: "Diffusion", topicIds: ["T2"] }]);
  });
});

describe("consolidator: the whole run", () => {
  it("merges two overlapping documents: one section per topic, overlap once, every block traced, all passages cited", async () => {
    const { callModel, calls } = fakeModel();
    const result = await run({ documents: [biology, lab], options: { language: "English" }, deps: { callModel } });
    // passes: map → organise → merge
    expect(calls.map((call) => call.schemaName)).toEqual(expect.arrayContaining(["consolidation_notes", "consolidation_outline", "consolidation_section"]));
    expect(result.blocks[0]).toMatchObject({ type: "document_header", title: "Cell transport" });
    // the source key lists both originals
    const key = result.blocks.find((block: any) => block.type === "bullet_list" && /D1/.test((block.items || [])[0] || ""));
    expect(key.items.join(" ")).toMatch(/Biology notes\.docx/);
    expect(key.items.join(" ")).toMatch(/Lab manual\.pdf/);
    // the shared sentence is written once
    const text = result.blocks.map((block: any) => [block.text, ...(block.items || [])].join(" ")).join("\n");
    expect(text.match(/passive movement of water/g)).toHaveLength(1);
    // every content block carries where it came from
    const content = result.blocks.filter((block: any) => ["paragraph", "bullet_list", "vocabulary"].includes(block.type) && block._refs);
    expect(content.length).toBeGreaterThan(0);
    for (const block of content) expect(block._refs.every((refs: any[]) => refs.length > 0)).toBe(true);
    expect(result.coverage.passagesCited).toBe(result.coverage.passages);
    expect(result.usage.total_tokens).toBeGreaterThan(0);
    expect(result.originals.map((original: any) => original.name)).toEqual(["Biology notes.docx", "Lab manual.pdf"]);
  });

  it("asks again for a passage the model skipped, and carries it over verbatim if it is still skipped", async () => {
    const skipAll = (request: any) => {
      const input = JSON.parse(request.user);
      // answers with the FIRST passage only, always
      const passage = input.passages[0];
      return { parsed: { topics: [{ title: "T", blocks: [{ type: "paragraph", text: passage.content, level: null, callout_type: null, bullets: null, term: null, meaning: null, detail: null, sources: [passage.sourceId] }] }] }, usage: null };
    };
    const long = { id: "doc-long", name: "Long.md", content: Array.from({ length: 4 }, (_, index) => `# Part ${index}\n\n${"Alpha beta gamma delta epsilon. ".repeat(60)} unique-marker-${index}`).join("\n\n") };
    const { callModel } = fakeModel({ consolidation_notes: skipAll });
    const result = await run({ documents: [long], options: {}, deps: { callModel } });
    const text = result.blocks.map((block: any) => [block.text, ...(block.items || [])].join(" ")).join(" ");
    for (let index = 0; index < 4; index += 1) expect(text).toContain(`unique-marker-${index}`);
    expect(result.stats.carriedOverPassages + result.stats.recoveredPassages).toBeGreaterThan(0);
  });

  it("halves a group the model cannot finish, so nothing is lost on a long input", async () => {
    let failures = 0;
    const flaky = (request: any) => {
      const input = JSON.parse(request.user);
      if (input.passages.length > 1 && failures < 2) { failures += 1; return { parsed: null, usage: null }; }
      return { parsed: { topics: [{ title: input.passages[0].location || "T", blocks: input.passages.map((passage: any) => ({ type: "paragraph", text: passage.content.slice(0, 60), level: null, callout_type: null, bullets: null, term: null, meaning: null, detail: null, sources: [passage.sourceId] })) }] }, usage: null };
    };
    const docs = [1, 2, 3].map((n) => ({ id: `d${n}`, name: `Doc ${n}.md`, content: Array.from({ length: 6 }, (_, index) => `# Topic ${n}.${index}\n\n${"Some content about the topic. ".repeat(80)} marker-${n}-${index}`).join("\n\n") }));
    const { callModel } = fakeModel({ consolidation_notes: flaky });
    const result = await run({ documents: docs, options: {}, deps: { callModel } });
    expect(result.stats.splits).toBeGreaterThan(0);
    expect(result.coverage.passagesCited).toBe(result.coverage.passages);
  });

  it("appends a formula the merge lost, with its source", async () => {
    const noFormulas = (request: any) => {
      const input = JSON.parse(request.user);
      return { parsed: { topics: [{ title: "Notes", blocks: input.passages.map((passage: any) => ({ type: "paragraph", text: String(passage.content).replace(/\$[^$]*\$/g, "(formula)").slice(0, 80), level: null, callout_type: null, bullets: null, term: null, meaning: null, detail: null, sources: [passage.sourceId] })) }] }, usage: null };
    };
    const { callModel } = fakeModel({ consolidation_notes: noFormulas });
    const result = await run({ documents: [biology], options: {}, deps: { callModel } });
    const extra = result.blocks.filter((block: any) => block.type === "paragraph" && /frac\{dC\}\{dx\}/.test(block.text));
    expect(extra).toHaveLength(1);
    expect(extra[0].text).toMatch(/\[D1/);
    expect(result.coverage.formulasMissingAfterMerge).toBe(1);
  });

  it("falls back to the drafts when a merge loses most of the text", async () => {
    const lossy = () => ({ parsed: { topics: [{ title: "x", blocks: [{ type: "paragraph", text: "ok", level: null, callout_type: null, bullets: null, term: null, meaning: null, detail: null, sources: ["S1"] }] }] }, usage: null });
    const { callModel } = fakeModel({ consolidation_section: lossy });
    const result = await run({ documents: [biology, lab], options: {}, deps: { callModel } });
    expect(result.stats.mergeFallbacks).toBeGreaterThan(0);
    const text = result.blocks.map((block: any) => block.text || "").join(" ");
    expect(text).toContain("potato");
  });

  it("works without a model (merged by heading, de-duplicated, still traced) and says so", async () => {
    const result = await run({ documents: [biology, lab], options: {}, deps: {} });
    expect(result.stats.usedModel).toBe(false);
    const text = result.blocks.map((block: any) => [block.text, ...(block.items || [])].join(" ")).join("\n");
    expect(text.match(/passive movement of water/g)).toHaveLength(1);
    expect(text).toMatch(/\[D1 .*D2/);
  });

  it("past its time budget it stops asking the model but still keeps every passage", async () => {
    const { callModel: inner, calls } = fakeModel();
    const callModel = async (request: any) => { await new Promise((resolve) => setTimeout(resolve, 15)); return inner(request); };
    const result = await run({ documents: [biology, lab], options: {}, deps: { callModel, budgetMs: 10 } });
    expect(result.stats.timeBudgetHit).toBe(true);
    const text = result.blocks.map((block: any) => [block.text, ...(block.items || [])].join(" ")).join("\n");
    expect(text).toContain("potato experiment");
    expect(calls.map((call) => call.schemaName)).not.toContain("consolidation_section");
  });

  it("refuses documents without text", async () => {
    await expect(run({ documents: [{ id: "x", name: "Empty", content: "  " }], options: {}, deps: {} })).rejects.toThrow(/no readable text/);
  });
});

describe("consolidator: helpers", () => {
  it("reads language and focus from the runner's answers; 'same as the documents' means no translation", () => {
    expect(consolidationOptions({ questionAnswers: [{ question: "Language", answer: "Spanish" }, { question: "Focus (optional)", answer: "membranes" }] })).toEqual({ language: "Spanish", focus: "membranes" });
    expect(consolidationOptions({ questionAnswers: [{ question: "Language", answer: "Same as the documents" }] }).language).toBe("");
    expect(consolidationOptions({}).language).toBe("");
  });

  it("limits concurrency and keeps result order", async () => {
    let active = 0;
    let peak = 0;
    const tasks = Array.from({ length: 10 }, (_, index) => async () => { active += 1; peak = Math.max(peak, active); await new Promise((resolve) => setTimeout(resolve, 2)); active -= 1; return index; });
    expect(await runPool(tasks, 3)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("estimates more tokens for more material", () => {
    const small = estimateConsolidationTokens([{ content: "x".repeat(4000) }]);
    const large = estimateConsolidationTokens([{ content: "x".repeat(400000) }]);
    expect(large.inputTokens + large.outputTokens).toBeGreaterThan((small.inputTokens + small.outputTokens) * 10);
  });

  it("cited sources cover bullets too", () => {
    expect([...citedSources([{ sources: ["S1"] }, { bullets: [{ sources: ["S2"] }] }])].sort()).toEqual(["S1", "S2"]);
  });
});

describe("Summary Notes Consolidator spec", () => {
  const spec = createSummaryNotesConsolidatorSpec();
  it("is a consolidation pipeline agent with language and optional focus, documents required", () => {
    expect(spec.pipeline).toBe("consolidate");
    expect(spec.inputs.map((input) => input.type)).toEqual(["language", "text"]);
    expect(spec.inputs[1].required).toBe(false);
    expect(spec.contextSlots.find((slot) => slot.kind === "user_material")).toMatchObject({ required: true, multiple: true });
  });
  it("offers document-structure blocks only, all defined in the registry", () => {
    const ids: string[] = (spec.output?.selectedBlocks || []).map((block) => block.blockId);
    expect(ids).toEqual(expect.arrayContaining(["document_header", "section_header", "heading", "paragraph", "bullet_list", "callout", "vocabulary"]));
    for (const id of ids) expect((BLOCKS as Record<string, any>)[id as string].category).toBe("structure");
  });
});

/** OpenAI strict structured outputs: every object lists all its properties as required and forbids extras. */
function strictViolations(schema: any, path = "$"): string[] {
  const problems: string[] = [];
  if (!schema || typeof schema !== "object") return problems;
  if (schema.type === "object") {
    const keys = Object.keys(schema.properties || {});
    if (schema.additionalProperties !== false) problems.push(`${path}: additionalProperties`);
    if (JSON.stringify([...(schema.required || [])].sort()) !== JSON.stringify([...keys].sort())) problems.push(`${path}: required`);
    for (const key of keys) problems.push(...strictViolations(schema.properties[key], `${path}.${key}`));
  }
  if (schema.items) problems.push(...strictViolations(schema.items, `${path}[]`));
  for (const option of schema.anyOf || []) problems.push(...strictViolations(option, `${path}|`));
  return problems;
}

describe("consolidator: strict schemas", () => {
  it("every schema it sends is valid for strict structured outputs", async () => {
    const sent: any[] = [];
    const { callModel } = fakeModel();
    await run({ documents: [biology, lab], options: {}, deps: { callModel: async (request: any) => { sent.push(request); return callModel(request); } } });
    expect(new Set(sent.map((request) => request.schemaName))).toEqual(new Set(["consolidation_notes", "consolidation_outline", "consolidation_section"]));
    for (const request of sent) expect(strictViolations(request.schema)).toEqual([]);
  });
});
