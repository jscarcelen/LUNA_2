import path from "node:path";
import { readFile } from "node:fs/promises";
import { ensureDir, escapeHtml, writeJson, writeText } from "./utils.js";

const outputDir = path.join(process.cwd(), "output");
const textPaintFile = path.join(outputDir, "text-paints.json");
const rawFile = path.join(outputDir, "raw-pages.json");
const reportFile = path.join(outputDir, "text-state-report.json");
const htmlFile = path.join(outputDir, "text-state-debug.html");

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function buildRecords(textPaintPages = [], rawPages = []) {
  const records = [];
  const seenSourceIds = new Set();
  for (const page of textPaintPages) {
    for (const paint of page?.textPaintObjects || []) {
      const bbox = paint?.geometry?.bbox || null;
      const baseline = paint?.baseline || null;
      const baselineY = baseline?.start?.[1] ?? null;
      const bboxBaselineY = bbox ? Number(bbox.y || 0) + Number(bbox.height || 0) : null;
      const baselineError = Number.isFinite(baselineY) && Number.isFinite(bboxBaselineY)
        ? Math.abs(baselineY - bboxBaselineY)
        : null;

      records.push({
        page: Number(page?.pageNumber || 0),
        sourceId: paint?.pdfjs?.id || null,
        operatorId: paint?.operatorId || null,
        text: paint?.text || "",
        pdfjs: {
          transform: paint?.comparison?.pdfjsTransform || paint?.pdfjs?.transform || null,
          fontName: paint?.comparison?.fontNamePdfjs || paint?.pdfjs?.fontName || null,
          width: Number(paint?.pdfjs?.width || 0),
          height: Number(paint?.pdfjs?.height || 0)
        },
        reconstructedState: {
          transform: paint?.comparison?.reconstructedTransform || paint?.geometry?.transform || null,
          ctm: paint?.state?.ctm || null,
          textMatrix: paint?.state?.textMatrix || null,
          textLineMatrix: paint?.state?.textLineMatrix || null,
          fontName: paint?.comparison?.fontNameState || paint?.state?.font?.name || null,
          fontSize: Number(paint?.state?.fontSize || 0),
          rise: Number(paint?.state?.rise || 0),
          characterSpacing: Number(paint?.state?.characterSpacing || 0),
          wordSpacing: Number(paint?.state?.wordSpacing || 0),
          horizontalScale: Number(paint?.state?.horizontalScale || 100),
          leading: Number(paint?.state?.leading || 0),
          renderingMode: Number(paint?.state?.renderingMode || 0),
          fillColor: paint?.state?.fillColor || null,
          strokeColor: paint?.state?.strokeColor || null
        },
        geometry: {
          bbox,
          baseline,
          segments: paint?.segments || []
        },
        differences: {
          transformError: Number(paint?.comparison?.transformError ?? NaN),
          fontMatch: paint?.comparison?.fontMatch ?? null,
          baselineError,
          riseDetected: Math.abs(Number(paint?.state?.rise || 0)) > 0.0001
        }
      });

      if (paint?.pdfjs?.id) seenSourceIds.add(paint.pdfjs.id);
    }
  }

  for (const page of rawPages) {
    for (const textObject of page?.textObjects || []) {
      if (seenSourceIds.has(textObject.id)) continue;
      records.push({
        page: Number(page?.pageNumber || 0),
        sourceId: textObject.id,
        operatorId: null,
        text: textObject.text || "",
        pdfjs: {
          transform: textObject.transform || null,
          fontName: textObject.fontName || null,
          width: Number(textObject.width || 0),
          height: Number(textObject.height || 0)
        },
        reconstructedState: null,
        geometry: {
          bbox: textObject.bbox || null,
          baseline: textObject.bbox
            ? {
                start: [Number(textObject.bbox.x || 0), Number(textObject.bbox.y || 0) + Number(textObject.bbox.height || 0)],
                end: [Number(textObject.bbox.x || 0) + Number(textObject.bbox.width || 0), Number(textObject.bbox.y || 0) + Number(textObject.bbox.height || 0)]
              }
            : null,
          segments: []
        },
        differences: {
          transformError: null,
          fontMatch: null,
          baselineError: null,
          riseDetected: false,
          reason: "no_text_paint_match"
        }
      });
    }
  }

  return records;
}

function summary(records = [], tolerance = 0.02) {
  const textItems = records.length;
  const stateReconstructed = records.filter((item) => item.reconstructedState && (item.sourceId || item.operatorId)).length;
  const transformMatch = records.filter((item) => Number.isFinite(item?.differences?.transformError) && item.differences.transformError <= tolerance).length;
  const fontMatch = records.filter((item) => item?.differences?.fontMatch === true).length;
  const baselineMatch = records.filter((item) => Number.isFinite(item?.differences?.baselineError) && item.differences.baselineError <= 0.5).length;
  const riseDetected = records.filter((item) => item?.differences?.riseDetected).length;

  return {
    textItems,
    stateReconstructed,
    transformMatch,
    fontMatch,
    baselineMatch,
    riseDetected,
    transformTolerance: tolerance
  };
}

