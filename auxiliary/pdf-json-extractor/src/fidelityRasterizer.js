import path from "node:path";
import { promises as fsp } from "node:fs";
import { spawn } from "node:child_process";
import http from "node:http";
import { createCanvas } from "canvas";
import { chromium } from "playwright";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { PNG } from "pngjs";
import { ensureDir, readBinaryFile } from "./utils.js";

const FIDELITY_PREFIX = "[FIDELITY]";

function pageName(pageNumber) {
  return `page-${String(pageNumber).padStart(3, "0")}.png`;
}

function logStage(stage, state, detail = "") {
  const suffix = detail ? `: ${detail}` : "";
  console.log(`${FIDELITY_PREFIX} ${stage} ${state}${suffix}`);
}

async function withTimeout(stage, ms, work) {
  logStage(stage, "START", `timeoutMs=${ms}`);
  const started = Date.now();
  let timer = null;
  try {
    const result = await Promise.race([
      Promise.resolve().then(work),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const elapsed = Date.now() - started;
          const error = new Error(`FIDELITY TIMEOUT stage=${stage} elapsedMs=${elapsed}`);
          error.code = "FIDELITY_TIMEOUT";
          reject(error);
        }, ms);
      })
    ]);
    logStage(stage, "SUCCESS", `elapsedMs=${Date.now() - started}`);
    return result;
  } catch (error) {
    logStage(stage, "ERROR", String(error?.message || error));
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function commandInPath(cmd) {
  const pathValue = String(process.env.PATH || "");
  const parts = pathValue.split(path.delimiter).filter(Boolean);
  for (const part of parts) {
    const full = path.join(part, cmd);
    try {
      // eslint-disable-next-line no-await-in-loop
      const stat = await fsp.stat(full);
      if (stat.isFile()) return true;
    } catch {
      // continue
    }
  }
  return false;
}

async function runCommand(command, args, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 30000);
  const stage = options.stage || `subprocess:${command}`;
  return new Promise((resolve, reject) => {
    logStage(stage, "START", `${command} ${args.join(" ")}`);
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let killTimer = null;

    const done = (fn) => (value) => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      fn(value);
    };

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk || "");
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });

    child.on("error", done((error) => {
      logStage(stage, "ERROR", String(error?.message || error));
      reject(error);
    }));

    killTimer = setTimeout(() => {
      logStage(stage, "ERROR", `timeout after ${timeoutMs}ms; sending SIGTERM`);
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!settled) {
          logStage(stage, "ERROR", "process still alive; sending SIGKILL");
          child.kill("SIGKILL");
        }
      }, 1000);
    }, timeoutMs);

    child.on("close", done((code) => {
      if (code === 0) {
        logStage(stage, "SUCCESS", `exitCode=${code}`);
        resolve({ code, stdout, stderr });
      } else {
        const message = `${command} exited with code ${code}\n${stderr || stdout}`;
        logStage(stage, "ERROR", `exitCode=${code}`);
        reject(new Error(message));
      }
    }));

    child.on("exit", (code, signal) => {
      if (signal) {
        logStage(stage, "ERROR", `signal=${signal}`);
      } else {
        logStage(stage, "SUCCESS", `exit event code=${code}`);
      }
    });
  });
}

async function listRasters(dir) {
  const entries = await fsp.readdir(dir);
  const files = entries.filter((name) => /\.png$/i.test(name)).sort();
  return files.map((name, idx) => ({
    pageNumber: idx + 1,
    outFile: path.join(dir, name),
    fileName: name
  }));
}

async function enrichWithDimensions(rows) {
  const pages = [];
  for (const row of rows) {
    // eslint-disable-next-line no-await-in-loop
    const data = await fsp.readFile(row.outFile);
    const png = PNG.sync.read(data);
    pages.push({
      pageNumber: row.pageNumber,
      outFile: row.outFile,
      width: png.width,
      height: png.height
    });
  }
  return pages;
}

async function rasterizeWithPdftoppm(pdfPath, outputDirectory, dpi) {
  const prefix = path.join(outputDirectory, "page");
  await runCommand("pdftoppm", ["-png", "-r", String(dpi), pdfPath, prefix], { stage: "source-raster:pdftoppm", timeoutMs: 30000 });
  const pages = await enrichWithDimensions(await listRasters(outputDirectory));
  return {
    renderer: "pdftoppm",
    dpi,
    pageCount: pages.length,
    pages,
    config: {
      command: "pdftoppm",
      args: ["-png", "-r", String(dpi)]
    }
  };
}

