import test from "node:test";
import assert from "node:assert/strict";
import { htmlToPdfY, pdfToHtmlY } from "../src/coordinates.js";

test("pdfToHtmlY maps bottom-left PDF origin to top-left HTML origin", () => {
  const pageHeight = 841.89;
  const pdfY = 100;
  const elementHeight = 20;
  const htmlY = pdfToHtmlY(pdfY, pageHeight, elementHeight);
  assert.equal(htmlY, 721.89);
});

test("htmlToPdfY inverts pdfToHtmlY", () => {
  const pageHeight = 841.89;
  const pdfY = 245.5;
  const elementHeight = 11.2;
  const htmlY = pdfToHtmlY(pdfY, pageHeight, elementHeight);
  const reconstructed = htmlToPdfY(htmlY, pageHeight, elementHeight);
  assert.equal(Number(reconstructed.toFixed(6)), Number(pdfY.toFixed(6)));
});
