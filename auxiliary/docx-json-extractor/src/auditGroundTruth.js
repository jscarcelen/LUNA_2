import path from "node:path";
import { readFile } from "node:fs/promises";
import { elementChildren, findElements, firstElement, getAttribute, localName, makeProvenance, nodePath, parseXml, readDocxZip, readZipText, resolveProjectPath, serializeXml, writeJson } from "./utils.js";
import { parseMathNode } from "./parseMath.js";
import { splitInlineMathBoundaryText } from "./mathCanonical.js";

const repoDocxPath = resolveProjectPath("..", "..", "Statistics.docx");
const statisticsJsonPath = resolveProjectPath("output", "statistics.json");
const mathAuditPath = resolveProjectPath("output", "statistics.math-audit.json");
const fidelityReportPath = resolveProjectPath("output", "statistics.fidelity-report.json");

function extractParagraphPath(pathValue = "") {
  const match = String(pathValue || "").match(/body\/p\[\d+\]/);
  return match ? match[0] : "";
}

function sourceMathTypeCounts(documentDoc) {
  const count = (tag) => findElements(documentDoc, tag).length;
  return {
    fraction: count("f"),
    subscript: count("sSub"),
    superscript: count("sSup"),
    subsuperscript: count("sSubSup"),
    radical: count("rad"),
    nary: count("nary"),
    matrix: count("m"),
    delimiter: count("d"),
    accent: count("acc"),
    bar: count("bar"),
    degree: count("deg"),
    function: count("func"),
    limitLower: count("limLow"),
    limitUpper: count("limUpp")
  };
}

function collectMathText(node) {
  return findElements(node, "t").map((child) => String(child.textContent || "")).join(" ").replace(/\s+/g, " ").trim();
}

function sourceMathSequenceEntries(mathNode, paragraphPath, index, display = false) {
  const mathPath = `${paragraphPath}/${display ? `oMathPara[${index}]` : `oMath[${index}]`}`;
  const parsed = parseMathNode(mathNode, {
    display,
    nextEquationId: () => index,
    diagnostics: { unsupportedElements: [], warnings: [], errors: [] },
    part: "word/document.xml",
    path: mathPath,
    paragraphIndex: 0,
    runIndex: 0
  });

  if (display) {
    return [{ index: -1, xmlElement: mathNode.nodeName, nodePath: mathPath, type: "display_math", text: parsed.latex, rawXml: serializeXml(mathNode) }];
  }

  const { leadingText, trailingText, mathNode: normalizedMath } = splitInlineMathBoundaryText(parsed);
  const entries = [];
  if (leadingText) entries.push({ index: -1, xmlElement: mathNode.nodeName, nodePath: `${mathPath}/leadingBoundary`, type: "text", text: leadingText });
  if (normalizedMath) entries.push({ index: -1, xmlElement: mathNode.nodeName, nodePath: mathPath, type: "math", text: normalizedMath.latex, rawXml: serializeXml(mathNode) });
  if (trailingText) entries.push({ index: -1, xmlElement: mathNode.nodeName, nodePath: `${mathPath}/trailingBoundary`, type: "text", text: trailingText });
  return entries;
}

function sourceSequenceForParagraph(paragraphNode, paragraphPath) {
  const sequence = [];
  let runIndex = 0;
  let mathIndex = 0;
  let displayMathIndex = 0;
  for (const child of elementChildren(paragraphNode)) {
    const name = localName(child);
    if (name === "r") {
      runIndex += 1;
      const basePath = `${paragraphPath}/r[${runIndex}]`;
      let childIndex = 0;
      for (const runChild of elementChildren(child)) {
        const runName = localName(runChild);
        if (runName === "t") {
          childIndex += 1;
          sequence.push({ index: sequence.length, xmlElement: runChild.nodeName, nodePath: `${basePath}/t[${childIndex}]`, type: "text", text: String(runChild.textContent || "") });
        } else if (runName === "drawing") {
          sequence.push({ index: sequence.length, xmlElement: runChild.nodeName, nodePath: `${basePath}/drawing[1]`, type: "image", text: "" });
        } else if (runName === "br" || runName === "lastRenderedPageBreak") {
          sequence.push({ index: sequence.length, xmlElement: runChild.nodeName, nodePath: `${basePath}/${runName}[1]`, type: "page_break", text: "" });
        }
      }
      continue;
    }
    if (name === "oMath") {
      mathIndex += 1;
      for (const item of sourceMathSequenceEntries(child, paragraphPath, mathIndex, false)) {
        sequence.push({ ...item, index: sequence.length });
      }
      continue;
    }
    if (name === "oMathPara") {
      displayMathIndex += 1;
      for (const item of sourceMathSequenceEntries(child, paragraphPath, displayMathIndex, true)) {
        sequence.push({ ...item, index: sequence.length });
      }
      continue;
    }
    if (name === "hyperlink") {
      sequence.push({ index: sequence.length, xmlElement: child.nodeName, nodePath: `${paragraphPath}/hyperlink[1]`, type: "link", text: collectMathText(child) });
    }
  }
  return sequence;
}