async function rasterizeWithPdftocairo(pdfPath, outputDirectory, dpi) {
  const prefix = path.join(outputDirectory, "page");
  await runCommand("pdftocairo", ["-png", "-r", String(dpi), pdfPath, prefix], { stage: "source-raster:pdftocairo", timeoutMs: 30000 });
  const pages = await enrichWithDimensions(await listRasters(outputDirectory));
  return {
    renderer: "pdftocairo",
    dpi,
    pageCount: pages.length,
    pages,
    config: {
      command: "pdftocairo",
      args: ["-png", "-r", String(dpi)]
    }
  };
}

async function rasterizeWithMutool(pdfPath, outputDirectory, dpi) {
  const pattern = path.join(outputDirectory, "page-%03d.png");
  await runCommand("mutool", ["draw", "-r", String(dpi), "-o", pattern, pdfPath], { stage: "source-raster:mutool", timeoutMs: 30000 });
  const pages = await enrichWithDimensions(await listRasters(outputDirectory));
  return {
    renderer: "mutool",
    dpi,
    pageCount: pages.length,
    pages,
    config: {
      command: "mutool",
      args: ["draw", "-r", String(dpi), "-o", "page-%03d.png"]
    }
  };
}

async function rasterizeWithGhostscript(pdfPath, outputDirectory, dpi) {
  const pattern = path.join(outputDirectory, "page-%03d.png");
  await runCommand("gs", [
    "-dSAFER",
    "-dBATCH",
    "-dNOPAUSE",
    "-sDEVICE=png16m",
    `-r${dpi}`,
    `-sOutputFile=${pattern}`,
    pdfPath
  ], { stage: "source-raster:ghostscript", timeoutMs: 30000 });
  const pages = await enrichWithDimensions(await listRasters(outputDirectory));
  return {
    renderer: "ghostscript",
    dpi,
    pageCount: pages.length,
    pages,
    config: {
      command: "gs",
      args: ["-sDEVICE=png16m", `-r${dpi}`, "-dSAFER", "-dBATCH", "-dNOPAUSE"]
    }
  };
}

async function rasterizeWithPdfjsNodeCanvas(pdfPath, outputDirectory, dpi) {
  const sourceBuffer = await withTimeout("source-raster:read-pdf", 10000, () => readBinaryFile(pdfPath));
  const pdf = await withTimeout("source-raster:pdfjs-load", 30000, async () => {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(sourceBuffer),
      disableWorker: true,
      useSystemFonts: true,
      isEvalSupported: false
    });
    return loadingTask.promise;
  });

  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    // eslint-disable-next-line no-await-in-loop
    const page = await pdf.getPage(pageNumber);
    const scale = Number(dpi) / 72;
    const viewport = page.getViewport({ scale });

    const width = Math.max(1, Math.round(Number(viewport.width || 0)));
    const height = Math.max(1, Math.round(Number(viewport.height || 0)));
    const canvas = createCanvas(width, height);
    const canvasContext = canvas.getContext("2d");

    // eslint-disable-next-line no-await-in-loop
    await withTimeout(`source-raster:pdfjs-node-render-page-${pageNumber}`, 20000, () => page.render({ canvasContext, viewport }).promise);

    const outFile = path.join(outputDirectory, pageName(pageNumber));
    // eslint-disable-next-line no-await-in-loop
    await fsp.writeFile(outFile, canvas.toBuffer("image/png"));

    pages.push({
      pageNumber,
      width,
      height,
      outFile,
      sourceWidthPt: Number(viewport.width || 0) / scale,
      sourceHeightPt: Number(viewport.height || 0) / scale,
      rotation: Number(viewport.rotation || 0)
    });
  }

  return {
    renderer: "pdfjs-node-canvas",
    dpi,
    pageCount: pages.length,
    pages,
    config: {
      library: "pdfjs-dist/legacy + canvas",
      disableWorker: true,
      useSystemFonts: true,
      scale: Number(dpi) / 72
    }
  };
}

