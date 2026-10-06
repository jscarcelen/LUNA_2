import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName } from "pdf-lib";
import JSZip from "jszip";
import { createTemplate, createText } from "../../modules/template-studio/engine/model";
import { layoutDocument } from "../../modules/template-studio/engine/layout";
import { renderDocx, renderHtml, renderPdf, renderPptx } from "../../modules/template-studio/engine/renderers/index";
import { buildOutputDocument, planOutput } from "../../modules/template-studio/output/outputDocument";
import { breakMath, hasRich, richToPlain, splitRich } from "../../modules/template-studio/engine/math/richText";
import { layoutRich } from "../../modules/template-studio/engine/math/richLayout";
import { estimateMath, katexExtent, typesetMath } from "../../modules/template-studio/engine/math/typeset";
import { hasMath, latexToUnicode, renderMath } from "../../modules/template-studio/engine/latex";

const VARIANCE = "S_x^2=\\frac{1}{n-1}\\sum_{i=1}^{n}(x_i-\\bar{x})^2";

const textTemplate = (value: string, width = 160) => {
  const template = createTemplate("maths");
  template.layouts[0].pages[0].elements = [createText({ type: "static", value }, { frame: { x: 20, y: 20, w: width, h: 8 } })];
  return template;
};
const textItemOf = (value: string, width?: number) => layoutDocument(textTemplate(value, width), {}).pages[0].items.find((item) => item.type === "text") as any;

describe("maths and prices in text", () => {
  it("detects inline, display and \\( \\) formulas and keeps their raw LaTeX", () => {
    const segs = splitRich(`La varianza $${VARIANCE}$ y $$x^2$$ y \\(a\\leq b\\) y \\[c\\]`);
    expect(segs.filter((seg) => seg.t === "math")).toEqual([
      { t: "math", tex: VARIANCE, display: false },
      { t: "math", tex: "x^2", display: true },
      { t: "math", tex: "a\\leq b", display: false },
      { t: "math", tex: "c", display: true }
    ]);
    expect(hasRich(segs)).toBe(true);
  });

  it("never treats prices or currency as maths", () => {
    for (const text of ["It costs $40,000 in 2019 and $5,000 in 2020.", "Pay $5 each, $6 total", "Price: $ 40 and $50", "$40,000 … $5,000", "Costs \\$5 and \\$6"]) {
      expect(splitRich(text).every((seg) => seg.t === "text")).toBe(true);
      expect(hasMath(text)).toBe(false);
    }
    expect(splitRich("Costs \\$5 and \\$6")).toEqual([{ t: "text", text: "Costs $5 and $6" }]);
    expect(renderMath("It costs $40,000 and $5,000.")).toBe("It costs $40,000 and $5,000.");
    // and a price next to a real formula
    const mixed = splitRich("Earn $40,000 then $x^2$ more");
    expect(mixed.filter((seg) => seg.t === "math")).toEqual([{ t: "math", tex: "x^2", display: false }]);
  });

  it("does not take a sentence between two dollars for a formula", () => {
    expect(splitRich("one $this is a long sentence of prose$ two").every((seg) => seg.t === "text")).toBe(true);
  });

  it("reads Markdown links, including the bracketed source tags", () => {
    const segs = splitRich("Ver [[D1 p.3](https://luna.test/source?d=a&p=3) · [D2](https://luna.test/source?d=b)] fin");
    expect(segs.filter((seg) => seg.t === "link")).toEqual([
      { t: "link", text: "D1 p.3", href: "https://luna.test/source?d=a&p=3" },
      { t: "link", text: "D2", href: "https://luna.test/source?d=b" }
    ]);
    expect(richToPlain(segs)).toBe("Ver [D1 p.3 · D2] fin");
  });
});

