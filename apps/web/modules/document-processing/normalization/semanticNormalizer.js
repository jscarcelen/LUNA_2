function normalizeLatex(latex = "") {
  return String(latex || "")
    .replace(/\s+/g, " ")
    .replace(/\\(sum|int|prod|lim)\s+_/g, "\\$1_")
    .replace(/(\\(?:sum|int|prod|lim)(?:_\{[^}]+\})?)\^([A-Za-z0-9])/g, "$1^{$2}")
    .replace(/(_\{[^}]+\})\^([A-Za-z0-9])/g, "$1^{$2}")
    .replace(/([A-Za-z0-9])_\(([^)]+)\)/g, "$1_$2")
    .replace(/([A-Za-z0-9])_\(([^)]+)\)\^\(([^)]+)\)/g, "$1_$2^$3")
    .replace(/([A-Za-z0-9])_\{([A-Za-z0-9]+)\}/g, "$1_$2")
    .replace(/(?<=[A-Za-z0-9)])\^\{([A-Za-z0-9]+)\}/g, "^$1")
    .replace(/\^\(([^)]+)\)/g, "^$1")
    .replace(/\bbar\s*\{([^}]+)\}/g, "\\bar{$1}")
    .trim();
}

function buildMathDiagnosticHtml(latex = "", type = "inline_equation") {
  const safeLatex = String(latex || "").trim();
  if (!safeLatex) return "";
  if (type === "display_equation") {
    return `<div class="cdm-display-math">$$ ${safeLatex} $$</div>`;
  }
  return `<span class="cdm-inline-math">$${safeLatex}$</span>`;
}

function isHeaderFooterHeading(block = {}) {
  if (String(block?.type || "") !== "heading") return false;
  const text = String(block?.text || "").trim().toLowerCase();
  return text === "headers" || text === "footers";
}

// Word stores a Unicode-math "linear format" fallback alongside the real oMath equation; if it
// survives extraction as plain text it has no real words (letters longer than 3 chars).
function looksLikeMathArtifactText(text = "") {
  const words = String(text || "").match(/[A-Za-z]+/g) || [];
  return !words.some((word) => word.length >= 4);
}

// The linear-format fallback can be glued directly onto the following sentence with no space
// (e.g. "Sx2Units are..."). Strip only the leading math-artifact tokens, keeping real prose intact.
function stripLeadingMathArtifactPrefix(text = "") {
  const tokens = String(text || "").split(/(\s+)/);
  let index = 0;
  let sawDigit = false;
  let removedTokenCount = 0;

  while (index < tokens.length && removedTokenCount < 30) {
    const token = tokens[index];
    if (/^\s*$/.test(token)) {
      index += 1;
      continue;
    }
    const letters = token.match(/[A-Za-z]+/g) || [];
    if (letters.some((word) => word.length >= 3)) break;
    if (/[0-9]/.test(token)) sawDigit = true;
    index += 1;
    removedTokenCount += 1;
  }

  if (!sawDigit || !removedTokenCount) return text;
  return tokens.slice(index).join("").replace(/^\s+/, "");
}

function removeMathArtifactText(children = []) {
  const source = Array.isArray(children) ? children : [];
  const cleaned = [];

  for (let i = 0; i < source.length; i += 1) {
    const child = source[i];
    if (child?.type !== "text") {
      cleaned.push(child);
      continue;
    }

    const rawText = String(child.text || "");
    const strippedText = rawText.replace(/\s+/g, " ").trim();
    if (!strippedText) {
      cleaned.push({ ...child, text: rawText });
      continue;
    }

    if (/<m:oMath|<m:oMathPara|\\oMath/i.test(strippedText)) {
      continue;
    }

    const prev = source[i - 1];
    const next = source[i + 1];
    const adjacentMath = [prev, next].find((node) => node?.type === "inline_math");
    if (adjacentMath) {
      const latexText = String(adjacentMath?.latex || "").trim();
      if (strippedText === latexText || looksLikeMathArtifactText(strippedText)) {
        continue;
      }
    }

    if (prev?.type === "inline_math" && !/^\s/.test(rawText)) {
      const cleanedText = stripLeadingMathArtifactPrefix(rawText);
      if (cleanedText !== rawText) {
        const spaced = cleanedText && !/^\s/.test(cleanedText) ? ` ${cleanedText}` : cleanedText;
        cleaned.push({ ...child, text: spaced });
        continue;
      }
    }

    cleaned.push({ ...child, text: rawText });
  }

  return cleaned;
}


function normalizeInlineChildren(children = [], equationLatexById = {}) {
  const normalized = (Array.isArray(children) ? children : []).map((child) => {
    if (!child || typeof child !== "object") return child;

    if (child.type === "inline_math") {
      const equationId = String(child.equation_id || "").trim();
      const canonicalLatex = equationId ? equationLatexById[equationId] : null;
      return {
        ...child,
        latex: normalizeLatex(canonicalLatex || child.latex || "")
      };
    }

    return { ...child };
  });

  return removeMathArtifactText(normalized);
}

function normalizeListItems(block = {}, equationLatexById = {}) {
  const items = [];
  const itemChildren = normalizeInlineChildren(block.children || [], equationLatexById);

  if (itemChildren.length) {
    items.push({ children: itemChildren });
  }

  if (!items.length) {
    for (const item of Array.isArray(block.items) ? block.items : []) {
      const text = String(item || "");
      if (!text.trim()) continue;
      items.push({ children: [{ type: "text", text, source: block.source || "OOXML", confidence: 1 }] });
    }
  }

  return items;
}