function createPdfJsServer(pdfBytes, pdfjsBuildDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const urlPath = String(req.url || "/").split("?")[0];
      if (urlPath === "/input.pdf") {
        res.writeHead(200, { "content-type": "application/pdf" });
        res.end(pdfBytes);
        return;
      }

      if (urlPath === "/render") {
        const html = `<!doctype html><html><head><meta charset="utf-8" /><style>html,body{margin:0;padding:0;background:#fff;}canvas{display:block;}</style></head><body><main id="root"></main><script type="module">import * as pdfjsLib from '/pdf.mjs'; try { pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs'; const loadingTask = pdfjsLib.getDocument({ url: '/input.pdf', disableWorker: false, useSystemFonts: true, isEvalSupported: false }); const pdf = await loadingTask.promise; const root = document.getElementById('root'); const pages = []; const scale = window.__rasterScale; for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) { const p = await pdf.getPage(pageNumber); const viewport = p.getViewport({ scale }); const canvas = document.createElement('canvas'); canvas.id = 'pdf-canvas-' + pageNumber; canvas.width = Math.max(1, Math.round(viewport.width)); canvas.height = Math.max(1, Math.round(viewport.height)); const ctx = canvas.getContext('2d', { alpha: false }); await p.render({ canvasContext: ctx, viewport }).promise; root.appendChild(canvas); pages.push({ pageNumber, width: canvas.width, height: canvas.height, rotation: viewport.rotation || 0 }); } window.__pdfRasterDone = { pages }; } catch (error) { window.__pdfRasterError = String(error && (error.stack || error.message || error)); }</script></body></html>`;
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      const safeRel = path.posix.normalize(urlPath).replace(/^\/+/, "");
      if (!safeRel || safeRel.includes("..")) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const full = path.join(pdfjsBuildDir, safeRel);
      if (!full.startsWith(pdfjsBuildDir)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      try {
        const data = await fsp.readFile(full);
        const ext = path.extname(full).toLowerCase();
        const mime = ext === ".mjs" ? "text/javascript" : ext === ".js" ? "text/javascript" : "application/octet-stream";
        res.writeHead(200, { "content-type": mime });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    server.on("error", (error) => {
      logStage("source-raster:pdfjs-http-server", "ERROR", String(error?.message || error));
      reject(error);
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to bind PDF.js local server"));
        return;
      }
      logStage("source-raster:pdfjs-http-server", "SUCCESS", `port=${address.port}`);
      resolve({ server, port: address.port });
    });
  });
}

async function rasterizeWithPdfjsPlaywrightHttp(pdfPath, outputDirectory, dpi) {
  const pdfBytes = await withTimeout("source-raster:http-read-pdf", 10000, () => fsp.readFile(pdfPath));
  const pdfjsBuildDir = path.join(process.cwd(), "node_modules", "pdfjs-dist", "build");
  const { server, port } = await withTimeout("source-raster:http-server-start", 10000, () => createPdfJsServer(pdfBytes, pdfjsBuildDir));

  let browser;
  let context;
  try {
    browser = await withTimeout("source-raster:http-browser-launch", 15000, () => chromium.launch({ headless: true }));
    context = await withTimeout("source-raster:http-context-create", 10000, () => browser.newContext({ viewport: { width: 2400, height: 2400 }, deviceScaleFactor: 1 }));
    const page = await withTimeout("source-raster:http-page-create", 10000, () => context.newPage());

    await withTimeout("source-raster:http-add-init-script", 5000, () => page.addInitScript((scale) => {
      window.__rasterScale = scale;
    }, Number(dpi) / 72));

    await withTimeout("source-raster:http-goto-render", 20000, () => page.goto(`http://127.0.0.1:${port}/render`, { waitUntil: "networkidle" }));
    await withTimeout("source-raster:http-wait-render-done", 30000, () => page.waitForFunction(() => Boolean(window.__pdfRasterDone || window.__pdfRasterError), null, { timeout: 25000 }));

    const err = await withTimeout("source-raster:http-check-render-error", 5000, () => page.evaluate(() => window.__pdfRasterError || null));
    if (err) throw new Error(`pdfjs-playwright-http render error: ${err}`);

    const done = await withTimeout("source-raster:http-read-render-result", 5000, () => page.evaluate(() => window.__pdfRasterDone || { pages: [] }));
    const pages = [];
    for (const row of done.pages || []) {
      const outFile = path.join(outputDirectory, pageName(row.pageNumber));
      // eslint-disable-next-line no-await-in-loop
      await withTimeout(`source-raster:http-screenshot-page-${row.pageNumber}`, 15000, () => page.locator(`#pdf-canvas-${row.pageNumber}`).screenshot({ path: outFile, animations: "disabled" }));
      pages.push({
        pageNumber: row.pageNumber,
        width: Number(row.width || 0),
        height: Number(row.height || 0),
        outFile,
        rotation: Number(row.rotation || 0)
      });
    }

    return {
      renderer: "pdfjs-playwright-http",
      dpi,
      pageCount: pages.length,
      pages,
      config: {
        disableWorker: true,
        useSystemFonts: true,
        scale: Number(dpi) / 72,
        viewport: { width: 2400, height: 2400 }
      }
    };
  } finally {
    if (context) {
      await withTimeout("source-raster:http-context-close", 5000, () => context.close());
    }
    if (browser) {
      await withTimeout("source-raster:http-browser-close", 5000, () => browser.close());
    }
    await withTimeout("source-raster:http-server-close", 5000, () => new Promise((resolve) => server.close(() => resolve())));
  }
}

