function clampRatio(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, Number(value)));
}

function countMatches(source = "", pattern) {
  const matches = String(source || "").match(pattern);
  return Array.isArray(matches) ? matches.length : 0;
}

function sourceEquationCount(extraction = {}) {
  const fromVerification = Number(extraction?.verification?.sourceCounts?.equations || 0);
  if (fromVerification > 0) return fromVerification;
  const markers = Array.isArray(extraction?.riskMarkers) ? extraction.riskMarkers : [];
  return markers.filter((marker) => marker?.formula && typeof marker.formula === "object").length;
}

function sourceTableCount(extraction = {}) {
  const fromVerification = Number(extraction?.verification?.sourceCounts?.tables || 0);
  if (fromVerification > 0) return fromVerification;
  return countMatches(String(extraction?.sourceRenderHtml || ""), /<table\b/gi);
}

function sourceTextLength(extraction = {}) {
  const fromVerification = Number(extraction?.verification?.sourceCounts?.textLength || 0);
  if (fromVerification > 0) return fromVerification;
  return Math.max(0, Number(String(extraction?.sourcePreview || extraction?.text || "").length));
}

function normalizeText(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLatexForComparison(value = "") {
  return normalizeText(String(value || "")
    .replace(/\\/g, "")
    .replace(/[{}$]/g, "")
    .replace(/_/g, " ")
    .replace(/\^/g, " "))
    .toLowerCase();
}

function collectAllBlocks(canonicalDocument = {}) {
  const sections = Array.isArray(canonicalDocument?.sections) ? canonicalDocument.sections : [];
  return sections.flatMap((section) => Array.isArray(section?.blocks) ? section.blocks : []);
}

function collectInlineNodes(children = [], owner = {}) {
  return (Array.isArray(children) ? children : []).map((child) => ({
    ...child,
    ownerType: owner.type || "",
    ownerNodePath: owner.nodePath || ""
  }));
}

function collectContentNodeEntries(canonicalDocument = {}) {
  const entries = [];
  const blocks = collectAllBlocks(canonicalDocument);
  for (const block of blocks) {
    const blockPath = String(block?.nodePath || "").trim();
    if (blockPath) {
      entries.push({
        kind: String(block?.type || "block"),
        nodePath: blockPath,
        label: `${block.type}:${blockPath}`
      });
    }

    const inlineNodes = collectInlineNodes(block?.children || [], block);
    for (const child of inlineNodes) {
      const childPath = String(child?.nodePath || "").trim();
      if (!childPath) continue;
      entries.push({
        kind: String(child?.type || "inline"),
        nodePath: childPath,
        label: `${child.type}:${childPath}`
      });
    }
  }
  return entries;
}

export function validateCanonicalUniqueness(canonicalDocument = {}, extraction = {}) {
  const errors = [];
  const blocks = collectAllBlocks(canonicalDocument);
  const equations = Array.isArray(canonicalDocument?.equations) ? canonicalDocument.equations : [];

  const equationIds = new Map();
  for (const equation of equations) {
    const id = String(equation?.id || "").trim();
    if (!id) continue;
    const existing = equationIds.get(id) || [];
    existing.push(equation);
    equationIds.set(id, existing);
  }
  for (const [id, items] of equationIds.entries()) {
    if (items.length > 1) {
      errors.push({
        error: "DUPLICATE_EQUATION_ID",
        equationId: id,
        representations: items.map((item) => `${item.type}:${item.nodePath || ""}`)
      });
    }
  }

  const sourcePathMap = new Map();
  for (const entry of collectContentNodeEntries(canonicalDocument)) {
    const existing = sourcePathMap.get(entry.nodePath) || [];
    existing.push(entry.label);
    sourcePathMap.set(entry.nodePath, existing);
  }
  for (const [nodePath, representations] of sourcePathMap.entries()) {
    if (representations.length > 1) {
      const uniqueKinds = new Set(representations.map((item) => item.split(":")[0]));
      if (uniqueKinds.size > 1) {
        errors.push({
          error: "DUPLICATE_SOURCE_CONTENT",
          nodePath,
          representations
        });
      }
    }
  }

  const seenHeadings = new Map();
  for (const block of blocks) {
    if (block?.type !== "heading") continue;
    const key = `${Number(block?.level || 0)}:${normalizeText(block?.text || "").toLowerCase()}`;
    const items = seenHeadings.get(key) || [];
    items.push(block);
    seenHeadings.set(key, items);
  }
  for (const [key, items] of seenHeadings.entries()) {
    if (items.length > 1) {
      errors.push({
        error: "DUPLICATE_HEADING",
        headingKey: key,
        nodePaths: items.map((item) => String(item?.nodePath || ""))
      });
    }
  }

  const metadataTitle = normalizeText(canonicalDocument?.metadata?.title || "").toLowerCase();
  for (const section of Array.isArray(canonicalDocument?.sections) ? canonicalDocument.sections : []) {
    const sectionHeading = normalizeText(section?.heading || "").toLowerCase();
    const firstHeading = (Array.isArray(section?.blocks) ? section.blocks : []).find((block) => block?.type === "heading");
    const firstHeadingText = normalizeText(firstHeading?.text || "").toLowerCase();
    if (sectionHeading && firstHeadingText && sectionHeading === firstHeadingText) {
      errors.push({
        error: "BODY_METADATA_DUPLICATION",
        sectionId: String(section?.id || ""),
        nodePath: String(firstHeading?.nodePath || ""),
        representations: [`section.heading:${sectionHeading}`, `heading:${firstHeadingText}`]
      });
    }
    if (metadataTitle && firstHeadingText && metadataTitle === firstHeadingText && sectionHeading === metadataTitle) {
      errors.push({
        error: "BODY_METADATA_DUPLICATION",
        sectionId: String(section?.id || ""),
        nodePath: String(firstHeading?.nodePath || ""),
        representations: [`metadata.title:${metadataTitle}`, `heading:${firstHeadingText}`]
      });
    }
  }

  const equationLatexById = Object.fromEntries(equations.map((equation) => [String(equation?.id || ""), normalizeLatexForComparison(equation?.latex || "")]));
  for (const block of blocks) {
    const inlineNodes = collectInlineNodes(block?.children || [], block);
    for (let index = 0; index < inlineNodes.length; index += 1) {
      const current = inlineNodes[index];
      if (current?.type !== "inline_math") continue;
      const equationId = String(current?.equation_id || "");
      const canonicalMath = equationLatexById[equationId];
      if (!canonicalMath) continue;

      const neighbors = [inlineNodes[index - 1], inlineNodes[index + 1]].filter(Boolean);
      for (const neighbor of neighbors) {
        if (neighbor?.type !== "text") continue;
        const normalizedNeighbor = normalizeLatexForComparison(neighbor?.text || "");
        if (normalizedNeighbor && normalizedNeighbor === canonicalMath) {
          errors.push({
            error: "MATH_TEXT_DUPLICATION",
            nodePath: String(current?.nodePath || block?.nodePath || ""),
            representations: [
              `inline_math:${equationId}`,
              `text:${normalizeText(neighbor?.text || "")}`
            ]
          });
        }
      }
    }
  }

  const renderedHtml = String(extraction?.sourceRenderHtml || "");
  const fallbackHtml = String(extraction?.fallbackSourceRenderHtml || "");
  if (fallbackHtml && renderedHtml && renderedHtml.includes(fallbackHtml)) {
    errors.push({
      error: "RENDERER_FALLBACK_CONTENT",
      representations: ["rendered-html", "fallback-html"]
    });
  }

  return errors;
}

export function buildCanonicalVerification(canonicalDocument = {}, extraction = {}) {
  const equations = Array.isArray(canonicalDocument?.equations) ? canonicalDocument.equations : [];
  const sections = Array.isArray(canonicalDocument?.sections) ? canonicalDocument.sections : [];

  const extractedTableCount = sections.reduce((sum, section) => {
    const blocks = Array.isArray(section?.blocks) ? section.blocks : [];
    return sum + blocks.filter((block) => String(block?.type || "") === "table").length;
  }, 0);

  const extractedEquationCount = equations.length;
  const extractedTextLength = Math.max(0, Number(String(extraction?.text || "").length));

  const sourceEq = sourceEquationCount(extraction);
  const sourceTbl = sourceTableCount(extraction);
  const sourceTxt = sourceTextLength(extraction);

  const equationCoverage = sourceEq > 0 ? clampRatio(extractedEquationCount / sourceEq) : 1;
  const tableCoverage = sourceTbl > 0 ? clampRatio(extractedTableCount / sourceTbl) : 1;
  const textCoverage = sourceTxt > 0 ? clampRatio(extractedTextLength / sourceTxt) : (extractedTextLength > 0 ? 1 : 0);

  const unresolved = [];
  if (sourceEq > 0 && extractedEquationCount < sourceEq) {
    unresolved.push(`cdm-formula-parity-failed:${extractedEquationCount}/${sourceEq}`);
  }
  if (sourceTbl > 0 && extractedTableCount < sourceTbl) {
    unresolved.push(`cdm-table-parity-failed:${extractedTableCount}/${sourceTbl}`);
  }
  if (textCoverage < 0.55) {
    unresolved.push(`cdm-text-coverage-low:${textCoverage.toFixed(3)}<0.550`);
  }

  const uniquenessErrors = validateCanonicalUniqueness(canonicalDocument, extraction);
  for (const issue of uniquenessErrors) {
    unresolved.push(`${issue.error}:${issue.nodePath || issue.equationId || issue.headingKey || issue.sectionId || "unknown"}`);
  }

  return {
    sourceCounts: {
      equations: sourceEq,
      tables: sourceTbl,
      textLength: sourceTxt
    },
    extractedCounts: {
      equations: extractedEquationCount,
      tables: extractedTableCount,
      textLength: extractedTextLength
    },
    coverage: {
      equations: Number(equationCoverage.toFixed(3)),
      tables: Number(tableCoverage.toFixed(3)),
      text: Number(textCoverage.toFixed(3))
    },
    uniquenessErrors,
    gatePassed: unresolved.length === 0,
    unresolved
  };
}

export function buildCanonicalVerificationMarkers(verification = null) {
  if (!verification || verification.gatePassed) return [];
  return (verification.unresolved || []).map((issue, index) => ({
    id: `CDM-R${index + 1}`,
    type: "canonical-verification",
    severity: "high",
    label: `Canonical verification failed ${index + 1}`,
    excerpt: String(issue || ""),
    addressed: false,
    anchor: null,
    formula: null
  }));
}
