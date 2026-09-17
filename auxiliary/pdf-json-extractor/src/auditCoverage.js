import path from "node:path";
import { readFile } from "node:fs/promises";
import { ensureDir, writeJson } from "./utils.js";

const baseDir = process.cwd();
const outputDir = path.join(baseDir, "output");
const rawFile = path.join(outputDir, "raw-pages.json");
const lossFile = path.join(outputDir, "loss-accounting.json");
const reportFile = path.join(outputDir, "preservation-report.json");

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function summarize(lossStatuses = []) {
  const counts = {
    "preserved+interpreted": 0,
    "preserved+uninterpreted": 0,
    intentionally_ignored: 0,
    unavailable_from_parser: 0,
    error: 0
  };

  for (const status of lossStatuses) {
    if (Object.prototype.hasOwnProperty.call(counts, status.terminalStatus)) {
      counts[status.terminalStatus] += 1;
    }
  }

  const sourceObjects = lossStatuses.length;
  const preserved = counts["preserved+interpreted"] + counts["preserved+uninterpreted"] + counts.intentionally_ignored;
  const missing = sourceObjects - preserved - counts.unavailable_from_parser - counts.error;

  return {
    sourceObjects,
    preservation: {
      preserved,
      missing: Math.max(0, missing),
      coverage: sourceObjects ? preserved / sourceObjects : 1
    },
    semanticInterpretation: {
      interpreted: counts["preserved+interpreted"],
      uninterpreted: counts["preserved+uninterpreted"] + counts.intentionally_ignored
    },
    terminalStatusCounts: counts
  };
}

function perType(lossStatuses = []) {
  const map = new Map();
  for (const status of lossStatuses) {
    const key = status.sourceType || "unknown";
    if (!map.has(key)) {
      map.set(key, {
        sourceType: key,
        sourceObjects: 0,
        interpreted: 0,
        uninterpreted: 0,
        intentionallyIgnored: 0,
        unavailable: 0,
        error: 0
      });
    }
    const bucket = map.get(key);
    bucket.sourceObjects += 1;
    if (status.terminalStatus === "preserved+interpreted") bucket.interpreted += 1;
    else if (status.terminalStatus === "preserved+uninterpreted") bucket.uninterpreted += 1;
    else if (status.terminalStatus === "intentionally_ignored") bucket.intentionallyIgnored += 1;
    else if (status.terminalStatus === "unavailable_from_parser") bucket.unavailable += 1;
    else if (status.terminalStatus === "error") bucket.error += 1;
  }

  return Array.from(map.values()).map((row) => ({
    ...row,
    preservationCoverage: row.sourceObjects
      ? (row.interpreted + row.uninterpreted + row.intentionallyIgnored) / row.sourceObjects
      : 1,
    interpretationCoverage: row.sourceObjects ? row.interpreted / row.sourceObjects : 1
  }));
}

async function main() {
  await ensureDir(outputDir);

  const [raw, loss] = await Promise.all([
    readJson(rawFile),
    readJson(lossFile)
  ]);

  const statuses = Array.isArray(loss?.statuses) ? loss.statuses : [];
  const report = {
    generatedAt: new Date().toISOString(),
    sourceFile: raw?.sourceFile || null,
    summary: summarize(statuses),
    byType: perType(statuses)
  };

  await writeJson(reportFile, report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
