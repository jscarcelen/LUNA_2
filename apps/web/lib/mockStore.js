import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);
const dataFilePath = path.join(currentDirPath, "..", "mock-data", "workspaces.json");
let memoryStore = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export async function readWorkspaces() {
  if (memoryStore) {
    return clone(memoryStore);
  }

  try {
    const text = await fs.readFile(dataFilePath, "utf8");
    const data = JSON.parse(text);
    memoryStore = Array.isArray(data) ? data : [];
    return clone(memoryStore);
  } catch {
    memoryStore = [];
    return [];
  }
}

export async function writeWorkspaces(workspaces) {
  memoryStore = clone(workspaces);

  try {
    await fs.writeFile(dataFilePath, `${JSON.stringify(workspaces, null, 2)}\n`, "utf8");
  } catch {
    // Read-only environments (e.g., serverless) keep data in memory for the current instance.
  }
}

export function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