function normalizeBlock(block = {}, equationLatexById = {}) {
  const type = String(block?.type || "");
  const copy = { ...block };

  if (type === "display_math") {
    const equationId = String(copy.equation_id || "").trim();
    const canonicalLatex = equationId ? equationLatexById[equationId] : null;
    copy.latex = normalizeLatex(canonicalLatex || copy.latex || "");
    return copy;
  }

  if (type === "paragraph" || type === "quote" || type === "caption" || type === "callout") {
    copy.children = normalizeInlineChildren(copy.children || [], equationLatexById);
    return copy;
  }

  if (type === "list") {
    copy.list_items = normalizeListItems(copy, equationLatexById);
    copy.children = undefined;
    copy.items = undefined;
    return copy;
  }

  if (type === "table") {
    copy.rows = (Array.isArray(copy.rows) ? copy.rows : []).map((row) => (Array.isArray(row) ? row : []).map((cell) => {
      if (!cell || typeof cell !== "object") return cell;
      const cellCopy = { ...cell };
      if (cellCopy.type === "table_cell") {
        cellCopy.blocks = (Array.isArray(cellCopy.blocks) ? cellCopy.blocks : []).map((nested) => normalizeBlock(nested, equationLatexById));
      }
      return cellCopy;
    }));
    return copy;
  }

  return copy;
}

function normalizeSections(sections = [], equationLatexById = {}, documentTitle = "") {
  const normalizedSections = [];

  for (const section of Array.isArray(sections) ? sections : []) {
    const sourceBlocks = Array.isArray(section?.blocks) ? section.blocks : [];
    const blocks = [];

    for (let i = 0; i < sourceBlocks.length; i += 1) {
      const block = sourceBlocks[i];
      if (!block) continue;

      if (block.region === "header" || block.region === "footer") continue;
      if (isHeaderFooterHeading(block)) continue;

      if (block.type === "list") {
        const normalizedList = normalizeBlock(block, equationLatexById);
        const listPath = String(normalizedList.nodePath || "");

        while (i + 1 < sourceBlocks.length) {
          const next = sourceBlocks[i + 1];
          if (!next || next.type !== "display_math") break;
          const nextPath = String(next.nodePath || "");
          if (!listPath || !nextPath.startsWith(`${listPath}/`)) break;
          const listItems = Array.isArray(normalizedList.list_items) ? normalizedList.list_items : [];
          if (!listItems.length) break;

          const normalizedDisplay = normalizeBlock(next, equationLatexById);
          const lastItem = listItems[listItems.length - 1];
          const itemChildren = Array.isArray(lastItem.children) ? lastItem.children : [];
          itemChildren.push({
            type: "display_math",
            equation_id: normalizedDisplay.equation_id,
            latex: normalizedDisplay.latex,
            nodePath: normalizedDisplay.nodePath,
            source: normalizedDisplay.source,
            confidence: normalizedDisplay.confidence
          });
          lastItem.children = itemChildren;
          i += 1;
        }

        blocks.push(normalizedList);
        continue;
      }

      blocks.push(normalizeBlock(block, equationLatexById));
    }

    const deduped = [];
    for (const block of blocks) {
      const previous = deduped[deduped.length - 1];
      const isDuplicateHeading = previous
        && previous.type === "heading"
        && block.type === "heading"
        && String(previous.text || "").trim() === String(block.text || "").trim()
        && Number(previous.level || 0) === Number(block.level || 0);
      if (!isDuplicateHeading) {
        deduped.push(block);
      }
    }

    const sourceHeading = String(section?.heading || "").trim();
    const firstHeadingBlock = deduped.find((block) => block?.type === "heading");
    const firstHeadingText = String(firstHeadingBlock?.text || "").trim();
    const titleText = String(documentTitle || "").trim();
    const headingIsTitle = sourceHeading && titleText && sourceHeading === titleText;
    const headingDuplicatesBlock = sourceHeading && firstHeadingText && sourceHeading === firstHeadingText;

    const normalizedSection = {
      ...section,
      heading: headingIsTitle || headingDuplicatesBlock ? "" : sourceHeading,
      blocks: deduped
    };

    if (normalizedSection.blocks.length || !normalizedSections.length) {
      normalizedSections.push(normalizedSection);
    }
  }

  return normalizedSections;
}

export function normalizeCanonicalDocument(cdm = {}) {
  const equations = (Array.isArray(cdm?.equations) ? cdm.equations : []).map((equation) => ({
    ...equation,
    latex: normalizeLatex(equation?.latex || ""),
    diagnostics: equation?.diagnostics && typeof equation.diagnostics === "object"
      ? {
        ...equation.diagnostics,
        canonicalLatex: normalizeLatex(equation?.latex || ""),
        renderedHtml: buildMathDiagnosticHtml(normalizeLatex(equation?.latex || ""), equation?.type || "inline_equation")
      }
      : equation?.diagnostics
  }));

  const equationLatexById = {};
  for (const equation of equations) {
    const id = String(equation?.id || "").trim();
    if (id) equationLatexById[id] = String(equation?.latex || "");
  }

  const title = String(cdm?.metadata?.title || "").trim();
  const sections = normalizeSections(cdm?.sections || [], equationLatexById, title);

  return {
    ...cdm,
    equations,
    sections,
    metadata: {
      ...(cdm?.metadata || {}),
      title,
      document_title: title
    }
  };
}