function jsonSequenceFromNode(node) {
  const sequence = [];
  if (!node || typeof node !== "object") return sequence;

  function walkContent(contentNode) {
    if (!contentNode || typeof contentNode !== "object") return;
    if (contentNode.type === "text") {
      sequence.push({ type: "text", nodePath: contentNode.provenance?.nodePath || "", text: String(contentNode.text || "") });
      return;
    }
    if (contentNode.type === "inline_math" || contentNode.type === "display_math") {
      sequence.push({ type: contentNode.type === "inline_math" ? "math" : "display_math", nodePath: contentNode.provenance?.nodePath || "", latex: String(contentNode.latex || "") });
      return;
    }
    if (contentNode.type === "image") {
      sequence.push({ type: "image", nodePath: contentNode.provenance?.nodePath || "", source: contentNode.source?.part || "" });
      return;
    }
    if (contentNode.type === "page_break") {
      sequence.push({ type: "page_break", nodePath: contentNode.provenance?.nodePath || "" });
      return;
    }
    if (contentNode.type === "link") {
      sequence.push({ type: "link", nodePath: contentNode.provenance?.nodePath || "", url: contentNode.url || "" });
      return;
    }
    if (contentNode.type === "paragraph" || contentNode.type === "heading") {
      (contentNode.children || []).forEach(walkContent);
      return;
    }
    if (contentNode.type === "list") {
      (contentNode.items || []).forEach(walkContent);
      return;
    }
    if (contentNode.type === "list_item") {
      (contentNode.children || []).forEach(walkContent);
      return;
    }
  }

  walkContent(node);
  return sequence;
}

