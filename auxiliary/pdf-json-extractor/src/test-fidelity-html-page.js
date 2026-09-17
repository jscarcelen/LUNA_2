import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";

async function withTimeout(stage, ms, fn) {
  console.log(`[FIDELITY-HTML] ${stage} START timeoutMs=${ms}`);
  const started = Date.now();
  let timer = null;
  try {
    const result = await Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`TIMEOUT stage=${stage} elapsedMs=${Date.now() - started}`)), ms);
      })
    ]);
    console.log(`[FIDELITY-HTML] ${stage} SUCCESS elapsedMs=${Date.now() - started}`);
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function main() {
  const baseDir = process.cwd();
  const htmlPath = path.join(baseDir, "output", "document.fidelity.html");
  const documentTree = JSON.parse(await readFile(path.join(baseDir, "output", "document.json"), "utf8"));
  const pageOne = (documentTree.pages || []).find((p) => Number(p.pageNumber) === 1);
  if (!pageOne) throw new Error("Page 1 missing");

  const dpr = 150 / 72;
  const browser = await withTimeout("launch-browser", 10000, () => chromium.launch({ headless: true }));
  const context = await withTimeout("create-context", 5000, () => browser.newContext({ viewport: { width: 1700, height: 2300 }, deviceScaleFactor: dpr }));
  try {
    const page = await withTimeout("create-page", 5000, () => context.newPage());
    await withTimeout("load-html", 15000, () => page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load", timeout: 12000 }));

    const locator = page.locator("#pdf-page-1");
    const box = await withTimeout("get-page1-bbox", 5000, () => locator.boundingBox());
    if (!box) throw new Error("Page 1 bbox not found");

    const clip = {
      x: Math.max(0, Math.floor(box.x)),
      y: Math.max(0, Math.floor(box.y)),
      width: Math.max(1, Math.round(Number(pageOne.width || 0) * dpr)),
      height: Math.max(1, Math.round(Number(pageOne.height || 0) * dpr))
    };

    const outPath = path.join(baseDir, "output", "fidelity", "html-page1-test.png");
    await withTimeout("screenshot-page1", 15000, () => page.screenshot({ path: outPath, clip, type: "png", animations: "disabled" }));
    console.log(`[FIDELITY-HTML] page1 screenshot complete ${outPath}`);
  } finally {
    await withTimeout("close-context", 5000, () => context.close());
    await withTimeout("close-browser", 5000, () => browser.close());
  }

  console.log("[FIDELITY-HTML] COMPLETE");
}

main().catch((error) => {
  console.log("[FIDELITY-HTML] ERROR", String(error?.stack || error?.message || error));
  process.exitCode = 1;
});
