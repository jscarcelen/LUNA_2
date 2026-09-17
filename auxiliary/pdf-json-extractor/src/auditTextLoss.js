import path from "node:path";
import { readFile } from "node:fs/promises";
import { ensureDir, escapeHtml, writeJson, writeText } from "./utils.js";

const outputDir = path.join(process.cwd(), "output");
const rawFile = path.join(outputDir, "raw-pages.json");
const lossFile = path.join(outputDir, "loss-accounting.json");
const jsonFile = path.join(outputDir, "text-loss.json");
const htmlFile = path.join(outputDir, "text-loss.html");

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function main() {
  await ensureDir(outputDir);
  const [raw, loss] = await Promise.all([readJson(rawFile), readJson(lossFile)]);
  const rawPages = Array.isArray(raw?.pages) ? raw.pages : [];
  const statuses = Array.isArray(loss?.statuses) ? loss.statuses : [];

  const statusById = new Map(statuses.map((row) => [row.sourceId, row]));
  const rows = [];

  for (const page of rawPages) {
    for (const text of page.textObjects || []) {
      const status = statusById.get(text.id) || null;
      const interpreted = status?.terminalStatus === "preserved+interpreted";
      if (interpreted) continue;

      const reason = status?.reason || "unhandled";
      rows.push({
        sourceId: text.id,
        page: page.pageNumber,
        text: text.text,
        bbox: text.bbox,
        reason,
        terminalStatus: status?.terminalStatus || "error"
      });
    }
  }

  const grouped = rows.reduce((acc, row) => {
    acc[row.reason] = (acc[row.reason] || 0) + 1;
    return acc;
  }, {});

  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      unrepresentedTextObjects: rows.length,
      byReason: grouped
    },
    items: rows
  };

  await writeJson(jsonFile, report);

  const cards = rows.map((row) => `<div class="item" style="left:${Number(row.bbox?.x || 0)}px;top:${Number(row.bbox?.y || 0)}px;width:${Math.max(2, Number(row.bbox?.width || 0))}px;height:${Math.max(2, Number(row.bbox?.height || 0))}px;" title="${escapeHtml(row.sourceId)} | ${escapeHtml(row.reason)}"></div>`).join("\n");

  await writeText(htmlFile, `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Text Loss</title>
<style>
body { margin: 0; font-family: sans-serif; background: #111; color: #eee; }
main { padding: 1rem; }
.page { position: relative; border: 1px solid #444; background: #fff; margin: 1rem 0; width: 595px; height: 842px; }
.item { position: absolute; border: 1px solid rgba(255,80,80,0.9); background: rgba(255,80,80,0.18); }
pre { white-space: pre-wrap; background: #1a1a1a; padding: 0.7rem; border-radius: 6px; }
</style></head><body><main>
<h1>Text Loss Overlay</h1>
<p>Total unrepresented text objects: ${rows.length}</p>
<div class="page">${cards}</div>
<pre>${escapeHtml(JSON.stringify(grouped, null, 2))}</pre>
</main></body></html>`);

  console.log(JSON.stringify({ jsonFile, htmlFile, unrepresentedTextObjects: rows.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