describe("laying out text that carries maths", () => {
  it("keeps the raw LaTeX in a `math` representation next to the plain lines", () => {
    const item = textItemOf(`La varianza se define como $${VARIANCE}$ para la muestra.`);
    expect(item.math.lines.length).toBe(item.lines.length);
    const formulas = item.math.lines.flatMap((line: any) => line.segs).filter((seg: any) => seg.t === "math");
    expect(formulas.map((seg: any) => seg.tex).join("")).toBe(VARIANCE);
    // the plain fallback is readable Unicode, with the limits of the sum kept
    expect(item.lines.join(" ")).toContain("∑(i=1→n)");
    expect(item.lines.join(" ")).not.toContain("\\frac");
  });

  it("does not add `math` to text that has none", () => {
    expect(textItemOf("Plain text, costs $40,000 and $5,000.").math).toBeUndefined();
  });

  it("gives a line with a stacked fraction or a sum the extra height it needs", () => {
    const plain = textItemOf("La varianza se define como la media de los cuadrados.");
    const tall = textItemOf(`La varianza se define como $${VARIANCE}$ y es la media.`);
    const flat = textItemOf("La varianza se define como $x_i+y$ y es la media.");
    const pitchOf = (item: any) => item.math.lines[0].pitch;
    const base = (plain.style.fontSize * 0.352778) * plain.style.lineHeight;
    expect(pitchOf(flat)).toBeLessThanOrEqual(pitchOf(tall));
    // An inline fraction with a sum next to it needs more than a plain line…
    expect(pitchOf(tall)).toBeGreaterThan(base);
    // …and display maths, stacked, needs about two and a half.
    const stacked = textItemOf(`Antes $$${VARIANCE}$$ después`).math.lines.find((line: any) => line.display);
    expect(stacked.pitch).toBeGreaterThan(base * 2);
    expect(stacked.extraEm).toBeGreaterThan(1);
    // The estimate is what KaTeX's own struts say, not a guess.
    const real = katexExtent(VARIANCE, true)!;
    expect((real.h + real.d) * 1.1).toBeGreaterThan(2.5);
  });

  it("puts display maths on its own centred line and wraps a long one at its operators", () => {
    const long = "a_1+a_2+a_3+a_4+a_5+a_6+a_7+a_8+a_9+a_{10}+a_{11}+a_{12}+a_{13}+a_{14}+a_{15}+a_{16}+a_{17}+a_{18}+a_{19}+a_{20}+a_{21}+a_{22}=S";
    const item = textItemOf(`Antes $$${long}$$ después`, 90);
    const display = item.math.lines.filter((line: any) => line.display);
    expect(display.length).toBeGreaterThan(1);
    expect(item.math.lines[0].display).toBeFalsy();
    expect(item.math.lines[item.math.lines.length - 1].display).toBeFalsy();
    // joined again, the pieces are the original formula
    expect(display.flatMap((line: any) => line.segs).map((seg: any) => seg.tex).join("")).toBe(long);
  });

  it("keeps every inline formula inside the card width, shrinking only a piece that cannot be broken", () => {
    const widthMm = 60;
    const { rich } = layoutRich(
      [splitRich("Una fórmula larga $\\sum_{i=1}^{n}\\sum_{j=1}^{m}\\frac{(x_{ij}-\\bar{x})^2}{(n-1)(m-1)}+\\frac{1}{2}+\\frac{3}{4}+\\sqrt{x}+\\sqrt{y}=\\alpha+\\beta+\\gamma$ y más texto")],
      { fontSize: 10, lineHeight: 1.35 },
      widthMm
    );
    expect(rich.length).toBeGreaterThan(1);
    const emMm = 10 * 0.352778;
    for (const line of rich) {
      let width = 0;
      for (const seg of line.segs) {
        if (seg.t === "math") width += (estimateMath(seg.tex, false)?.w || 0) * 1.1 * (seg.shrink || 1);
        else width += seg.t === "text" ? seg.text.length * 0.5 : 0;
      }
      expect(width * emMm).toBeLessThan(widthMm * 1.25);
    }
  });

  it("splits a formula only at the top level", () => {
    expect(breakMath("a+b=\\frac{c+d}{e}+f").join("|")).toBe("a|+b|=\\frac{c+d}{e}|+f");
    expect(breakMath("\\left(a+b\\right)+c").length).toBe(2);
    expect(breakMath("x_{i=1}^{n}")).toEqual(["x_{i=1}^{n}"]);
  });

  it("pushes the components below instead of overlapping them", () => {
    const tall = `Texto con $${VARIANCE}$ y $$${VARIANCE}$$ y $$\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}\\begin{pmatrix}x\\\\y\\end{pmatrix}$$ seguido de más texto.`;
    const blocks = [{ type: "section_header", title: "Uno", intro: null }, { type: "paragraph", text: tall }, { type: "paragraph", text: tall }, { type: "callout", text: tall, callout_type: "info" }, { type: "paragraph", text: "Final." }];
    const plan: any = planOutput({ blocks: blocks as any, title: "T" });
    const doc: any = buildOutputDocument(plan, {});
    for (const layout of doc.template.layouts) {
      const result = layoutDocument(doc.template, doc.data, { layoutId: layout.id });
      let checked = 0;
      for (const page of result.pages) {
        const texts = page.items.filter((item: any) => item.type === "text") as any[];
        // Each text's lines stay inside its own box, and no two texts that share a column overlap vertically.
        for (const item of texts) {
          const used = item.math ? item.math.lines.reduce((sum: number, line: any) => sum + line.pitch, 0) : 0;
          expect(item.h + 0.01).toBeGreaterThanOrEqual(used);
        }
        for (const a of texts) for (const b of texts) {
          if (a === b || a.y >= b.y || Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) < 1) continue;
          if (!a.math) continue;
          checked += 1;
          expect(a.y + a.h).toBeLessThanOrEqual(b.y + 0.6);
        }
      }
      expect(checked, layout.name).toBeGreaterThan(0);
    }
  });
});

