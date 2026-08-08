import JSZip from "jszip";
import { MathService } from "../math/mathService.js";

function decodeXmlEntities(text = "") {
  return String(text || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function stripTags(value = "") {
  return decodeXmlEntities(String(value || "")
    .replace(/<w:tab\s*\/?\s*>/g, " ")
    .replace(/<w:br\s*\/?\s*>/g, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function extractBodyXml(docXml = "") {
  const match = String(docXml || "").match(/<w:body\b[^>]*>([\s\S]*?)<\/w:body>/i);
  return String(match?.[1] || "");
}

function extractTopLevelBodyNodes(bodyXml = "") {
  const nodes = [];
  const pattern = /<w:p\b[\s\S]*?<\/w:p>|<w:tbl\b[\s\S]*?<\/w:tbl>|<w:sectPr\b[\s\S]*?<\/w:sectPr>/g;
  for (const match of String(bodyXml || "").matchAll(pattern)) {
    nodes.push({ xml: String(match[0] || ""), index: Number(match.index || 0) });
  }
  return nodes;
}

function extractParagraphStyle(paragraphXml = "") {
  return String(paragraphXml.match(/<w:pStyle\b[^>]*w:val="([^"]+)"/i)?.[1] || "").trim();
}

function getHeadingLevelFromStyle(style = "") {
  const normalized = String(style || "").toLowerCase();
  const match = normalized.match(/heading\s*([1-6])/i) || normalized.match(/heading([1-6])/i);
  return Number(match?.[1] || 0);
}

function parseRunFormatting(runXml = "") {
  const xml = String(runXml || "");
  const font = String(xml.match(/<w:rFonts\b[^>]*w:ascii="([^"]+)"/i)?.[1] || "").trim();
  const color = String(xml.match(/<w:color\b[^>]*w:val="([^"]+)"/i)?.[1] || "").trim();
  const highlight = String(xml.match(/<w:highlight\b[^>]*w:val="([^"]+)"/i)?.[1] || "").trim();
  return {
    bold: /<w:b\b[^>]*\/?\s*>/i.test(xml),
    italic: /<w:i\b[^>]*\/?\s*>/i.test(xml),
    underline: /<w:u\b[^>]*\/?\s*>/i.test(xml),
    font: font || null,
    color: color || null,
    highlight: highlight || null
  };
}

function extractTopLevelCellNodes(cellXml = "") {
  const nodes = [];
  const pattern = /<w:p\b[\s\S]*?<\/w:p>|<w:tbl\b[\s\S]*?<\/w:tbl>/g;
  for (const match of String(cellXml || "").matchAll(pattern)) {
    nodes.push({ xml: String(match[0] || "") });
  }
  return nodes;
}

function extractListMetadata(paragraphXml = "") {
  const ilvl = String(paragraphXml.match(/<w:ilvl\b[^>]*w:val="([^"]+)"/i)?.[1] || "0").trim();
  const numId = String(paragraphXml.match(/<w:numId\b[^>]*w:val="([^"]+)"/i)?.[1] || "").trim();
  const listType = numId === "2" ? "bullet" : "numbered";
  return {
    level: Number.isFinite(Number(ilvl)) ? Number(ilvl) : 0,
    listType,
    numberId: numId || null
  };
}

function extractTextFromRunXml(runXml = "") {
  const texts = [];
  for (const t of String(runXml || "").matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)) {
    const value = decodeXmlEntities(String(t[1] || ""));
    if (value) texts.push(value);
  }
  if (/<w:tab\b[^>]*\/?\s*>/i.test(runXml)) texts.push(" ");
  if (/<w:br\b[^>]*\/?\s*>/i.test(runXml)) texts.push("\n");
  return texts.join("");
}

function normalizeChildren(children = []) {
  const compact = [];
  for (const child of children) {
    if (!child) continue;
    if (child.type === "text") {
      const text = String(child.text || "");
      if (!text) continue;
      const previous = compact[compact.length - 1];
      const sameFormatting = Boolean(previous)
        && previous.type === "text"
        && JSON.stringify(previous.formatting || {}) === JSON.stringify(child.formatting || {});
      if (sameFormatting) {
        previous.text += text;
      } else {
        compact.push(child);
      }
      continue;
    }
    compact.push(child);
  }
  return compact;
}

function paragraphTextFromChildren(children = []) {
  return (Array.isArray(children) ? children : []).map((child) => {
    if (child?.type === "text") return String(child.text || "");
    if (child?.type === "inline_math") return String(child.latex || "");
    if (child?.type === "hyperlink") return String(child.text || "");
    return "";
  }).join("").replace(/\s+/g, " ").trim();
}

function parseRunContent(runXml = "", state, paragraphPath = "", runIndex = 0) {
  const children = [];
  const blocks = [];
  const runSource = String(runXml || "");
  const formatting = parseRunFormatting(runSource);

  for (const bookmark of runSource.matchAll(/<w:bookmarkStart\b[^>]*w:id="([^"]+)"[^>]*w:name="([^"]+)"[^>]*\/?\s*>/gi)) {
    children.push({
      type: "bookmark",
      bookmarkId: String(bookmark[1] || "").trim(),
      name: String(bookmark[2] || "").trim()
    });
  }

  for (const fieldCode of runSource.matchAll(/<w:instrText[^>]*>([\s\S]*?)<\/w:instrText>/gi)) {
    const value = decodeXmlEntities(String(fieldCode[1] || "")).trim();
    if (value) {
      children.push({ type: "field_code", value });
    }
  }

  let cursor = 0;
  for (const mathMatch of runSource.matchAll(/<m:oMathPara\b[\s\S]*?<\/m:oMathPara>|<m:oMath\b[\s\S]*?<\/m:oMath>/g)) {
    const at = Number(mathMatch.index || 0);
    const before = runSource.slice(cursor, at);
    const beforeText = extractTextFromRunXml(before);
    if (beforeText) {
      children.push({ type: "text", text: beforeText, formatting, confidence: 1, source: "OOXML" });
    }

    const mathXml = String(mathMatch[0] || "");
    const isDisplay = /^<m:oMathPara\b/i.test(mathXml);
    const equation = state.mathService.createEquation({
      omml: mathXml,
      type: isDisplay ? "display_equation" : "inline_equation",
      nodePath: `${paragraphPath}/r[${runIndex + 1}]/${isDisplay ? "oMathPara" : "oMath"}`,
      section: state.sectionHeading || null,
      source: "OOXML"
    });
    state.equations.push(equation);

    if (isDisplay) {
      blocks.push({
        type: "display_math",
        equation_id: equation.id,
        equation_ids: [equation.id],
        latex: equation.latex,
        nodePath: equation.nodePath,
        source: "OOXML",
        confidence: equation.confidence
      });
    } else {
      children.push({
        type: "inline_math",
        equation_id: equation.id,
        latex: equation.latex,
        nodePath: equation.nodePath,
        source: "OOXML",
        confidence: equation.confidence
      });
    }

    cursor = at + mathXml.length;
  }

  const tail = runSource.slice(cursor);
  const tailText = extractTextFromRunXml(tail);
  if (tailText) {
    children.push({ type: "text", text: tailText, formatting, confidence: 1, source: "OOXML" });
  }

  for (const commentRef of runSource.matchAll(/<w:commentReference\b[^>]*w:id="([^"]+)"[^>]*\/?\s*>/gi)) {
    children.push({ type: "comment_reference", commentId: String(commentRef[1] || "").trim() });
  }

  const figures = [];
  if (/<w:drawing\b/i.test(runSource)) {
    const name = String(runSource.match(/<wp:docPr\b[^>]*name="([^"]+)"/i)?.[1] || "Figure");
    const descr = String(runSource.match(/<wp:docPr\b[^>]*descr="([^"]+)"/i)?.[1] || "");
    figures.push({
      type: "figure",
      caption: name,
      alt_text: descr,
      relationship_id: String(runSource.match(/<a:blip\b[^>]*r:embed="([^"]+)"/i)?.[1] || ""),
      source: "OOXML",
      confidence: 1
    });
  }

  const pageBreaks = (runSource.match(/<w:br\b[^>]*w:type="page"[^>]*\/?\s*>/gi) || []).length;
  return { children, blocks, figures, pageBreaks };
}

function parseParagraphXml(paragraphXml = "", state, paragraphPath = "") {
  const style = extractParagraphStyle(paragraphXml);
  const styleLower = style.toLowerCase();
  const isList = /<w:numPr\b/i.test(paragraphXml);
  const headingLevel = getHeadingLevelFromStyle(style);

  const children = [];
  const blocks = [];
  const tokenPattern = /<w:hyperlink\b[\s\S]*?<\/w:hyperlink>|<w:r\b[\s\S]*?<\/w:r>|<m:oMathPara\b[\s\S]*?<\/m:oMathPara>|<m:oMath\b[\s\S]*?<\/m:oMath>/g;

  let runIndex = 0;
  for (const token of String(paragraphXml || "").matchAll(tokenPattern)) {
    const xml = String(token[0] || "");

    if (/^<w:hyperlink\b/i.test(xml)) {
      const text = stripTags(xml);
      const relationshipId = String(xml.match(/\br:id="([^"]+)"/i)?.[1] || "");
      if (text) {
        children.push({
          type: "hyperlink",
          text,
          relationship_id: relationshipId,
          source: "OOXML",
          confidence: 1
        });
      }
      continue;
    }

    if (/^<w:r\b/i.test(xml)) {
      const parsedRun = parseRunContent(xml, state, paragraphPath, runIndex);
      runIndex += 1;
      children.push(...parsedRun.children);
      blocks.push(...parsedRun.blocks);
      for (let i = 0; i < parsedRun.pageBreaks; i += 1) {
        blocks.push({ type: "page_break", source: "OOXML", confidence: 1 });
      }
      blocks.push(...parsedRun.figures);
      continue;
    }

    if (/^<m:oMathPara\b/i.test(xml) || /^<m:oMath\b/i.test(xml)) {
      const isDisplay = /^<m:oMathPara\b/i.test(xml);
      const equation = state.mathService.createEquation({
        omml: xml,
        type: isDisplay ? "display_equation" : "inline_equation",
        nodePath: `${paragraphPath}/${isDisplay ? "oMathPara" : "oMath"}`,
        section: state.sectionHeading || null,
        source: "OOXML"
      });
      state.equations.push(equation);
      if (isDisplay) {
        blocks.push({
          type: "display_math",
          equation_id: equation.id,
          equation_ids: [equation.id],
          latex: equation.latex,
          nodePath: equation.nodePath,
          source: "OOXML",
          confidence: equation.confidence
        });
      } else {
        children.push({
          type: "inline_math",
          equation_id: equation.id,
          latex: equation.latex,
          nodePath: equation.nodePath,
          source: "OOXML",
          confidence: equation.confidence
        });
      }
    }
  }

  const normalizedChildren = normalizeChildren(children);
  const paragraphText = paragraphTextFromChildren(normalizedChildren);

  const isCaption = styleLower.includes("caption") || /^\s*(figure|table)\s+\d+/i.test(paragraphText);
  const isQuote = styleLower.includes("quote") || styleLower.includes("blockquote");
  const isCode = styleLower.includes("code") || styleLower.includes("source");
  const isCallout = styleLower.includes("callout") || styleLower.includes("note");

  const equationIds = normalizedChildren
    .filter((child) => child.type === "inline_math" && child.equation_id)
    .map((child) => child.equation_id);

  if (headingLevel > 0 && paragraphText) {
    state.sectionHeading = paragraphText;
    blocks.unshift({
      type: "heading",
      level: headingLevel,
      text: paragraphText,
      source: "OOXML",
      confidence: 1,
      nodePath: paragraphPath
    });
  } else if (isCaption && normalizedChildren.length) {
    blocks.unshift({ type: "caption", children: normalizedChildren, equation_ids: equationIds, source: "OOXML", confidence: 1, nodePath: paragraphPath });
  } else if (isList && paragraphText) {
    const listMeta = extractListMetadata(paragraphXml);
    blocks.unshift({
      type: "list",
      items: [paragraphText],
      children: normalizedChildren,
      equation_ids: equationIds,
      source: "OOXML",
      confidence: 1,
      nodePath: paragraphPath,
      list_type: listMeta.listType,
      level: listMeta.level,
      number_id: listMeta.numberId
    });
  } else if (isCode && paragraphText) {
    blocks.unshift({ type: "code", text: paragraphText, children: normalizedChildren, equation_ids: equationIds, source: "OOXML", confidence: 1, nodePath: paragraphPath });
  } else if (isQuote && normalizedChildren.length) {
    blocks.unshift({ type: "quote", children: normalizedChildren, equation_ids: equationIds, source: "OOXML", confidence: 1, nodePath: paragraphPath });
  } else if (isCallout && normalizedChildren.length) {
    blocks.unshift({ type: "callout", children: normalizedChildren, equation_ids: equationIds, source: "OOXML", confidence: 1, nodePath: paragraphPath });
  } else if (normalizedChildren.length) {
    blocks.unshift({ type: "paragraph", children: normalizedChildren, equation_ids: equationIds, source: "OOXML", confidence: 1, nodePath: paragraphPath });
  }

  if (/<w:sectPr\b/i.test(paragraphXml)) {
    blocks.push({ type: "section_break", source: "OOXML", confidence: 1 });
  }

  return blocks;
}

function parseTableCellBlocks(cellXml = "", state, tablePath = "", rowIndex = 0, colIndex = 0) {
  const blocks = [];
  const nodes = extractTopLevelCellNodes(cellXml);
  let paragraphIndex = 0;
  let nestedTableIndex = 0;
  for (const node of nodes) {
    const xml = String(node.xml || "");
    if (/^<w:p\b/i.test(xml)) {
      const path = `${tablePath}/tr[${rowIndex + 1}]/tc[${colIndex + 1}]/p[${paragraphIndex + 1}]`;
      blocks.push(...parseParagraphXml(xml, state, path));
      paragraphIndex += 1;
      continue;
    }

    if (/^<w:tbl\b/i.test(xml)) {
      const nestedPath = `${tablePath}/tr[${rowIndex + 1}]/tc[${colIndex + 1}]/tbl[${nestedTableIndex + 1}]`;
      blocks.push({
        type: "table",
        rows: parseTableXml(xml, state, nestedPath),
        source: "OOXML",
        confidence: 1,
        nodePath: nestedPath,
        nested: true
      });
      nestedTableIndex += 1;
    }
  }
  return blocks;
}

function parseTableXml(tableXml = "", state, tablePath = "") {
  const rows = [];
  let rowIndex = 0;
  for (const rowMatch of String(tableXml || "").matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)) {
    const cells = [];
    let colIndex = 0;
    for (const cellMatch of String(rowMatch[0] || "").matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)) {
      const cellXml = String(cellMatch[0] || "");
      const colSpan = Number(cellXml.match(/<w:gridSpan\b[^>]*w:val="([^"]+)"/i)?.[1] || 1);
      const vMerge = String(cellXml.match(/<w:vMerge\b[^>]*w:val="([^"]+)"/i)?.[1] || (/<w:vMerge\b/i.test(cellXml) ? "continue" : "")).trim();
      cells.push({
        type: "table_cell",
        blocks: parseTableCellBlocks(cellXml, state, tablePath, rowIndex, colIndex),
        source: "OOXML",
        confidence: 1,
        nodePath: `${tablePath}/tr[${rowIndex + 1}]/tc[${colIndex + 1}]`,
        col_span: Number.isFinite(colSpan) && colSpan > 1 ? colSpan : 1,
        row_merge: vMerge || null
      });
      colIndex += 1;
    }
    if (cells.length) rows.push(cells);
    rowIndex += 1;
  }
  return rows;
}

function parseDocxNotes(xml = "", type = "footnote") {
  const blocks = [];
  for (const note of String(xml || "").matchAll(/<w:(?:footnote|endnote)\b[\s\S]*?<\/w:(?:footnote|endnote)>/g)) {
    const noteXml = String(note[0] || "");
    const noteId = String(noteXml.match(/\bw:id="([^"]+)"/i)?.[1] || "");
    if (noteId === "-1" || noteId === "0") continue;

    const paragraphTexts = [];
    for (const paragraph of noteXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)) {
      const text = stripTags(String(paragraph[0] || ""));
      if (text) paragraphTexts.push(text);
    }

    const noteText = paragraphTexts.join("\n").trim();
    if (!noteText) continue;
    blocks.push({
      type,
      note_id: noteId,
      text: noteText,
      source: "OOXML",
      confidence: 1
    });
  }
  return blocks;
}

