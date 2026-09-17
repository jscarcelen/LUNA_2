import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildRawPdfPageModels, loadPdfForRawModel } from "./rawPageModel.js";
import { replayTextStateForPage } from "./textStateReplayer.js";
import { makeConfidence, normalizeSourceRefs, sourceIdOf, valueState } from "./sourceModel.js";
import { buildPdfEvidenceLayer } from "./source/pdfSourceModel.js";
import { ensureDir, median, normalizeWhitespace, parseArgs, percentile, readBinaryFile, resolveProjectPath, writeJson } from "./utils.js";

const baseDir = process.cwd();
const outputDir = path.join(baseDir, "output");
const outputFile = path.join(outputDir, "document.json");
const summaryFile = path.join(outputDir, "document.summary.json");
const rawPagesFile = path.join(outputDir, "raw-pages.json");
const lossAccountingFile = path.join(outputDir, "loss-accounting.json");
const textPaintFile = path.join(outputDir, "text-paints.json");
const DEFAULT_INPUT = resolveProjectPath("..", "..", "Statistics.pdf");

function toBBox(x = 0, y = 0, width = 0, height = 0) {
  return { x: Number(x || 0), y: Number(y || 0), width: Number(width || 0), height: Number(height || 0) };
}

function unionBBoxes(boxes = []) {
  if (!boxes.length) return toBBox(0, 0, 0, 0);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const box of boxes) {
    if (!box) continue;
    minX = Math.min(minX, Number(box.x || 0));
    minY = Math.min(minY, Number(box.y || 0));
    maxX = Math.max(maxX, Number(box.x || 0) + Number(box.width || 0));
    maxY = Math.max(maxY, Number(box.y || 0) + Number(box.height || 0));
  }
  if (!Number.isFinite(minX)) return toBBox(0, 0, 0, 0);
  return toBBox(minX, minY, Math.max(0, maxX - minX), Math.max(0, maxY - minY));
}

function buildLossAccounting(rawPages = []) {
  const entries = new Map();
  const push = (id, page, sourceType, status, reason) => {
    entries.set(id, {
      sourceId: id,
      page,
      sourceType,
      terminalStatus: status,
      reason,
      interpretedBy: []
    });
  };

  for (const page of rawPages) {
    for (const obj of page.textObjects || []) {
      const status = obj.whitespaceKind === "empty" ? "intentionally_ignored" : "preserved+uninterpreted";
      const reason = obj.whitespaceKind === "empty" ? "empty_text_object" : "not_interpreted_yet";
      push(obj.id, page.pageNumber, "text", status, reason);
    }
    for (const obj of page.operators || []) push(obj.id, page.pageNumber, "operator", "preserved+uninterpreted", "not_interpreted_yet");
    for (const obj of page.fonts || []) push(obj.id, page.pageNumber, "font", "preserved+uninterpreted", "not_interpreted_yet");
    for (const obj of page.images || []) push(obj.id, page.pageNumber, "image", "preserved+uninterpreted", "not_interpreted_yet");
    for (const obj of page.graphics || []) push(obj.id, page.pageNumber, "vector", "preserved+uninterpreted", "not_interpreted_yet");
  }

  return entries;
}

function markInterpreted(lossMap, sourceRefs = [], nodeId = "") {
  for (const ref of sourceRefs) {
    const sourceId = sourceIdOf(ref);
    if (!sourceId) continue;
    const entry = lossMap.get(sourceId);
    if (!entry) continue;
    if (!entry.interpretedBy.includes(nodeId)) entry.interpretedBy.push(nodeId);
    entry.terminalStatus = "preserved+interpreted";
    entry.reason = "mapped_to_canonical_node";
  }
}

function inferVerticalAlign(run, baseline, baseFontSize) {
  const rise = Number(run?.state?.rise || 0);
  if (rise > 0.0001) {
    return { value: "superscript", inference: { method: "text-rise", source: "text-rise", confidence: 1 } };
  }
  if (rise < -0.0001) {
    return { value: "subscript", inference: { method: "text-rise", source: "text-rise", confidence: 1 } };
  }

  const runFont = Number(run?.state?.fontSize || run?.height || 0);
  const delta = Number(run?.baseline?.start?.[1] || 0) - Number(baseline || 0);

  if (runFont <= baseFontSize * 0.84 && delta < -Math.max(1.2, baseFontSize * 0.14)) {
    return { value: "superscript", inference: { method: "baseline-offset", source: "baseline-analysis", confidence: 0.94 } };
  }
  if (runFont <= baseFontSize * 0.9 && delta > Math.max(1.2, baseFontSize * 0.12)) {
    return { value: "subscript", inference: { method: "baseline-offset", source: "baseline-analysis", confidence: 0.92 } };
  }
  if (runFont <= baseFontSize * 0.82) {
    return { value: "baseline", inference: { method: "font-size-ratio", source: "heuristic", confidence: 0.62 } };
  }

  return { value: "baseline", inference: { method: "baseline-offset", source: "baseline-analysis", confidence: 0.96 } };
}

