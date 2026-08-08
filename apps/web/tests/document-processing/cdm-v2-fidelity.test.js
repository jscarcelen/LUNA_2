import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildCanonicalDocumentFromDocxFile, buildCanonicalDocumentFromExtraction } from "../../modules/document-processing/canonical/model.js";
import { listDocumentProcessingStages, processUploadedDocument } from "../../modules/document-processing/index.js";
import { normalizeCanonicalDocument } from "../../modules/document-processing/normalization/semanticNormalizer.js";
import { renderCanonicalDocumentToHtml } from "../../modules/document-processing/renderers/htmlRenderer.js";
import { renderCanonicalDocumentToText } from "../../modules/document-processing/renderers/textRenderer.js";
import {
  createAdversarialFixtures,
  createComplexDocxFixtureFile,
  createMinimalDocxFixtureFile,
  createStatisticsDocxFixtureFile
} from "./fixtures/docxFixtureFactory.js";

function getAllBlocks(cdm = {}) {
  const sections = Array.isArray(cdm?.sections) ? cdm.sections : [];
  return sections.flatMap((section) => Array.isArray(section?.blocks) ? section.blocks : []);
}

function getNestedBlocks(block = {}) {
  if (block?.type !== "table") return [];
  const rows = Array.isArray(block?.rows) ? block.rows : [];
  return rows.flatMap((row) => (Array.isArray(row) ? row : [])
    .flatMap((cell) => (Array.isArray(cell?.blocks) ? cell.blocks : [])));
}

