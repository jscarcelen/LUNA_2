import { describe, expect, it } from "vitest";
import { ACCENT_PRESETS, blockFamilies, builtInBlocks, instantiateBlock } from "../../modules/template-studio/engine/blocks";
import { INK, PALETTES } from "../../modules/template-studio/engine/design";
import { assembleTemplate, variantsOf } from "../../modules/template-studio/engine/outputTemplate";
import { layoutDocument } from "../../modules/template-studio/engine/layout";
import { buildOutputDocument, COMPONENT_FOR_BLOCK, formatsOf, planOutput } from "../../modules/template-studio/output/outputDocument";
import { BLOCKS, BLOCK_CATEGORIES, buildJsonSchema } from "../../modules/ai-tools/blocks/blockRegistry";
import { renderHtml } from "../../modules/template-studio/engine/renderers";

const textOf = (doc: ReturnType<typeof buildOutputDocument>, layoutIndex = 0, viewIndex = 0) => {
  const layout = doc.template.layouts[layoutIndex];
  return layoutDocument(doc.template, doc.data, { layoutId: layout.id, viewId: layout.views[viewIndex].id }).pages.flatMap((page) => page.items).filter((item) => item.type === "text").map((item) => (item as { lines: string[] }).lines.join(" ")).join("\n");
};

describe("the catalog", () => {
  it("has the components, in the categories, Template Studio now defines", () => {
    const names = (category: string) => blockFamilies(builtInBlocks().filter((block) => block.category === category)).map((family) => family.family);
    expect(names("structure")).toEqual(["Exam header", "Document header", "Section header", "Headings", "Paragraph", "Key points", "Callout", "Table", "Footer"]);
    expect(names("questions")).toEqual(["Multiple choice", "Open answer", "True / false", "Fill in the blanks", "Match the pairs", "Math practice set"]);
    expect(builtInBlocks().filter((block) => !["structure", "questions"].includes(block.category)).map((block) => block.family)).toEqual(["Flashcard"]);
  });

  it("splits the exam header from the document header, with different fields", () => {
    const fieldsOf = (id: string) => builtInBlocks().find((block) => block.id === id)!.fields.map((field) => field.name);
    expect(fieldsOf("block-header-exam")).toEqual(["Title", "Subtitle"]);
    expect(fieldsOf("block-header-minimal")).toEqual(["Title"]);
  });

  it("offers exactly the formats the card shows: only Section header has two", () => {
    for (const block of builtInBlocks()) expect(variantsOf(block).map((format) => format.id)).toEqual(formatsOf(block.id).map((format) => format.id));
    expect(formatsOf("block-section-header").map((format) => format.variant)).toEqual(["Badge + title", "Title only"]);
    expect(builtInBlocks().filter((block) => formatsOf(block.id).length > 1).map((block) => block.family)).toEqual(["Section header", "Section header"]);
  });

  it("every question type has an answer for the key", () => {
    for (const block of builtInBlocks().filter((candidate) => candidate.category === "questions")) expect(block.options?.some((option) => option.key === "answer")).toBe(true);
  });

  it("every AI block type is drawn by a Template Studio component, and the picker lists them all", () => {
    const ids = new Set(builtInBlocks().map((block) => block.id));
    const listed = BLOCK_CATEGORIES.flatMap((category) => category.blocks);
    for (const type of listed) expect(ids.has(COMPONENT_FOR_BLOCK[type] as string)).toBe(true);
    expect(Object.keys(BLOCKS).filter((type) => !listed.includes(type))).toEqual(["divider"]);
    expect(Object.keys(buildJsonSchema(listed).items.properties)).toContain("left_items");
  });
});

describe("headings and section titles", () => {
  const heading = (level: number, text: string) => ({ type: "heading", level, text });

  it("draw each level at its own size", () => {
    const plan = planOutput({ blocks: [heading(1, "Cell transport"), heading(2, "Diffusion"), heading(3, "Facilitated diffusion"), heading(4, "Carrier proteins")] })!;
    const doc = buildOutputDocument(plan, {});
    const layout = doc.template.layouts[0];
    const sizes = layoutDocument(doc.template, doc.data, { layoutId: layout.id, viewId: layout.views[0].id }).pages.flatMap((page) => page.items).filter((item) => item.type === "text").map((item) => [(item as { lines: string[] }).lines.join(" "), item.style.fontSize] as const);
    const size = (label: string) => sizes.find(([text]) => text === label)![1];
    expect(size("Cell transport")).toBeGreaterThan(size("Diffusion"));
    expect(size("Diffusion")).toBeGreaterThan(size("Facilitated diffusion"));
    expect(size("Facilitated diffusion")).toBeGreaterThan(size("Carrier proteins"));
  });

  it("section header comes with a badge or as a plain title", () => {
    const plan = planOutput({ blocks: [{ type: "section_header", title: "Part A", intro: "Read carefully." }] })!;
    const badge = textOf(buildOutputDocument(plan, {}));
    const plain = textOf(buildOutputDocument(plan, { "block-section-header": { blockId: "block-section-title" } }));
    expect(badge).toContain("SECTION 1");
    expect(plain).toContain("Part A");
    expect(plain).not.toContain("SECTION");
  });
});