function lineFromTextPaintObjects(textPaintObjects = []) {
  const sorted = [...textPaintObjects]
    .filter((obj) => typeof obj?.text === "string" && obj?.geometry?.bbox)
    .sort((a, b) => {
      if (Math.abs(a.geometry.bbox.y - b.geometry.bbox.y) > 0.01) return a.geometry.bbox.y - b.geometry.bbox.y;
      return a.geometry.bbox.x - b.geometry.bbox.x;
    });

  const lines = [];
  const tolerance = 2.8;
  for (const obj of sorted) {
    const baselineY = Number(obj?.baseline?.start?.[1] || (obj.geometry.bbox.y + obj.geometry.bbox.height));
    let line = lines.find((candidate) => Math.abs(candidate.baseline - baselineY) <= tolerance);
    if (!line) {
      line = {
        id: `line-${lines.length + 1}`,
        baseline: baselineY,
        objects: []
      };
      lines.push(line);
    }
    line.objects.push(obj);
  }

  return lines.map((line) => {
    const objects = [...line.objects].sort((a, b) => a.geometry.bbox.x - b.geometry.bbox.x);
    const baseSize = median(objects.map((obj) => Number(obj?.state?.fontSize || obj?.geometry?.bbox?.height || 12))) || 12;
    const baseline = median(objects.map((obj) => Number(obj?.baseline?.start?.[1] || (obj.geometry.bbox.y + obj.geometry.bbox.height))));

    const runs = objects.map((obj, runIndex) => {
      const inferred = inferVerticalAlign(obj, baseline, baseSize);
      const text = String(obj.text || "");
      const bbox = obj.geometry.bbox;
      const glyphWidth = Number(bbox.width || 0) / Math.max(1, text.length);
      const glyphs = Array.from(text).map((char, charIndex) => ({
        char,
        bbox: toBBox(Number(bbox.x || 0) + glyphWidth * charIndex, Number(bbox.y || 0), glyphWidth, Number(bbox.height || 0)),
        transform: obj.geometry.transform,
        font: obj?.state?.font?.name || obj?.pdfjs?.fontName || "unknown",
        fontSize: Number(obj?.state?.fontSize || bbox.height || 12),
        source: "text-paint"
      }));

      return {
        id: `${obj.id}-run-${runIndex + 1}`,
        type: "textRun",
        text,
        bbox,
        baseline: Number(obj?.baseline?.start?.[1] || (bbox.y + bbox.height)),
        baselineSpan: obj.baseline,
        transform: obj.geometry.transform,
        style: {
          fontFamily: obj?.state?.font?.name || obj?.pdfjs?.fontName || "unknown",
          fontSize: Number(obj?.state?.fontSize || bbox.height || 12),
          fontWeight: 400,
          italic: false,
          verticalAlign: inferred.value,
          writingDirection: obj?.pdfjs?.dir || "ltr",
          color: "#000000"
        },
        inference: {
          verticalAlign: inferred.inference
        },
        paint: {
          operator: obj.operator,
          segments: obj.segments || [],
          state: obj.state,
          comparison: obj.comparison
        },
        glyphs,
        sourceRefs: normalizeSourceRefs(obj.sourceRefs || [], {
          sourceType: "pdf-text",
          kind: "textPaint"
        })
      };
    });

    let mergedText = "";
    for (let index = 0; index < runs.length; index += 1) {
      const run = runs[index];
      const previous = runs[index - 1] || null;
      if (previous) {
        const gap = run.bbox.x - (previous.bbox.x + previous.bbox.width);
        if (gap > Math.max(1.2, Number(previous.style.fontSize || 12) * 0.2) && !/\s$/.test(mergedText)) {
          mergedText += " ";
        }
      }
      mergedText += run.text;
    }

    return {
      id: line.id,
      baseline,
      bbox: unionBBoxes(runs.map((run) => run.bbox)),
      text: mergedText,
      normalizedText: normalizeWhitespace(mergedText),
      avgFontSize: median(runs.map((run) => Number(run.style.fontSize || 12))) || 12,
      runs,
      sourceRefs: normalizeSourceRefs(runs.flatMap((run) => run.sourceRefs || []), {
        sourceType: "pdf-text",
        kind: "textPaint"
      })
    };
  }).filter((line) => line.text.length > 0);
}

