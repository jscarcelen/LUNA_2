import path from "node:path";
import { writeFile } from "node:fs/promises";
import { elementChildren, findElements, firstElement, getAttribute, localName, makeProvenance, nodePath, normalizeText, parseXml, readZipBuffer, readZipText, serializeXml } from "./utils.js";
import { parseParagraphNode } from "./parseParagraph.js";
import { parseSectionProperties } from "./parseSection.js";
import { parseTableNode } from "./parseTable.js";

function parseRelationships(xml = "") {
  const doc = parseXml(xml);
  const map = {};
  for (const relationship of findElements(doc, "Relationship")) {
    const id = getAttribute(relationship, "Id") || getAttribute(relationship, "id");
    if (!id) continue;
    map[id] = {
      target: getAttribute(relationship, "Target") || "",
      type: getAttribute(relationship, "Type") || "",
      mode: getAttribute(relationship, "TargetMode") || ""
    };
  }
  return map;
}

function parseStyles(xml = "") {
  const doc = parseXml(xml);
  const styles = {};
  for (const style of findElements(doc, "style")) {
    const styleId = getAttribute(style, "styleId");
    if (!styleId) continue;
    styles[styleId] = {
      id: styleId,
      type: getAttribute(style, "type") || "",
      name: getAttribute(firstElement(style, "name"), "val") || styleId,
      basedOn: getAttribute(firstElement(style, "basedOn"), "val") || null
    };
  }
  return styles;
}

function parseNumbering(xml = "") {
  const doc = parseXml(xml);
  const abstractNums = {};
  const numbering = {};
  for (const abstractNum of findElements(doc, "abstractNum")) {
    const id = getAttribute(abstractNum, "abstractNumId");
    const levels = {};
    for (const level of elementChildren(abstractNum).filter((child) => localName(child) === "lvl")) {
      const ilvl = Number(getAttribute(level, "ilvl") || 0);
      levels[ilvl] = {
        format: getAttribute(firstElement(level, "numFmt"), "val") || null,
        text: getAttribute(firstElement(level, "lvlText"), "val") || null
      };
    }
    abstractNums[id] = { levels };
  }
  for (const num of findElements(doc, "num")) {
    const numId = getAttribute(num, "numId");
    const abstractNumId = getAttribute(firstElement(num, "abstractNumId"), "val");
    numbering[numId] = abstractNums[abstractNumId] || { levels: {} };
  }
  return numbering;
}

function buildSummary(documentTree) {
  const contentRoots = [
    ...(Array.isArray(documentTree.body?.children) ? documentTree.body.children : []),
    ...(Array.isArray(documentTree.headers) ? documentTree.headers : []),
    ...(Array.isArray(documentTree.footers) ? documentTree.footers : [])
  ];
  const summary = {
    headings: [],
    paragraphs: [],
    equations: [],
    tables: [],
    images: [],
    lists: [],
    links: [],
    pageBreaks: [],
    textRuns: [],
    warnings: documentTree.diagnostics.warnings,
    unsupportedElements: documentTree.diagnostics.unsupportedElements
  };

  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "heading") summary.headings.push({ level: node.level, text: node.children?.map((child) => child.text || child.latex || child.value || "").join("") || "", provenance: node.provenance });
    if (node.type === "paragraph") summary.paragraphs.push({ text: node.children?.map((child) => child.text || child.latex || "").join("") || "", provenance: node.provenance });
    if (node.type === "inline_math" || node.type === "display_math") summary.equations.push({ id: node.id, type: node.type, latex: node.latex, provenance: node.provenance });
    if (node.type === "table") summary.tables.push({ rows: node.rows?.length || 0, provenance: node.provenance });
    if (node.type === "image") summary.images.push({ id: node.id, source: node.source?.part || "", provenance: node.provenance });
    if (node.type === "list") summary.lists.push({ ordered: Boolean(node.ordered), items: node.items?.length || 0, provenance: node.provenance });
    if (node.type === "link") summary.links.push({ url: node.url || "", provenance: node.provenance });
    if (node.type === "page_break") summary.pageBreaks.push({ provenance: node.provenance });
    if (node.type === "text") summary.textRuns.push({ text: node.text || "", provenance: node.provenance, format: node.format || {} });
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") walk(value);
    }
  }

  contentRoots.forEach(walk);
  return summary;
}