describe("the maths typesetter", () => {
  it("typesets fractions, sums, roots, accents and matrices into boxes", () => {
    for (const tex of [VARIANCE, "\\sqrt{\\frac{a}{b}}", "\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}", "\\hat{\\beta}=(X^TX)^{-1}X^Ty", "\\int_0^\\infty e^{-x^2}dx=\\frac{\\sqrt\\pi}{2}", "x \\neq y"]) {
      const box = typesetMath(tex, { display: true });
      expect(box, tex).not.toBeNull();
      expect(box!.w).toBeGreaterThan(0.3);
      expect(box!.ops.length).toBeGreaterThan(0);
    }
    const fraction = typesetMath("\\frac{a}{b}", { display: true })!;
    const inline = typesetMath("a/b", { display: true })!;
    expect(fraction.h + fraction.d).toBeGreaterThan((inline.h + inline.d) * 1.8);
    expect(typesetMath("\\frac{")).toBeNull();
  });

  it("keeps the plain fallback readable", () => {
    expect(latexToUnicode("\\frac{1}{2}")).toBe("1/2");
    expect(latexToUnicode("\\frac{x+1}{2}")).toBe("(x+1)/(2)");
    expect(latexToUnicode("\\bar{x}")).toBe("x̄");
    expect(latexToUnicode("\\sum_{i=1}^{n} x_i")).toBe("∑(i=1→n) xᵢ");
    expect(latexToUnicode("\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}")).toBe("(a, b; c, d)");
    expect(latexToUnicode("\\mathbb{R}")).toBe("ℝ");
  });
});

const consolidated = [
  { type: "document_header", title: "Estadística" },
  { type: "bullet_list", title: "Clave de fuentes", items: ["D1 — Statistics.pdf (3 fragmentos)"], _docs: [{ tag: "D1", id: "doc-1", name: "Statistics.pdf" }] },
  { type: "section_header", title: "Dispersión", intro: null },
  { type: "paragraph", text: `La varianza es $${VARIANCE}$ y la desviación $$S_x=\\sqrt{\\frac{1}{n-1}\\sum_{i=1}^{n}(x_i-\\bar{x})^2}$$ [D1 p.2]`, _tags: [" [D1 p.2]"], _refs: [[{ tag: "D1", documentId: "doc-1", page: 2, heading: "", chunkIndex: 1 }]] },
  { type: "paragraph", text: "Costó $40,000 y luego $5,000. Con $x \\leq 5$ se acepta." }
];