export async function rasterizePdf(pdfPath, outputDirectory, options = {}) {
  const dpi = Number(options.dpi || 150);
  const expectedPageCount = Number(options.expectedPageCount || 0) || null;

  logStage("source-raster", "START", `pdf=${pdfPath} dpi=${dpi}`);
  await withTimeout("source-raster:ensure-output-dir", 5000, () => ensureDir(outputDirectory));
  const oldFiles = await withTimeout("source-raster:read-output-dir", 5000, () => fsp.readdir(outputDirectory));
  await withTimeout("source-raster:cleanup-old-png", 10000, () => Promise.all(oldFiles.filter((name) => /\.png$/i.test(name)).map((name) => fsp.rm(path.join(outputDirectory, name), { force: true }))));

  const hasPdftoppm = await withTimeout("source-raster:check-pdftoppm", 2000, () => commandInPath("pdftoppm"));
  if (hasPdftoppm) {
    const result = await rasterizeWithPdftoppm(pdfPath, outputDirectory, dpi);
    if (expectedPageCount && result.pageCount !== expectedPageCount) {
      throw new Error(`pdftoppm page count mismatch: expected ${expectedPageCount}, got ${result.pageCount}`);
    }
    logStage("source-raster", "SUCCESS", `renderer=${result.renderer} pages=${result.pageCount}`);
    return result;
  }

  const hasPdftocairo = await withTimeout("source-raster:check-pdftocairo", 2000, () => commandInPath("pdftocairo"));
  if (hasPdftocairo) {
    const result = await rasterizeWithPdftocairo(pdfPath, outputDirectory, dpi);
    if (expectedPageCount && result.pageCount !== expectedPageCount) {
      throw new Error(`pdftocairo page count mismatch: expected ${expectedPageCount}, got ${result.pageCount}`);
    }
    logStage("source-raster", "SUCCESS", `renderer=${result.renderer} pages=${result.pageCount}`);
    return result;
  }

  const hasMutool = await withTimeout("source-raster:check-mutool", 2000, () => commandInPath("mutool"));
  if (hasMutool) {
    const result = await rasterizeWithMutool(pdfPath, outputDirectory, dpi);
    if (expectedPageCount && result.pageCount !== expectedPageCount) {
      throw new Error(`mutool page count mismatch: expected ${expectedPageCount}, got ${result.pageCount}`);
    }
    logStage("source-raster", "SUCCESS", `renderer=${result.renderer} pages=${result.pageCount}`);
    return result;
  }

  const hasGs = await withTimeout("source-raster:check-gs", 2000, () => commandInPath("gs"));
  if (hasGs) {
    const result = await rasterizeWithGhostscript(pdfPath, outputDirectory, dpi);
    if (expectedPageCount && result.pageCount !== expectedPageCount) {
      throw new Error(`ghostscript page count mismatch: expected ${expectedPageCount}, got ${result.pageCount}`);
    }
    logStage("source-raster", "SUCCESS", `renderer=${result.renderer} pages=${result.pageCount}`);
    return result;
  }

  try {
    const result = await rasterizeWithPdfjsNodeCanvas(pdfPath, outputDirectory, dpi);
    if (expectedPageCount && result.pageCount !== expectedPageCount) {
      throw new Error(`pdfjs-node-canvas page count mismatch: expected ${expectedPageCount}, got ${result.pageCount}`);
    }
    logStage("source-raster", "SUCCESS", `renderer=${result.renderer} pages=${result.pageCount}`);
    return result;
  } catch (nodeCanvasError) {
    const result = await rasterizeWithPdfjsPlaywrightHttp(pdfPath, outputDirectory, dpi);
    if (expectedPageCount && result.pageCount !== expectedPageCount) {
      throw new Error(`pdfjs-playwright-http page count mismatch: expected ${expectedPageCount}, got ${result.pageCount}`);
    }
    result.config = {
      ...result.config,
      fallbackFrom: "pdfjs-node-canvas",
      fallbackReason: String(nodeCanvasError?.message || nodeCanvasError)
    };
    logStage("source-raster", "SUCCESS", `renderer=${result.renderer} pages=${result.pageCount}`);
    logStage("source-raster", "SUCCESS", `renderer=${result.renderer} pages=${result.pageCount}`);
    return result;
  }
}