function classifyLineConservative(line, fontP75, fontMedian) {
  const text = String(line.normalizedText || "");
  if (!text) return { type: "unknownBlock", confidence: 0, candidate: "empty" };

  const headingLike = text.length < 120 && line.avgFontSize >= Math.max(fontMedian * 1.18, fontP75 * 1.0);
  if (headingLike) {
    const level = line.avgFontSize >= Math.max(fontMedian * 1.4, fontP75 * 1.12) ? 1 : 2;
    return { type: "heading", confidence: 0.9, level };
  }

  if (/^((\d+|[A-Za-z])[\.|\)])\s+/.test(text) || /^[•◦▪-]\s+/.test(text)) {
    return { type: "listItem", confidence: 0.88, level: 1 };
  }

  const symbolCount = (text.match(/[=+\-*/^_<>∑∫√±≈≤≥µσπ]/g) || []).length;
  const greekCount = (text.match(/[α-ωΑ-Ωµπσ]/g) || []).length;
  const mathKeyword = /(sum|int|sqrt|mu|sigma|theta|lambda|frac)/i.test(text);
  const superSubCount = line.runs.filter((run) => ["superscript", "subscript"].includes(run?.style?.verticalAlign)).length;
  const baselineEvidenceCount = line.runs.filter((run) => run?.inference?.verticalAlign?.source === "text-rise").length;
  const spacingAdjustments = line.runs.reduce((sum, run) => sum + (run?.paint?.segments || []).filter((segment) => segment.type === "adjustment").length, 0);
  const mathScore = symbolCount * 0.08
    + greekCount * 0.2
    + (mathKeyword ? 0.35 : 0)
    + Math.min(0.35, superSubCount * 0.12)
    + Math.min(0.22, baselineEvidenceCount * 0.11)
    + Math.min(0.16, spacingAdjustments * 0.02);

  if (mathScore >= 0.82) {
    return { type: "mathCandidate", confidence: Math.min(0.99, mathScore), sourceKind: "inferred" };
  }
  if (mathScore >= 0.5) {
    return { type: "unknownBlock", confidence: mathScore, candidate: "equation" };
  }

  return { type: "paragraph", confidence: 0.85 };
}

function createTableHeuristic(lines = []) {
  const groups = [];
  let current = [];
  for (const line of lines) {
    const manyRuns = line.runs.length >= 4;
    if (manyRuns) {
      current.push(line);
      continue;
    }
    if (current.length >= 2) groups.push(current);
    current = [];
  }
  if (current.length >= 2) groups.push(current);
  return groups;
}

function buildTableNode(group, id) {
  const allRuns = group.flatMap((line) => line.runs);
  const xAnchors = Array.from(new Set(allRuns.map((run) => Math.round(run.bbox.x / 10) * 10))).sort((a, b) => a - b);
  const rows = group.map((line, rowIndex) => {
    const cells = xAnchors.map((anchor, colIndex) => {
      const runs = line.runs.filter((run) => Math.abs(run.bbox.x - anchor) <= 14);
      if (!runs.length) return null;
      return {
        id: `${id}-r${rowIndex + 1}-c${colIndex + 1}`,
        type: "tableCell",
        rowSpan: 1,
        colSpan: 1,
        bbox: unionBBoxes(runs.map((run) => run.bbox)),
        children: runs,
        sourceRefs: runs.flatMap((run) => run.sourceRefs || [])
      };
    }).filter(Boolean);

    return {
      id: `${id}-row${rowIndex + 1}`,
      type: "tableRow",
      bbox: unionBBoxes(cells.map((cell) => cell.bbox)),
      cells,
      sourceRefs: cells.flatMap((cell) => cell.sourceRefs || [])
    };
  });

  return {
    type: "table",
    bbox: unionBBoxes(rows.map((row) => row.bbox)),
    rows,
    sourceRefs: rows.flatMap((row) => row.sourceRefs || [])
  };
}

function isFooterLine(line, pageHeight) {
  return line.bbox.y >= pageHeight * 0.86;
}

function isHeaderLine(line, pageHeight) {
  return line.bbox.y <= pageHeight * 0.14;
}

function normalizeRecurring(text = "") {
  return normalizeWhitespace(String(text || "").toLowerCase()).replace(/\d+/g, "#");
}

function detectRecurring(rawInterpretedPages) {
  const top = new Map();
  const bottom = new Map();
  const pageCount = rawInterpretedPages.length || 1;

  for (const page of rawInterpretedPages) {
    for (const line of page.lines) {
      const key = normalizeRecurring(line.normalizedText);
      if (!key) continue;
      if (isHeaderLine(line, page.height)) {
        if (!top.has(key)) top.set(key, new Set());
        top.get(key).add(page.pageNumber);
      }
      if (isFooterLine(line, page.height)) {
        if (!bottom.has(key)) bottom.set(key, new Set());
        bottom.get(key).add(page.pageNumber);
      }
    }
  }

  return {
    headerKeys: new Set(Array.from(top.entries()).filter((entry) => entry[1].size / pageCount >= 0.6).map((entry) => entry[0])),
    footerKeys: new Set(Array.from(bottom.entries()).filter((entry) => entry[1].size / pageCount >= 0.6).map((entry) => entry[0]))
  };
}