function documentFor() {
  const plan: any = planOutput({ blocks: consolidated as any, title: "Estadística", linkBase: "https://luna.test" });
  return buildOutputDocument(plan, {}) as any;
}

describe("maths in the exports", () => {
  it("HTML carries KaTeX markup and the stylesheet that draws it, offline", () => {
    const doc = documentFor();
    const { html } = renderHtml(doc.template, doc.data, { layoutId: doc.template.layouts[0].id });
    expect(html).toContain('class="katex"');
    expect(html).toContain("katex-display");
    expect(html).toContain("@font-face");
    expect(html).toContain("data:font/woff2;base64");
    expect(html).not.toContain("\\frac");
    expect(html).not.toMatch(/https?:\/\/[^"']*katex/);
    expect(html).toContain("$40,000");
    expect(html).toContain("$5,000");
  });

  it("HTML without maths carries no KaTeX stylesheet", () => {
    const plan: any = planOutput({ blocks: [{ type: "paragraph", text: "Solo texto, $40,000." }] as any, title: "T" });
    const doc: any = buildOutputDocument(plan, {});
    const { html } = renderHtml(doc.template, doc.data, { layoutId: doc.template.layouts[0].id });
    expect(html).not.toContain("katex");
  });

  it("links every source tag to the original document at that page", () => {
    const doc = documentFor();
    const { html } = renderHtml(doc.template, doc.data, { layoutId: doc.template.layouts[0].id });
    expect(html).toContain('href="https://luna.test/source?d=doc-1&amp;p=2&amp;c=1"');
    expect(html).toContain("data-luna-source");
    // the key at the top links the document itself
    expect(html).toContain('href="https://luna.test/source?d=doc-1"');
    const interactive = renderHtml(doc.template, doc.data, { layoutId: doc.template.layouts[0].id, interactiveLinks: true }).html;
    expect(interactive).toContain("luna-open-source");
    expect(html).not.toContain("luna-open-source");
  });

  it("PDF typesets the formulas and makes the tags clickable", async () => {
    const doc = documentFor();
    const bytes = await renderPdf(doc.template, doc.data, { layoutId: doc.template.layouts[0].id });
    const pdf = await PDFDocument.load(bytes);
    let links = 0;
    for (const page of pdf.getPages()) {
      const annots = page.node.lookup(PDFName.of("Annots"));
      links += annots && "size" in (annots as any) ? (annots as any).size() : 0;
    }
    expect(links).toBeGreaterThanOrEqual(2);
    expect(bytes.length).toBeGreaterThan(2000);
  });

  it("DOCX writes native Word equations and hyperlinks, PPTX readable text with clickable tags", async () => {
    const doc = documentFor();
    const docx = await JSZip.loadAsync(await renderDocx(doc.template, doc.data, { layoutId: doc.template.layouts[0].id }));
    const xml = await docx.file("word/document.xml")!.async("string");
    expect(xml).toContain("<m:f>");
    expect(xml).toContain("<m:rad>");
    expect(xml).toContain("<m:nary>");
    expect(xml).toContain("<w:hyperlink");
    const slides = doc.template.layouts.findIndex((layout: any) => layout.class === "slides");
    const pptx = await JSZip.loadAsync(await renderPptx(doc.template, doc.data, { layoutId: doc.template.layouts[slides].id }));
    const slideXml = (await Promise.all(Object.keys(pptx.files).filter((name) => /ppt\/slides\/slide\d+\.xml$/.test(name)).map((name) => pptx.file(name)!.async("string")))).join("");
    expect(slideXml).toContain("hlinkClick");
    expect(slideXml).toContain("∑");
    expect(slideXml).not.toContain("\\frac");
  });
});