function splitInlineMathFromText(text = "") {
  const source = String(text || "");
  if (!source.trim()) return [];

  const children = [];
  let cursor = 0;
  const pattern = /\$([^$\n]+)\$/g;
  for (const match of source.matchAll(pattern)) {
    const at = Number(match.index || 0);
    const before = source.slice(cursor, at);
    if (before) {
      children.push({ type: "text", text: before, source: "fallback", confidence: 0.72 });
    }

    const latex = String(match[1] || "").trim();
    if (latex) {
      children.push({ type: "inline_math", latex, source: "fallback", confidence: 0.72 });
    }

    cursor = at + String(match[0] || "").length;
  }

  const tail = source.slice(cursor);
  if (tail) {
    children.push({ type: "text", text: tail, source: "fallback", confidence: 0.72 });
  }

  if (!children.length) {
    children.push({ type: "text", text: source, source: "fallback", confidence: 0.72 });
  }

  return children;
}

function parseHtmlFallbackBlocks(html = "") {
  const source = String(html || "").trim();
  if (!source) return [];

  const blocks = [];
  const blockPattern = /<(h[1-6]|p|li|table)\b[^>]*>[\s\S]*?<\/\1>/gi;
  for (const match of source.matchAll(blockPattern)) {
    const tag = String(match[1] || "").toLowerCase();
    const xml = String(match[0] || "");
    const text = stripTags(xml);

    if (tag.startsWith("h")) {
      blocks.push({ type: "heading", level: Number(tag.slice(1)) || 2, text, source: "fallback", confidence: 0.72 });
      continue;
    }

    if (tag === "p") {
      blocks.push({ type: "paragraph", children: splitInlineMathFromText(text), source: "fallback", confidence: 0.72 });
      continue;
    }

    if (tag === "li") {
      blocks.push({ type: "list", items: [text], source: "fallback", confidence: 0.72 });
      continue;
    }

    if (tag === "table") {
      const rows = [];
      for (const rowMatch of xml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const row = [];
        for (const cellMatch of String(rowMatch[1] || "").matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)) {
          const cellText = stripTags(String(cellMatch[1] || ""));
          row.push({
            type: "table_cell",
            blocks: [{ type: "paragraph", children: splitInlineMathFromText(cellText), source: "fallback", confidence: 0.72 }],
            source: "fallback",
            confidence: 0.72
          });
        }
        if (row.length) rows.push(row);
      }
      blocks.push({ type: "table", rows, source: "fallback", confidence: 0.72 });
    }
  }

  return blocks;
}