describe("page sizes and footer", () => {
  it("keeps real page sizes and the footer at the bottom of every page, even for long documents", () => {
    const items = Array.from({ length: 24 }, (_, i) => ({ question: `Question ${i + 1} about the median and the mean`, type: "multiple-choice", options: ["a", "b", "c", "d"], answer: "a" }));
    const blocks = items.map((item) => ({ type: "question_mc", question: item.question, options: item.options, answer_index: 0 }));
    const plan = planOutput({ blocks, title: "Long quiz", framed: true })!;
    const doc = buildOutputDocument(plan, {});
    expect(doc.template.layouts.map((layout) => [layout.canvas.width, layout.canvas.height])).toEqual([[210, 297], [216, 279], [254, 143]]);
    doc.template.layouts.forEach((layout) => {
      const laid = layoutDocument(doc.template, doc.data, { layoutId: layout.id, viewId: layout.views[0].id });
      expect(laid.pages.length).toBeGreaterThan(1);
      for (const page of laid.pages) {
        const footer = page.items.find((item) => item.type === "text" && (item as { lines: string[] }).lines.join(" ").startsWith("Page "));
        expect(footer).toBeTruthy();
        expect(footer!.y).toBeGreaterThan(layout.canvas.height - 25);
        expect(footer!.y + footer!.h).toBeLessThanOrEqual(layout.canvas.height);
      }
    });
  });

  it("recolours the exam header and the footer with the chosen accent", () => {
    const plan = planOutput({ blocks: [{ type: "question_tf", statement: "x", is_true: true }], title: "Quiz", framed: true })!;
    const styles = Object.fromEntries(plan.components.map((component) => [component.key, { accentId: "rose" }]));
    const html = renderHtml(buildOutputDocument(plan, styles).template, {}, {}).html;
    expect(html).toContain(ACCENT_PRESETS.find((accent) => accent.id === "rose")!.main);
    expect(html).not.toContain("#0071e3");
  });

  it("drops the logo, name and date from a slide cover only", () => {
    const plan = planOutput({ blocks: [{ type: "question_tf", statement: "x", is_true: true }], title: "Quiz", subtitle: "Biology", framed: true })!;
    const doc = buildOutputDocument(plan, {});
    expect(textOf(doc, 0, 0)).toContain("LUNA");
    expect(textOf(doc, 2, 0)).not.toContain("LUNA");
    expect(textOf(doc, 2, 0)).not.toContain("Name");
    expect(textOf(doc, 2, 0)).toContain("Biology");
  });
});

describe("assembleTemplate", () => {
  it("never makes the page taller than the paper", () => {
    const blocks = builtInBlocks().filter((block) => block.category === "questions");
    const template = assembleTemplate("All", 210, 297, blocks.map((block) => ({ block, accent: ACCENT_PRESETS[0], toggles: {} })));
    expect(template.layouts.map((layout) => layout.canvas.height)).toEqual([297, 279, 143]);
  });
});

describe("colours", () => {
  const colours = (elements: import("../../modules/template-studio/engine/types").Element[]): string[] => elements.flatMap((element) => [element.style?.fill, element.style?.stroke, element.style?.color, ...(element.type === "group" ? colours(element.children) : [])]).filter(Boolean).map((value) => String(value).toLowerCase());
  const allowed = new Set([...PALETTES.flatMap((palette) => [palette.main, palette.deep, palette.tint, palette.soft, palette.line]), ...Object.values(INK), "#ffffff", "#000000"].map((value) => value.toLowerCase()));

  it("every component is painted only with palette and ink colours (no stray pastels)", () => {
    for (const block of builtInBlocks()) {
      const stray = [...new Set(colours(block.elements))].filter((value) => !allowed.has(value));
      expect(stray, `${block.family} · ${block.variant}`).toEqual([]);
    }
  });

  it("recolouring leaves nothing of the original palette behind", () => {
    const rose = ACCENT_PRESETS.find((accent) => accent.id === "rose")!;
    for (const block of builtInBlocks()) {
      const native = PALETTES.find((palette) => palette.main.toLowerCase() === String(block.accent?.main).toLowerCase())!;
      if (native.id === "rose") continue;
      const { elements } = instantiateBlock(block, [], { accent: rose, toggles: Object.fromEntries((block.options || []).map((option) => [option.key, true])) });
      const left = colours(elements).filter((value) => [native.main, native.deep, native.tint, native.soft, native.line].some((own) => own.toLowerCase() === value));
      // The answer band is always green, whatever the accent.
      const expected = native.id === "green" ? left.filter(() => false) : left;
      expect(expected, `${block.family} · ${block.variant}`).toEqual([]);
    }
  });
});