function normalizeWords(text = "") {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function jaccardSimilarity(a = "", b = "") {
  const left = new Set(normalizeWords(a));
  const right = new Set(normalizeWords(b));
  if (!left.size && !right.size) return 1;
  const intersection = [...left].filter((word) => right.has(word)).length;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}

function countInXml(source = "", pattern) {
  const matches = String(source || "").match(pattern);
  return Array.isArray(matches) ? matches.length : 0;
}

async function readDocxXml(file = {}) {
  const zip = await JSZip.loadAsync(Buffer.from(String(file?.contentBase64 || ""), "base64"));
  const documentXml = await zip.file("word/document.xml")?.async("string");
  const headers = Object.keys(zip.files)
    .filter((path) => /^word\/header\d+\.xml$/i.test(path))
    .sort();
  const footers = Object.keys(zip.files)
    .filter((path) => /^word\/footer\d+\.xml$/i.test(path))
    .sort();

  const headerXml = [];
  for (const path of headers) {
    headerXml.push(await zip.file(path)?.async("string") || "");
  }

  const footerXml = [];
  for (const path of footers) {
    footerXml.push(await zip.file(path)?.async("string") || "");
  }

  return {
    documentXml: String(documentXml || ""),
    headerXml,
    footerXml
  };
}

function countTableBlocks(cdm = {}) {
  const blocks = getAllBlocks(cdm);
  let total = 0;
  for (const block of blocks) {
    if (block?.type === "table") {
      total += 1;
      const nested = getNestedBlocks(block);
      total += nested.filter((child) => child?.type === "table").length;
    }
  }
  return total;
}

function countHeadingBlocks(cdm = {}) {
  return getAllBlocks(cdm).filter((block) => block?.type === "heading").length;
}

function countInlineMathNodes(cdm = {}) {
  const blocks = getAllBlocks(cdm);
  return blocks.reduce((sum, block) => {
    const children = Array.isArray(block?.children) ? block.children : [];
    const count = children.filter((child) => child?.type === "inline_math").length;
    return sum + count;
  }, 0);
}

function calcFidelityScore(metrics = {}) {
  const textSimilarity = Math.max(0, Math.min(1, Number(metrics.textSimilarity || 0)));
  const equationCoverage = Math.max(0, Math.min(1, Number(metrics.equationCoverage || 0)));
  const tableCoverage = Math.max(0, Math.min(1, Number(metrics.tableCoverage || 0)));
  const headingCoverage = Math.max(0, Math.min(1, Number(metrics.headingCoverage || 0)));
  const inlinePreservation = Math.max(0, Math.min(1, Number(metrics.inlinePreservation || 0)));

  return Number((
    textSimilarity * 0.25
+    + equationCoverage * 0.3
+    + tableCoverage * 0.2
+    + headingCoverage * 0.15
+    + inlinePreservation * 0.1
  ).toFixed(3));
}

describe("CDM v2 DOCX fidelity", () => {
  it("keeps baseline no-flattening guarantee", async () => {
    const file = await createMinimalDocxFixtureFile();
    const cdm = await buildCanonicalDocumentFromDocxFile(file, {});
    const blocks = getAllBlocks(cdm);
    const paragraphBlock = blocks.find((block) => block?.type === "paragraph");

    expect(paragraphBlock).toBeTruthy();
    expect(Array.isArray(paragraphBlock.children)).toBe(true);
    expect(paragraphBlock.children.map((child) => child.type)).toEqual(["text", "inline_math", "text"]);
    expect(paragraphBlock.text).toBeUndefined();
  });

  it("ensures renderer output is CDM-driven and ignores extraction fallback html", async () => {
    const file = await createComplexDocxFixtureFile();
    const cdm = await buildCanonicalDocumentFromExtraction({
      file,
      detectedType: "docx",
      extraction: {
        sourceRenderHtml: "<p>SHOULD_NOT_APPEAR</p>",
        text: "SHOULD_NOT_APPEAR"
      }
    });

    const html = renderCanonicalDocumentToHtml(cdm);
    expect(html).not.toContain("SHOULD_NOT_APPEAR");
  });

  it("normalizes statistics document before rendering and preserves math/list structure", async () => {
    const stages = listDocumentProcessingStages();
    expect(stages).toContain("normalize");
    expect(stages.indexOf("normalize")).toBeGreaterThan(stages.indexOf("canonical-model"));
    expect(stages.indexOf("normalize")).toBeLessThan(stages.indexOf("render"));

    const file = await createStatisticsDocxFixtureFile();
    const raw = await buildCanonicalDocumentFromDocxFile(file, {});
    const normalized = normalizeCanonicalDocument(raw);

    const html = renderCanonicalDocumentToHtml(normalized);
    const processed = await processUploadedDocument(file, {});
    const markdown = processed.markdown;
    const diagnostics = (normalized.equations || []).map((equation) => equation.diagnostics || null).filter(Boolean);

    expect((html.match(/<h1>Statistics Report<\/h1>/g) || []).length).toBe(1);
    expect(html).not.toContain("<h2>statistics-regression.docx</h2>");
    expect(html).not.toContain("Header statistics note");
    expect(html).not.toContain("Footer statistics note");

    expect(html).not.toContain("x_(i)");
    expect(html).toContain("x_i");
    expect(html).not.toContain("S_(x)^(2)");
    expect(html).toContain("S_x^2");
    expect(html).toContain("\\bar{x}");
    expect(html).toContain("\\frac{1}{n-1}");
    expect(html).toContain("\\sum_{i=1}^{n}");
    expect(html).not.toContain("<m:oMath");
    expect(html).not.toContain("oMathPara");

    expect(markdown).toContain("Sample variance $S_x^2$ for score $x_i$.");
    expect(markdown).toMatch(/- Observation .*\$x_i\$/);
    expect(markdown).toContain("$$\nS_x^2 = ");
    expect(markdown).toContain("\\frac{1}{n-1}");
    expect(markdown).toContain("\\sum_{i=1}^{n}");
    expect(markdown).not.toContain("Header statistics note");
    expect(markdown).not.toContain("Footer statistics note");
    expect(markdown).not.toContain("x_(i)");
    expect(markdown).not.toContain("S_(x)^(2)");
    expect(markdown).not.toContain("cdm-document");
    expect(markdown).not.toContain("&amp;");
    expect(markdown).not.toContain("&lt;");

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.every((item) => String(item.originalOmml || "").includes("<m:oMath"))).toBe(true);
    expect(diagnostics.some((item) => String(item.canonicalLatex || "").includes("\\frac{1}{n-1}"))).toBe(true);
    expect(diagnostics.some((item) => String(item.canonicalLatex || "").includes("\\sum_{i=1}^{n}"))).toBe(true);
    expect(Array.isArray(processed.canonicalVerification?.uniquenessErrors)).toBe(true);
    expect(processed.canonicalVerification?.uniquenessErrors || []).toHaveLength(0);
  });

  it("validates adversarial fixtures with provenance, deterministic math, and fidelity metrics", async () => {
    const fixtures = await createAdversarialFixtures();
    const scoreRows = [];

    for (const fixture of fixtures) {
      const cdmA = await buildCanonicalDocumentFromDocxFile(fixture.file, {});
      const cdmB = await buildCanonicalDocumentFromDocxFile(fixture.file, {});
      const htmlA = renderCanonicalDocumentToHtml(cdmA);
      const htmlB = renderCanonicalDocumentToHtml(cdmB);

      expect(cdmA.schemaVersion).toBe("2.0");
      expect(cdmA.schema_version).toBe("cdm.v2");
      expect(cdmA).toMatchSnapshot(`${fixture.id}:cdm`);
      expect(htmlA).toMatchSnapshot(`${fixture.id}:html`);
      expect(htmlA).toBe(htmlB);

      const latexA = (cdmA.equations || []).map((eq) => eq.latex);
      const latexB = (cdmB.equations || []).map((eq) => eq.latex);
      expect(latexA).toEqual(latexB);

      const equationTypes = new Set((cdmA.equations || []).map((equation) => equation.type));
      if (fixture.id === "equations-complex" || fixture.id === "combined-adversarial") {
        expect(equationTypes.has("inline_equation")).toBe(true);
        expect(equationTypes.has("display_equation")).toBe(true);
      }

      for (const equation of cdmA.equations || []) {
        expect(equation.id).toMatch(/^EQ-\d+$/);
        expect(equation.nodePath).toMatch(/^(body|header(\[\d+\])?|footer(\[\d+\])?)\//);
        if (equation.type === "display_equation") {
          expect(equation.nodePath).toMatch(/oMathPara/);
        }
        if (equation.type === "inline_equation") {
          expect(equation.nodePath).toMatch(/oMath/);
        }
      }

      const allBlocks = getAllBlocks(cdmA);
      const tableBlocks = allBlocks.filter((block) => block?.type === "table");
      for (const table of tableBlocks) {
        const firstRow = Array.isArray(table.rows) ? table.rows[0] : null;
        if (!firstRow) continue;
        const firstCell = Array.isArray(firstRow) ? firstRow[0] : null;
        if (!firstCell) continue;
        expect(firstCell.type).toBe("table_cell");
        expect(Array.isArray(firstCell.blocks)).toBe(true);
      }

      const formattedTextChildren = allBlocks.flatMap((block) => Array.isArray(block?.children) ? block.children : []);
      if (fixture.id === "formatting-edge" || fixture.id === "combined-adversarial") {
        expect(formattedTextChildren.some((child) => child?.type === "text" && child?.formatting?.color)).toBe(true);
        expect(formattedTextChildren.some((child) => child?.type === "text" && child?.formatting?.highlight)).toBe(true);
        expect(formattedTextChildren.some((child) => child?.type === "hyperlink")).toBe(true);
      }

      const xml = await readDocxXml(fixture.file);
      const sourceEquationCount = countInXml(xml.documentXml, /<m:oMath\b|<m:oMathPara\b/g)
        + xml.headerXml.reduce((sum, part) => sum + countInXml(part, /<m:oMath\b|<m:oMathPara\b/g), 0)
        + xml.footerXml.reduce((sum, part) => sum + countInXml(part, /<m:oMath\b|<m:oMathPara\b/g), 0);
      const sourceTableCount = countInXml(xml.documentXml, /<w:tbl\b/g)
        + xml.headerXml.reduce((sum, part) => sum + countInXml(part, /<w:tbl\b/g), 0)
        + xml.footerXml.reduce((sum, part) => sum + countInXml(part, /<w:tbl\b/g), 0);
      const sourceHeadingCount = countInXml(xml.documentXml, /<w:pStyle\b[^>]*w:val="Heading[1-6]"/g);

      const extractedText = renderCanonicalDocumentToText(cdmA);
      const textSimilarity = jaccardSimilarity(fixture.expected?.sourceText || "", extractedText);
      const equationCoverageRaw = sourceEquationCount > 0
        ? (cdmA.equations || []).length / sourceEquationCount
        : 1;
      const tableCoverageRaw = sourceTableCount > 0
        ? countTableBlocks(cdmA) / sourceTableCount
        : 1;
      const headingCoverageRaw = sourceHeadingCount > 0
        ? countHeadingBlocks(cdmA) / sourceHeadingCount
        : 1;
      const inlinePreservationRaw = (cdmA.equations || []).length > 0
        ? Math.min(1, countInlineMathNodes(cdmA) / (cdmA.equations || []).length)
        : 1;

      const equationCoverage = Math.min(1, equationCoverageRaw);
      const tableCoverage = Math.min(1, tableCoverageRaw);
      const headingCoverage = Math.min(1, headingCoverageRaw);
      const inlinePreservation = Math.min(1, inlinePreservationRaw);

      const fidelityScore = calcFidelityScore({
        textSimilarity,
        equationCoverage,
        tableCoverage,
        headingCoverage,
        inlinePreservation
      });

      scoreRows.push({
        fixture: fixture.id,
        textSimilarity: Number(textSimilarity.toFixed(3)),
        equationCoverage: Number(equationCoverage.toFixed(3)),
        tableCoverage: Number(tableCoverage.toFixed(3)),
        headingCoverage: Number(headingCoverage.toFixed(3)),
        inlinePreservation: Number(inlinePreservation.toFixed(3)),
        fidelityScore
      });

      expect((cdmA.equations || []).length).toBeGreaterThanOrEqual(Number(fixture.expected?.minEquationCount || 0));
      expect(countHeadingBlocks(cdmA)).toBeGreaterThanOrEqual(Number(fixture.expected?.minHeadingCount || 0));
      expect(countTableBlocks(cdmA)).toBeGreaterThanOrEqual(Number(fixture.expected?.minTableCount || 0));
      expect(fidelityScore).toBeGreaterThanOrEqual(Number(fixture.expected?.minFidelityScore || 0.7));

      const processed = await processUploadedDocument(fixture.file, {});
      expect(processed.method).toBe("docx-ooxml-cdm");
      expect(processed.canonicalDocument?.schemaVersion).toBe("2.0");
      expect(processed.sourceRenderHtml).toContain("cdm-document");
      expect(processed.markdown).not.toContain("cdm-document");
      expect(processed.markdown).not.toContain("&amp;");
      expect(processed.markdown).not.toContain("&lt;");
      expect(processed.canonicalVerification?.uniquenessErrors || []).toHaveLength(0);
    }

    expect(scoreRows).toMatchSnapshot("adversarial-fidelity-scores");
  });
});
