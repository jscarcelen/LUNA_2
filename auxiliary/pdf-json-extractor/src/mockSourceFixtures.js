import { makeConfidence, valueState } from "./sourceModel.js";

function baseDocument(name = "mock") {
  return {
    type: "document",
    schemaVersion: "cdm-v3",
    source: {
      primaryType: "ocr",
      adapters: ["MockAdapter"]
    },
    supportedSourceTypes: [
      "pdf",
      "pdf-text",
      "pdf-vector",
      "pdf-image",
      "ocr",
      "printed-ocr",
      "handwriting-ocr",
      "image",
      "docx",
      "unknown"
    ],
    metadata: {
      filename: `${name}.json`,
      filepath: `/mock/${name}.json`,
      mimeType: "application/json",
      pageCount: 1,
      sizeBytes: 0
    },
    pages: []
  };
}

function sourceRef(sourceId, sourceType, kind) {
  return { sourceId, sourceType, kind };
}

export function buildMockSourceAgnosticFixtures() {
  const docs = [];

  const printed = baseDocument("printed-ocr");
  printed.pages.push({
    id: "page-1",
    pageNumber: 1,
    width: 1200,
    height: 1600,
    rotation: 0,
    sourceType: "ocr",
    source: { type: "ocr", adapter: "OCRAdapter" },
    coordinateSystem: {
      origin: "top-left",
      units: "px",
      yAxis: "down",
      sourceSpace: { origin: "top-left", yAxis: "down", type: "ocr-image" },
      canonicalSpace: "top-left-px",
      renderSpace: "html-css-px"
    },
    evidence: [
      {
        id: "ocr-word-1",
        source: { type: "printed-ocr", adapter: "OCRAdapter" },
        kind: "word",
        observed: {
          text: valueState("Statistics", "observed"),
          bbox: valueState({ x: 120, y: 200, width: 220, height: 40 }, "observed")
        },
        confidence: makeConfidence({ overall: 0.93, text: 0.93, geometry: 0.98 })
      }
    ],
    regions: { header: [], body: ["n1"], footer: [] },
    readingOrder: [{ id: "n1", index: 1 }],
    elements: [
      {
        id: "n1",
        type: "paragraph",
        bbox: { x: 120, y: 200, width: 220, height: 40 },
        text: "Statistics",
        sourceRefs: [sourceRef("ocr-word-1", "printed-ocr", "word")],
        confidence: makeConfidence({ overall: 0.93, text: 0.93, geometry: 0.98, classification: 0.86 }),
        evidenceStatus: {
          text: valueState("Statistics", "observed"),
          classification: valueState("paragraph", "inferred", { method: "layout-classifier", confidence: 0.86 })
        }
      }
    ]
  });
  docs.push(printed);

  const handwriting = baseDocument("handwriting");
  handwriting.pages.push({
    id: "page-1",
    pageNumber: 1,
    width: 1000,
    height: 1400,
    rotation: 0,
    sourceType: "image",
    source: { type: "image", adapter: "HandwritingAdapter" },
    coordinateSystem: {
      origin: "top-left",
      units: "px",
      yAxis: "down",
      sourceSpace: { origin: "top-left", yAxis: "down", type: "handwriting-image" },
      canonicalSpace: "top-left-px",
      renderSpace: "html-css-px"
    },
    sourceImage: {
      sourceRef: sourceRef("scan-page-1", "image", "pageImage"),
      bbox: { x: 0, y: 0, width: 1000, height: 1400 },
      dpi: 300,
      rotation: 0
    },
    evidence: [
      {
        id: "hw-word-1",
        source: { type: "handwriting-ocr", adapter: "HandwritingAdapter" },
        kind: "recognizedWord",
        observed: {
          bbox: valueState({ x: 180, y: 300, width: 170, height: 44 }, "observed")
        },
        recognition: {
          value: "variance",
          alternatives: [
            { value: "variance", confidence: 0.81 },
            { value: "varlance", confidence: 0.12 }
          ]
        },
        confidence: makeConfidence({ overall: 0.81, text: 0.81, geometry: 0.95 })
      },
      {
        id: "hw-math-1",
        source: { type: "handwriting-ocr", adapter: "HandwritingAdapter" },
        kind: "mathCandidate",
        observed: {
          bbox: valueState({ x: 190, y: 360, width: 210, height: 70 }, "observed")
        },
        confidence: makeConfidence({ overall: 0.7, text: 0.62, geometry: 0.91, math: 0.7 })
      }
    ],
    regions: { header: [], body: ["n1", "n2", "n3"], footer: [] },
    readingOrder: [{ id: "n1", index: 1 }, { id: "n2", index: 2 }, { id: "n3", index: 3 }],
    elements: [
      {
        id: "n1",
        type: "textRun",
        bbox: { x: 180, y: 300, width: 170, height: 44 },
        text: "variance",
        sourceRefs: [sourceRef("hw-word-1", "handwriting-ocr", "recognizedWord")],
        confidence: makeConfidence({ overall: 0.81, text: 0.81, geometry: 0.95 }),
        evidenceStatus: {
          text: valueState("variance", "inferred", { method: "handwriting-recognition", confidence: 0.81 })
        }
      },
      {
        id: "n2",
        type: "math",
        bbox: { x: 190, y: 360, width: 210, height: 70 },
        text: "x2",
        representation: {
          kind: "geometric",
          confidence: 0.7,
          status: "inferred"
        },
        sourceRefs: [
          sourceRef("hw-math-1", "handwriting-ocr", "mathCandidate"),
          sourceRef("hw-word-1", "handwriting-ocr", "recognizedWord")
        ],
        confidence: makeConfidence({ overall: 0.7, text: 0.62, geometry: 0.91, math: 0.7 })
      },
      {
        id: "n3",
        type: "unknownBlock",
        bbox: { x: 450, y: 620, width: 220, height: 80 },
        text: "unclear token",
        sourceRefs: [sourceRef("hw-word-2", "handwriting-ocr", "recognizedWord")],
        confidence: makeConfidence({ overall: 0.34, text: 0.34, geometry: 0.88, classification: 0.2 }),
        evidenceStatus: {
          classification: valueState("unknownBlock", "inferred", { confidence: 0.2, reason: "low_recognition_confidence" })
        }
      }
    ]
  });
  docs.push(handwriting);

  const oneToMany = baseDocument("one-evidence-many-nodes");
  oneToMany.pages.push({
    id: "page-1",
    pageNumber: 1,
    width: 900,
    height: 1200,
    rotation: 0,
    sourceType: "ocr",
    source: { type: "ocr", adapter: "OCRAdapter" },
    coordinateSystem: {
      origin: "top-left",
      units: "px",
      yAxis: "down",
      sourceSpace: { origin: "top-left", yAxis: "down" },
      canonicalSpace: "top-left-px",
      renderSpace: "html-css-px"
    },
    evidence: [
      {
        id: "ocr-region-1",
        source: { type: "printed-ocr", adapter: "OCRAdapter" },
        kind: "line",
        observed: {
          text: valueState("The mean is x = 24", "observed"),
          bbox: valueState({ x: 100, y: 200, width: 420, height: 42 }, "observed")
        },
        confidence: makeConfidence({ overall: 0.91, text: 0.91, geometry: 0.98 })
      }
    ],
    regions: { header: [], body: ["n1", "n2", "n3"], footer: [] },
    readingOrder: [{ id: "n1", index: 1 }, { id: "n2", index: 2 }, { id: "n3", index: 3 }],
    elements: [
      {
        id: "n1",
        type: "textRun",
        bbox: { x: 100, y: 200, width: 180, height: 42 },
        text: "The mean is",
        sourceRefs: [sourceRef("ocr-region-1", "printed-ocr", "line")],
        confidence: makeConfidence({ overall: 0.91, text: 0.91, geometry: 0.98 })
      },
      {
        id: "n2",
        type: "mathRun",
        bbox: { x: 290, y: 200, width: 90, height: 42 },
        text: "x =",
        sourceRefs: [sourceRef("ocr-region-1", "printed-ocr", "line")],
        confidence: makeConfidence({ overall: 0.84, text: 0.84, geometry: 0.95, math: 0.84 })
      },
      {
        id: "n3",
        type: "textRun",
        bbox: { x: 390, y: 200, width: 70, height: 42 },
        text: "24",
        sourceRefs: [sourceRef("ocr-region-1", "printed-ocr", "line")],
        confidence: makeConfidence({ overall: 0.91, text: 0.91, geometry: 0.98 })
      }
    ]
  });
  docs.push(oneToMany);

  const userCorrection = baseDocument("user-corrected-ocr");
  userCorrection.pages.push({
    id: "page-1",
    pageNumber: 1,
    width: 900,
    height: 1200,
    rotation: 0,
    sourceType: "ocr",
    source: { type: "ocr", adapter: "OCRAdapter" },
    coordinateSystem: {
      origin: "top-left",
      units: "px",
      yAxis: "down",
      sourceSpace: { origin: "top-left", yAxis: "down" },
      canonicalSpace: "top-left-px",
      renderSpace: "html-css-px"
    },
    evidence: [
      {
        id: "ocr-word-raw",
        source: { type: "printed-ocr", adapter: "OCRAdapter" },
        kind: "word",
        observed: {
          text: valueState("statistlcs", "observed"),
          bbox: valueState({ x: 130, y: 220, width: 200, height: 38 }, "observed")
        },
        confidence: makeConfidence({ overall: 0.67, text: 0.67, geometry: 0.97 })
      }
    ],
    regions: { header: [], body: ["n1"], footer: [] },
    readingOrder: [{ id: "n1", index: 1 }],
    elements: [
      {
        id: "n1",
        type: "textRun",
        bbox: { x: 130, y: 220, width: 200, height: 38 },
        text: "statistics",
        sourceRefs: [sourceRef("ocr-word-raw", "printed-ocr", "word")],
        confidence: makeConfidence({ overall: 0.67, text: 0.67, geometry: 0.97 }),
        correction: {
          text: {
            value: "statistics",
            status: "userCorrected",
            originalValue: "statistlcs"
          }
        }
      }
    ]
  });
  docs.push(userCorrection);

  return docs;
}
