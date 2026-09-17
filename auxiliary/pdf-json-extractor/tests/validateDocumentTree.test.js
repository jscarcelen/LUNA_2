import test from "node:test";
import assert from "node:assert/strict";
import { validateDocumentTree } from "../src/validateDocumentTree.js";

test("validateDocumentTree accepts valid minimal document", () => {
  const result = validateDocumentTree({
    type: "document",
    schemaVersion: "cdm-v3",
    source: { primaryType: "pdf" },
    supportedSourceTypes: ["pdf", "ocr", "unknown"],
    metadata: { filename: "sample.pdf" },
    pages: [
      {
        width: 612,
        height: 792,
        source: { type: "pdf" },
        evidence: [],
        elements: [
          {
            id: "p1-el1",
            type: "paragraph",
            bbox: { x: 10, y: 10, width: 100, height: 20 },
            sourceRefs: [{ sourceId: "p1-text-00001", sourceType: "pdf-text", kind: "textPaint" }],
            confidence: { overall: 1, text: 1, geometry: 1, classification: null, style: 1, math: null }
          }
        ],
        readingOrder: []
      }
    ]
  });

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("validateDocumentTree reports malformed document", () => {
  const result = validateDocumentTree({
    schemaVersion: "wrong"
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});
