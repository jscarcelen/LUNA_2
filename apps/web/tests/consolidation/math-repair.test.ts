import { describe, expect, it } from "vitest";
import { repairNotesMath, runConsolidation } from "../../modules/ai-tools/pipeline/consolidator.js";
import { isValidTex } from "../../modules/template-studio/engine/math/repair";
import { splitRich } from "../../modules/template-studio/engine/math/richText";

const repair: any = repairNotesMath;
const run: any = runConsolidation;

const para = (text: string) => ({ type: "paragraph", text, sources: ["S1"] });
/** Every formula of a text must be accepted by KaTeX. */
const allValid = (text: string) => splitRich(text).filter((seg) => seg.t === "math").every((seg: any) => isValidTex(seg.tex, seg.display));

describe("consolidator: valid maths in the notes", () => {
  it("repairs the usual ways a model breaks a formula, in every field", async () => {
    const blocks = [
      para("Varianza \\(S_x^2 = \\frac{1}{n-1}\\sum_{i=1}^{n}(x_i-\\bar{x})^2\\)."),
      para("Doble escape: $\\\\frac{a}{b} + \\\\sqrt{c}$"),
      para("Unicode dentro: $S²ₓ = √(a+b) ± x̄$"),
      { type: "bullet_list", text: "", sources: ["S1"], bullets: [{ text: "Media $\\bar{x}=\\frac{1}{n}\\sum x_i$", sources: ["S1"] }, { text: "Precio: $40,000 y $5,000", sources: ["S1"] }] },
      { type: "table_row", term: "$\\sigma$", meaning: "desviación \\[\\sigma=\\sqrt{S_x^2}\\]", detail: "", sources: ["S1"] }
    ];
    const { blocks: out, stats } = await repair(blocks);
    const texts = out.flatMap((block: any) => [block.text, block.term, block.meaning, ...(block.bullets || []).map((bullet: any) => bullet.text)]).filter(Boolean);
    for (const text of texts) expect(allValid(text)).toBe(true);
    expect(out[0].text).toBe("Varianza $S_x^2 = \\frac{1}{n-1}\\sum_{i=1}^{n}(x_i-\\bar{x})^2$.");
    expect(out[1].text).toBe("Doble escape: $\\frac{a}{b} + \\sqrt{c}$");
    expect(out[2].text).not.toMatch(/[²ₓ√±]/);
    expect(out[3].bullets[1].text).toBe("Precio: \\$40,000 y \\$5,000");
    expect(out[4].meaning).toContain("$$\\sigma=\\sqrt{S_x^2}$$");
    expect(stats.repaired).toBeGreaterThanOrEqual(4);
    // The input is not modified.
    expect(blocks[0].text).toContain("\\(");
  });

  it("asks the model once, in one batch, for the formulas no local fix can save", async () => {
    const requests: any[] = [];
    const ask = async (request: any) => {
      requests.push(request);
      const input = JSON.parse(request.user);
      return { parsed: { fixes: input.formulas.map((item: any) => ({ id: item.id, latex: "\\frac{a}{b}" })) } };
    };
    const { blocks, stats } = await repair([para("Uno $\\frac{a}$ y dos $\\frac{x}$ y tres $\\frac{a}$."), para("Otra $\\frac{q}$.")], { ask });
    expect(requests).toHaveLength(1);
    expect(JSON.parse(requests[0].user).formulas).toHaveLength(3);
    expect(stats.modelFixed).toBe(3);
    expect(blocks[0].text).toBe("Uno $\\frac{a}{b}$ y dos $\\frac{a}{b}$ y tres $\\frac{a}{b}$.");
    expect(allValid(blocks[1].text)).toBe(true);
  });

  it("shows what still fails as a code span, never as broken markup", async () => {
    const { blocks, stats } = await repair([para("Roto $\\frac{a}$ fin")], { ask: async () => ({ parsed: { fixes: [{ id: "F1", latex: "\\frac{" }] } }) });
    expect(blocks[0].text).toBe("Roto `\\frac{a}` fin");
    expect(stats.codeSpans).toBe(1);
  });

  it("leaves text without maths exactly as it was", async () => {
    const blocks = [para("Osmosis is the passive movement of water."), para("Costs 5 USD.")];
    const { blocks: out, stats } = await repair(blocks);
    expect(out.map((block: any) => block.text)).toEqual(blocks.map((block) => block.text));
    expect(stats.repaired).toBe(0);
  });

  it("runs inside a consolidation: flattened source maths comes out as LaTeX the renderer accepts", async () => {
    const document = { id: "doc-stat", name: "Statistics.md", content: "# Dispersion\n\nThe sample variance is S²ₓ = (1)/(n-1) ∑ᵢ₌₁ⁿ(xᵢ - x̄)² and the deviation is its root." };
    const callModel = async (request: any) => {
      const input = JSON.parse(request.user);
      if (request.schemaName !== "consolidation_notes") throw new Error("unexpected request");
      // The model copies the flattened formula verbatim, between dollars, as it was told not to.
      return { parsed: { topics: [{ title: "Dispersion", blocks: [{ type: "paragraph", text: "The sample variance is $S²ₓ = (1)/(n-1) ∑ᵢ₌₁ⁿ(xᵢ - x̄)²$ \\\\frac{x}{y}.", level: null, callout_type: null, bullets: null, term: null, meaning: null, detail: null, sources: [input.passages[0].sourceId] }] }] }, usage: null };
    };
    const result = await run({ documents: [document], options: {}, deps: { callModel } });
    const paragraph = result.blocks.find((block: any) => block.type === "paragraph");
    expect(paragraph.text).toContain("\\frac{1}{n-1}");
    expect(paragraph.text).toContain("\\sum_{i=1}^{n}");
    expect(paragraph.text).toContain("\\bar{x}");
    expect(allValid(paragraph.text)).toBe(true);
    expect(result.stats.mathRepair.repaired).toBeGreaterThan(0);
  });
});