function buildFallbackBlocksFromText(text = "") {
  const source = String(text || "");
  if (!source.trim()) return [];

  return source
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => ({
      type: "paragraph",
      children: splitInlineMathFromText(paragraph),
      source: "fallback",
      confidence: 0.72
    }));
}

function collectSectionsFromBlocks(blocks = [], title = "") {
  const sections = [];
  let activeSection = {
    id: "section-1",
    heading: String(title || "").trim() || "Document",
    blocks: []
  };
  let sectionIndex = 1;

  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (String(block?.type || "") === "section_break") {
      if (activeSection.blocks.length) {
        sections.push(activeSection);
      }
      sectionIndex += 1;
      activeSection = {
        id: `section-${sectionIndex}`,
        heading: `Section ${sectionIndex}`,
        blocks: []
      };
      continue;
    }

    if (String(block?.type || "") === "heading" && Number(block?.level || 0) <= 2) {
      if (activeSection.blocks.length) {
        sections.push(activeSection);
      }
      sectionIndex += 1;
      activeSection = {
        id: `section-${sectionIndex}`,
        heading: "",
        blocks: [block]
      };
      continue;
    }

    activeSection.blocks.push(block);
  }

  if (activeSection.blocks.length || !sections.length) {
    sections.push(activeSection);
  }

  return sections;
}

