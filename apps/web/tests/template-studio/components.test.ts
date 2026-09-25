import { describe, expect, it } from "vitest";
import { createPage, createTemplate } from "../../modules/template-studio/engine/model";
import { critiqueTemplate, faultsOf } from "../../modules/template-studio/engine/critique";
import { layoutDocument } from "../../modules/template-studio/engine/layout";
import { buildSampleData } from "../../modules/template-studio/engine/sample";
import { ACCENT_PRESETS, builtInBlocks, instantiateBlock } from "../../modules/template-studio/engine/blocks";
import { CONFIDENCE_LEVELS, TYPE } from "../../modules/template-studio/engine/design";
import type { BlockDef } from "../../modules/template-studio/engine/blocks";

/** A one-block template, as inserting that block into an empty document produces. */
function templateWith(block: BlockDef, options: Parameters<typeof instantiateBlock>[2] = {}) {
  const template = createTemplate(block.name);
  const { fields, elements } = instantiateBlock(block, [], options);
  template.fields = fields;
  template.layouts[0].pages = [createPage({ elements })];
  return template;
}

describe("every built-in component", () => {
  const blocks = builtInBlocks();

  it.each(blocks.map((block) => [`${block.family || block.name} · ${block.variant || ""}`, block] as const))(
    "%s passes the design critic",
    (_name, block) => {
      // Faults are defects; a "this would read better on a card" suggestion is taste, and several
      // of these components are deliberately bare.
      const faults = faultsOf(critiqueTemplate(templateWith(block)));
      expect(faults.map((issue) => `${issue.kind}: ${issue.message}`)).toEqual([]);
    }
  );

  it("keeps type readable and inside the page", () => {
    for (const block of blocks) {
      const template = templateWith(block);
      const result = layoutDocument(template, buildSampleData(template, 4) as never, {});
      for (const page of result.pages) {
        for (const item of page.items) {
          if (item.type !== "text") continue;
          expect(item.style.fontSize || 10).toBeGreaterThanOrEqual(TYPE.micro - 0.01);
          expect(item.x).toBeGreaterThanOrEqual(-14); // rotated edge labels are painted about their centre
          expect(item.x + item.w).toBeLessThanOrEqual(212);
        }
      }
    }
  });

  it("offers the confidence check on every question card that a learner fills in", () => {
    // The full-size cards — the ones a learner writes on. The compact and true/false rows are single
    // lines by design and have nowhere to put it.
    const cards = blocks.filter((block) => ["block-exam-question", "block-open-question", "block-question-mixed", "block-section-questions"].includes(block.id));
    for (const block of cards) {
      expect(block.options?.some((option) => option.key === "confidence")).toBe(true);
    }
    const withConfidence = templateWith(cards[0], { toggles: { confidence: true } });
    const printed: string[] = [];
    const walk = (elements: import("../../modules/template-studio/engine/types").Element[]) => {
      for (const element of elements) {
        if (element.type === "text" && element.source.type === "static") printed.push(element.source.value);
        if (element.type === "group") walk(element.children);
      }
    };
    walk(templateWith(cards[0]).layouts[0].pages[0].elements);
    expect(printed).not.toContain("How sure are you?"); // off unless the teacher asks for it
    printed.length = 0;
    walk(withConfidence.layouts[0].pages[0].elements);
    expect(printed).toContain("How sure are you?");
    for (const level of CONFIDENCE_LEVELS) expect(printed).toContain(level);
  });

  it("recolours a component's whole palette, never half of it", () => {
    const card = builtInBlocks().find((block) => block.id === "block-exam-question")!;
    const rose = ACCENT_PRESETS.find((preset) => preset.id === "rose")!;
    const { elements } = instantiateBlock(card, [], { accent: rose });
    const colours: string[] = [];
    const walk = (list: import("../../modules/template-studio/engine/types").Element[]) => {
      for (const element of list) {
        colours.push(element.style.fill || "", element.style.stroke || "", element.style.color || "");
        if (element.type === "group") walk(element.children);
      }
    };
    walk(elements);
    expect(colours).toContain(rose.main);
    expect(colours.filter((colour) => colour.toLowerCase() === "#0071e3")).toHaveLength(0);
  });
});
