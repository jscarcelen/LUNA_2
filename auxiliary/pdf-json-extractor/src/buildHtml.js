import path from "node:path";
import { spawnSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { parseArgs, resolveProjectPath } from "./utils.js";

const baseDir = process.cwd();
const outputDir = path.join(baseDir, "output");
const DEFAULT_INPUT = resolveProjectPath("..", "..", "Statistics.pdf");

function runNodeScript(scriptPath, args = []) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: baseDir,
    stdio: "inherit",
    env: process.env
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: node ${scriptPath} ${args.join(" ")}`.trim());
  }
}

function countByType(documentTree = {}, type = "") {
  let count = 0;
  for (const page of documentTree.pages || []) {
    for (const node of page.fidelityObjects || []) {
      if (node?.type === type) count += 1;
    }
  }
  return count;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputFile = args.input ? path.resolve(baseDir, args.input) : DEFAULT_INPUT;

  runNodeScript(path.join(baseDir, "src", "inspectSource.js"), ["--input", inputFile]);
  runNodeScript(path.join(baseDir, "src", "extractPdf.js"), ["--input", inputFile]);
  runNodeScript(path.join(baseDir, "src", "validate.js"));
  runNodeScript(path.join(baseDir, "src", "renderDocument.js"));

  const [documentPayload, renderPlanPayload, lossPayload, htmlPayload, htmlStat] = await Promise.all([
    readFile(path.join(outputDir, "document.json"), "utf8"),
    readFile(path.join(outputDir, "document.render-plan.json"), "utf8"),
    readFile(path.join(outputDir, "loss-accounting.json"), "utf8"),
    readFile(path.join(outputDir, "document.html"), "utf8"),
    stat(path.join(outputDir, "document.html"))
  ]);

  const documentTree = JSON.parse(documentPayload);
  const renderPlan = JSON.parse(renderPlanPayload);
  const loss = JSON.parse(lossPayload);

  const statuses = Array.isArray(loss?.statuses) ? loss.statuses : [];
  const sourceObjects = statuses.length;
  const preserved = statuses.filter((row) => String(row?.terminalStatus || "").startsWith("preserved")).length;
  const missing = statuses.filter((row) => String(row?.terminalStatus || "").includes("missing") || String(row?.terminalStatus || "") === "error").length;

  const pages = Number(documentTree?.statistics?.pages || 0);
  const textObjects = Number(documentTree?.statistics?.textPaint?.textPaintObjects || 0);
  const vectorObjects = countByType(documentTree, "vectorPaint");
  const imageObjects = countByType(documentTree, "imagePaint");

  const pageContainers = (htmlPayload.match(/id="pdf-page-\d+"/g) || []).length;
  const hasExternalRefs = /(src|href)=["'](?!data:|#)/i.test(htmlPayload);
  const selfContained = !hasExternalRefs;
  const status = pages > 0 && pages === pageContainers && htmlStat.size > 0 ? "PASS" : "FAIL";

  console.log("\nPDF -> HTML BUILD\n");
  console.log(`Input:\n  ${inputFile}\n`);
  console.log(`Pages:\n  ${pages}\n`);
  console.log(`Source objects:\n  ${sourceObjects}\n`);
  console.log(`Preserved:\n  ${preserved}\n`);
  console.log(`Missing:\n  ${missing}\n`);
  console.log(`Text objects:\n  ${textObjects}\n`);
  console.log(`Vector objects:\n  ${vectorObjects}\n`);
  console.log(`Image objects:\n  ${imageObjects}\n`);
  console.log(`HTML:\n  ${path.join(outputDir, "document.html")}\n`);
  console.log(`Canonical JSON:\n  ${path.join(outputDir, "document.json")}\n`);
  console.log(`Render plan:\n  ${path.join(outputDir, "document.render-plan.json")}\n`);
  console.log(`Self-contained:\n  ${selfContained ? "YES" : "NO"}\n`);
  console.log(`Render plan decisions:\n  ${Array.isArray(renderPlan?.decisions) ? renderPlan.decisions.length : 0}\n`);
  console.log(`STATUS: ${status}`);

  if (status !== "PASS") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
