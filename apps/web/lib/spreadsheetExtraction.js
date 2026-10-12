import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";

/**
 * Reading an Excel workbook (.xlsx / .xlsm) into text Luna can study from: one table per sheet, in
 * Markdown, with the values the workbook last calculated (formulas are not re-run).
 *
 * An .xlsx file is a zip of XML: `xl/workbook.xml` names the sheets, `xl/_rels/workbook.xml.rels` says which
 * file holds each, `xl/sharedStrings.xml` holds the words, and each `xl/worksheets/*.xml` holds the cells.
 * No extra dependency: JSZip and the XML parser are already used for Word and PowerPoint files.
 */

export const MAX_SHEET_ROWS = 500;
export const MAX_SHEET_COLUMNS = 40;

const parse = (xml) => new DOMParser({ errorHandler: { warning() {}, error() {}, fatalError() {} } }).parseFromString(xml, "text/xml");
const children = (node, name) => Array.from(node?.childNodes || []).filter((child) => child.nodeType === 1 && (child.localName === name || child.nodeName === name));
const first = (node, name) => children(node, name)[0] || null;
const textOf = (node) => String(node?.textContent || "");

/** "C12" → { column: 2, row: 11 } (zero-based). */
export function cellPosition(reference = "") {
  const match = String(reference).match(/^([A-Za-z]+)(\d+)$/);
  if (!match) return null;
  let column = 0;
  for (const letter of match[1].toUpperCase()) column = column * 26 + (letter.charCodeAt(0) - 64);
  return { column: column - 1, row: Number(match[2]) - 1 };
}

/** The text of a shared string: plain `<t>`, or the runs `<r><t>` of formatted text (phonetic hints skipped). */
function sharedStringText(item) {
  const direct = children(item, "t");
  if (direct.length) return direct.map(textOf).join("");
  return children(item, "r").map((run) => children(run, "t").map(textOf).join("")).join("");
}

function cellValue(cell, shared) {
  const type = cell.getAttribute("t") || "";
  if (type === "inlineStr") return children(first(cell, "is") || cell, "t").map(textOf).join("") || textOf(first(cell, "is"));
  const raw = textOf(first(cell, "v"));
  if (raw === "") return "";
  if (type === "s") return shared[Number(raw)] ?? "";
  if (type === "b") return raw === "1" ? "TRUE" : "FALSE";
  if (type === "e") return raw;
  return raw;
}

const escapeCell = (value) => String(value ?? "").replace(/\r?\n+/g, " ").replace(/\|/g, "\\|").trim();

/** Rows of cells → a Markdown table (the first non-empty row is the header). */
export function rowsToMarkdown(rows = []) {
  const used = rows.filter((row) => row.some((cell) => String(cell || "").trim()));
  if (!used.length) return "";
  const width = Math.max(...used.map((row) => row.length));
  const pad = (row) => Array.from({ length: width }, (_, index) => escapeCell(row[index]));
  const [head, ...body] = used.map(pad);
  return [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...body.map((row) => `| ${row.join(" | ")} |`)].join("\n");
}

/**
 * @param {Buffer} buffer the .xlsx file
 * @returns {Promise<{ sheets: { name: string, rows: string[][], truncated: boolean }[], markdown: string, text: string, issues: string[] }>}
 */
export async function extractXlsx(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const read = async (path) => { const file = zip.file(path); return file ? file.async("string") : ""; };

  const sharedXml = await read("xl/sharedStrings.xml");
  const shared = sharedXml ? children(parse(sharedXml).documentElement, "si").map(sharedStringText) : [];

  const workbook = parse(await read("xl/workbook.xml")).documentElement;
  const relationships = new Map();
  const relsXml = await read("xl/_rels/workbook.xml.rels");
  if (relsXml) for (const rel of children(parse(relsXml).documentElement, "Relationship")) relationships.set(rel.getAttribute("Id"), rel.getAttribute("Target"));

  const declared = children(first(workbook, "sheets"), "sheet").map((sheet, index) => {
    const target = relationships.get(sheet.getAttribute("r:id")) || `worksheets/sheet${index + 1}.xml`;
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.?\//, "")}`;
    return { name: sheet.getAttribute("name") || `Sheet ${index + 1}`, path };
  });

  const issues = [];
  const sheets = [];
  for (const { name, path } of declared) {
    const xml = await read(path);
    if (!xml) continue;
    const data = first(parse(xml).documentElement, "sheetData");
    const rows = [];
    let truncated = false;
    for (const row of children(data, "row")) {
      const rowIndex = Number(row.getAttribute("r")) - 1;
      if (rowIndex >= MAX_SHEET_ROWS) { truncated = true; break; }
      const cells = [];
      let next = 0;
      for (const cell of children(row, "c")) {
        const position = cellPosition(cell.getAttribute("r"));
        const column = position ? position.column : next;
        next = column + 1;
        if (column >= MAX_SHEET_COLUMNS) { truncated = true; continue; }
        cells[column] = cellValue(cell, shared);
      }
      const target = Number.isFinite(rowIndex) && rowIndex >= 0 ? rowIndex : rows.length;
      while (rows.length < target) rows.push([]);
      rows[target] = Array.from(cells, (value) => value ?? "");
    }
    if (truncated) issues.push(`sheet-truncated:${name}`);
    sheets.push({ name, rows, truncated });
  }

  const sections = sheets.map((sheet) => {
    const table = rowsToMarkdown(sheet.rows);
    const note = sheet.truncated ? `\n\n_Only the first ${MAX_SHEET_ROWS} rows and ${MAX_SHEET_COLUMNS} columns of this sheet are shown._` : "";
    return `## ${sheet.name}\n\n${table || "_This sheet is empty._"}${note}`;
  });
  const markdown = sections.join("\n\n");
  const text = sheets.map((sheet) => `${sheet.name}\n${sheet.rows.filter((row) => row.some((cell) => String(cell || "").trim())).map((row) => row.map((cell) => String(cell ?? "").replace(/\s+/g, " ").trim()).join("\t")).join("\n")}`).join("\n\n");
  return { sheets, markdown, text, issues };
}
