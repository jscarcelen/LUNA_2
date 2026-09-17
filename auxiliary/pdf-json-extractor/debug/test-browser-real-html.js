import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const baseDir = process.cwd();
const htmlPath = path.join(baseDir, "output", "document.fidelity.html");
const outputPath = path.join(baseDir, "output", "fidelity", "debug-real-full.png");

async function main() {
  console.log("[HTML] 1 START");

  const browser = await chromium.launch({ headless: true });
  console.log("[HTML] 2 BROWSER_STARTED");

  const page = await browser.newPage();
  console.log("[HTML] 3 PAGE_CREATED");

  await page.setViewportSize({ width: 1275, height: 1650 });
  console.log("[HTML] 4 VIEWPORT_SET");

  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "domcontentloaded", timeout: 10000 });
  console.log("[HTML] 5 HTML_LOADED");

  await page.screenshot({ path: outputPath, type: "png", fullPage: false, timeout: 10000 });
  console.log("[HTML] 6 SCREENSHOT_COMPLETE");

  await browser.close();
  console.log("[HTML] 7 BROWSER_CLOSED");
  console.log("[HTML] COMPLETE");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
