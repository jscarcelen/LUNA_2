import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

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

  console.log("[FIDELITY-HTML] START");
  const browser = await withTimeout("launch-browser", 10000, () => chromium.launch({ headless: true }));
  const context = await withTimeout("create-context", 5000, () => browser.newContext({ viewport: { width: 1600, height: 2000 }, deviceScaleFactor: 1 }));
  try {
    const page = await withTimeout("create-page", 5000, () => context.newPage());
    await withTimeout("block-external", 5000, () => page.route("**/*", (route) => {
      const u = route.request().url();
      if (u.startsWith("file://") || u.startsWith("data:") || u.startsWith("blob:") || u.startsWith("about:")) route.continue();
      else route.abort("blockedbyclient");
    }));
    await withTimeout("load-html", 15000, () => page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load", timeout: 12000 }));
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