function buildHtml(rawPages = [], records = []) {
  const pageByNumber = new Map((rawPages || []).map((page) => [Number(page.pageNumber || 0), page]));
  const recordsByPage = new Map();
  for (const record of records) {
    if (!recordsByPage.has(record.page)) recordsByPage.set(record.page, []);
    const bucket = recordsByPage.get(record.page);
    bucket.push({ ...record, _debugIndex: bucket.length });
  }

  const pageMarkup = Array.from(recordsByPage.entries()).sort((a, b) => a[0] - b[0]).map(([pageNumber, items]) => {
    const page = pageByNumber.get(pageNumber);
    const width = Number(page?.geometry?.width || 600);
    const height = Number(page?.geometry?.height || 800);

    const boxes = items.map((item) => {
      const box = item?.geometry?.bbox;
      if (!box) return "";
      const label = `${item._debugIndex + 1}`;
      return `<button class="obj" data-key="${pageNumber}-${item._debugIndex}" style="left:${Number(box.x || 0).toFixed(2)}px;top:${Number(box.y || 0).toFixed(2)}px;width:${Math.max(1, Number(box.width || 0)).toFixed(2)}px;height:${Math.max(1, Number(box.height || 0)).toFixed(2)}px;">${label}</button>`;
    }).join("\n");

    return `<section class="page-wrap"><h2>Page ${pageNumber}</h2><div class="page" style="width:${width.toFixed(2)}px;height:${height.toFixed(2)}px;">${boxes}</div></section>`;
  }).join("\n");

  const payload = escapeHtml(JSON.stringify(recordsByPage.size ? Array.from(recordsByPage.values()).flat() : []));
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Text state debug</title>
  <style>
    body { margin: 0; background: #11161c; color: #e8edf3; font-family: "IBM Plex Sans", sans-serif; }
    .grid { display: grid; grid-template-columns: 1fr 420px; min-height: 100vh; }
    .left { padding: 1rem; overflow: auto; }
    .right { border-left: 1px solid #2a3340; padding: 1rem; overflow: auto; background: #141b23; }
    .page-wrap { margin-bottom: 1.2rem; }
    .page { position: relative; background: #fffdf9; border: 1px solid #384656; }
    .obj { position: absolute; border: 1px solid rgba(226, 92, 70, 0.95); background: rgba(226, 92, 70, 0.2); color: #2c0e08; font-size: 9px; cursor: pointer; overflow: hidden; }
    .obj.active { outline: 2px solid #ffd166; }
    pre { white-space: pre-wrap; word-break: break-word; background: #0d141c; border: 1px solid #2a3748; border-radius: 8px; padding: 0.7rem; }
  </style>
</head>
<body>
  <div class="grid">
    <div class="left">${pageMarkup}</div>
    <aside class="right">
      <h3>Text state inspector</h3>
      <p>Click any highlighted text object.</p>
      <pre id="output">No object selected.</pre>
    </aside>
  </div>
  <script type="application/json" id="records-json">${payload}</script>
  <script>
    const recordsPayload = document.getElementById("records-json");
    const records = JSON.parse(recordsPayload.textContent || "[]");
    const output = document.getElementById("output");
    const lookup = new Map();
    for (const record of records) {
      const key = String(record.page) + "-" + String(record._debugIndex);
      lookup.set(key, record);
    }

    for (const button of document.querySelectorAll(".obj")) {
      button.addEventListener("click", () => {
        document.querySelectorAll(".obj.active").forEach((el) => el.classList.remove("active"));
        button.classList.add("active");
        const key = button.getAttribute("data-key");
        const record = lookup.get(key);
        output.textContent = JSON.stringify(record || { error: "record not found", key }, null, 2);
      });
    }
  </script>
</body>
</html>`;
}

async function main() {
  await ensureDir(outputDir);
  const [textPaint, raw] = await Promise.all([
    readJson(textPaintFile),
    readJson(rawFile)
  ]);

  const records = buildRecords(textPaint?.pages || [], raw?.pages || []);
  const report = {
    generatedAt: new Date().toISOString(),
    sourceFile: textPaint?.sourceFile || null,
    summary: summary(records, 0.02),
    items: records
  };

  await writeJson(reportFile, report);
  await writeText(htmlFile, buildHtml(raw?.pages || [], records));

  console.log(JSON.stringify({
    reportFile,
    htmlFile,
    totals: report.summary
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
