import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { pdfToHtmlY } from "./coordinates.js";

function opsNameMap() {
  const map = new Map();
  for (const [name, value] of Object.entries(pdfjsLib.OPS || {})) {
    map.set(value, name);
  }
  return map;
}

function normalizeResolvedFontName(name = "") {
  const source = String(name || "").trim();
  if (!source) return "";
  return source
    .replace(/^[A-Z]{6}\+/, "")
    .replace(/^[^+]+\+/, "")
    .trim();
}

function safeSerialize(value) {
  if (value === null || value === undefined) return value;
  if (ArrayBuffer.isView(value)) {
    return {
      type: "typed-array",
      constructor: value.constructor?.name || "TypedArray",
      length: Number(value.length || 0),
      preview: Array.from(value).slice(0, 32)
    };
  }
  if (Array.isArray(value)) return value.map(safeSerialize);
  if (typeof value === "object") {
    const ctor = value?.constructor?.name || "Object";
    if (ctor !== "Object") {
      const serializable = {};
      for (const [key, child] of Object.entries(value)) {
        serializable[key] = safeSerialize(child);
      }
      return {
        type: "object",
        constructor: ctor,
        fields: serializable
      };
    }
    const out = {};
    for (const [key, child] of Object.entries(value)) out[key] = safeSerialize(child);
    return out;
  }
  if (typeof value === "function") {
    return {
      type: "unserializable",
      constructor: "Function",
      summary: "Function value omitted"
    };
  }
  return value;
}

function toStableId(pageNumber, prefix, index) {
  return `p${pageNumber}-${prefix}-${String(index + 1).padStart(5, "0")}`;
}

function multiplyMatrix(left = [1, 0, 0, 1, 0, 0], right = [1, 0, 0, 1, 0, 0]) {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5]
  ];
}

function inspectFonts(page, textContent, pageNumber, operatorList = null) {
  const styles = textContent?.styles || {};
  const fonts = [];
  const fontNames = Object.keys(styles);

  let index = 0;

  for (const fontName of fontNames) {
    const style = styles[fontName] || {};
    let commonObj = null;
    try {
      if (page?.commonObjs?.has?.(fontName)) commonObj = page.commonObjs.get(fontName);
    } catch {
      commonObj = null;
    }

    const resolvedName = normalizeResolvedFontName(commonObj?.name || commonObj?.loadedName || fontName);
    const fallbackName = String(commonObj?.fallbackName || "").trim();
    const styleFamily = String(style?.fontFamily || style?.fontSubstitution || "").trim();
    const family = resolvedName || styleFamily || fallbackName || fontName || "unknown";

    fonts.push({
      id: toStableId(pageNumber, "font", index),
      index,
      fontName,
      family,
      style: safeSerialize(style),
      resolvedName,
      fallbackName: fallbackName || null,
      subtype: String(commonObj?.subtype || commonObj?.type || "unknown"),
      embedded: commonObj?.isEmbeddedFont ?? null,
      unicodeMapping: Boolean(commonObj?.toUnicode),
      customEncodingLikely: Boolean(commonObj?.encoding || commonObj?.differences),
      fontDataAvailable: Boolean(commonObj?.data),
      ascent: Number.isFinite(Number(commonObj?.ascent)) ? Number(commonObj.ascent) : (Number.isFinite(Number(style?.ascent)) ? Number(style.ascent) : null),
      descent: Number.isFinite(Number(commonObj?.descent)) ? Number(commonObj.descent) : (Number.isFinite(Number(style?.descent)) ? Number(style.descent) : null),
      fontMatrix: Array.isArray(commonObj?.fontMatrix) ? commonObj.fontMatrix.map((v) => Number(v || 0)) : null
    });
    index += 1;
  }

  return fonts;
}