function parseHeaderFooterRootXml(rootXml = "", rootPath = "region", state) {
  const blocks = [];
  const nodes = extractTopLevelCellNodes(String(rootXml || ""));
  let paragraphIndex = 0;
  let tableIndex = 0;

  for (const node of nodes) {
    const xml = String(node.xml || "");
    if (/^<w:p\b/i.test(xml)) {
      const path = `${rootPath}/p[${paragraphIndex + 1}]`;
      blocks.push(...parseParagraphXml(xml, state, path));
      paragraphIndex += 1;
      continue;
    }

    if (/^<w:tbl\b/i.test(xml)) {
      const path = `${rootPath}/tbl[${tableIndex + 1}]`;
      blocks.push({
        type: "table",
        rows: parseTableXml(xml, state, path),
        source: "OOXML",
        confidence: 1,
        nodePath: path
      });
      tableIndex += 1;
    }
  }

  return blocks;
}

async function parseDocxToCanonicalData(file = {}) {
  const buffer = Buffer.from(String(file?.contentBase64 || ""), "base64");
  if (!buffer.length) {
    return { blocks: [], equations: [], notes: [], debug: {} };
  }

  const zip = await JSZip.loadAsync(buffer);
  const docXml = await zip.file("word/document.xml")?.async("string");
  if (!docXml) {
    return { blocks: [], equations: [], notes: [], debug: {} };
  }

  const mathService = new MathService();
  const state = {
    mathService,
    equations: [],
    sectionHeading: null
  };

  const bodyXml = extractBodyXml(docXml);
  const topLevelNodes = extractTopLevelBodyNodes(bodyXml);
  const blocks = [];

  let paragraphIndex = 0;
  let tableIndex = 0;
  for (const node of topLevelNodes) {
    const xml = String(node.xml || "");

    if (/^<w:p\b/i.test(xml)) {
      const path = `body/p[${paragraphIndex + 1}]`;
      blocks.push(...parseParagraphXml(xml, state, path));
      paragraphIndex += 1;
      continue;
    }

    if (/^<w:tbl\b/i.test(xml)) {
      const path = `body/tbl[${tableIndex + 1}]`;
      blocks.push({
        type: "table",
        rows: parseTableXml(xml, state, path),
        source: "OOXML",
        confidence: 1,
        nodePath: path
      });
      tableIndex += 1;
      continue;
    }

    if (/^<w:sectPr\b/i.test(xml)) {
      blocks.push({ type: "section_break", source: "OOXML", confidence: 1, nodePath: `body/sectPr[${tableIndex + paragraphIndex + 1}]` });
    }
  }

  const footnotesXml = await zip.file("word/footnotes.xml")?.async("string");
  const endnotesXml = await zip.file("word/endnotes.xml")?.async("string");
  const footnoteBlocks = parseDocxNotes(footnotesXml || "", "footnote");
  const endnoteBlocks = parseDocxNotes(endnotesXml || "", "endnote");

  const headerBlocks = [];
  const footerBlocks = [];
  const headerPaths = Object.keys(zip.files).filter((path) => /^word\/header\d+\.xml$/i.test(path)).sort();
  const footerPaths = Object.keys(zip.files).filter((path) => /^word\/footer\d+\.xml$/i.test(path)).sort();

  for (let index = 0; index < headerPaths.length; index += 1) {
    const xml = await zip.file(headerPaths[index])?.async("string");
    const body = String(xml || "").match(/<w:hdr\b[^>]*>([\s\S]*?)<\/w:hdr>/i)?.[1] || "";
    headerBlocks.push(...parseHeaderFooterRootXml(body, `header[${index + 1}]`, state));
  }

  for (let index = 0; index < footerPaths.length; index += 1) {
    const xml = await zip.file(footerPaths[index])?.async("string");
    const body = String(xml || "").match(/<w:ftr\b[^>]*>([\s\S]*?)<\/w:ftr>/i)?.[1] || "";
    footerBlocks.push(...parseHeaderFooterRootXml(body, `footer[${index + 1}]`, state));
  }

  return {
    blocks,
    equations: state.equations,
    notes: [...footnoteBlocks, ...endnoteBlocks],
    headers: headerBlocks,
    footers: footerBlocks,
    debug: {
      bodyNodeCount: topLevelNodes.length,
      headerCount: headerBlocks.length,
      footerCount: footerBlocks.length
    }
  };
}

