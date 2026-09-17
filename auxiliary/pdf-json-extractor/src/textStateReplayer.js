function identityMatrix() {
  return [1, 0, 0, 1, 0, 0];
}

function cloneMatrix(matrix = identityMatrix()) {
  return [
    Number(matrix[0] || 0),
    Number(matrix[1] || 0),
    Number(matrix[2] || 0),
    Number(matrix[3] || 0),
    Number(matrix[4] || 0),
    Number(matrix[5] || 0)
  ];
}

export function multiplyMatrix(left = identityMatrix(), right = identityMatrix()) {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5]
  ];
}

function translateMatrix(tx = 0, ty = 0) {
  return [1, 0, 0, 1, Number(tx || 0), Number(ty || 0)];
}

function defaultTextState() {
  return {
    ctm: identityMatrix(),
    textMatrix: identityMatrix(),
    textLineMatrix: identityMatrix(),
    font: {
      name: null,
      size: 0
    },
    characterSpacing: 0,
    wordSpacing: 0,
    horizontalScale: 100,
    leading: 0,
    rise: 0,
    renderingMode: 0,
    fillColor: null,
    strokeColor: null,
    inTextObject: false
  };
}

function cloneState(state) {
  return {
    ctm: cloneMatrix(state.ctm),
    textMatrix: cloneMatrix(state.textMatrix),
    textLineMatrix: cloneMatrix(state.textLineMatrix),
    font: {
      name: state?.font?.name || null,
      size: Number(state?.font?.size || 0)
    },
    characterSpacing: Number(state?.characterSpacing || 0),
    wordSpacing: Number(state?.wordSpacing || 0),
    horizontalScale: Number(state?.horizontalScale || 100),
    leading: Number(state?.leading || 0),
    rise: Number(state?.rise || 0),
    renderingMode: Number(state?.renderingMode || 0),
    fillColor: state?.fillColor ? [...state.fillColor] : null,
    strokeColor: state?.strokeColor ? [...state.strokeColor] : null,
    inTextObject: Boolean(state?.inTextObject)
  };
}

function parseNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseMatrixArg(arg) {
  if (Array.isArray(arg) && arg.length >= 6) return cloneMatrix(arg);
  if (arg && typeof arg === "object" && arg.type === "typed-array" && Array.isArray(arg.preview) && arg.preview.length >= 6) {
    return cloneMatrix(arg.preview);
  }
  return identityMatrix();
}

function toArray(args) {
  return Array.isArray(args) ? args : [];
}

function normalizeShowArg(value) {
  if (Array.isArray(value)) return value;
  return [value];
}

function glyphToChar(item) {
  if (typeof item === "string") return item;
  if (typeof item === "number") return "";
  if (!item || typeof item !== "object") return "";
  if (typeof item.unicode === "string") return item.unicode;
  if (typeof item.fontChar === "string") return item.fontChar;
  return "";
}

function buildTextSegments(operatorName, args = []) {
  const segments = [];
  const payload = operatorName === "showSpacedText" ? normalizeShowArg(args[0]) : normalizeShowArg(args[0]);

  for (const item of payload) {
    if (typeof item === "number") {
      segments.push({ type: "adjustment", adjustment: Number(item) });
      continue;
    }

    if (typeof item === "string") {
      segments.push({ type: "text", text: item });
      continue;
    }

    if (Array.isArray(item)) {
      for (const nested of item) {
        if (typeof nested === "number") {
          segments.push({ type: "adjustment", adjustment: Number(nested) });
        } else {
          const char = glyphToChar(nested);
          if (char) segments.push({ type: "glyph", text: char, glyph: nested });
        }
      }
      continue;
    }

    const char = glyphToChar(item);
    if (char) segments.push({ type: "glyph", text: char, glyph: item });
  }

  const text = segments
    .filter((segment) => segment.type === "text" || segment.type === "glyph")
    .map((segment) => segment.text)
    .join("");

  return { segments, text };
}

