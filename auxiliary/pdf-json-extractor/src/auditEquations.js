import path from "node:path";
import { readFile } from "node:fs/promises";
import { sourceIdOf } from "./sourceModel.js";
import { ensureDir, escapeHtml, writeJson, writeText } from "./utils.js";

const baseDir = process.cwd();
const outputDir = path.join(baseDir, "output");
const canonicalFile = path.join(outputDir, "document.json");
const rawFile = path.join(outputDir, "raw-pages.json");
const reportFile = path.join(outputDir, "equation-report.json");
const htmlFile = path.join(outputDir, "equation-report.html");

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function buildSourceMap(rawPages = []) {
  const map = new Map();
  for (const page of rawPages) {
    for (const item of page.textObjects || []) map.set(item.id, { kind: "textObject", value: item });
    for (const item of page.operators || []) map.set(item.id, { kind: "operator", value: item });
    for (const item of page.images || []) map.set(item.id, { kind: "image", value: item });
    for (const item of page.graphics || []) map.set(item.id, { kind: "vector", value: item });
  }
  return map;
}

function runHtml(run = {}) {
  const text = escapeHtml(run.text || "");
  const align = run?.style?.verticalAlign;
  if (align === "superscript") return `<sup>${text}</sup>`;
  if (align === "subscript") return `<sub>${text}</sub>`;
  return `<span>${text}</span>`;
}

async function main() {
  await ensureDir(outputDir);
  const [canonical, raw] = await Promise.all([readJson(canonicalFile), readJson(rawFile)]);
  const rawPages = Array.isArray(raw?.pages) ? raw.pages : [];
  const sourceMap = buildSourceMap(rawPages);

  const reportEntries = [];

  for (const page of canonical.pages || []) {
    for (const node of page.elements || []) {
      const isEquation = node.type === "equation";
      const isUnknown = node.type === "unknownBlock" && node?.classification?.candidate === "equation";
      const isMathCandidate = node.type === "textGroup" && node?.semanticCandidate === "math";
      if (!isEquation && !isUnknown && !isMathCandidate) continue;

      const refs = (node.sourceRefs || []).map((ref) => {
        const id = sourceIdOf(ref);
        return { id, raw: id ? sourceMap.get(id) || null : null };
      });
      const rawTextObjects = refs
        .filter((ref) => ref.raw?.kind === "textObject")
        .map((ref) => ({
          sourceId: ref.id,
          text: ref.raw.value.text,
          transform: ref.raw.value.transform,
          width: ref.raw.value.width,
          height: ref.raw.value.height,
          fontName: ref.raw.value.fontName,
          bbox: ref.raw.value.bbox
        }));

      reportEntries.push({
        page: page.pageNumber,
        nodeId: node.id,
        nodeType: node.type,
        rawSource: rawTextObjects,
        geometry: {
          bbox: node.bbox,
          baseline: node.baseline || null
        },
        inferredStructure: node.type === "equation" ? {
          math: node.math,
          confidence: Number(node?.math?.sourceMeta?.confidence || node?.classification?.confidence || 0),
          sourceKind: String(node?.math?.sourceMeta?.kind || "inferred")
        } : node.type === "textGroup" ? {
          candidate: node?.semanticCandidate || "math",
          confidence: Number(node?.classification?.confidence || 0),
          sourceKind: "text-paint-geometry",
          evidence: node?.mathEvidence || null
        } : {
          candidate: node?.classification?.candidate || "equation",
          confidence: Number(node?.classification?.confidence || 0),
          sourceKind: "inferred"
        },
        canonicalRepresentation: {
          type: node.type,
          text: node.text,
          sourceRefs: node.sourceRefs,
          fragments: node.fragments || []
        },
        renderedHtml: (node.children || []).map((run) => runHtml(run)).join("")
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    equations: reportEntries
  };

  await writeJson(reportFile, report);

  const cards = reportEntries.map((entry) => `
<section class="card">
  <h2>Page ${entry.page} - ${escapeHtml(entry.nodeId)} (${escapeHtml(entry.nodeType)})</h2>
  <h3>RAW SOURCE -> text objects</h3>
  <pre>${escapeHtml(JSON.stringify(entry.rawSource, null, 2))}</pre>
  <h3>Geometry</h3>
  <pre>${escapeHtml(JSON.stringify(entry.geometry, null, 2))}</pre>
  <h3>Inferred structure</h3>
  <pre>${escapeHtml(JSON.stringify(entry.inferredStructure, null, 2))}</pre>
  <h3>Canonical representation</h3>
  <pre>${escapeHtml(JSON.stringify(entry.canonicalRepresentation, null, 2))}</pre>
  <h3>Rendered HTML snippet</h3>
  <div class="snippet">${entry.renderedHtml || "(no run html)"}</div>
</section>`).join("\n");

  await writeText(htmlFile, `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Equation report</title>
  <style>
    body { margin: 0; background: #13161a; color: #e8edf4; font-family: "IBM Plex Sans", sans-serif; }
    main { max-width: 980px; margin: 1rem auto 2rem; padding: 0 1rem; }
    .card { border: 1px solid #2c3643; background: #1b2129; border-radius: 8px; padding: 0.8rem; margin-bottom: 1rem; }
    pre { white-space: pre-wrap; background: #0f141b; border: 1px solid #2b3746; border-radius: 8px; padding: 0.7rem; }
    .snippet { background: #f4ece0; color: #271f16; border-radius: 6px; padding: 0.7rem; }
  </style>
</head>
<body>
  <main>
    <h1>Equation report</h1>
    ${cards || "<p>No equation-like nodes found.</p>"}
  </main>
</body>
</html>`);

  console.log(JSON.stringify({ reportFile, htmlFile, equationLikeNodes: reportEntries.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
