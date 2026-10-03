import { describe, expect, it } from "vitest";
import { buildAutoDocument, buildOutputDocument, itemsToBlocks, planOutput, resolveStyle, styleFromTemplate, stylesFromSelectedBlocks, formatsOf, type FlatBlock } from "../../modules/template-studio/output/outputDocument";
import { assembleTemplate } from "../../modules/template-studio/engine/outputTemplate";
import { ACCENT_PRESETS, builtInBlocks } from "../../modules/template-studio/engine/blocks";
import { layoutDocument } from "../../modules/template-studio/engine/layout";
import { renderHtml } from "../../modules/template-studio/engine/renderers";
import { detectLanguage, labelLanguageFrom, resolveOutputLanguage } from "../../modules/template-studio/output/labels";

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
  it("merges bullets separated by dividers into one Key points list; the top heading becomes the page header's title", () => {
    const plan = planOutput({ blocks: bulletBlocks })!;
    expect(plan.runs.map((run) => run.componentKey)).toEqual(["block-key-points"]);
    expect((plan.runs[0].data.points as unknown[]).length).toBe(3);
    expect(plan.title).toBe("1.2. Enterprise value");
    expect(plan.components.map((component) => component.key)).toEqual(["block-header-minimal", "block-key-points", "block-footer"]);
    expect(plan.kind).toBe("document");
  });

  it("a document gets a page header and footer by default, but not a second header when the AI wrote one", () => {
    const own = planOutput({ blocks: [{ type: "document_header", title: "Guide" }, { type: "paragraph", text: "Body." }] })!;
    expect(own.start).toEqual([]);
    expect(own.end).toEqual(["block-footer"]);
    const plain = planOutput({ blocks: [{ type: "paragraph", text: "Body." }], title: "Guide" })!;
    expect(plain.start).toEqual(["block-header-minimal"]);
    expect(plain.end).toEqual(["block-footer"]);
  });

  it("header and footer can be removed", () => {
    const plan = planOutput({ blocks: [{ type: "paragraph", text: "Body text of the document." }], title: "Guide" })!;
    const withBoth = allText(buildOutputDocument(plan, {}));
    expect(withBoth).toContain("Guide");
    expect(withBoth).toMatch(/Page 1/);
    const without = allText(buildOutputDocument(plan, { "block-header-minimal": { hidden: true }, "block-footer": { hidden: true } }));
    expect(without).not.toMatch(/Page 1/);
    expect(without).not.toContain("Guide");
    expect(without).toContain("Body text of the document.");
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
    expect(key).toContain("Middle value");
    expect(student).not.toContain("Middle value");
    // Placeholders from the component designs must never show up in real output.
    for (const placeholder of ["Biology Midterm Exam", "Which organelle", "The mean is always larger", "Explain why the median"]) expect(student).not.toContain(placeholder);
    expect(student).toContain("Statistics quiz");
  });

  it("fits cards to each page size and drops Name / Date on slides only", () => {
    const blocks = itemsToBlocks([
      { question: "Is the median robust to outliers?", type: "true-false", options: ["True", "False"], answer: "True" },
      { question: "Define the variance in the context of sample statistics.", type: "short-answer", options: [], answer: "The mean squared deviation from the mean." }
    ])!;
    const doc = buildOutputDocument(planOutput({ blocks, title: "Stats", framed: true })!, {});
    const [a4, letter, slides] = doc.template.layouts;
    for (const layout of [a4, letter, slides]) {
      const width = layout.canvas.width - layout.margins.left - layout.margins.right;
      for (const element of layout.pages[0].elements) expect(element.frame.w).toBeCloseTo(width, 1);
      const laid = layoutDocument(doc.template, doc.data, { layoutId: layout.id, viewId: layout.views[1].id });
      expect(laid.overflows).toHaveLength(0);
      for (const item of laid.pages.flatMap((page) => page.items)) expect(item.x + item.w).toBeLessThanOrEqual(layout.canvas.width + 0.5);
    }
    const textOf = (layoutIndex: number) => layoutDocument(doc.template, doc.data, { layoutId: doc.template.layouts[layoutIndex].id, viewId: doc.template.layouts[layoutIndex].views[0].id }).pages.flatMap((page) => page.items).filter((item) => item.type === "text").map((item) => (item as { lines: string[] }).lines.join(" ")).join("\n");
    expect(textOf(0)).toContain("Name");
    expect(textOf(1)).toContain("Name");
    expect(textOf(2)).not.toContain("Name");
    expect(textOf(2)).not.toContain("Date");
    expect(textOf(2)).toContain("Stats");
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

describe("sources", () => {
  const passages = [
    { documentId: "doc-1", documentName: "Statistics.pdf", chunkIndex: 3, heading: "2. Dispersion", content: "The variance measures the average squared deviation from the mean. The standard deviation is its square root." },
    { documentId: "doc-1", documentName: "Statistics.pdf", chunkIndex: 7, heading: "4. Correlation", content: "Correlation describes how two variables move together. It ranges between minus one and one." }
  ];
  const quiz = () => itemsToBlocks([
    { question: "What does the variance measure?", type: "multiple-choice", options: ["Squared deviation from the mean", "The middle value", "The most frequent value", "The range"], answer: "Squared deviation from the mean" },
    { question: "A completely unrelated question about volcanoes?", type: "true-false", options: ["True", "False"], answer: "True" }
  ])!;

  it("cites the best passage under the answer, links to that chunk, and only in the answer key", () => {
    const plan = planOutput({ blocks: quiz(), title: "Quiz", framed: true, passages, linkBase: "https://luna.test", language: "en" })!;
    const doc = buildOutputDocument(plan, {});
    const student = allText(doc, 0, 0);
    const key = allText(doc, 0, 1);
    expect(key).toContain("Source: Statistics.pdf › 2. Dispersion · passage 3");
    expect(key).toContain("average squared deviation");
    expect(key).not.toContain("passage 7");
    expect(student).not.toContain("Statistics.pdf");
    const layout = doc.template.layouts[0];
    const html = renderHtml(doc.template, doc.data, { layoutId: layout.id, viewId: layout.views[1].id }).html;
    expect(html).toContain('href="https://luna.test/source?d=doc-1&amp;c=3&amp;q=');
    expect(layoutDocument(doc.template, doc.data, { layoutId: layout.id, viewId: layout.views[1].id }).overflows).toHaveLength(0);
  });

  it("adds no source when nothing in the material backs the question", () => {
    const plan = planOutput({ blocks: quiz(), title: "Quiz", framed: true, passages: [passages[1]], linkBase: "https://luna.test" })!;
    expect(allText(buildOutputDocument(plan, {}), 0, 1)).not.toContain("volcanoes · passage");
  });
});

describe("language of the printed words", () => {
  const blocks = () => itemsToBlocks([
    { question: "¿Qué mide la varianza?", type: "multiple-choice", options: ["La desviación", "La media", "La moda", "El rango"], answer: "La desviación" },
    { question: "La mediana es robusta.", type: "true-false", options: ["Verdadero", "Falso"], answer: "Verdadero" }
  ])!;

  it("translates the fixed words, in every page size, and leaves English alone", () => {
    const plan = planOutput({ blocks: blocks(), title: "Prueba", framed: true, language: "es" })!;
    const es = buildOutputDocument(plan, {}, { language: "es" });
    const key = allText(es, 0, 1).toLowerCase();
    for (const word of ["respuesta", "verdadero", "falso", "nombre", "fecha"]) expect(key).toContain(word);
    for (const word of ["answer", "true", "name", "date"]) expect(key).not.toContain(word);
    expect(allText(es, 1, 1).toLowerCase()).toContain("respuesta");
    expect(allText(buildOutputDocument(plan, {}), 0, 1).toLowerCase()).toContain("answer");
  });

  it("works out the language from the choice, or from the content when it says 'same as the material'", () => {
    expect(labelLanguageFrom("Spanish")).toBe("es");
    expect(labelLanguageFrom("Same as material")).toBeNull();
    const questions = [{ id: "q1", text: "Language" }];
    expect(resolveOutputLanguage(questions, { q1: "French" }, "The mean is the average")).toBe("fr");
    expect(resolveOutputLanguage(questions, { q1: "Same as material" }, "¿Cuál es el valor de la mediana en la muestra?")).toBe("es");
    expect(detectLanguage("Wat is de mediaan van de steekproef en het gemiddelde?")).toBe("nl");
    expect(detectLanguage("What is the median of the sample?")).toBe("en");
  });

  it("numbers the section and page words in the chosen language", () => {
    const plan = planOutput({ blocks: [{ type: "section_header", title: "Intro" }], title: "Doc", language: "de" })!;
    expect(allText(buildOutputDocument(plan, {}, { language: "de" }))).toContain("ABSCHNITT 1");
  });
});
