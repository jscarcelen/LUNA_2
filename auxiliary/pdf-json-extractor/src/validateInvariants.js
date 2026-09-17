import path from "node:path";
import { readFile } from "node:fs/promises";
import { sourceIdOf } from "./sourceModel.js";

const outputDir = path.join(process.cwd(), "output");
const rawFile = path.join(outputDir, "raw-pages.json");
const canonicalFile = path.join(outputDir, "document.json");
const lossFile = path.join(outputDir, "loss-accounting.json");

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function buildSourceSet(rawPages = []) {
  const set = new Set();
  for (const page of rawPages) {
    for (const obj of page.textObjects || []) set.add(obj.id);
    for (const obj of page.operators || []) set.add(obj.id);
    for (const obj of page.fonts || []) set.add(obj.id);
    for (const obj of page.images || []) set.add(obj.id);
    for (const obj of page.graphics || []) set.add(obj.id);
  }
  return set;
}

function validateSourceRefs(canonical = {}, sourceSet = new Set()) {
  const unresolved = [];

  const checkRefs = (refs = [], row = {}) => {
    for (const ref of refs || []) {
      const sourceId = sourceIdOf(ref);
      if (!sourceId || !sourceSet.has(sourceId)) {
        unresolved.push({ ...row, sourceRef: ref });
      }
    }
  };

  const hasCanonicalContent = Array.isArray(canonical?.content);
  if (hasCanonicalContent) {
    for (const node of canonical.content || []) {
      checkRefs(node?.source?.objectRefs || node?.source?.sourceRefs || [], { nodeId: node.id });
      for (const run of node.children || []) {
        checkRefs(run?.source?.objectRefs || run?.source?.sourceRefs || [], { nodeId: node.id, runId: run.id });
      }
    }
    return unresolved;
  }

  for (const page of canonical.pages || []) {
    for (const node of page.elements || []) {
      checkRefs(node.sourceRefs || [], { nodeId: node.id });
      for (const run of node.children || []) {
        checkRefs(run.sourceRefs || [], { nodeId: node.id, runId: run.id });
      }
    }
  }

  return unresolved;
}

function validateTerminalStatuses(lossStatuses = [], sourceSet = new Set()) {
  const terminal = new Set(["preserved+interpreted", "preserved+uninterpreted", "intentionally_ignored", "unavailable_from_parser", "error"]);
  const statusById = new Map(lossStatuses.map((entry) => [entry.sourceId, entry]));
  const missing = [];
  const invalid = [];

  for (const sourceId of sourceSet) {
    const status = statusById.get(sourceId);
    if (!status) {
      missing.push(sourceId);
      continue;
    }
    if (!terminal.has(status.terminalStatus)) {
      invalid.push({ sourceId, terminalStatus: status.terminalStatus });
    }
  }

  return { missing, invalid };
}

async function main() {
  const [raw, canonical, loss] = await Promise.all([
    readJson(rawFile),
    readJson(canonicalFile),
    readJson(lossFile)
  ]);

  const sourceSet = buildSourceSet(raw.pages || []);
  const unresolvedRefs = validateSourceRefs(canonical, sourceSet);
  const terminalCheck = validateTerminalStatuses(loss?.statuses || [], sourceSet);

  const pass = unresolvedRefs.length === 0 && terminalCheck.missing.length === 0 && terminalCheck.invalid.length === 0;

  const report = {
    pass,
    unresolvedSourceRefs: unresolvedRefs,
    missingTerminalStatuses: terminalCheck.missing,
    invalidTerminalStatuses: terminalCheck.invalid,
    summary: {
      sourceObjects: sourceSet.size,
      unresolvedRefs: unresolvedRefs.length,
      missingStatuses: terminalCheck.missing.length,
      invalidStatuses: terminalCheck.invalid.length
    }
  };

  console.log(JSON.stringify(report, null, 2));
  if (!pass) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
