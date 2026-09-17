import path from "node:path";
import { pathToFileURL } from "node:url";
import { access } from "node:fs/promises";
import { chromium } from "playwright";

const outputDir = path.join(process.cwd(), "output");
const reportPath = path.join(outputDir, "browser-validation.json");

function readCliOption(flagName) {
  const argv = process.argv.slice(2);
  const index = argv.findIndex((arg) => String(arg || "") === flagName);
  if (index < 0) return "";
  return String(argv[index + 1] || "").trim();
}

async function resolveHtmlPath() {
  const explicit = readCliOption("--html");
  if (explicit) return path.resolve(process.cwd(), explicit);

  const candidates = [
    path.join(outputDir, "document.semantic.html"),
    path.join(outputDir, "document.html")
  ];

  for (const candidate of candidates) {
    try {
      // Use first existing artifact, preferring semantic output.
      // eslint-disable-next-line no-await-in-loop
      await access(candidate);
      return candidate;
    } catch {
      // Continue to next candidate.
    }
  }

  return candidates[0];
}

async function main() {
  const htmlPath = await resolveHtmlPath();
  const pageErrors = [];
  const consoleErrors = [];

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on("pageerror", (err) => {
    pageErrors.push(String(err?.message || err));
  });

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "domcontentloaded", timeout: 30000 });

  const stats = await page.evaluate(() => {
    const textLength = (document.body?.innerText || "").trim().length;
    const equations = Array.from(document.querySelectorAll(".equation .eq-latex"));
    const tables = Array.from(document.querySelectorAll("table"));
    const figures = Array.from(document.querySelectorAll("figure img"));

    const equationsRendered = equations.filter((el) => (el.textContent || "").trim().length > 0).length;
    const tablesRendered = tables.filter((el) => (el.textContent || "").trim().length > 0).length;
    const imagesRendered = figures.filter((el) => {
      const src = (el.getAttribute("src") || "").trim();
      return src.length > 0;
    }).length;

    return {
      nonEmptyPage: textLength > 0,
      equationCount: equations.length,
      equationsRendered,
      tableCount: tables.length,
      tablesRendered,
      imageCount: figures.length,
      imagesRendered
    };
  });

  await browser.close();

  const status = pageErrors.length === 0
    && consoleErrors.length === 0
    && stats.nonEmptyPage
    && stats.equationsRendered === stats.equationCount
    && stats.tablesRendered === stats.tableCount
    && stats.imagesRendered === stats.imageCount
    ? "PASS"
    : "FAIL";

  const report = {
    status,
    htmlPath,
    consoleErrors,
    pageErrors,
    ...stats
  };

  await import("node:fs/promises").then(({ writeFile }) => writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"));
  console.log(JSON.stringify(report, null, 2));

  if (status !== "PASS") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
