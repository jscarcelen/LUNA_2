import test from "node:test";
import assert from "node:assert/strict";
import { buildMockSourceAgnosticFixtures } from "../src/mockSourceFixtures.js";
import { validateDocumentTree } from "../src/validateDocumentTree.js";
import { renderFidelityHtml, renderSemanticHtml } from "../src/renderDocument.js";

test("mock source-agnostic fixtures validate as CDM v3", () => {
  const fixtures = buildMockSourceAgnosticFixtures();
  assert.ok(fixtures.length >= 4);

  for (const doc of fixtures) {
    const result = validateDocumentTree(doc);
    assert.equal(result.valid, true, `fixture invalid: ${doc?.metadata?.filename} -> ${result.errors.join("; ")}`);
  }
});

test("supports multi-evidence and one-evidence-to-many mappings", () => {
  const fixtures = buildMockSourceAgnosticFixtures();
  const handwriting = fixtures.find((doc) => doc.metadata.filename === "handwriting.json");
  const oneToMany = fixtures.find((doc) => doc.metadata.filename === "one-evidence-many-nodes.json");

  assert.ok(handwriting);
  assert.ok(oneToMany);

  const mathNode = handwriting.pages[0].elements.find((node) => node.type === "math");
  assert.ok(mathNode.sourceRefs.length >= 2);

  const refs = oneToMany.pages[0].elements.map((node) => node.sourceRefs[0].sourceId);
  assert.ok(refs.every((value) => value === "ocr-region-1"));
});

test("fixtures render through fidelity and semantic renderers", () => {
  const fixtures = buildMockSourceAgnosticFixtures();

  for (const doc of fixtures) {
    const fidelityHtml = renderFidelityHtml(doc);
    const semanticHtml = renderSemanticHtml(doc);
    assert.ok(fidelityHtml.includes("<!DOCTYPE html>"));
    assert.ok(semanticHtml.includes("<!DOCTYPE html>"));
  }
});

test("user-corrected OCR preserves original text evidence", () => {
  const fixtures = buildMockSourceAgnosticFixtures();
  const corrected = fixtures.find((doc) => doc.metadata.filename === "user-corrected-ocr.json");
  assert.ok(corrected);

  const node = corrected.pages[0].elements[0];
  assert.equal(node.text, "statistics");
  assert.equal(node.correction.text.status, "userCorrected");
  assert.equal(node.correction.text.originalValue, "statistlcs");
});