function buildStatistics(summary) {
  return {
    paragraphs: summary.paragraphs.length,
    headings: summary.headings.length,
    inlineMath: summary.equations.filter((item) => item.type === "inline_math").length,
    displayMath: summary.equations.filter((item) => item.type === "display_math").length,
    tables: summary.tables.length,
    images: summary.images.length,
    links: summary.links.length,
    lists: summary.lists.length,
    pageBreaks: summary.pageBreaks.length,
    textRuns: summary.textRuns.length
  };
}

function aggregateListItems(nodes = []) {
  const aggregated = [];
  let activeList = null;

  for (const entry of nodes) {
    if (entry?.type === "list_item") {
      const ordered = Boolean(entry.ordered);
      if (!activeList || activeList.ordered !== ordered || activeList.level !== entry.level) {
        activeList = {
          type: "list",
          ordered,
          level: entry.level,
          items: [],
          provenance: entry.provenance,
          source: entry.source || null
        };
        aggregated.push(activeList);
      }
      activeList.items.push(entry);
      continue;
    }
    activeList = null;
    aggregated.push(entry);
  }

  return aggregated;
}

export async function parseDocument(zip, options = {}) {
  const documentXml = await readZipText(zip, "word/document.xml");
  const relationshipsXml = await readZipText(zip, "word/_rels/document.xml.rels");
  const stylesXml = await readZipText(zip, "word/styles.xml");
  const numberingXml = await readZipText(zip, "word/numbering.xml");
  const footnotesXml = await readZipText(zip, "word/footnotes.xml");
  const endnotesXml = await readZipText(zip, "word/endnotes.xml");

  const documentDoc = parseXml(documentXml);
  const relationships = parseRelationships(relationshipsXml);
  const styles = parseStyles(stylesXml);
  const numbering = parseNumbering(numberingXml);
  const diagnostics = {
    unsupportedElements: [],
    warnings: [],
    errors: []
  };

  let equationCounter = 0;
  let imageCounter = 0;
  let paragraphCounter = 0;

  const nextEquationId = () => {
    equationCounter += 1;
    return equationCounter;
  };
  const nextImageId = () => {
    imageCounter += 1;
    return imageCounter;
  };
  const nextParagraphIndex = () => {
    paragraphCounter += 1;
    return paragraphCounter;
  };

  const bodyNode = findElements(documentDoc, "body")[0] || null;
  const bodyChildren = [];
  let currentSection = {
    type: "section",
    id: "section-1",
    properties: null,
    children: []
  };
  let sectionCounter = 1;
  let paragraphIndex = 0;
  let tableIndex = 0;

  for (const child of elementChildren(bodyNode)) {
    const name = localName(child);
    if (name === "p") {
      paragraphIndex += 1;
      const parsed = parseParagraphNode(child, {
        part: "word/document.xml",
        path: nodePath("body", `p[${paragraphIndex}]`),
        paragraphIndex: nextParagraphIndex(),
        styles,
        numbering,
        relationships,
        diagnostics,
        nextEquationId,
        nextImageId
      });
      if (parsed.node) currentSection.children.push(parsed.node);
      if (Array.isArray(parsed.siblings)) currentSection.children.push(...parsed.siblings);
      continue;
    }
    if (name === "tbl") {
      tableIndex += 1;
      currentSection.children.push(parseTableNode(child, {
        part: "word/document.xml",
        path: nodePath("body", `tbl[${tableIndex}]`),
        paragraphIndex: nextParagraphIndex(),
        styles,
        numbering,
        relationships,
        diagnostics,
        nextEquationId,
        nextImageId,
        nextParagraphIndex
      }));
      continue;
    }
    if (name === "sectPr") {
      currentSection.properties = parseSectionProperties(child, {
        part: "word/document.xml",
        path: nodePath("body", `sectPr[${sectionCounter}]`)
      });
      bodyChildren.push({ ...currentSection, children: aggregateListItems(currentSection.children) });
      sectionCounter += 1;
      currentSection = {
        type: "section",
        id: `section-${sectionCounter}`,
        properties: null,
        children: []
      };
      continue;
    }
    diagnostics.unsupportedElements.push({
      type: "unsupported",
      originalElement: child.nodeName,
      provenance: makeProvenance("word/document.xml", nodePath("body", child.nodeName), child.nodeName),
      source: {
        xml: serializeXml(child)
      }
    });
    currentSection.children.push({
      type: "unsupported",
      originalElement: child.nodeName,
      provenance: makeProvenance("word/document.xml", nodePath("body", child.nodeName), child.nodeName),
      source: {
        xml: serializeXml(child)
      }
    });
  }

  if (currentSection.children.length || currentSection.properties) {
    bodyChildren.push({ ...currentSection, children: aggregateListItems(currentSection.children) });
  }

  const headerParts = Object.keys(zip.files).filter((part) => /^word\/header\d+\.xml$/i.test(part)).sort();
  const footerParts = Object.keys(zip.files).filter((part) => /^word\/footer\d+\.xml$/i.test(part)).sort();

  const headers = [];
  for (const part of headerParts) {
    const xml = await readZipText(zip, part);
    const doc = parseXml(xml);
    const root = findElements(doc, "hdr")[0];
    const children = [];
    let pIndex = 0;
    for (const child of elementChildren(root)) {
      if (localName(child) === "p") {
        pIndex += 1;
        const parsed = parseParagraphNode(child, {
          part,
          path: nodePath(path.basename(part, ".xml"), `p[${pIndex}]`),
          paragraphIndex: nextParagraphIndex(),
          styles,
          numbering,
          relationships,
          diagnostics,
          nextEquationId,
          nextImageId
        });
        if (parsed.node) children.push(parsed.node);
        if (Array.isArray(parsed.siblings)) children.push(...parsed.siblings);
      }
    }
    headers.push({ type: "header", part, children: aggregateListItems(children) });
  }

  const footers = [];
  for (const part of footerParts) {
    const xml = await readZipText(zip, part);
    const doc = parseXml(xml);
    const root = findElements(doc, "ftr")[0];
    const children = [];
    let pIndex = 0;
    for (const child of elementChildren(root)) {
      if (localName(child) === "p") {
        pIndex += 1;
        const parsed = parseParagraphNode(child, {
          part,
          path: nodePath(path.basename(part, ".xml"), `p[${pIndex}]`),
          paragraphIndex: nextParagraphIndex(),
          styles,
          numbering,
          relationships,
          diagnostics,
          nextEquationId,
          nextImageId
        });
        if (parsed.node) children.push(parsed.node);
        if (Array.isArray(parsed.siblings)) children.push(...parsed.siblings);
      }
    }
    footers.push({ type: "footer", part, children: aggregateListItems(children) });
  }

  const assetsDir = options.assetsDir;
  const images = Object.entries(relationships)
    .filter(([, rel]) => rel.target.startsWith("media/"))
    .map(([id, rel]) => ({ id, rel }));
  for (const image of images) {
    const buffer = await readZipBuffer(zip, `word/${image.rel.target}`);
    if (!buffer || !assetsDir) continue;
    await writeFile(path.join(assetsDir, path.basename(image.rel.target)), buffer);
  }

  const documentTree = {
    type: "document",
    schemaVersion: "1.0",
    source: {
      filename: "Statistics.docx",
      format: "docx"
    },
    metadata: {
      styles,
      numbering,
      footnotesPartPresent: Boolean(footnotesXml),
      endnotesPartPresent: Boolean(endnotesXml)
    },
    relationships,
    headers,
    footers,
    body: {
      type: "body",
      children: bodyChildren
    },
    diagnostics
  };

  const summary = buildSummary(documentTree);
  documentTree.statistics = buildStatistics(summary);

  return {
    documentTree,
    summary: {
      ...summary,
      statistics: documentTree.statistics
    }
  };
}