export async function buildCanonicalDocumentFromDocxFile(file = {}, extraction = {}) {
  const documentId = String(file?.id || file?.name || `doc-${Date.now()}`);
  const title = String(file?.name || extraction?.title || "Uploaded Document").trim() || "Uploaded Document";

  const parsed = await parseDocxToCanonicalData(file);
  const blocks = [...(parsed.blocks || [])];

  if (parsed.notes?.length) {
    blocks.push({ type: "heading", level: 2, text: "Notes", source: "OOXML", confidence: 1 });
    for (const note of parsed.notes) {
      blocks.push(note);
    }
  }

  if (Array.isArray(parsed.headers) && parsed.headers.length) {
    blocks.push({ type: "heading", level: 2, text: "Headers", source: "OOXML", confidence: 1 });
    for (const headerBlock of parsed.headers) {
      blocks.push({ ...headerBlock, region: "header" });
    }
  }

  if (Array.isArray(parsed.footers) && parsed.footers.length) {
    blocks.push({ type: "heading", level: 2, text: "Footers", source: "OOXML", confidence: 1 });
    for (const footerBlock of parsed.footers) {
      blocks.push({ ...footerBlock, region: "footer" });
    }
  }

  const sections = collectSectionsFromBlocks(blocks, title);

  return {
    schemaVersion: "2.0",
    schema_version: "cdm.v2",
    document_id: documentId,
    metadata: {
      title,
      source_type: "docx",
      mime_type: String(file?.mimeType || extraction?.sourceMimeType || "").trim().toLowerCase(),
      extraction_method: "docx-ooxml-cdm"
    },
    equations: parsed.equations || [],
    sections,
    stats: {
      section_count: sections.length,
      block_count: sections.reduce((sum, section) => sum + (Array.isArray(section.blocks) ? section.blocks.length : 0), 0),
      equation_count: (parsed.equations || []).length,
      table_count: sections.reduce((sum, section) => sum + (section.blocks || []).filter((block) => block.type === "table").length, 0)
    },
    confidence: 1,
    debug: parsed.debug || {}
  };
}

