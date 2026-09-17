import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

export function resolveProjectPath(...parts) {
  return path.resolve(process.cwd(), ...parts);
}

export async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

export async function readBinaryFile(filePath) {
  return readFile(filePath);
}

export async function writeJson(filePath, value) {
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(filePath, payload, "utf8");
}

export async function writeText(filePath, value) {
  await writeFile(filePath, String(value || ""), "utf8");
}

export function median(values = []) {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

export function percentile(values = [], p = 0.5) {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const clamped = Math.min(Math.max(Number(p) || 0, 0), 1);
  const index = Math.floor(clamped * (sorted.length - 1));
  return sorted[index];
}

export function parseArgs(argv = []) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "");
    if (token === "--input") {
      options.input = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }
    if (token === "--output") {
      options.output = String(argv[index + 1] || "").trim();
      index += 1;
    }
  }
  return options;
}

export function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function normalizeWhitespace(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}