function createNodeFactory(pageNumber, rotation, lossMap) {
  let counter = 0;
  return (payload, region) => {
    counter += 1;
    const id = `p${pageNumber}-node-${String(counter).padStart(4, "0")}`;
    const refs = normalizeSourceRefs(payload.sourceRefs || []);
    markInterpreted(lossMap, refs, id);

    const classificationConfidence = Number(payload?.classification?.confidence);
    const hasClassificationConfidence = Number.isFinite(classificationConfidence);
    const nodeConfidence = makeConfidence({
      overall: hasClassificationConfidence ? Math.max(0, Math.min(1, classificationConfidence)) : null,
      text: payload?.text ? 1 : null,
      geometry: payload?.bbox ? 1 : null,
      classification: hasClassificationConfidence ? Math.max(0, Math.min(1, classificationConfidence)) : null,
      style: payload?.children?.length ? 1 : null,
      math: payload?.semanticCandidate === "math" ? (hasClassificationConfidence ? Math.max(0, Math.min(1, classificationConfidence)) : null) : null
    });

    return {
      id,
      page: pageNumber,
      rotation,
      region,
      ...payload,
      sourceRefs: refs,
      sourceRefIds: refs.map((ref) => ref.sourceId),
      confidence: payload?.confidence || nodeConfidence,
      evidenceStatus: payload?.evidenceStatus || {
        text: valueState(payload?.text ?? payload?.value ?? null, payload?.text ? "observed" : "unknown"),
        geometry: valueState(payload?.bbox || null, payload?.bbox ? "observed" : "unknown"),
        classification: valueState(payload?.type || "unknown", payload?.classification ? "inferred" : "observed")
      }
    };
  };
}

function buildPageEvidence(rawPage, textPaintPage) {
  const evidence = [];

  for (const paint of textPaintPage?.textPaintObjects || []) {
    evidence.push({
      id: paint.id,
      source: { type: "pdf-text", adapter: "PDFAdapter" },
      kind: "textPaint",
      page: rawPage.pageNumber,
      zOrder: Number(paint?.operatorIndex || 0),
      sourceOperatorIndex: Number(paint?.operatorIndex || 0),
      observed: {
        text: valueState(String(paint?.text || ""), "observed"),
        bbox: valueState(paint?.geometry?.bbox || null, "observed"),
        transform: valueState(paint?.geometry?.transform || null, "observed"),
        style: valueState({
          fontName: paint?.state?.font?.name || paint?.pdfjs?.fontName || null,
          fontSize: Number(paint?.pdfjs?.height || paint?.state?.fontSize || 0),
          characterSpacing: Number(paint?.state?.characterSpacing || 0),
          wordSpacing: Number(paint?.state?.wordSpacing || 0),
          horizontalScale: Number(paint?.state?.horizontalScale || 100),
          rise: Number(paint?.state?.rise || 0)
        }, "observed")
      },
      confidence: makeConfidence({ text: 1, geometry: 1, style: 1, overall: 1 }),
      sourceRefs: normalizeSourceRefs(paint?.sourceRefs || [], { sourceType: "pdf" })
    });
  }

  for (const image of rawPage.images || []) {
    evidence.push({
      id: image.id,
      source: { type: "pdf-image", adapter: "PDFAdapter" },
      kind: "imageObject",
      page: rawPage.pageNumber,
      zOrder: Number(image?.operatorIndex || 0),
      sourceOperatorIndex: Number(image?.operatorIndex || 0),
      observed: {
        bbox: valueState(image.geometry, "observed"),
        transform: valueState(image.transform, "observed"),
        bytesExtractable: valueState(Boolean(image?.source?.bytesExtractable), "observed")
      },
      confidence: makeConfidence({ geometry: 1, overall: 1 }),
      sourceRefs: normalizeSourceRefs([image.id, image.operatorId], { sourceType: "pdf-image", kind: "imageObject" })
    });
  }

  for (const vector of rawPage.graphics || []) {
    evidence.push({
      id: vector.id,
      source: { type: "pdf-vector", adapter: "PDFAdapter" },
      kind: "vectorPath",
      page: rawPage.pageNumber,
      zOrder: Number(vector?.operatorIndex || 0),
      sourceOperatorIndex: Number(vector?.operatorIndex || 0),
      observed: {
        commands: valueState(vector.commands || [], "observed"),
        transform: valueState(vector.transform || null, "observed")
      },
      confidence: makeConfidence({ geometry: 1, overall: 1 }),
      sourceRefs: normalizeSourceRefs([vector.id, vector.operatorId], { sourceType: "pdf-vector", kind: "vectorPath" })
    });
  }

  return evidence;
}

function pickColor(color) {
  if (!Array.isArray(color) || color.length < 3) return null;
  const r = Math.max(0, Math.min(255, Math.round(Number(color[0] || 0) * 255)));
  const g = Math.max(0, Math.min(255, Math.round(Number(color[1] || 0) * 255)));
  const b = Math.max(0, Math.min(255, Math.round(Number(color[2] || 0) * 255)));
  return `rgb(${r}, ${g}, ${b})`;
}

function stripPdfSubsetPrefix(name = "") {
  return String(name || "")
    .replace(/^[A-Z]{6}\+/, "")
    .replace(/^[^+]+\+/, "")
    .trim();
}

function inferFontTraits(name = "") {
  const n = String(name || "");
  const lower = n.toLowerCase();
  const italic = /italic|oblique/.test(lower);
  const weight = /extrabold|ultrabold|black|heavy/.test(lower)
    ? 800
    : /semibold|demibold/.test(lower)
      ? 600
      : /bold/.test(lower)
        ? 700
        : 400;
  return { italic, weight };
}