function transformDelta(expected = identityMatrix(), actual = identityMatrix()) {
  let maxAbs = 0;
  let sum = 0;
  for (let i = 0; i < 6; i += 1) {
    const diff = Math.abs(Number(expected[i] || 0) - Number(actual[i] || 0));
    maxAbs = Math.max(maxAbs, diff);
    sum += diff;
  }
  return { maxAbs, sumAbs: sum };
}

function estimateTextAdvance(textObject = null, state = defaultTextState()) {
  if (!textObject) return 0;
  const width = Number(textObject?.width || 0);
  if (!Number.isFinite(width) || width <= 0) return 0;
  const ctmScaleX = Math.hypot(Number(state.ctm[0] || 0), Number(state.ctm[1] || 0)) || 1;
  return width / ctmScaleX;
}

function runFormulaCandidates(state) {
  const tm = cloneMatrix(state.textMatrix);
  const ctm = cloneMatrix(state.ctm);
  const fontSize = Number(state?.font?.size || 0);
  const hScale = Number(state?.horizontalScale || 100) / 100;
  const rise = Number(state?.rise || 0);

  const fontMatrix = [Math.max(0, fontSize) * hScale, 0, 0, Math.max(0, fontSize), 0, rise];

  return [
    { key: "ctm_textMatrix", transform: multiplyMatrix(ctm, tm) },
    { key: "ctm_textMatrix_fontMatrix", transform: multiplyMatrix(multiplyMatrix(ctm, tm), fontMatrix) },
    { key: "ctm_fontMatrix_textMatrix", transform: multiplyMatrix(multiplyMatrix(ctm, fontMatrix), tm) }
  ];
}

function chooseBestTransform(state, textObject) {
  const target = Array.isArray(textObject?.transform) && textObject.transform.length === 6
    ? cloneMatrix(textObject.transform)
    : null;
  const candidates = runFormulaCandidates(state);

  if (!target) {
    return {
      key: candidates[0].key,
      transform: candidates[0].transform,
      delta: { maxAbs: null, sumAbs: null }
    };
  }

  let best = null;
  for (const candidate of candidates) {
    const delta = transformDelta(candidate.transform, target);
    if (!best || delta.maxAbs < best.delta.maxAbs) {
      best = { ...candidate, delta };
    }
  }

  return best;
}

function cloneTextObject(textObject = {}) {
  if (!textObject) return null;
  return {
    id: textObject.id,
    index: textObject.index,
    text: textObject.text,
    transform: Array.isArray(textObject.transform) ? cloneMatrix(textObject.transform) : identityMatrix(),
    width: Number(textObject.width || 0),
    height: Number(textObject.height || 0),
    fontName: textObject.fontName || null,
    bbox: textObject?.bbox || null,
    hasEOL: Boolean(textObject?.hasEOL),
    whitespaceKind: textObject?.whitespaceKind || null
  };
}