function extractOperatorModel(operatorList, viewport, pageNumber) {
  const opNames = opsNameMap();
  const fnArray = Array.isArray(operatorList?.fnArray) ? operatorList.fnArray : [];
  const argsArray = Array.isArray(operatorList?.argsArray) ? operatorList.argsArray : [];

  const operators = [];
  const images = [];
  const graphics = [];

  let ctm = [1, 0, 0, 1, 0, 0];
  let stackDepth = 0;
  const ctmStack = [];

  const vectorOps = new Set([
    pdfjsLib.OPS.moveTo,
    pdfjsLib.OPS.lineTo,
    pdfjsLib.OPS.curveTo,
    pdfjsLib.OPS.curveTo2,
    pdfjsLib.OPS.curveTo3,
    pdfjsLib.OPS.closePath,
    pdfjsLib.OPS.rectangle,
    pdfjsLib.OPS.constructPath,
    pdfjsLib.OPS.stroke,
    pdfjsLib.OPS.fill,
    pdfjsLib.OPS.eoFill,
    pdfjsLib.OPS.fillStroke,
    pdfjsLib.OPS.eoFillStroke,
    pdfjsLib.OPS.closeStroke,
    pdfjsLib.OPS.closeFillStroke,
    pdfjsLib.OPS.endPath,
    pdfjsLib.OPS.clip,
    pdfjsLib.OPS.eoClip
  ]);

  const imageOps = new Set([
    pdfjsLib.OPS.paintImageXObject,
    pdfjsLib.OPS.paintInlineImageXObject,
    pdfjsLib.OPS.paintImageMaskXObject,
    pdfjsLib.OPS.paintImageXObjectRepeat
  ]);

  for (let index = 0; index < fnArray.length; index += 1) {
    const code = fnArray[index];
    const args = argsArray[index] || [];

    if (code === pdfjsLib.OPS.save) {
      ctmStack.push([...ctm]);
      stackDepth += 1;
    } else if (code === pdfjsLib.OPS.restore) {
      ctm = ctmStack.pop() || [1, 0, 0, 1, 0, 0];
      stackDepth = Math.max(0, stackDepth - 1);
    } else if (code === pdfjsLib.OPS.transform) {
      ctm = multiplyMatrix(ctm, args);
    }

    const operator = {
      id: toStableId(pageNumber, "op", index),
      index,
      operatorCode: code,
      operator: opNames.get(code) || `OP_${code}`,
      args: safeSerialize(args),
      page: pageNumber,
      graphicsState: {
        ctm: [...ctm],
        stackDepth,
        currentFont: null,
        fontSize: null,
        characterSpacing: null,
        wordSpacing: null,
        horizontalScaling: null,
        leading: null,
        textRise: null,
        textRenderingMode: null,
        fillColor: null,
        strokeColor: null,
        lineWidth: null,
        lineCap: null,
        lineJoin: null,
        opacity: null
      },
      transform: [...ctm],
      preservationStatus: "preserved"
    };

    operators.push(operator);

    if (imageOps.has(code)) {
      const device = multiplyMatrix(viewport.transform || [1, 0, 0, 1, 0, 0], ctm);
      const width = Math.max(1, Math.hypot(device[0] || 0, device[1] || 0));
      const height = Math.max(1, Math.hypot(device[2] || 0, device[3] || 0));
      const pdfX = Number(device[4] || 0);
      const pdfY = Number(device[5] || 0);

      images.push({
        id: toStableId(pageNumber, "image", images.length),
        index: images.length,
        operatorId: operator.id,
        operatorIndex: index,
        objectId: String(args[0] || ""),
        transform: device,
        geometry: {
          x: pdfX,
          y: pdfToHtmlY(pdfY, Number(viewport.height || 0), height),
          width,
          height
        },
        clippingPath: null,
        scaling: {
          x: Number(device[0] || 1),
          y: Number(device[3] || 1)
        },
        rotation: 0,
        source: {
          bytesExtractable: false,
          reason: "Image bytes are not directly exposed from current operator-list inspection API path.",
          suggestedNextStep: "Probe PDF.js object caches / image resources or lower-level PDF parser for binary image streams."
        },
        preservationStatus: "preserved"
      });
    }

    if (vectorOps.has(code)) {
      graphics.push({
        id: toStableId(pageNumber, "vec", graphics.length),
        index: graphics.length,
        operatorId: operator.id,
        operatorIndex: index,
        operator: operator.operator,
        commands: [
          {
            op: operator.operator,
            args: safeSerialize(args)
          }
        ],
        style: {
          stroke: null,
          fill: null,
          lineWidth: null,
          lineCap: null,
          lineJoin: null
        },
        transform: [...ctm],
        clippingPath: null,
        preservationStatus: "preserved"
      });
    }
  }

  return { operators, images, graphics };
}

function buildTextObjects(textContent, viewport, pageNumber) {
  const items = Array.isArray(textContent?.items) ? textContent.items : [];
  const textObjects = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] || {};
    const transform = Array.isArray(item?.transform) ? item.transform.map((value) => Number(value || 0)) : [1, 0, 0, 1, 0, 0];
    const width = Number(item?.width || 0);
    const height = Number(item?.height || 0);
    const pdfY = Number(transform[5] || 0);
    const htmlY = pdfToHtmlY(pdfY, Number(viewport.height || 0), height);

    textObjects.push({
      id: toStableId(pageNumber, "text", index),
      index,
      page: pageNumber,
      text: String(item?.str ?? ""),
      rawText: String(item?.str ?? ""),
      transform,
      width,
      height,
      bbox: {
        x: Number(transform[4] || 0),
        y: htmlY,
        width,
        height
      },
      fontName: String(item?.fontName || ""),
      hasEOL: Boolean(item?.hasEOL),
      dir: String(item?.dir || ""),
      ascent: Number(item?.ascent || 0),
      descent: Number(item?.descent || 0),
      vertical: Boolean(item?.vertical),
      markedContentId: item?.markedContentId ?? null,
      whitespaceKind: item?.str === "" ? "empty" : (item?.str === " " ? "space" : (/^\s+$/.test(String(item?.str || "")) ? "whitespace" : "non-whitespace")),
      preservationStatus: "preserved"
    });
  }

  return textObjects;
}

export async function buildRawPdfPageModels(pdf, options = {}) {
  const pages = [];
  const startPage = Number(options?.startPage || 1);
  const endPage = Number(options?.endPage || pdf.numPages);

  for (let pageNumber = startPage; pageNumber <= endPage; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent({ disableNormalization: false, includeMarkedContent: true });
    const operatorList = await page.getOperatorList();
    const textObjects = buildTextObjects(textContent, viewport, pageNumber);
    const fonts = inspectFonts(page, textContent, pageNumber, operatorList);
    const { operators, images, graphics } = extractOperatorModel(operatorList, viewport, pageNumber);

    pages.push({
      pageNumber,
      geometry: {
        width: Number(viewport.width || 0),
        height: Number(viewport.height || 0),
        rotation: Number(viewport.rotation || 0)
      },
      textObjects,
      operators,
      fonts,
      images,
      graphics,
      diagnostics: {
        textObjectCount: textObjects.length,
        operatorCount: operators.length,
        fontCount: fonts.length,
        imageCount: images.length,
        graphicsCount: graphics.length
      }
    });
  }

  return pages;
}

export async function loadPdfForRawModel(sourceBuffer) {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(sourceBuffer),
    useSystemFonts: true,
    isEvalSupported: false
  });
  return loadingTask.promise;
}
