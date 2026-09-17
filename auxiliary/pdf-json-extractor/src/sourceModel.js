export const SOURCE_TYPES = Object.freeze([
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
]);

export const VALUE_STATUS = Object.freeze([
  "observed",
  "inferred",
  "derived",
  "userCorrected",
  "unknown"
]);

function isValidSourceType(value) {
  return SOURCE_TYPES.includes(String(value || "unknown"));
}

export function inferSourceTypeFromId(sourceId = "") {
  const id = String(sourceId || "");
  if (id.includes("-text-")) return "pdf-text";
  if (id.includes("-vec-") || id.includes("-graphics-")) return "pdf-vector";
  if (id.includes("-image-") || id.includes("-img-")) return "pdf-image";
  if (id.includes("-op-") || id.includes("-paint-")) return "pdf";
  return "unknown";
}

export function inferEvidenceKindFromId(sourceId = "") {
  const id = String(sourceId || "");
  if (id.includes("-text-")) return "textObject";
  if (id.includes("-paint-")) return "textPaint";
  if (id.includes("-op-")) return "operator";
  if (id.includes("-vec-")) return "vectorPath";
  if (id.includes("-image-") || id.includes("-img-")) return "imageObject";
  if (id.includes("-font-")) return "fontObject";
  return "unknown";
}

export function sourceIdOf(ref) {
  if (!ref) return null;
  if (typeof ref === "string") return ref;
  if (typeof ref === "object" && ref.sourceId) return String(ref.sourceId);
  return null;
}

export function toSourceRef(ref, fallback = {}) {
  if (!ref) return null;

  if (typeof ref === "string") {
    return {
      sourceId: ref,
      sourceType: fallback.sourceType || inferSourceTypeFromId(ref),
      kind: fallback.kind || inferEvidenceKindFromId(ref)
    };
  }

  if (typeof ref === "object") {
    const sourceId = String(ref.sourceId || ref.id || "").trim();
    if (!sourceId) return null;
    const sourceType = isValidSourceType(ref.sourceType)
      ? String(ref.sourceType)
      : (fallback.sourceType || inferSourceTypeFromId(sourceId));
    const kind = String(ref.kind || fallback.kind || inferEvidenceKindFromId(sourceId));
    return {
      sourceId,
      sourceType,
      kind
    };
  }

  return null;
}

export function normalizeSourceRefs(refs = [], fallback = {}) {
  const seen = new Set();
  const normalized = [];

  for (const ref of refs || []) {
    const candidate = toSourceRef(ref, fallback);
    if (!candidate) continue;
    const key = `${candidate.sourceId}::${candidate.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(candidate);
  }

  return normalized;
}

export function makeConfidence(overrides = {}) {
  return {
    overall: overrides.overall ?? null,
    text: overrides.text ?? null,
    geometry: overrides.geometry ?? null,
    classification: overrides.classification ?? null,
    style: overrides.style ?? null,
    math: overrides.math ?? null
  };
}

export function valueState(value, status = "unknown", meta = {}) {
  const normalizedStatus = VALUE_STATUS.includes(status) ? status : "unknown";
  return {
    value,
    status: normalizedStatus,
    ...meta
  };
}
