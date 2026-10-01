import { describe, expect, it } from "vitest";
import { buildAutoDocument, buildOutputDocument, itemsToBlocks, planOutput, resolveStyle, styleFromTemplate, stylesFromSelectedBlocks, formatsOf, type FlatBlock } from "../../modules/template-studio/output/outputDocument";
import { assembleTemplate } from "../../modules/template-studio/engine/outputTemplate";
import { ACCENT_PRESETS, builtInBlocks } from "../../modules/template-studio/engine/blocks";
import { layoutDocument } from "../../modules/template-studio/engine/layout";
import { renderHtml } from "../../modules/template-studio/engine/renderers";

const allText = (doc: ReturnType<typeof buildOutputDocument>, layoutIndex = 0, viewIndex = 0) => {
  const layout = doc.template.layouts[layoutIndex];
  const result = layoutDocument(doc.template, doc.data, { layoutId: layout.id, viewId: layout.views[viewIndex].id });
  return result.pages.flatMap((page) => page.items).filter((item) => item.type === "text").map((item) => (item as { lines: string[] }).lines.join(" ")).join("\n");
};

const bulletBlocks: FlatBlock[] = [
  { type: "heading", text: "1.2. Enterprise value", level: 1 },
  { type: "bullet_list", items: ["Enterprise value estimation uses time-value of money."] },
  { type: "divider" },
  { type: "bullet_list", items: ["Market capitalization changes due to expected cash flows."] },
  { type: "divider" },
  { type: "bullet_list", items: ["Equity value is enterprise value minus net debt."] }
];

describe("planOutput", () => {
  it("merges bullets separated by dividers into one Key points list and keeps the heading first", () => {
    const plan = planOutput({ blocks: bulletBlocks })!;
    expect(plan.runs.map((run) => run.componentKey)).toEqual(["block-section-header", "block-key-points"]);
    expect((plan.runs[1].data.points as unknown[]).length).toBe(3);
    expect(plan.components.map((component) => component.key)).toEqual(["block-section-header", "block-key-points"]);
    expect(plan.kind).toBe("document");
  });

  it("starts a new run when another component comes between", () => {
    const plan = planOutput({ blocks: [bulletBlocks[1], { type: "paragraph", text: "x" }, bulletBlocks[1]] })!;
    expect(plan.runs.map((run) => run.componentKey)).toEqual(["block-key-points", "block-paragraph", "block-key-points"]);
    expect(new Set(plan.runs.map((run) => run.n)).size).toBe(3);
  });

  it("returns null when nothing maps to a component", () => {
    expect(planOutput({ blocks: [{ type: "divider" }] })).toBeNull();
  });
});

describe("itemsToBlocks", () => {
  it("reads quiz items by type", () => {
    const blocks = itemsToBlocks([
      { question: "What is 2+2?", type: "multiple-choice", options: ["3", "4", "5", "6"], answer: "4", explanation: "Arithmetic" },
      { question: "The sky is green.", type: "true-false", options: ["True", "False"], answer: "False" },
      { question: "Define mean.", type: "short-answer", options: [], answer: "The average" }
    ])!;
    expect(blocks.map((block) => block.type)).toEqual(["question_mc", "question_tf", "question_open"]);
    expect(blocks[0].answer_index).toBe(1);
    expect(blocks[1].is_true).toBe(false);
  });

  it("reads flashcards and refuses unknown shapes", () => {
    expect(itemsToBlocks([{ front: "perro", back: "dog" }])![0].type).toBe("flashcard");
    expect(itemsToBlocks([{ title: "x", body: "y" }])).toBeNull();
  });
});

