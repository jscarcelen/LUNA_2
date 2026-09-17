import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";

const baseDir = process.cwd();
const htmlPath = path.join(baseDir, "output", "document.fidelity.html");
const docPath = path.join(baseDir, "output", "document.json");

async function runPage(pageNo) {
  const documentTree = JSON.parse(await readFile(docPath, "utf8"));
  const pageNode = (documentTree.pages || []).find((p) => Number(p.pageNumber) === Number(pageNo));
  if (!pageNode) throw new Error(`Page ${pageNo} missing`);

  const dpr = 150 / 72;
  const width = Math.max(1, Math.round(Number(pageNode.width || 0) * dpr));
  const height = Math.max(1, Math.round(Number(pageNode.height || 0) * dpr));

  console.log(`[HTML] PAGE_${pageNo} 1 START`);
  const browser = await chromium.launch({ headless: true });
  console.log(`[HTML] PAGE_${pageNo} 2 BROWSER_STARTED`);

  const page = await browser.newPage();
  console.log(`[HTML] PAGE_${pageNo} 3 PAGE_CREATED`);

  await page.setViewportSize({ width: Math.max(1275, width + 20), height: Math.max(1650, height + 20) });
  console.log(`[HTML] PAGE_${pageNo} 4 VIEWPORT_SET`);

  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "domcontentloaded", timeout: 10000 });
  console.log(`[HTML] PAGE_${pageNo} 5 HTML_LOADED`);

  const locator = page.locator(`#pdf-page-${pageNo}`);
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Page ${pageNo} bbox not found`);

  const outputPath = path.join(baseDir, "output", "fidelity", `debug-real-page-${String(pageNo).padStart(3, "0")}.png`);
  await page.screenshot({
    path: outputPath,
    type: "png",
    fullPage: false,
    timeout: 10000,
    clip: {
      x: Math.max(0, Math.floor(box.x)),
      y: Math.max(0, Math.floor(box.y)),
      width,
      height
    }
  });
  console.log(`[HTML] PAGE_${pageNo} 6 SCREENSHOT_COMPLETE`);

  await browser.close();
  console.log(`[HTML] PAGE_${pageNo} 7 BROWSER_CLOSED`);
  console.log(`[HTML] PAGE_${pageNo} COMPLETE`);
}

const pageNo = Number(process.argv[2] || 1);
runPage(pageNo).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