export async function buildCanonicalDocumentFromExtraction({ file = {}, extraction = {}, detectedType = "unknown" } = {}) {
  if (detectedType === "docx") {
    try {
      return await buildCanonicalDocumentFromDocxFile(file, extraction);
    } catch {
      // Continue into fallback generation for non-parseable DOCX.
    }
  }

  const documentId = String(file?.id || file?.name || `doc-${Date.now()}`);
  const title = String(file?.name || extraction?.title || "Uploaded Document").trim() || "Uploaded Document";
  const text = String(extraction?.text || "").trim();
  const sourceRenderHtml = String(extraction?.sourceRenderHtml || "").trim();

  const blocks = sourceRenderHtml ? parseHtmlFallbackBlocks(sourceRenderHtml) : buildFallbackBlocksFromText(text);
  const sections = collectSectionsFromBlocks(blocks, title);

  return {
    schemaVersion: "2.0",
    schema_version: "cdm.v2",
    document_id: documentId,
    metadata: {
      title,
      source_type: detectedType,
      mime_type: String(file?.mimeType || extraction?.sourceMimeType || "").trim().toLowerCase(),
      extraction_method: String(extraction?.method || "")
    },
    equations: [],
    sections,
    stats: {
      section_count: sections.length,
      block_count: sections.reduce((sum, section) => sum + (Array.isArray(section.blocks) ? section.blocks.length : 0), 0),
      equation_count: 0,
      table_count: sections.reduce((sum, section) => sum + (section.blocks || []).filter((block) => block.type === "table").length, 0),
      text_length: text.length
    },
    confidence: 0.72,
    debug: {
      html_sample: sourceRenderHtml.slice(0, 1200)
    }
  };
}