describe("buildOutputDocument", () => {
  it("renders the quiz with student and answer-key views, and never leaks sample placeholders", () => {
    const blocks = itemsToBlocks([
      { question: "What is 2+2?", type: "multiple-choice", options: ["3", "4", "5", "6"], answer: "4", explanation: "Arithmetic" },
      { question: "Mean of 2 and 4?", type: "multiple-choice", options: ["1", "2", "3", "4"], answer: "3" },
      { question: "The sky is green.", type: "true-false", options: ["True", "False"], answer: "False" },
      { question: "Define the median.", type: "short-answer", options: [], answer: "Middle value" }
    ])!;
    const plan = planOutput({ blocks, title: "Statistics quiz", framed: true })!;
    expect(plan.kind).toBe("quiz");
    expect(plan.components.map((component) => component.key)).toEqual(["block-header-exam", "block-exam-question", "block-true-false", "block-open-question", "block-footer"]);
    const doc = buildOutputDocument(plan, {});
    expect(doc.layouts.map((layout) => layout.label)).toEqual(["A4", "Letter", "Slides 16:9"]);
    expect(doc.views.map((view) => view.name)).toEqual(["Student view", "Answer key"]);
    const student = allText(doc, 0, 0);
    const key = allText(doc, 0, 1);
    expect(student).toContain("What is 2+2?");
    expect(student).toContain("Define the median.");
    expect(student).not.toContain("B · 4");
    expect(key).toContain("B · 4");
    // Placeholders from the component designs must never show up in real output.
    for (const placeholder of ["Biology Midterm Exam", "Which organelle", "The mean is always larger", "Explain why the median"]) expect(student).not.toContain(placeholder);
    expect(student).toContain("Statistics quiz");
  });

  it("keeps two runs of the same component apart", () => {
    const plan = planOutput({ blocks: [bulletBlocks[1], { type: "paragraph", text: "Between" }, { type: "bullet_list", title: "Second", items: ["b1", "b2"] }] })!;
    const text = allText(buildOutputDocument(plan, {}));
    expect(text).toContain("Enterprise value estimation");
    expect(text).toContain("Between");
    expect(text).toContain("Second");
    expect(text).toContain("b2");
  });

  it("applies the chosen colour to the component only", () => {
    const plan = planOutput({ blocks: bulletBlocks })!;
    const base = buildOutputDocument(plan, {});
    const rose = buildOutputDocument(plan, { "block-key-points": { accentId: "rose" } });
    const html = (doc: ReturnType<typeof buildOutputDocument>) => renderHtml(doc.template, doc.data, { layoutId: doc.template.layouts[0].id }).html;
    expect(html(rose)).toContain("#d8366f");
    expect(html(base)).not.toContain("#d8366f");
  });

  it("builds flashcards as cards with no views", () => {
    const blocks = itemsToBlocks([{ front: "perro", back: "dog" }, { front: "gato", back: "cat" }])!;
    const plan = planOutput({ blocks, title: "Spanish", framed: true })!;
    const doc = buildOutputDocument(plan, {});
    expect(plan.kind).toBe("cards");
    expect(doc.layouts.map((layout) => layout.label)).toEqual(["Cards"]);
    expect(allText(doc)).toContain("perro");
  });
});

describe("styles", () => {
  it("only offers formats Template Studio has", () => {
    for (const block of builtInBlocks()) {
      for (const format of formatsOf(block.id)) expect(builtInBlocks().some((candidate) => candidate.id === format.id)).toBe(true);
    }
    expect(resolveStyle("block-key-points", { "block-key-points": { blockId: "block-nope", accentId: "nope" } })!.block.id).toBe("block-key-points");
  });

  it("maps colours and formats saved by older agents", () => {
    const styles = stylesFromSelectedBlocks([
      { blockId: "bullet_list", formatId: "checkmark", color: "#dc3545" },
      { blockId: "callout", formatId: "card", color: "purple" },
      { blockId: "divider", formatId: "line", color: "default" }
    ]);
    expect(styles["block-key-points"]).toEqual({ accentId: "rose" });
    expect(styles["block-callout"]).toEqual({ accentId: "purple" });
    expect(Object.keys(styles)).toHaveLength(2);
  });

  it("reads format and colour per component back out of a template", () => {
    const blocks = builtInBlocks();
    const key = blocks.find((block) => block.id === "block-key-points")!;
    const flash = blocks.find((block) => block.id === "block-flashcard-single")!;
    const template = assembleTemplate("Saved", 210, 297, [
      { block: key, accent: ACCENT_PRESETS.find((a) => a.id === "green")!, toggles: {} },
      { block: flash, accent: ACCENT_PRESETS.find((a) => a.id === "rose")!, toggles: {} }
    ]);
    const styles = styleFromTemplate(template, ["block-key-points", "block-flashcard-single", "block-callout"]);
    expect(styles["block-key-points"]).toEqual({ blockId: "block-key-points", accentId: "green" });
    expect(styles["block-flashcard-single"]).toEqual({ blockId: "block-flashcard-single", accentId: "rose" });
    expect(styles["block-callout"]).toBeUndefined();
  });
});

describe("buildAutoDocument", () => {
  it("lays out free-form agents with the chosen accent", () => {
    const doc = buildAutoDocument({
      fields: [{ name: "title", repeatScope: "per-output" }, { name: "body", repeatScope: "per-output" }],
      items: [{ title: "One", body: "First" }, { title: "Two", body: "Second" }],
      title: "Notes",
      accentId: "purple"
    });
    expect(allText(doc)).toContain("Second");
    expect(renderHtml(doc.template, doc.data).html).toContain("#8a4fd6");
  });
});
