import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";

function pageName(pageNumber) {
  return `page-${String(pageNumber).padStart(3, "0")}.png`;
}

async function withTimeout(stage, ms, fn) {
  console.log(`[FIDELITY] ${stage} START timeoutMs=${ms}`);
  const started = Date.now();
  let timer = null;
  try {
    const result = await Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`TIMEOUT stage=${stage} elapsedMs=${Date.now() - started}`)), ms);
      })
    ]);
    console.log(`[FIDELITY] ${stage} SUCCESS elapsedMs=${Date.now() - started}`);
    return result;
  } catch (error) {
    console.log(`[FIDELITY] ${stage} ERROR ${String(error?.message || error)}`);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function main() {
  const baseDir = process.cwd();
  const outputDir = path.join(baseDir, "output");
  const fidelityDir = path.join(outputDir, "fidelity");
  const htmlPath = path.join(outputDir, "document.fidelity.html");
  const docPath = path.join(outputDir, "document.json");
  const outPath = path.join(fidelityDir, "html-stage-page-001.png");

  const documentTree = JSON.parse(await withTimeout("test-html:read-document", 5000, () => readFile(docPath, "utf8")));
  const pageOne = (documentTree.pages || []).find((p) => Number(p.pageNumber) === 1);
  if (!pageOne) throw new Error("Page 1 missing in document.json");

  const dpr = 150 / 72;
  const browser = await withTimeout("test-html:browser-launch", 10000, () => chromium.launch({ headless: true }));
  const context = await withTimeout("test-html:context-create", 5000, () => browser.newContext({
    viewport: { width: 1800, height: 2200 },
    deviceScaleFactor: dpr
  }));

  try {
    const page = await withTimeout("test-html:page-create", 5000, () => context.newPage());
    await withTimeout("test-html:goto", 15000, () => page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" }));

    const locator = page.locator("#pdf-page-1");
    const box = await withTimeout("test-html:page1-bbox", 5000, () => locator.boundingBox());
    if (!box) throw new Error("Failed to get page 1 bounding box");

    const clip = {
      x: Math.max(0, Math.floor(box.x)),
      y: Math.max(0, Math.floor(box.y)),
      width: Math.max(1, Math.round(Number(pageOne.width || 0) * dpr)),
      height: Math.max(1, Math.round(Number(pageOne.height || 0) * dpr))
    };

    await withTimeout("test-html:screenshot", 10000, () => page.screenshot({ path: outPath, clip, animations: "disabled" }));

    await withTimeout("test-html:write-result", 3000, () => writeFile(path.join(fidelityDir, "html-stage-result.json"), `${JSON.stringify({ outPath, clip }, null, 2)}\n`, "utf8"));
    console.log(`[FIDELITY] test-html COMPLETE out=${outPath}`);
  } finally {
    await withTimeout("test-html:context-close", 5000, () => context.close());
    await withTimeout("test-html:browser-close", 5000, () => browser.close());
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