function charAdvanceFromGlyph(glyph = null, fontSize = 12, hScale = 1) {
  const width1000 = Number(glyph?.width || 0);
  if (Number.isFinite(width1000) && width1000 > 0) {
    return (width1000 / 1000) * fontSize * hScale;
  }
  return fontSize * hScale * 0.5;
}

function buildGlyphLayout(segments = [], spacing = {}, fontSize = 12) {
  const hScale = Math.max(0.01, Number(spacing?.horizontalScale || 100) / 100);
  const characterSpacing = Number(spacing?.characterSpacing || 0);
  const wordSpacing = Number(spacing?.wordSpacing || 0);
  const glyphs = [];
  let x = 0;

  for (const segment of segments || []) {
    if (segment?.type === "adjustment") {
      const adjust = Number(segment.adjustment || 0);
      x += (-adjust / 1000) * fontSize * hScale;
      continue;
    }

    if (segment?.type === "glyph") {
      const char = String(segment.text || "");
      for (const ch of Array.from(char)) {
        glyphs.push({ char: ch, x: Number(x.toFixed(6)) });
        const baseAdvance = charAdvanceFromGlyph(segment.glyph, fontSize, hScale);
        const spacingAdvance = characterSpacing + (ch === " " ? wordSpacing : 0);
        x += baseAdvance + spacingAdvance;
      }
      continue;
    }

    if (segment?.type === "text") {
      const text = String(segment.text || "");
      for (const ch of Array.from(text)) {
        glyphs.push({ char: ch, x: Number(x.toFixed(6)) });
        const baseAdvance = fontSize * hScale * (ch === " " ? 0.28 : 0.5);
        const spacingAdvance = characterSpacing + (ch === " " ? wordSpacing : 0);
        x += baseAdvance + spacingAdvance;
      }
    }
  }

  return glyphs;
}

function buildFidelityObjectsForPage(rawPage, textPaintPage) {
  const fidelityObjects = [];
  const fontByName = new Map((rawPage.fonts || []).map((font) => [String(font.fontName || ""), font]));
  const textPaintByOp = new Map();
  for (const paint of textPaintPage?.textPaintObjects || []) {
    const key = String(paint.operatorId || "");
    if (!key) continue;
    if (!textPaintByOp.has(key)) textPaintByOp.set(key, []);
    textPaintByOp.get(key).push(paint);
  }

  const imageByOp = new Map((rawPage.images || []).map((image) => [String(image.operatorId || ""), image]));
  const vectorsByOp = new Map();
  for (const vector of rawPage.graphics || []) {
    const key = String(vector.operatorId || "");
    if (!vectorsByOp.has(key)) vectorsByOp.set(key, []);
    vectorsByOp.get(key).push(vector);
  }

  for (const operator of rawPage.operators || []) {
    const opId = String(operator.id || "");
    const zOrder = Number(operator.index || 0);

    for (const paint of textPaintByOp.get(opId) || []) {
      const bbox = paint?.geometry?.bbox || { x: 0, y: 0, width: 0, height: 0 };
      const text = String(paint.text || "");

      const fontKey = String(paint?.state?.font?.name || paint?.pdfjs?.fontName || "");
      const fontMeta = fontByName.get(fontKey) || null;
      const resolvedName = stripPdfSubsetPrefix(fontMeta?.resolvedName || "") || stripPdfSubsetPrefix(fontKey) || "unknown";
      const fallbackName = String(fontMeta?.fallbackName || "").trim();
      const fontSize = Number(paint?.pdfjs?.height || paint?.state?.fontSize || bbox.height || 12);
      const inferred = inferFontTraits(resolvedName);
      const spacing = {
        characterSpacing: Number(paint?.state?.characterSpacing || 0),
        wordSpacing: Number(paint?.state?.wordSpacing || 0),
        horizontalScale: Number(paint?.state?.horizontalScale || 100)
      };
      const segments = paint?.segments || [];
      const glyphLayout = buildGlyphLayout(segments, spacing, fontSize);

      fidelityObjects.push({
        id: `fo-${paint.id}`,
        type: "textPaint",
        zOrder,
        sourceOperatorIndex: zOrder,
        sourceRefs: normalizeSourceRefs(paint.sourceRefs || [], {
          sourceType: "pdf-text",
          kind: "textPaint"
        }),
        bbox,
        text,
        baseline: paint.baseline || null,
        transform: paint?.geometry?.transform || null,
        font: {
          name: fontKey || "unknown",
          resolvedName,
          fallbackName: fallbackName || null,
          cssFamily: resolvedName || fallbackName || "sans-serif",
          size: fontSize,
          weight: inferred.weight,
          italic: inferred.italic,
          ascent: Number.isFinite(Number(fontMeta?.ascent)) ? Number(fontMeta.ascent) : null,
          descent: Number.isFinite(Number(fontMeta?.descent)) ? Number(fontMeta.descent) : null,
          fontMatrix: Array.isArray(fontMeta?.fontMatrix) ? fontMeta.fontMatrix : null
        },
        spacing,
        textRise: Number(paint?.state?.rise || 0),
        renderingMode: Number(paint?.state?.renderingMode || 0),
        fillColor: pickColor(paint?.state?.fillColor) || "rgb(0, 0, 0)",
        strokeColor: pickColor(paint?.state?.strokeColor),
        segments,
        glyphLayout
      });
    }

    const image = imageByOp.get(opId);
    if (image) {
      fidelityObjects.push({
        id: `fo-${image.id}`,
        type: "imagePaint",
        zOrder,
        sourceOperatorIndex: zOrder,
        sourceRefs: normalizeSourceRefs([image.id, image.operatorId], { sourceType: "pdf-image", kind: "imageObject" }),
        bbox: image.geometry,
        transform: image.transform,
        objectId: image.objectId,
        bytesExtractable: Boolean(image?.source?.bytesExtractable),
        imageDataUri: image?.source?.dataUri || null
      });
    }

    for (const vector of vectorsByOp.get(opId) || []) {
      fidelityObjects.push({
        id: `fo-${vector.id}`,
        type: "vectorPaint",
        zOrder,
        sourceOperatorIndex: zOrder,
        sourceRefs: normalizeSourceRefs([vector.id, vector.operatorId], { sourceType: "pdf-vector", kind: "vectorPath" }),
        transform: vector.transform,
        operator: vector.operator,
        commands: vector.commands || [],
        style: vector.style || {}
      });
    }
  }

  return fidelityObjects.sort((a, b) => a.zOrder - b.zOrder);
}

