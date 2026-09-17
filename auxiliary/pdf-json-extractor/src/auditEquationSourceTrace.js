import path from "node:path";
import { readFile } from "node:fs/promises";
import { sourceIdOf } from "./sourceModel.js";
import { ensureDir, writeJson } from "./utils.js";

const outputDir = path.join(process.cwd(), "output");
const documentFile = path.join(outputDir, "document.json");
const textPaintFile = path.join(outputDir, "text-paints.json");
const reportFile = path.join(outputDir, "equation-source-trace.json");

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function sourceMapFromPaintPages(pages = []) {
  const map = new Map();
  for (const page of pages) {
    for (const paint of page?.textPaintObjects || []) {
      map.set(paint.id, paint);
      for (const ref of paint.sourceRefs || []) {
        const sourceId = sourceIdOf(ref);
        if (sourceId && !map.has(sourceId)) map.set(sourceId, paint);
      }
    }
  }
  return map;
}

function buildCharRelationships(runs = []) {
  const chars = [];
  for (const run of runs) {
    for (const glyph of run?.glyphs || []) {
      chars.push({
        char: glyph.char,
        x: Number(glyph?.bbox?.x || 0),
        y: Number(glyph?.bbox?.y || 0),
        width: Number(glyph?.bbox?.width || 0),
        height: Number(glyph?.bbox?.height || 0),
        verticalAlign: run?.style?.verticalAlign || "baseline",
        verticalAlignSource: run?.inference?.verticalAlign?.source || "baseline-analysis"
      });
    }
  }

  chars.sort((a, b) => (a.y - b.y) || (a.x - b.x));

  const relationships = [];
  for (let index = 1; index < chars.length; index += 1) {
    const prev = chars[index - 1];
    const cur = chars[index];
    relationships.push({
      from: prev.char,
      to: cur.char,
      dx: Number((cur.x - (prev.x + prev.width)).toFixed(4)),
      dy: Number((cur.y - prev.y).toFixed(4)),
      overlapY: Number((Math.min(prev.y + prev.height, cur.y + cur.height) - Math.max(prev.y, cur.y)).toFixed(4))
    });
  }

  return { chars, relationships };
}

async function main() {
  await ensureDir(outputDir);
  const [documentTree, textPaint] = await Promise.all([
    readJson(documentFile),
    readJson(textPaintFile)
  ]);

  const paintMap = sourceMapFromPaintPages(textPaint?.pages || []);
  const candidates = [];

  for (const page of documentTree?.pages || []) {
    for (const node of page?.elements || []) {
      const isMathCandidate = node?.type === "textGroup" && node?.semanticCandidate === "math";
      const isUnknownEquation = node?.type === "unknownBlock" && node?.classification?.candidate === "equation";
      if (!isMathCandidate && !isUnknownEquation) continue;

      const sourceOperators = [];
      const textPaintObjects = [];

      for (const ref of node.sourceRefs || []) {
        const sourceId = sourceIdOf(ref);
        const paint = sourceId ? paintMap.get(sourceId) : null;
        if (!paint) continue;
        textPaintObjects.push({
          paintId: paint.id,
          operatorId: paint.operatorId,
          operatorIndex: paint.operatorIndex,
          operator: paint.operator,
          text: paint.text,
          segments: paint.segments,
          bbox: paint?.geometry?.bbox || null,
          baseline: paint?.baseline || null,
          rise: Number(paint?.state?.rise || 0),
          fontName: paint?.state?.font?.name || null,
          fontSize: Number(paint?.state?.fontSize || 0)
        });

        sourceOperators.push({
          operatorId: paint.operatorId,
          operatorIndex: paint.operatorIndex,
          operator: paint.operator
        });
      }

      const runGeometry = (node.children || []).map((run) => ({
        runId: run.id,
        text: run.text,
        bbox: run.bbox,
        baseline: run.baselineSpan || { start: [run.bbox?.x || 0, run.baseline || 0], end: [(run.bbox?.x || 0) + (run.bbox?.width || 0), run.baseline || 0] },
        rise: Number(run?.paint?.state?.rise || 0),
        verticalAlign: run?.style?.verticalAlign || "baseline",
        verticalAlignSource: run?.inference?.verticalAlign?.source || "baseline-analysis"
      }));

      const charRelationships = buildCharRelationships(node.children || []);

      candidates.push({
        page: page.pageNumber,
        nodeId: node.id,
        nodeType: node.type,
        semanticCandidate: node.semanticCandidate || null,
        classification: node.classification || null,
        chain: {
          sourceOperators,
          textPaintObjects,
          textPositions: runGeometry,
          baselines: runGeometry.map((run) => ({ runId: run.runId, baseline: run.baseline, rise: run.rise })),
          characterRelationships: charRelationships.relationships
        },
        glyphEvidence: charRelationships.chars
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      mathCandidates: candidates.filter((item) => item.semanticCandidate === "math").length,
      unknownEquationBlocks: candidates.filter((item) => item.nodeType === "unknownBlock").length
    },
    candidates
  };

  await writeJson(reportFile, report);
  console.log(JSON.stringify({ reportFile, totals: report.totals }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
