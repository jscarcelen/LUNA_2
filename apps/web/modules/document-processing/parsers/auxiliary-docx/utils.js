import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

export const EMU_PER_PIXEL = 9525;

export function resolveProjectPath(...parts) {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), ...parts);
}

export async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

export async function readDocxZip(filePath) {
  const buffer = await readFile(filePath);
  return JSZip.loadAsync(buffer);
}

export async function readZipText(zip, filePath) {
  const file = zip.file(filePath);
  return file ? file.async("string") : "";
}

export async function readZipBuffer(zip, filePath) {
  const file = zip.file(filePath);
  return file ? file.async("nodebuffer") : null;
}

export function parseXml(xml = "") {
  return new DOMParser().parseFromString(String(xml || ""), "text/xml");
}

export function serializeXml(node) {
  return new XMLSerializer().serializeToString(node);
}

export function localName(node) {
  const name = String(node?.localName || node?.nodeName || "");
  const pieces = name.split(":");
  return pieces[pieces.length - 1] || "";
}

export function elementChildren(node) {
  return Array.from(node?.childNodes || []).filter((child) => child?.nodeType === 1);
}

export function firstElement(node, tagName = "") {
  return elementChildren(node).find((child) => localName(child) === tagName) || null;
}

export function findElements(node, tagName = "") {
  const found = [];
  const stack = [node];
  while (stack.length) {
    const current = stack.pop();
    for (const child of elementChildren(current)) {
      if (localName(child) === tagName) {
        found.push(child);
      }
      stack.push(child);
    }
  }
  return found;
}

export function getAttribute(node, name) {
  if (!node?.attributes) return "";
  const target = Array.from(node.attributes).find((attribute) => {
    const attrName = String(attribute?.name || "");
    return attrName === name || attrName.endsWith(`:${name}`);
  });
  return String(target?.value || "");
}

export function decodeXmlEntities(text = "") {
  return String(text || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function normalizeText(text = "") {
  return decodeXmlEntities(String(text || ""))
    .replace(/\r/g, "")
    .replaceAll("\u0000", "")
    .replace(/\s+/g, " ")
    .trim();
}

export function paragraphText(text = "") {
  return decodeXmlEntities(String(text || "")).replace(/\r/g, "");
}

export function nodePath(parentPath = "", segment = "") {
  return parentPath ? `${parentPath}/${segment}` : segment;
}

export function toPixels(emuValue) {
  const emu = Number(emuValue || 0);
  return emu > 0 ? Math.round(emu / EMU_PER_PIXEL) : null;
}

export function makeProvenance(part, pathValue, xmlElement) {
  return {
    part: String(part || ""),
    nodePath: String(pathValue || ""),
    xmlElement: String(xmlElement || "")
  };
}

export async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function countNodeTypes(node, counts = {}) {
  if (!node || typeof node !== "object") return counts;
  const type = String(node.type || "");
  if (type) {
    counts[type] = Number(counts[type] || 0) + 1;
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) countNodeTypes(item, counts);
    } else if (value && typeof value === "object") {
      countNodeTypes(value, counts);
    }
  }
  return counts;
}