import test from "node:test";
import assert from "node:assert/strict";
import { buildRepresentationPlan } from "../src/rendering/representationPlanner.js";
import { renderFidelityHtml } from "../src/renderDocument.js";

function sampleDoc() {
  return {
    pages: [
      {
        pageNumber: 1,
        width: 200,
        height: 120,
        fidelityObjects: [
          {
            id: "fo-text-1",
            type: "textPaint",
            sourceRefs: [{ sourceId: "op-1" }],
            sourceOperatorIndex: 1,
            bbox: { x: 10, y: 10, width: 80, height: 12 },
            text: "Hello",
            font: { name: "g_d0_f2", size: 12, weight: 400, italic: false },
            spacing: { characterSpacing: 0, wordSpacing: 0, horizontalScale: 100 },
            textRise: 0,
            fillColor: "rgb(0,0,0)",
            segments: [{ type: "text", text: "Hel" }, { type: "adjustment", adjustment: -120 }, { type: "text", text: "lo" }]
          },
          {
            id: "fo-text-2",
            type: "textPaint",
            sourceRefs: [{ sourceId: "op-2" }],
            sourceOperatorIndex: 2,
            bbox: { x: 10, y: 30, width: 60, height: 12 },
            text: "World",
            font: { name: "Arial", size: 12, weight: 400, italic: false },
            spacing: { characterSpacing: 0, wordSpacing: 0, horizontalScale: 100 },
            textRise: 0,
            fillColor: "rgb(0,0,0)",
            segments: [{ type: "text", text: "World" }]
          },
          {
            id: "fo-image-1",
            type: "imagePaint",
            sourceRefs: [{ sourceId: "img-1" }],
            sourceOperatorIndex: 3,
            bbox: { x: 90, y: 10, width: 50, height: 30 },
            imageDataUri: null
          },
          {
            id: "fo-vector-1",
            type: "vectorPaint",
            sourceRefs: [{ sourceId: "vec-1" }],
            sourceOperatorIndex: 4,
            commands: [{ op: "lineTo", args: [1, 2] }],
            zOrder: 4
          }
        ]
      }
    ]
  };
}

test("representation planner selects mixed render modes", () => {
  const plan = buildRepresentationPlan(sampleDoc());
  const byId = new Map(plan.decisions.map((row) => [row.nodeId, row]));

  assert.equal(byId.get("fo-text-1")?.representation, "svg-text");
  assert.equal(byId.get("fo-text-2")?.representation, "svg-text");
  assert.equal(byId.get("fo-image-1")?.representation, "source-crop");
  assert.equal(byId.get("fo-vector-1")?.representation, "svg-path");

  assert.equal(plan.counts["svg-text"], 2);
  assert.equal(plan.counts["native-html"], 0);
  assert.equal(plan.counts["source-crop"], 1);
  assert.equal(plan.counts["svg-path"], 1);
});

test("fidelity renderer emits semantic and visual layers with provenance", () => {
  const doc = sampleDoc();
  const plan = buildRepresentationPlan(doc);
  const html = renderFidelityHtml(doc, plan);

  assert.match(html, /class="semantic-text"/);
  assert.match(html, /data-semantic-node-id="fo-text-1"/);
  assert.match(html, /data-visual-representation="svg-text"/);
  assert.match(html, /data-visual-representation="source-crop"/);
  assert.match(html, /data-visual-representation="svg-path"/);
  assert.match(html, /data-node-id="fo-text-1"/);
  assert.match(html, /data-source-op="1"/);
});