function normalizeText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function selectPaintEventForText(textObject, paintEvents = [], cursor = 0) {
  if (!paintEvents.length) return { event: null, nextCursor: cursor };

  const text = normalizeText(textObject?.text || "");
  const isEmpty = text.length === 0 || textObject?.whitespaceKind === "empty";
  if (isEmpty) {
    const idx = Math.max(0, Math.min(cursor, paintEvents.length - 1));
    return { event: paintEvents[idx] || null, nextCursor: cursor };
  }

  const start = Math.max(0, cursor);
  const end = Math.min(paintEvents.length - 1, start + 40);
  let bestIndex = -1;
  let bestScore = -1;

  for (let idx = start; idx <= end; idx += 1) {
    const eventText = normalizeText(paintEvents[idx]?.showPayload?.text || "");
    if (!eventText) continue;

    let score = 0;
    if (eventText === text) score = 5;
    else if (eventText.includes(text) || text.includes(eventText)) score = 3;
    else {
      const overlap = Math.min(eventText.length, text.length);
      if (overlap > 0 && (eventText.slice(0, overlap) === text.slice(0, overlap))) {
        score = 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = idx;
      if (score === 5) break;
    }
  }

  if (bestIndex >= 0) {
    return {
      event: paintEvents[bestIndex],
      nextCursor: bestIndex + 1
    };
  }

  const fallback = Math.min(start, paintEvents.length - 1);
  return {
    event: paintEvents[fallback] || null,
    nextCursor: Math.min(paintEvents.length, fallback + 1)
  };
}

function resolveTextObjectMatch(textObjects = [], startIndex = 0, preferredText = "") {
  const limit = Math.min(textObjects.length, startIndex + 8);
  if (preferredText) {
    for (let idx = startIndex; idx < limit; idx += 1) {
      const candidate = textObjects[idx];
      if (!candidate) continue;
      if (String(candidate.text || "") === preferredText) return { index: idx, item: candidate };
    }
  }

  for (let idx = startIndex; idx < limit; idx += 1) {
    const candidate = textObjects[idx];
    if (!candidate) continue;
    return { index: idx, item: candidate };
  }

  return { index: startIndex, item: null };
}

function applyTextPositioning(operatorName, args, state) {
  if (operatorName === "setTextMatrix") {
    const maybeMatrix = args.length === 1 ? parseMatrixArg(args[0]) : parseMatrixArg(args);
    state.textMatrix = maybeMatrix;
    state.textLineMatrix = cloneMatrix(maybeMatrix);
    return;
  }

  if (operatorName === "moveText") {
    const tx = parseNumber(args[0], 0);
    const ty = parseNumber(args[1], 0);
    state.textLineMatrix = multiplyMatrix(state.textLineMatrix, translateMatrix(tx, ty));
    state.textMatrix = cloneMatrix(state.textLineMatrix);
    return;
  }

  if (operatorName === "setLeadingMoveText") {
    const tx = parseNumber(args[0], 0);
    const ty = parseNumber(args[1], 0);
    state.leading = -ty;
    state.textLineMatrix = multiplyMatrix(state.textLineMatrix, translateMatrix(tx, ty));
    state.textMatrix = cloneMatrix(state.textLineMatrix);
    return;
  }

  if (operatorName === "nextLine") {
    state.textLineMatrix = multiplyMatrix(state.textLineMatrix, translateMatrix(0, -Number(state.leading || 0)));
    state.textMatrix = cloneMatrix(state.textLineMatrix);
  }
}

function applyTextStyle(operatorName, args, state) {
  if (operatorName === "setFont") {
    state.font = {
      name: args[0] ? String(args[0]) : null,
      size: parseNumber(args[1], 0)
    };
    return;
  }

  if (operatorName === "setCharSpacing") {
    state.characterSpacing = parseNumber(args[0], state.characterSpacing);
    return;
  }

  if (operatorName === "setWordSpacing") {
    state.wordSpacing = parseNumber(args[0], state.wordSpacing);
    return;
  }

  if (operatorName === "setHScale") {
    state.horizontalScale = parseNumber(args[0], state.horizontalScale);
    return;
  }

  if (operatorName === "setLeading") {
    state.leading = parseNumber(args[0], state.leading);
    return;
  }

  if (operatorName === "setTextRise") {
    state.rise = parseNumber(args[0], state.rise);
    return;
  }

  if (operatorName === "setTextRenderingMode") {
    state.renderingMode = parseNumber(args[0], state.renderingMode);
    return;
  }

  if (operatorName === "setFillRGBColor") {
    state.fillColor = [parseNumber(args[0]), parseNumber(args[1]), parseNumber(args[2])];
    return;
  }

  if (operatorName === "setStrokeRGBColor") {
    state.strokeColor = [parseNumber(args[0]), parseNumber(args[1]), parseNumber(args[2])];
  }
}

function isTextPaintOperator(name = "") {
  return name === "showText"
    || name === "showSpacedText"
    || name === "nextLineShowText"
    || name === "nextLineSetSpacingShowText";
}

function captureTextPaint({ pageNumber, paintIndex, operator, stateSnapshot, textObject, showPayload, transformChoice }) {
  const bbox = textObject?.bbox || null;
  const baselineY = bbox ? Number(bbox.y || 0) + Number(bbox.height || 0) : Number(transformChoice?.transform?.[5] || 0);
  const baselineStart = bbox ? [Number(bbox.x || 0), baselineY] : [Number(transformChoice?.transform?.[4] || 0), baselineY];
  const baselineEnd = bbox
    ? [Number(bbox.x || 0) + Number(bbox.width || 0), baselineY]
    : [baselineStart[0], baselineStart[1]];

  return {
    id: `p${pageNumber}-paint-${String(paintIndex + 1).padStart(5, "0")}`,
    page: pageNumber,
    operatorId: operator?.id || null,
    operatorIndex: Number.isFinite(Number(operator?.index)) ? Number(operator.index) : null,
    operator: operator?.operator || "unresolvedPaintEvent",
    sourceRefs: [...(operator?.id ? [operator.id] : []), ...(textObject?.id ? [textObject.id] : [])],
    text: textObject?.text ?? showPayload.text,
    segments: showPayload.segments,
    geometry: {
      bbox,
      transform: textObject?.transform || transformChoice.transform
    },
    baseline: {
      start: baselineStart,
      end: baselineEnd
    },
    state: {
      ctm: cloneMatrix(stateSnapshot.ctm),
      textMatrix: cloneMatrix(stateSnapshot.textMatrix),
      textLineMatrix: cloneMatrix(stateSnapshot.textLineMatrix),
      font: { ...stateSnapshot.font },
      fontSize: Number(stateSnapshot?.font?.size || 0),
      rise: Number(stateSnapshot.rise || 0),
      characterSpacing: Number(stateSnapshot.characterSpacing || 0),
      wordSpacing: Number(stateSnapshot.wordSpacing || 0),
      horizontalScale: Number(stateSnapshot.horizontalScale || 100),
      leading: Number(stateSnapshot.leading || 0),
      renderingMode: Number(stateSnapshot.renderingMode || 0),
      fillColor: stateSnapshot.fillColor ? [...stateSnapshot.fillColor] : null,
      strokeColor: stateSnapshot.strokeColor ? [...stateSnapshot.strokeColor] : null
    },
    comparison: {
      formula: transformChoice.key,
      transformError: transformChoice?.delta?.maxAbs,
      transformErrorL1: transformChoice?.delta?.sumAbs,
      fontMatch: textObject ? String(textObject.fontName || "") === String(stateSnapshot?.font?.name || "") : null,
      fontNamePdfjs: textObject?.fontName || null,
      fontNameState: stateSnapshot?.font?.name || null,
      pdfjsTransform: textObject?.transform || null,
      reconstructedTransform: transformChoice.transform
    },
    pdfjs: cloneTextObject(textObject),
    diagnostics: {
      inTextObject: Boolean(stateSnapshot.inTextObject)
    }
  };
}

export function replayTextStateForPage(pageModel = {}, options = {}) {
  const tolerance = Number(options?.transformTolerance || 0.01);
  const operators = Array.isArray(pageModel?.operators) ? pageModel.operators : [];
  const textObjects = Array.isArray(pageModel?.textObjects) ? pageModel.textObjects : [];

  const state = defaultTextState();
  const stack = [];
  const paintEvents = [];
  const unsupportedOperators = new Set();

  for (const operator of operators) {
    const opName = String(operator?.operator || "");
    const args = toArray(operator?.args);

    if (opName === "save") {
      stack.push(cloneState(state));
      continue;
    }

    if (opName === "restore") {
      const restored = stack.pop();
      if (restored) {
        Object.assign(state, restored);
      }
      continue;
    }

    if (opName === "transform") {
      const matrix = parseMatrixArg(args);
      state.ctm = multiplyMatrix(state.ctm, matrix);
      continue;
    }

    if (opName === "beginText") {
      state.inTextObject = true;
      state.textMatrix = identityMatrix();
      state.textLineMatrix = identityMatrix();
      continue;
    }

    if (opName === "endText") {
      state.inTextObject = false;
      continue;
    }

    if (opName === "nextLineShowText") {
      applyTextPositioning("nextLine", [], state);
    }

    if (opName === "nextLineSetSpacingShowText") {
      state.wordSpacing = parseNumber(args[0], state.wordSpacing);
      state.characterSpacing = parseNumber(args[1], state.characterSpacing);
      applyTextPositioning("nextLine", [], state);
    }

    if (["setTextMatrix", "moveText", "setLeadingMoveText", "nextLine"].includes(opName)) {
      applyTextPositioning(opName, args, state);
      continue;
    }

    if ([
      "setFont",
      "setCharSpacing",
      "setWordSpacing",
      "setHScale",
      "setLeading",
      "setTextRise",
      "setTextRenderingMode",
      "setFillRGBColor",
      "setStrokeRGBColor"
    ].includes(opName)) {
      applyTextStyle(opName, args, state);
      continue;
    }

    if (!isTextPaintOperator(opName)) {
      if (opName.startsWith("set") || opName.includes("Text") || opName.includes("Color")) {
        unsupportedOperators.add(opName);
      }
      continue;
    }

    const payloadArgs = opName === "nextLineShowText"
      ? [args[0]]
      : opName === "nextLineSetSpacingShowText"
        ? [args[2]]
        : args;
    const showPayload = buildTextSegments(opName, payloadArgs);

    paintEvents.push({
      operator,
      showPayload,
      stateSnapshot: cloneState(state)
    });
  }

  let eventCursor = 0;
  const textPaintObjects = textObjects.map((textObject, index) => {
    const selection = selectPaintEventForText(textObject, paintEvents, eventCursor);
    const event = selection.event;
    eventCursor = selection.nextCursor;

    const stateSnapshot = event?.stateSnapshot || cloneState(state);
    const transformChoice = chooseBestTransform(stateSnapshot, textObject);

    return captureTextPaint({
      pageNumber: pageModel?.pageNumber || 0,
      paintIndex: index,
      operator: event?.operator || null,
      stateSnapshot,
      textObject,
      showPayload: event?.showPayload || { segments: [], text: String(textObject?.text || "") },
      transformChoice
    });
  });

  const matchedItems = textPaintObjects.filter((paint) => paint?.pdfjs?.id).length;
  const transformMatches = textPaintObjects.filter((paint) => Number(paint?.comparison?.transformError ?? Infinity) <= tolerance).length;
  const fontMatches = textPaintObjects.filter((paint) => paint?.comparison?.fontMatch === true).length;
  const riseDetected = textPaintObjects.filter((paint) => Math.abs(Number(paint?.state?.rise || 0)) > 0.0001).length;

  return {
    pageNumber: pageModel?.pageNumber || 0,
    textPaintObjects,
    diagnostics: {
      textObjectsTotal: textObjects.length,
      textPaintObjects: textPaintObjects.length,
      matchedTextObjects: matchedItems,
      unmatchedTextObjects: Math.max(0, textObjects.length - matchedItems),
      paintEventCount: paintEvents.length,
      orphanPaintEvents: Math.max(0, paintEvents.length - textObjects.length),
      transformMatches,
      fontMatches,
      riseDetected,
      transformTolerance: tolerance,
      unsupportedOperators: Array.from(unsupportedOperators).sort()
    }
  };
}
