import path from "node:path";
import { readFile } from "node:fs/promises";
import { ensureDir, writeJson } from "./utils.js";

const outputDir = path.join(process.cwd(), "output");
const rawFile = path.join(outputDir, "raw-pages.json");
const reportFile = path.join(outputDir, "vector-report.json");

async function main() {
  await ensureDir(outputDir);
  const raw = JSON.parse(await readFile(rawFile, "utf8"));

  const vectors = [];
  for (const page of raw?.pages || []) {
    for (const vector of page.graphics || []) {
      vectors.push({
        page: page.pageNumber,
        vectorId: vector.id,
        operatorId: vector.operatorId,
        operator: vector.operator,
        commands: vector.commands,
        style: vector.style,
        transform: vector.transform,
        clippingPath: vector.clippingPath
      });
    }
  }

  const byOperator = vectors.reduce((acc, vector) => {
    acc[vector.operator] = (acc[vector.operator] || 0) + 1;
    return acc;
  }, {});

  const report = {
    generatedAt: new Date().toISOString(),
    vectorCount: vectors.length,
    byOperator: Object.entries(byOperator).map(([operator, count]) => ({ operator, count })).sort((a, b) => b.count - a.count),
    vectors
  };

  await writeJson(reportFile, report);
  console.log(JSON.stringify({ reportFile, vectorCount: vectors.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
