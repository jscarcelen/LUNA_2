import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { parseXml, readDocxZip } from "../src/utils.js";
import { parseDocument } from "../src/parseDocument.js";
import { parseMathNode } from "../src/parseMath.js";
import { auditMathCanonicalization, EXPECTED_EQUATIONS } from "../src/auditMathCanonicalization.js";

async function buildDocumentTree() {
  const inputFile = path.resolve(process.cwd(), "..", "..", "Statistics.docx");
  const zip = await readDocxZip(inputFile);
  const { documentTree } = await parseDocument(zip, {});
  return documentTree;
}

function parseStandaloneMath(xml) {
  const doc = parseXml(xml);
  const node = doc.documentElement;
  return parseMathNode(node, {
    display: false,
    nextEquationId: () => 1,
    diagnostics: { unsupportedElements: [], warnings: [], errors: [] },
    part: "test.xml",
    path: "test/oMath[1]",
    paragraphIndex: 1,
    runIndex: 1
  });
}

test("square root OMML canonicalizes without unsupported degree placeholder", () => {
  const equation = parseStandaloneMath(`
    <m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
      <m:rad>
        <m:radPr><m:degHide m:val="1"/></m:radPr>
        <m:deg />
        <m:e><m:r><m:t>x</m:t></m:r></m:e>
      </m:rad>
    </m:oMath>
  `);

  assert.equal(equation.latex, "\\sqrt{x}");
  assert.ok(!equation.latex.includes("UNSUPPORTED"));
});

test("nth root OMML canonicalizes with explicit degree", () => {
  const equation = parseStandaloneMath(`
    <m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
      <m:rad>
        <m:deg><m:r><m:t>3</m:t></m:r></m:deg>
        <m:e><m:r><m:t>x</m:t></m:r></m:e>
      </m:rad>
    </m:oMath>
  `);

  assert.equal(equation.latex, "\\sqrt[3]{x}");
});

test("statistics equations canonicalize cleanly and match locked expectations", async () => {
  const documentTree = await buildDocumentTree();
  const report = auditMathCanonicalization(documentTree);

  assert.equal(documentTree.diagnostics.unsupportedElements.length, 0);
  assert.equal(report.canonicalMathErrors, 0);
  assert.equal(report.canonicalLaTeXContainsUnsupportedTokens, false);
  assert.equal(report.equationReports.length, 23);

  const equationMap = new Map(report.equationReports.map((item) => [item.id, item]));
  for (const [equationId, expectedLatex] of Object.entries(EXPECTED_EQUATIONS)) {
    assert.equal(equationMap.get(equationId)?.latex, expectedLatex, equationId);
    assert.equal(equationMap.get(equationId)?.passed, true, equationId);
  }
});