export async function extractPdfDocument(sourceFile) {
  const sourceBuffer = await readBinaryFile(sourceFile);
  const pdf = await loadPdfForRawModel(sourceBuffer);
  const rawPages = await buildRawPdfPageModels(pdf, {});

  const lossMap = buildLossAccounting(rawPages);

  const textPaintPages = rawPages.map((rawPage) => replayTextStateForPage(rawPage, { transformTolerance: 0.02 }));
  const textPaintByPage = new Map(textPaintPages.map((page) => [page.pageNumber, page]));

  const interpretedPages = rawPages.map((rawPage) => {
    const textPaint = textPaintByPage.get(rawPage.pageNumber) || { textPaintObjects: [], diagnostics: {} };
    const lines = lineFromTextPaintObjects(textPaint.textPaintObjects || []);
    return {
      pageNumber: rawPage.pageNumber,
      width: rawPage.geometry.width,
      height: rawPage.geometry.height,
      rotation: rawPage.geometry.rotation,
      lines,
      textPaint,
      rawPage
    };
  });

  const fontSizes = interpretedPages.flatMap((page) => page.lines.map((line) => line.avgFontSize));
  const p75 = percentile(fontSizes, 0.75);
  const p50 = median(fontSizes) || 12;
  const recurring = detectRecurring(interpretedPages);

  const canonicalPages = [];
  const allElements = [];

  for (const page of interpretedPages) {
    const makeNode = createNodeFactory(page.pageNumber, page.rotation, lossMap);
    const tableGroups = createTableHeuristic(page.lines);
    const tableLineSet = new Set(tableGroups.flatMap((group) => group.map((line) => line.id)));

    const elements = [];
    const regions = { header: [], body: [], footer: [] };

    for (const line of page.lines) {
      if (tableLineSet.has(line.id)) continue;

      const key = normalizeRecurring(line.normalizedText);
      const header = recurring.headerKeys.has(key) && isHeaderLine(line, page.height);
      const footer = recurring.footerKeys.has(key) && isFooterLine(line, page.height);
      const pageNumberLine = /^\d+$/.test(line.normalizedText) && isFooterLine(line, page.height);

      const region = header ? "header" : (footer || pageNumberLine ? "footer" : "body");
      const sourceRefs = normalizeSourceRefs(line.sourceRefs || [], { sourceType: "pdf-text", kind: "textPaint" });
      const common = {
        bbox: line.bbox,
        baseline: line.baseline,
        text: line.normalizedText,
        children: line.runs,
        sourceRefs
      };

      if (pageNumberLine) {
        const node = makeNode({ type: "pageNumber", value: line.normalizedText, ...common }, "footer");
        elements.push(node); regions.footer.push(node.id); continue;
      }

      if (header || footer) {
        const node = makeNode({ type: header ? "header" : "footer", ...common }, region);
        elements.push(node); regions[region].push(node.id); continue;
      }

      const classification = classifyLineConservative(line, p75, p50);
      if (classification.type === "heading") {
        const node = makeNode({ type: "heading", level: classification.level, classification, ...common }, "body");
        elements.push(node); regions.body.push(node.id); continue;
      }

      if (classification.type === "listItem") {
        const marker = (line.normalizedText.match(/^((\d+|[A-Za-z])[\.|\)]|[•◦▪-])/) || [""])[0];
        const node = makeNode({ type: "listItem", ordered: /^\d+|^[A-Za-z]/.test(marker), marker, level: 1, classification, ...common }, "body");
        elements.push(node); regions.body.push(node.id); continue;
      }

      if (classification.type === "mathCandidate") {
        const node = makeNode({
          type: "textGroup",
          semanticCandidate: "math",
          mathEvidence: {
            source: "text-paint-geometry",
            confidence: classification.confidence,
            runs: line.runs.map((run) => ({
              runId: run.id,
              text: run.text,
              bbox: run.bbox,
              baseline: run.baselineSpan,
              verticalAlign: run?.style?.verticalAlign || "baseline",
              verticalAlignSource: run?.inference?.verticalAlign?.source || "baseline-analysis",
              rise: Number(run?.paint?.state?.rise || 0),
              segments: run?.paint?.segments || []
            }))
          },
          classification,
          ...common
        }, "body");

        elements.push(node); regions.body.push(node.id); continue;
      }

      if (classification.type === "unknownBlock") {
        const node = makeNode({
          type: "unknownBlock",
          classification: {
            candidate: classification.candidate || "unknown",
            confidence: classification.confidence
          },
          ...common
        }, "body");
        elements.push(node); regions.body.push(node.id); continue;
      }

      const node = makeNode({ type: "paragraph", classification, ...common }, "body");
      elements.push(node); regions.body.push(node.id);
    }

    for (let tableIndex = 0; tableIndex < tableGroups.length; tableIndex += 1) {
      const table = buildTableNode(tableGroups[tableIndex], `p${page.pageNumber}-table-${tableIndex + 1}`);
      const node = makeNode({ ...table }, "body");
      elements.push(node);
      regions.body.push(node.id);
    }

    for (const image of page.rawPage.images || []) {
      const node = makeNode({
        type: "image",
        bbox: image.geometry,
        width: image.geometry.width,
        height: image.geometry.height,
        transform: image.transform,
        source: {
          kind: "embedded",
          objectId: image.objectId,
          bytesExtractable: image?.source?.bytesExtractable ?? false,
          bytesReason: image?.source?.reason || "unknown"
        },
        sourceRefs: normalizeSourceRefs([image.id, image.operatorId], { sourceType: "pdf-image", kind: "imageObject" })
      }, "body");
      elements.push(node);
      regions.body.push(node.id);
    }

    for (const vector of page.rawPage.graphics || []) {
      const node = makeNode({
        type: "vectorPath",
        bbox: toBBox(0, 0, 0, 0),
        path: {
          commands: vector.commands,
          operator: vector.operator
        },
        style: vector.style,
        transform: vector.transform,
        sourceRefs: normalizeSourceRefs([vector.id, vector.operatorId], { sourceType: "pdf-vector", kind: "vectorPath" })
      }, "body");
      elements.push(node);
      regions.body.push(node.id);
    }

    const readingOrder = [...elements]
      .sort((a, b) => {
        if (Math.abs((a.bbox?.y || 0) - (b.bbox?.y || 0)) > 0.01) return (a.bbox?.y || 0) - (b.bbox?.y || 0);
        return (a.bbox?.x || 0) - (b.bbox?.x || 0);
      })
      .map((element, index) => ({ id: element.id, index: index + 1 }));

    for (const row of readingOrder) {
      const target = elements.find((element) => element.id === row.id);
      if (target) target.readingOrder = row.index;
    }

    const fidelityObjects = buildFidelityObjectsForPage(page.rawPage, page.textPaint);
    const evidence = buildPageEvidence(page.rawPage, page.textPaint);

    canonicalPages.push({
      id: `page-${page.pageNumber}`,
      pageNumber: page.pageNumber,
      width: page.width,
      height: page.height,
      widthPt: page.width,
      heightPt: page.height,
      rotation: page.rotation,
      coordinateSystem: "pdf-points",
      sourceType: "pdf",
      source: {
        type: "pdf",
        adapter: "PDFAdapter"
      },
      coordinateSystem: {
        origin: "top-left",
        units: "px",
        yAxis: "down",
        sourceSpace: { origin: "bottom-left", yAxis: "up" },
        transform: "htmlY = pageHeight - pdfY - elementHeight",
        canonicalSpace: "top-left-px",
        renderSpace: "html-css-px"
      },
      regions,
      evidence,
      readingOrder,
      rawModelRefs: {
        textObjects: (page.rawPage.textObjects || []).map((obj) => obj.id),
        operators: (page.rawPage.operators || []).map((obj) => obj.id),
        fonts: (page.rawPage.fonts || []).map((obj) => obj.id),
        images: (page.rawPage.images || []).map((obj) => obj.id),
        graphics: (page.rawPage.graphics || []).map((obj) => obj.id)
      },
      textPaintSummary: page.textPaint.diagnostics,
      fidelityObjects,
      elements,
      sourceSummary: page.rawPage.diagnostics
    });

    allElements.push(...elements);
  }

  const recurringHeaders = canonicalPages.flatMap((page) => page.elements.filter((node) => node.type === "header").map((node) => ({ id: node.id, page: page.pageNumber, text: node.text })));
  const recurringFooters = canonicalPages.flatMap((page) => page.elements.filter((node) => node.type === "footer").map((node) => ({ id: node.id, page: page.pageNumber, text: node.text })));

  const allStatuses = Array.from(lossMap.values());
  const statusCounts = allStatuses.reduce((acc, item) => {
    acc[item.terminalStatus] = (acc[item.terminalStatus] || 0) + 1;
    return acc;
  }, {});

  const textContent = allElements
    .filter((node) => ["heading", "paragraph", "listItem", "textGroup", "header", "footer", "pageNumber"].includes(node.type))
    .map((node) => String(node?.text || node?.value || ""))
    .join("\n");

  const textPaintStats = textPaintPages.reduce((acc, page) => {
    acc.textPaintObjects += Number(page?.diagnostics?.textPaintObjects || 0);
    acc.transformMatches += Number(page?.diagnostics?.transformMatches || 0);
    acc.fontMatches += Number(page?.diagnostics?.fontMatches || 0);
    acc.riseDetected += Number(page?.diagnostics?.riseDetected || 0);
    return acc;
  }, { textPaintObjects: 0, transformMatches: 0, fontMatches: 0, riseDetected: 0 });

  const documentTree = {
    type: "document",
    schemaVersion: "cdm-v3",
    metadata: {
      filename: path.basename(sourceFile),
      filepath: sourceFile,
      mimeType: "application/pdf",
      pageCount: canonicalPages.length,
      sizeBytes: sourceBuffer.length
    },
    source: {
      primaryType: "pdf",
      adapters: ["PDFAdapter"]
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
    architecture: {
      pipeline: [
        "Input Adapter",
        "Evidence Layer",
        "Raw PDF Page Model",
        "PDF State Replayer",
        "Text Paint Objects",
        "Loss Accounting",
        "Canonical Semantic/Layout Tree",
        "Fidelity HTML"
      ],
      adapters: {
        pdf: "implemented",
        ocr: "planned",
        handwriting: "planned",
        docx: "planned"
      }
    },
    coordinateSystem: {
      origin: "top-left",
      units: "px",
      yAxis: "down",
      sourceSpace: { origin: "bottom-left", yAxis: "up" },
      transform: "htmlY = pageHeight - pdfY - elementHeight"
    },
    recurringRegions: {
      headers: recurringHeaders,
      footers: recurringFooters
    },
    statistics: {
      pages: canonicalPages.length,
      elements: allElements.length,
      textRuns: allElements.reduce((sum, node) => sum + (Array.isArray(node.children) ? node.children.length : 0), 0),
      headings: allElements.filter((node) => node.type === "heading").length,
      paragraphs: allElements.filter((node) => node.type === "paragraph").length,
      equations: allElements.filter((node) => node.type === "equation").length,
      mathCandidates: allElements.filter((node) => node.type === "textGroup" && node.semanticCandidate === "math").length,
      unknownBlocks: allElements.filter((node) => node.type === "unknownBlock").length,
      images: allElements.filter((node) => node.type === "image").length,
      vectors: allElements.filter((node) => node.type === "vectorPath").length,
      tables: allElements.filter((node) => node.type === "table").length,
      listItems: allElements.filter((node) => node.type === "listItem").length,
      pageNumbers: allElements.filter((node) => node.type === "pageNumber").length,
      characters: textContent.length,
      textPaint: textPaintStats,
      rawSourceObjects: allStatuses.length,
      lossAccounting: statusCounts
    },
    diagnostics: {
      warnings: [],
      unsupportedElements: []
    },
    pages: canonicalPages,
    evidenceLayer: buildPdfEvidenceLayer(rawPages),
    provenance: {
      sourceRefFormat: "sourceRef objects with sourceId/sourceType/kind",
      supportsMultiEvidencePerNode: true,
      supportsOneEvidenceToManyNodes: true
    }
  };

  const summary = {
    metadata: documentTree.metadata,
    statistics: documentTree.statistics,
    diagnostics: documentTree.diagnostics,
    previewText: textContent.slice(0, 2200)
  };

  return {
    documentTree,
    summary,
    rawPages,
    textPaintPages,
    lossAccounting: allStatuses
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceFile = args.input ? path.resolve(baseDir, args.input) : DEFAULT_INPUT;

  await ensureDir(outputDir);

  const { documentTree, summary, rawPages, textPaintPages, lossAccounting } = await extractPdfDocument(sourceFile);

  await writeJson(outputFile, documentTree);
  await writeJson(summaryFile, summary);
  await writeJson(rawPagesFile, {
    schemaVersion: "raw-pdf-page-model-v1",
    sourceFile,
    pages: rawPages
  });
  await writeJson(lossAccountingFile, {
    sourceFile,
    statuses: lossAccounting
  });
  await writeJson(textPaintFile, {
    sourceFile,
    pages: textPaintPages
  });

  console.log(JSON.stringify({
    inputFile: sourceFile,
    outputFile,
    summaryFile,
    rawPagesFile,
    lossAccountingFile,
    textPaintFile,
    statistics: documentTree.statistics
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
