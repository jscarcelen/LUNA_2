import path from "node:path";
import { readFile } from "node:fs/promises";
import { ensureDir, writeJson } from "./utils.js";

const outputDir = path.join(process.cwd(), "output");
const rawFile = path.join(outputDir, "raw-pages.json");
const lossFile = path.join(outputDir, "loss-accounting.json");
const reportFile = path.join(outputDir, "operator-loss.json");

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function main() {
  await ensureDir(outputDir);
  const [raw, loss] = await Promise.all([readJson(rawFile), readJson(lossFile)]);
  const statusById = new Map((loss?.statuses || []).map((item) => [item.sourceId, item]));

  const operators = [];
  for (const page of raw?.pages || []) {
    for (const op of page.operators || []) {
      const status = statusById.get(op.id);
      operators.push({
        sourceId: op.id,
        page: page.pageNumber,
        operator: op.operator,
        index: op.index,
        terminalStatus: status?.terminalStatus || "error",
        reason: status?.reason || "unhandled"
      });
    }
  }

  const uninterpreted = operators.filter((op) => op.terminalStatus !== "preserved+interpreted");
  const byOperator = uninterpreted.reduce((acc, op) => {
    acc[op.operator] = (acc[op.operator] || 0) + 1;
    return acc;
  }, {});

  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      operators: operators.length,
      uninterpreted: uninterpreted.length
    },
    topUninterpretedOperators: Object.entries(byOperator)
      .map(([operator, count]) => ({ operator, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 100),
    items: uninterpreted
  };

  await writeJson(reportFile, report);
  console.log(JSON.stringify({ reportFile, operators: operators.length, uninterpreted: uninterpreted.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