function collectJsonParagraphNodes(documentTree) {
  const map = new Map();
  function visit(node) {
    if (!node || typeof node !== "object") return;
    const paragraphPath = extractParagraphPath(node?.provenance?.nodePath || "");
    if ((node.type === "paragraph" || node.type === "heading" || node.type === "display_math") && paragraphPath) {
      const list = map.get(paragraphPath) || [];
      list.push(node);
      map.set(paragraphPath, list);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  }
  visit(documentTree.body);
  visit({ headers: documentTree.headers, footers: documentTree.footers });
  return map;
}

function sourceRenderedMathCount(paragraphAudit = []) {
  return paragraphAudit.reduce((sum, paragraph) => sum + paragraph.sourceSequence.filter((item) => item.type === "math" || item.type === "display_math").length, 0);
}

function isLeakCandidate(text = "") {
  const value = String(text || "").trim();
  if (!value) return false;
  if (/^[A-Za-z0-9]$/.test(value)) return false;
  return /[=+\-*/^_(){}≤≥<>±∑√]/.test(value) || value.length > 3;
}

function flattenJsonMath(documentTree) {
  const equations = [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "inline_math" || node.type === "display_math") {
      equations.push(node);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  }
  visit(documentTree.body);
  visit({ headers: documentTree.headers, footers: documentTree.footers });
  return equations;
}

function gatherUnsupportedMathNodes(mathNode) {
  const unsupported = [];
  function walk(node, parentName = "") {
    if (!node || typeof node !== "object") return;
    if (node.type === "unsupported") {
      unsupported.push({
        xmlElement: node.originalElement,
        nodePath: node.provenance?.nodePath || "",
        rawXml: node.source?.xml || "",
        parent: parentName
      });
    }
    for (const [key, value] of Object.entries(node)) {
      if (Array.isArray(value)) value.forEach((item) => walk(item, node.type || key));
      else if (value && typeof value === "object") walk(value, node.type || key);
    }
  }
  walk(mathNode.mathTree, mathNode.type);
  return unsupported;
}

function collectHeadingAudit(documentDoc, documentTree) {
  const sourceHeadings = [];
  const body = findElements(documentDoc, "body")[0];
  let paragraphIndex = 0;
  for (const child of elementChildren(body)) {
    if (localName(child) !== "p") continue;
    paragraphIndex += 1;
    const pPr = firstElement(child, "pPr");
    const pStyle = getAttribute(firstElement(pPr, "pStyle"), "val");
    if (!/^Heading/i.test(pStyle)) continue;
    sourceHeadings.push({
      nodePath: `body/p[${paragraphIndex}]`,
      styleId: pStyle,
      text: collectMathText(child)
    });
  }

  const jsonHeadings = [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "heading") {
      jsonHeadings.push(node);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  }
  visit(documentTree.body);

  const duplicates = [];
  for (const sourceHeading of sourceHeadings) {
    const matches = jsonHeadings.filter((node) => node.provenance?.nodePath === sourceHeading.nodePath);
    if (matches.length !== 1) {
      duplicates.push({ sourceHeading, jsonCount: matches.length });
    }
  }

  return { sourceHeadings, jsonHeadings, duplicates };
}

export async function auditGroundTruth() {
  const zip = await readDocxZip(repoDocxPath);
  const documentXml = await readZipText(zip, "word/document.xml");
  const documentDoc = parseXml(documentXml);
  const documentTree = JSON.parse(await readFile(statisticsJsonPath, "utf8"));

  const body = findElements(documentDoc, "body")[0];
  const paragraphAudit = [];
  const orderingFailures = [];
  const missingParagraphs = [];
  const leakedIntoText = [];
  const jsonParagraphNodes = collectJsonParagraphNodes(documentTree);

  let paragraphIndex = 0;
  for (const child of elementChildren(body)) {
    if (localName(child) !== "p") continue;
    paragraphIndex += 1;
    const paragraphPath = `body/p[${paragraphIndex}]`;
    const sourceSequence = sourceSequenceForParagraph(child, paragraphPath);
    const jsonNodes = jsonParagraphNodes.get(paragraphPath) || [];
    const jsonSequence = jsonNodes.flatMap((node) => jsonSequenceFromNode(node));

    const sourceTypes = sourceSequence.map((item) => item.type);
    const jsonTypes = jsonSequence.map((item) => item.type);
    if (!jsonNodes.length) {
      missingParagraphs.push(paragraphPath);
    }
    if (sourceTypes.join("|") !== jsonTypes.join("|")) {
      orderingFailures.push({ paragraphPath, sourceTypes, jsonTypes });
    }

    const sourceMathTexts = sourceSequence.filter((item) => item.type === "math" || item.type === "display_math").map((item) => item.text).filter(Boolean).filter(isLeakCandidate);
    const textPayload = jsonSequence.filter((item) => item.type === "text").map((item) => item.text).join(" ");
    for (const mathText of sourceMathTexts) {
      if (mathText && textPayload.includes(mathText)) {
        leakedIntoText.push({ paragraphPath, mathText });
      }
    }

    paragraphAudit.push({ paragraphPath, sourceSequence, jsonSequence });
  }

  const sourceInlineMathNodes = findElements(documentDoc, "oMath");
  const sourceDisplayMathNodes = findElements(documentDoc, "oMathPara");
  const jsonMathNodes = flattenJsonMath(documentTree);
  const sourceMathCount = sourceRenderedMathCount(paragraphAudit);
  const jsonMathCount = jsonMathNodes.length;

  const mathAudit = jsonMathNodes.map((node, index) => ({
    id: node.id,
    nodePath: node.provenance?.nodePath || "",
    type: node.type,
    rawOmml: node.source?.xml || "",
    ommlStructure: {
      root: node.type === "display_math" ? "oMathPara" : "oMath",
      children: node.mathTree?.children || []
    },
    latex: node.latex,
    mathml: null,
    unsupportedElements: gatherUnsupportedMathNodes(node)
  }));

  const missingEquations = sourceMathCount > jsonMathCount
    ? [{ sourceCount: sourceMathCount, jsonCount: jsonMathCount }]
    : [];
  const duplicateEquations = jsonMathCount > sourceMathCount
    ? [{ sourceCount: sourceMathCount, jsonCount: jsonMathCount }]
    : [];

  const headingAudit = collectHeadingAudit(documentDoc, documentTree);

  const provenanceMissing = [];
  function checkProvenance(node) {
    if (!node || typeof node !== "object") return;
    if (["heading", "paragraph", "text", "inline_math", "display_math", "table", "table_row", "table_cell", "image", "list", "list_item", "link"].includes(node.type) && !node.provenance) {
      provenanceMissing.push(node.type);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(checkProvenance);
      else if (value && typeof value === "object") checkProvenance(value);
    }
  }
  checkProvenance(documentTree.body);

  const fidelityReport = {
    document: {
      paragraphs: {
        sourceCount: paragraphAudit.length,
        jsonCount: documentTree.statistics?.paragraphs || 0,
        missingParagraphs
      },
      headings: {
        sourceCount: headingAudit.sourceHeadings.length,
        jsonCount: headingAudit.jsonHeadings.length,
        duplicates: headingAudit.duplicates
      },
      runs: {
        textRuns: documentTree.statistics?.textRuns || 0
      },
      tables: {
        jsonCount: documentTree.statistics?.tables || 0
      },
      images: {
        jsonCount: documentTree.statistics?.images || 0
      },
      lists: {
        jsonCount: documentTree.statistics?.lists || 0
      }
    },
    math: {
      sourceCount: sourceMathCount,
      jsonCount: jsonMathCount,
      sourceBreakdown: {
        oMathCount: sourceInlineMathNodes.length,
        oMathParaCount: sourceDisplayMathNodes.length,
        mathRunCount: sourceInlineMathNodes.length,
        mathElementsByType: sourceMathTypeCounts(documentDoc)
      },
      missing: missingEquations,
      duplicates: duplicateEquations,
      leakedIntoText,
      unsupported: documentTree.diagnostics?.unsupportedElements || []
    },
    ordering: {
      paragraphsChecked: paragraphAudit.length,
      orderingFailures
    },
    provenance: {
      missing: provenanceMissing
    },
    overall: {
      passed: missingEquations.length === 0
        && duplicateEquations.length === 0
        && leakedIntoText.length === 0
        && orderingFailures.length === 0
        && headingAudit.duplicates.length === 0
        && provenanceMissing.length === 0
        && (documentTree.diagnostics?.unsupportedElements || []).length === 0,
      criticalFailures: [
        ...missingEquations.map(() => "MISSING_EQUATIONS"),
        ...duplicateEquations.map(() => "DUPLICATE_EQUATIONS"),
        ...leakedIntoText.map(() => "MATH_LEAKED_INTO_TEXT"),
        ...orderingFailures.map(() => "ORDERING_FAILURE"),
        ...headingAudit.duplicates.map(() => "HEADING_DUPLICATION"),
        ...provenanceMissing.map(() => "MISSING_PROVENANCE"),
        ...((documentTree.diagnostics?.unsupportedElements || []).length ? ["UNSUPPORTED_OMML"] : [])
      ]
    }
  };

  await writeJson(mathAuditPath, mathAudit);
  await writeJson(fidelityReportPath, fidelityReport);

  return {
    mathAudit,
    fidelityReport,
    paragraphAudit,
    headingAudit
  };
}

if (process.argv[1] && process.argv[1].endsWith("auditGroundTruth.js")) {
  auditGroundTruth()
    .then(({ fidelityReport, mathAudit }) => {
      console.log(JSON.stringify({
        mathAuditPath,
        fidelityReportPath,
        sourceMathCount: fidelityReport.math.sourceCount,
        jsonMathCount: fidelityReport.math.jsonCount,
        overallPassed: fidelityReport.overall.passed,
        criticalFailures: fidelityReport.overall.criticalFailures,
        equationsAudited: mathAudit.length
      }, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}