import test from "node:test";
import assert from "node:assert/strict";
import { replayTextStateForPage } from "../src/textStateReplayer.js";

function typedMatrix(values) {
  return {
    type: "typed-array",
    constructor: "Float32Array",
    length: 6,
    preview: values
  };
}

test("replays basic BT/Tf/Tm/Tj and matches transform/font", () => {
  const page = {
    pageNumber: 1,
    operators: [
      { id: "op-1", index: 0, operator: "save", args: [] },
      { id: "op-2", index: 1, operator: "transform", args: [0.24, 0, 0, 0.24, 0, 640.08] },
      { id: "op-3", index: 2, operator: "beginText", args: [] },
      { id: "op-4", index: 3, operator: "setTextMatrix", args: [typedMatrix([50, 0, 0, 50, 300, 647])] },
      { id: "op-5", index: 4, operator: "setFont", args: ["F1", 1] },
      { id: "op-6", index: 5, operator: "showText", args: [["Pre-MBA"]] },
      { id: "op-7", index: 6, operator: "endText", args: [] },
      { id: "op-8", index: 7, operator: "restore", args: [] }
    ],
    textObjects: [
      {
        id: "t-1",
        index: 0,
        text: "Pre-MBA",
        transform: [12, 0, 0, 12, 72, 795.36],
        width: 40,
        height: 12,
        fontName: "F1",
        bbox: { x: 72, y: 34.56, width: 40, height: 12 }
      }
    ]
  };

  const result = replayTextStateForPage(page, { transformTolerance: 0.01 });
  assert.equal(result.textPaintObjects.length, 1);
  const paint = result.textPaintObjects[0];
  assert.equal(paint.comparison.fontMatch, true);
  assert.ok(Number(paint.comparison.transformError) <= 0.01);
  assert.equal(paint.state.font.name, "F1");
  assert.equal(paint.state.fontSize, 1);
});

test("captures native text rise from Ts", () => {
  const page = {
    pageNumber: 1,
    operators: [
      { id: "op-1", index: 0, operator: "beginText", args: [] },
      { id: "op-2", index: 1, operator: "setTextMatrix", args: [typedMatrix([10, 0, 0, 10, 20, 30])] },
      { id: "op-3", index: 2, operator: "setFont", args: ["F2", 1] },
      { id: "op-4", index: 3, operator: "setTextRise", args: [3] },
      { id: "op-5", index: 4, operator: "showText", args: [["x"]] }
    ],
    textObjects: [
      {
        id: "t-1",
        index: 0,
        text: "x",
        transform: [10, 0, 0, 10, 20, 30],
        width: 5,
        height: 10,
        fontName: "F2",
        bbox: { x: 20, y: 100, width: 5, height: 10 }
      }
    ]
  };

  const result = replayTextStateForPage(page);
  assert.equal(result.textPaintObjects.length, 1);
  assert.equal(result.textPaintObjects[0].state.rise, 3);
  assert.equal(result.diagnostics.riseDetected, 1);
});

test("applies quote operator spacing updates", () => {
  const page = {
    pageNumber: 1,
    operators: [
      { id: "op-1", index: 0, operator: "beginText", args: [] },
      { id: "op-2", index: 1, operator: "setTextMatrix", args: [typedMatrix([1, 0, 0, 1, 0, 0])] },
      { id: "op-3", index: 2, operator: "setLeading", args: [12] },
      { id: "op-4", index: 3, operator: "nextLineSetSpacingShowText", args: [120, 20, "abc"] }
    ],
    textObjects: [
      {
        id: "t-1",
        index: 0,
        text: "abc",
        transform: [1, 0, 0, 1, 0, 0],
        width: 12,
        height: 10,
        fontName: "F3",
        bbox: { x: 0, y: 0, width: 12, height: 10 }
      }
    ]
  };

  const result = replayTextStateForPage(page);
  const paint = result.textPaintObjects[0];
  assert.equal(paint.state.wordSpacing, 120);
  assert.equal(paint.state.characterSpacing, 20);
});

test("restores CTM with nested q/Q", () => {
  const page = {
    pageNumber: 1,
    operators: [
      { id: "op-1", index: 0, operator: "save", args: [] },
      { id: "op-2", index: 1, operator: "transform", args: [2, 0, 0, 2, 0, 0] },
      { id: "op-3", index: 2, operator: "save", args: [] },
      { id: "op-4", index: 3, operator: "transform", args: [3, 0, 0, 3, 0, 0] },
      { id: "op-5", index: 4, operator: "restore", args: [] },
      { id: "op-6", index: 5, operator: "beginText", args: [] },
      { id: "op-7", index: 6, operator: "setTextMatrix", args: [typedMatrix([1, 0, 0, 1, 5, 6])] },
      { id: "op-8", index: 7, operator: "showText", args: [["a"]] },
      { id: "op-9", index: 8, operator: "restore", args: [] }
    ],
    textObjects: [
      {
        id: "t-1",
        index: 0,
        text: "a",
        transform: [2, 0, 0, 2, 10, 12],
        width: 2,
        height: 2,
        fontName: "F1",
        bbox: { x: 10, y: 10, width: 2, height: 2 }
      }
    ]
  };

  const result = replayTextStateForPage(page, { transformTolerance: 0.001 });
  assert.equal(result.textPaintObjects.length, 1);
  assert.equal(result.textPaintObjects[0].comparison.formula, "ctm_textMatrix");
  assert.ok(Number(result.textPaintObjects[0].comparison.transformError) <= 0.001);
});

test("applies Tc/Tw/Tz and preserves TJ adjustments", () => {
  const page = {
    pageNumber: 1,
    operators: [
      { id: "op-1", index: 0, operator: "beginText", args: [] },
      { id: "op-2", index: 1, operator: "setTextMatrix", args: [typedMatrix([1, 0, 0, 1, 100, 200])] },
      { id: "op-3", index: 2, operator: "setCharSpacing", args: [2] },
      { id: "op-4", index: 3, operator: "setWordSpacing", args: [5] },
      { id: "op-5", index: 4, operator: "setHScale", args: [80] },
      { id: "op-6", index: 5, operator: "showSpacedText", args: [["abc", -120, "def", 80, "ghi"]] }
    ],
    textObjects: [
      {
        id: "t-1",
        index: 0,
        text: "abcdefghi",
        transform: [1, 0, 0, 1, 100, 200],
        width: 40,
        height: 10,
        fontName: "F1",
        bbox: { x: 100, y: 100, width: 40, height: 10 }
      }
    ]
  };

  const result = replayTextStateForPage(page);
  const paint = result.textPaintObjects[0];
  assert.equal(paint.state.characterSpacing, 2);
  assert.equal(paint.state.wordSpacing, 5);
  assert.equal(paint.state.horizontalScale, 80);
  assert.ok((paint.segments || []).some((segment) => segment.type === "adjustment" && segment.adjustment === -120));
  assert.ok((paint.segments || []).some((segment) => segment.type === "adjustment" && segment.adjustment === 80));
});

test("applies Tm/Td/TD/T* positioning operators", () => {
  const page = {
    pageNumber: 1,
    operators: [
      { id: "op-1", index: 0, operator: "beginText", args: [] },
      { id: "op-2", index: 1, operator: "setTextMatrix", args: [typedMatrix([1, 0, 0, 1, 10, 20])] },
      { id: "op-3", index: 2, operator: "moveText", args: [5, 7] },
      { id: "op-4", index: 3, operator: "setLeadingMoveText", args: [0, -12] },
      { id: "op-5", index: 4, operator: "nextLine", args: [] },
      { id: "op-6", index: 5, operator: "showText", args: [["x"]] }
    ],
    textObjects: [
      {
        id: "t-1",
        index: 0,
        text: "x",
        transform: [1, 0, 0, 1, 15, 3],
        width: 4,
        height: 10,
        fontName: "F1",
        bbox: { x: 15, y: 3, width: 4, height: 10 }
      }
    ]
  };

  const result = replayTextStateForPage(page);
  assert.equal(result.textPaintObjects.length, 1);
  assert.equal(result.textPaintObjects[0].state.leading, 12);
  assert.deepEqual(result.textPaintObjects[0].state.textLineMatrix.slice(4), [15, 3]);
});
