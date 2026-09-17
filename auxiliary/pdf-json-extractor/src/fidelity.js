import path from "node:path";
import { pathToFileURL } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { ssim } from "ssim.js";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { ensureDir, escapeHtml, parseArgs, readBinaryFile, resolveProjectPath } from "./utils.js";
import { rasterizePdf } from "./fidelityRasterizer.js";

const baseDir = process.cwd();
const outputDir = path.join(baseDir, "output");
const fidelityDir = path.join(outputDir, "fidelity");
const DEFAULT_INPUT = resolveProjectPath("..", "..", "Statistics.pdf");
const FIDELITY_PREFIX = "[FIDELITY]";

function logStage(stage, state, detail = "") {
  const suffix = detail ? `: ${detail}` : "";
  console.log(`${FIDELITY_PREFIX} ${stage} ${state}${suffix}`);
}

function logHtmlStage(stage, state, detail = "") {
  const suffix = detail ? `: ${detail}` : "";
  console.log(`[FIDELITY-HTML] ${stage} ${state}${suffix}`);
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

function activeHandleNames() {
  const handles = typeof process._getActiveHandles === "function" ? process._getActiveHandles() : [];
  return handles.map((h) => h?.constructor?.name || typeof h);
}

function pageName(pageNumber) {
  return `page-${String(pageNumber).padStart(3, "0")}.png`;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value || 0)));
}

function intersectArea(a, b) {
  const x1 = Math.max(Number(a.x || 0), Number(b.x || 0));
  const y1 = Math.max(Number(a.y || 0), Number(b.y || 0));
  const x2 = Math.min(Number(a.x || 0) + Number(a.width || 0), Number(b.x || 0) + Number(b.width || 0));
  const y2 = Math.min(Number(a.y || 0) + Number(a.height || 0), Number(b.y || 0) + Number(b.height || 0));
  if (x2 <= x1 || y2 <= y1) return 0;
  return (x2 - x1) * (y2 - y1);
}

async function inspectPdfPageGeometry(sourceFile) {
  const bytes = await readBinaryFile(sourceFile);
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(bytes),
    disableWorker: true,
    useSystemFonts: true,
    isEvalSupported: false
  });
  const pdf = await loadingTask.promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    // eslint-disable-next-line no-await-in-loop
    const page = await pdf.getPage(pageNumber);
    const view = Array.isArray(page.view) ? page.view.map((v) => Number(v || 0)) : null;
    const widthPt = view ? Number(view[2] - view[0]) : Number(page.getViewport({ scale: 1 }).width || 0);
    const heightPt = view ? Number(view[3] - view[1]) : Number(page.getViewport({ scale: 1 }).height || 0);
    pages.push({
      page: pageNumber,
      pdf: {
        mediaBox: view,
        cropBox: view,
        bleedBox: null,
        trimBox: null,
        artBox: null,
        rotation: Number(page.rotate || 0),
        widthPt,
        heightPt
      }
    });
  }

  return pages;
}
async function rasterizeFidelityHtml(htmlPath, outDir, dpi, documentTree, sourceRasterPages) {
  console.log("[HTML] 1 START");
  await ensureDir(outDir);
  const recoveredAssetsDir = path.join(path.dirname(outDir), "recovered-assets");
  await ensureDir(recoveredAssetsDir);

  // Keep capture DPR integer to avoid Chromium subpixel rounding drift in element screenshots.
  const dpr = 2;
  const maxSourceWidthPx = Math.max(...(sourceRasterPages || []).map((p) => Number(p.width || 0)), 1200);
  const maxSourceHeightPx = Math.max(...(sourceRasterPages || []).map((p) => Number(p.height || 0)), 1600);
  const maxWidthCssPx = Math.ceil(maxSourceWidthPx / dpr);
  const maxHeightCssPx = Math.ceil(maxSourceHeightPx / dpr);

  const browser = await chromium.launch({ headless: true });
  console.log("[HTML] 2 BROWSER_STARTED");

  const page = await browser.newPage({
    viewport: {
      width: maxWidthCssPx + 32,
      height: maxHeightCssPx + 32
    },
    deviceScaleFactor: dpr
  });
  console.log("[HTML] 3 PAGE_CREATED");

  await page.setViewportSize({ width: maxWidthCssPx + 32, height: maxHeightCssPx + 32 });
  console.log("[HTML] 4 VIEWPORT_SET", maxWidthCssPx + 32, maxHeightCssPx + 32);

  const pages = [];
  try {
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "domcontentloaded", timeout: 10000 });
    console.log("[HTML] 5 HTML_LOADED");

    await page.addStyleTag({
      content: "html,body,main,.pdf-page-wrap{margin:0 !important;padding:0 !important;} .pdf-page{margin:0 !important;}"
    });

    for (const pageNode of documentTree.pages || []) {
      const sourcePage = (sourceRasterPages || []).find((row) => Number(row.pageNumber) === Number(pageNode.pageNumber));
      if (!sourcePage) throw new Error(`Missing source raster page ${pageNode.pageNumber}`);

      const sourcePng = readPng(sourcePage.outFile);
      const sourceScale = Number(sourcePng.width || 0) / Math.max(0.001, Number(pageNode.widthPt || pageNode.width || 1));

      const fallbackAssets = [];
      for (const node of pageNode.fidelityObjects || []) {
        const nodeId = String(node?.id || "");
        if (!nodeId || !node?.bbox) continue;
        const isMissingImage = node.type === "imagePaint" && !node.imageDataUri;
        if (!isMissingImage) continue;

        const cropBBox = toPixelBbox(node.bbox, sourceScale);
        const crop = cropPngRegion(sourcePng, cropBBox);
        const assetFile = path.join(recoveredAssetsDir, `${String(pageNode.pageNumber).padStart(3, "0")}-${nodeId}.png`);
        writePng(assetFile, crop);

        fallbackAssets.push({
          nodeId,
          kind: "image",
          assetUrl: pathToFileURL(assetFile).href
        });
      }

      await page.evaluate(({ assets }) => {
        for (const asset of assets || []) {
          const el = document.querySelector(`[data-node-id="${asset.nodeId}"]`);
          if (!el) continue;

          if (asset.kind === "image") {
            el.innerHTML = "";
            const img = document.createElement("img");
            img.src = asset.assetUrl;
            img.alt = asset.nodeId;
            img.style.display = "block";
            img.style.width = "100%";
            img.style.height = "100%";
            img.style.objectFit = "fill";
            el.appendChild(img);
            continue;
          }

        }
      }, { assets: fallbackAssets });

      const locator = page.locator(`#pdf-page-${pageNode.pageNumber}`);
      const fit = await page.evaluate(
        ({ pageNumber, sourceWidthPx, sourceHeightPx, captureDpr }) => {
          const pageEl = document.getElementById(`pdf-page-${pageNumber}`);
          if (!pageEl) return null;

          const naturalRect = pageEl.getBoundingClientRect();
          const targetWidthCssPx = Number(sourceWidthPx) / Number(captureDpr);
          const targetHeightCssPx = Number(sourceHeightPx) / Number(captureDpr);
          const scaleX = naturalRect.width > 0 ? targetWidthCssPx / naturalRect.width : 1;
          const scaleY = naturalRect.height > 0 ? targetHeightCssPx / naturalRect.height : 1;

          let inner = pageEl.querySelector(":scope > .__fidelity-scale-inner");
          if (!inner) {
            inner = document.createElement("div");
            inner.className = "__fidelity-scale-inner";
            inner.style.position = "absolute";
            inner.style.left = "0";
            inner.style.top = "0";
            inner.style.transformOrigin = "top left";
            while (pageEl.firstChild) {
              inner.appendChild(pageEl.firstChild);
            }
            pageEl.appendChild(inner);
          }

          pageEl.style.width = `${targetWidthCssPx}px`;
          pageEl.style.height = `${targetHeightCssPx}px`;
          pageEl.style.overflow = "hidden";
          inner.style.transform = `scale(${scaleX}, ${scaleY})`;

          return {
            naturalWidthCssPx: naturalRect.width,
            naturalHeightCssPx: naturalRect.height,
            targetWidthCssPx,
            targetHeightCssPx,
            scaleX,
            scaleY
          };
        },
        {
          pageNumber: pageNode.pageNumber,
          sourceWidthPx: Number(sourcePage.width || 0),
          sourceHeightPx: Number(sourcePage.height || 0),
          captureDpr: dpr
        }
      );
      if (!fit) throw new Error(`Unable to normalize HTML page geometry for page ${pageNode.pageNumber}`);

      const box = await locator.boundingBox();
      if (!box) throw new Error(`Unable to resolve HTML page box for page ${pageNode.pageNumber}`);

      const htmlNodes = await page.evaluate(({ pageNumber, deviceScaleFactor }) => {
        const root = document.getElementById(`pdf-page-${pageNumber}`);
        if (!root) return [];
        const rootRect = root.getBoundingClientRect();
        const nodes = [];
        for (const el of root.querySelectorAll("[data-node-id][data-visual-representation]")) {
          const id = el.getAttribute("data-node-id") || "";
          if (!id) continue;
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          const transform = style.transform && style.transform !== "none" ? style.transform : "matrix(1,0,0,1,0,0)";
          const m = transform.match(/matrix\(([^)]+)\)/);
          let scaleX = 1;
          let scaleY = 1;
          if (m) {
            const parts = m[1].split(",").map((v) => Number(v.trim() || 0));
            if (parts.length >= 4) {
              scaleX = Number(parts[0] || 1);
              scaleY = Number(parts[3] || 1);
            }
          }

          nodes.push({
            nodeId: id,
            bboxPx: {
              x: (rect.left - rootRect.left) * deviceScaleFactor,
              y: (rect.top - rootRect.top) * deviceScaleFactor,
              width: rect.width * deviceScaleFactor,
              height: rect.height * deviceScaleFactor
            },
            baseline: (rect.top - rootRect.top + rect.height) * deviceScaleFactor,
            computedStyle: {
              fontFamily: style.fontFamily,
              fontSizePx: Number.parseFloat(style.fontSize || "0") * deviceScaleFactor,
              fontWeight: style.fontWeight,
              fontStyle: style.fontStyle,
              letterSpacingPx: Number.parseFloat(style.letterSpacing || "0") * deviceScaleFactor,
              wordSpacingPx: Number.parseFloat(style.wordSpacing || "0") * deviceScaleFactor,
              lineHeightPx: Number.parseFloat(style.lineHeight || "0") * deviceScaleFactor,
              color: style.color,
              opacity: Number.parseFloat(style.opacity || "1")
            },
            transform: {
              matrix: transform,
              scaleX,
              scaleY
            },
            representation: {
              selected: el.getAttribute("data-representation") || el.getAttribute("data-visual-representation") || "unknown",
              visual: el.getAttribute("data-visual-representation") || "unknown",
              reason: el.getAttribute("data-representation-reason") || ""
            }
          });
        }
        return nodes;
      }, { pageNumber: pageNode.pageNumber, deviceScaleFactor: dpr });

      const outFile = path.join(outDir, pageName(pageNode.pageNumber));
      console.log(`[HTML] SCREENSHOT_START page=${pageNode.pageNumber}`);
      await locator.screenshot({ path: outFile, type: "png", timeout: 10000, animations: "disabled" });
      console.log(`[HTML] SCREENSHOT_COMPLETE page=${pageNode.pageNumber}`);

      const shot = readPng(outFile);
      if (shot.width !== Number(sourcePage.width || 0) || shot.height !== Number(sourcePage.height || 0)) {
        throw new Error(
          `HTML raster dimension mismatch on page ${pageNode.pageNumber}: html=${shot.width}x${shot.height}, source=${sourcePage.width}x${sourcePage.height}`
        );
      }

      pages.push({
        pageNumber: pageNode.pageNumber,
        cssBox: {
          x: Number(box.x || 0),
          y: Number(box.y || 0),
          width: Number(box.width || 0),
          height: Number(box.height || 0)
        },
        fit,
        htmlNodes,
        width: shot.width,
        height: shot.height,
        outFile
      });
    }
  } finally {
    await browser.close();
    console.log("[HTML] 7 BROWSER_CLOSED");
  }

  console.log("[HTML] COMPLETE");
  return {
    renderer: "Playwright Chromium minimal",
    dpi,
    deviceScaleFactor: dpr,
    cssPxPerPt: 96 / 72,
    viewport: {
      widthCssPx: maxWidthCssPx + 32,
      heightCssPx: maxHeightCssPx + 32
    },
    pages
  };
}

function readPng(filePath) {
  const data = PNG.sync.read(Buffer.from(readFileSync(filePath)));
  return data;
}

function findConnectedComponents(diffPng, threshold = 10) {
  const width = diffPng.width;
  const height = diffPng.height;
  const visited = new Uint8Array(width * height);
  const components = [];

  const isDiff = (x, y) => {
    const idx = (y * width + x) * 4;
    return diffPng.data[idx] > threshold || diffPng.data[idx + 1] > threshold || diffPng.data[idx + 2] > threshold;
  };

  const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (visited[start] || !isDiff(x, y)) continue;

      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      let pixels = 0;

      const queue = [start];
      visited[start] = 1;

      while (queue.length) {
        const cur = queue.pop();
        const cx = cur % width;
        const cy = Math.floor(cur / width);
        pixels += 1;
        minX = Math.min(minX, cx);
        minY = Math.min(minY, cy);
        maxX = Math.max(maxX, cx);
        maxY = Math.max(maxY, cy);

        for (const [dx, dy] of neighbors) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (visited[ni] || !isDiff(nx, ny)) continue;
          visited[ni] = 1;
          queue.push(ni);
        }
      }

      components.push({
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        pixels
      });
    }
  }

  return components;
}

function classifyDifference(component, pageModel, scale, diffRatio, pageNumber) {
  const bboxCanonical = {
    x: component.x / scale,
    y: component.y / scale,
    width: component.width / scale,
    height: component.height / scale
  };

  const candidates = (pageModel?.fidelityObjects || []).map((obj) => {
    const bbox = obj?.bbox || { x: 0, y: 0, width: 0, height: 0 };
    return {
      obj,
      overlap: intersectArea(bboxCanonical, bbox)
    };
  }).filter((row) => row.overlap > 0).sort((a, b) => b.overlap - a.overlap);

  const top = candidates[0]?.obj || null;
  let type = "UNKNOWN";
  let severity = "low";
  let likelyCause = "unmapped-difference";
  let rootCauseCategory = "interpretation_error";

  if (!top) {
    type = "UNKNOWN";
    severity = component.pixels > 400 ? "medium" : "low";
    likelyCause = "region-without-canonical-object";
    rootCauseCategory = "interpretation_error";
  } else if (top.type === "textPaint") {
    const rise = Number(top.textRise || 0);
    if (rise > 0.1) {
      type = "SUPERSCRIPT";
      likelyCause = "text-rise-positioning";
    } else if (rise < -0.1) {
      type = "SUBSCRIPT";
      likelyCause = "text-rise-positioning";
    } else {
      type = "TEXT_POSITION";
      likelyCause = "text-matrix-font-spacing-mismatch";
    }
    if (!top.font?.name || String(top.font.name).startsWith("g_d")) {
      type = "TEXT_FONT";
      likelyCause = "font-substitution-or-unresolved-pdf-font";
      rootCauseCategory = "source_information_loss";
    } else {
      rootCauseCategory = "html_rendering_error";
    }
    severity = component.pixels > 600 ? "high" : "medium";
  } else if (top.type === "imagePaint") {
    type = top.imageDataUri ? "IMAGE_POSITION" : "IMAGE_MISSING";
    likelyCause = top.imageDataUri ? "image-transform-or-size" : "image-bytes-unavailable";
    severity = "high";
    rootCauseCategory = top.imageDataUri ? "html_rendering_error" : "source_information_loss";
  } else if (top.type === "vectorPaint") {
    type = "VECTOR_MISSING";
    likelyCause = "vector-command-not-rendered-in-html";
    severity = "high";
    rootCauseCategory = "html_rendering_error";
  }

  if (diffRatio < 0.01) {
    type = "RASTERIZATION_ONLY";
    severity = "low";
    likelyCause = "anti-aliasing-and-subpixel-rasterization";
    rootCauseCategory = "rasterization_error";
  }

  return {
    page: pageNumber,
    bbox: {
      x: component.x,
      y: component.y,
      width: component.width,
      height: component.height
    },
    canonicalBbox: bboxCanonical,
    type,
    severity,
    likelyCause,
    rootCauseCategory,
    canonicalObjectId: top?.id || null,
    sourceRefs: top?.sourceRefs || [],
    sourceOperatorIndex: top?.sourceOperatorIndex ?? null,
    textState: top?.type === "textPaint" ? {
      font: top?.font || null,
      spacing: top?.spacing || null,
      textRise: top?.textRise ?? null,
      text: top?.text || ""
    } : null
  };
}

function buildHeatmap(basePng, diffPng) {
  const out = new PNG({ width: basePng.width, height: basePng.height });
  for (let i = 0; i < basePng.data.length; i += 4) {
    const r = basePng.data[i];
    const g = basePng.data[i + 1];
    const b = basePng.data[i + 2];
    const d = Math.max(diffPng.data[i], diffPng.data[i + 1], diffPng.data[i + 2]);
    out.data[i] = Math.min(255, r + d);
    out.data[i + 1] = Math.max(0, g - Math.floor(d * 0.5));
    out.data[i + 2] = Math.max(0, b - Math.floor(d * 0.5));
    out.data[i + 3] = 255;
  }
  return out;
}

function writePng(filePath, png) {
  const data = PNG.sync.write(png);
  writeFileSync(filePath, data);
}

function cropPngRegion(png, bbox) {
  const x = Math.max(0, Math.floor(Number(bbox?.x || 0)));
  const y = Math.max(0, Math.floor(Number(bbox?.y || 0)));
  if (x >= png.width || y >= png.height) {
    const blank = new PNG({ width: 1, height: 1 });
    blank.data[0] = 255;
    blank.data[1] = 255;
    blank.data[2] = 255;
    blank.data[3] = 0;
    return blank;
  }
  const width = Math.max(1, Math.min(png.width - x, Math.round(Number(bbox?.width || 1))));
  const height = Math.max(1, Math.min(png.height - y, Math.round(Number(bbox?.height || 1))));
  const out = new PNG({ width, height });

  for (let row = 0; row < height; row += 1) {
    const srcStart = ((y + row) * png.width + x) * 4;
    const srcEnd = srcStart + width * 4;
    const dstStart = row * width * 4;
    png.data.copy(out.data, dstStart, srcStart, srcEnd);
  }

  return out;
}

function mae(original, rendered) {
  let sum = 0;
  const pixels = original.width * original.height * 3;
  for (let i = 0; i < original.data.length; i += 4) {
    sum += Math.abs(original.data[i] - rendered.data[i]);
    sum += Math.abs(original.data[i + 1] - rendered.data[i + 1]);
    sum += Math.abs(original.data[i + 2] - rendered.data[i + 2]);
  }
  return sum / pixels;
}

function rmse(original, rendered) {
  let sumSq = 0;
  const pixels = original.width * original.height * 3;
  for (let i = 0; i < original.data.length; i += 4) {
    const dr = original.data[i] - rendered.data[i];
    const dg = original.data[i + 1] - rendered.data[i + 1];
    const db = original.data[i + 2] - rendered.data[i + 2];
    sumSq += dr * dr + dg * dg + db * db;
  }
  return Math.sqrt(sumSq / pixels);
}

function blendOverlay(source, html, alpha = 0.5) {
  const out = new PNG({ width: source.width, height: source.height });
  const a = clamp01(alpha);
  for (let i = 0; i < source.data.length; i += 4) {
    out.data[i] = Math.round(source.data[i] * (1 - a) + html.data[i] * a);
    out.data[i + 1] = Math.round(source.data[i + 1] * (1 - a) + html.data[i + 1] * a);
    out.data[i + 2] = Math.round(source.data[i + 2] * (1 - a) + html.data[i + 2] * a);
    out.data[i + 3] = 255;
  }
  return out;
}

function buildDiffMask(original, rendered, channelThreshold = 16) {
  const width = original.width;
  const height = original.height;
  const mask = new Uint8Array(width * height);
  let pixels = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const dr = Math.abs(original.data[idx] - rendered.data[idx]);
      const dg = Math.abs(original.data[idx + 1] - rendered.data[idx + 1]);
      const db = Math.abs(original.data[idx + 2] - rendered.data[idx + 2]);
      const isDifferent = dr > channelThreshold || dg > channelThreshold || db > channelThreshold;
      if (!isDifferent) continue;
      const mi = y * width + x;
      mask[mi] = 1;
      pixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  const bbox = pixels > 0
    ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
    : { x: 0, y: 0, width: 0, height: 0 };

  return { mask, pixels, bbox };
}

function toPixelBbox(bbox, scale) {
  return {
    x: Math.max(0, Math.floor(Number(bbox?.x || 0) * scale)),
    y: Math.max(0, Math.floor(Number(bbox?.y || 0) * scale)),
    width: Math.max(1, Math.round(Number(bbox?.width || 0) * scale)),
    height: Math.max(1, Math.round(Number(bbox?.height || 0) * scale))
  };
}

function countMaskPixelsInBbox(mask, width, height, bbox) {
  const x1 = Math.max(0, Math.floor(Number(bbox?.x || 0)));
  const y1 = Math.max(0, Math.floor(Number(bbox?.y || 0)));
  const x2 = Math.min(width, x1 + Math.max(0, Math.floor(Number(bbox?.width || 0))));
  const y2 = Math.min(height, y1 + Math.max(0, Math.floor(Number(bbox?.height || 0))));
  if (x2 <= x1 || y2 <= y1) return 0;
  let count = 0;
  for (let y = y1; y < y2; y += 1) {
    const row = y * width;
    for (let x = x1; x < x2; x += 1) {
      count += mask[row + x];
    }
  }
  return count;
}

function markCoverage(coverage, width, height, bbox) {
  const x1 = Math.max(0, Math.floor(Number(bbox?.x || 0)));
  const y1 = Math.max(0, Math.floor(Number(bbox?.y || 0)));
  const x2 = Math.min(width, x1 + Math.max(0, Math.floor(Number(bbox?.width || 0))));
  const y2 = Math.min(height, y1 + Math.max(0, Math.floor(Number(bbox?.height || 0))));
  if (x2 <= x1 || y2 <= y1) return;
  for (let y = y1; y < y2; y += 1) {
    const row = y * width;
    for (let x = x1; x < x2; x += 1) {
      coverage[row + x] = 1;
    }
  }
}

function classifyNodeMismatch(node, nodeDiff, htmlNode, sourceBoxPx) {
  const categories = new Set();
  const type = String(node?.type || "unknown");
  const absDx = Math.abs(Number(nodeDiff?.positionError?.dx || 0));
  const absDy = Math.abs(Number(nodeDiff?.positionError?.dy || 0));
  const absDw = Math.abs(Number(nodeDiff?.sizeError?.dw || 0));
  const absDh = Math.abs(Number(nodeDiff?.sizeError?.dh || 0));

  if (!htmlNode) {
    categories.add("MISSING CONTENT");
  }

  if (absDx > 1 || absDy > 1) categories.add("TEXT POSITION");
  if (absDw > 1 || absDh > 1) categories.add("GLOBAL SCALE");

  if (type === "textPaint") {
    categories.add("TEXT POSITION");
    const rise = Number(node?.textRise || 0);
    if (rise > 0.1 || rise < -0.1) categories.add("SUPERSCRIPT / SUBSCRIPT");

    const sourceFontName = String(node?.font?.name || "");
    const htmlFontFamily = String(htmlNode?.computedStyle?.fontFamily || "");
    if (sourceFontName.startsWith("g_") || htmlFontFamily.includes("sans-serif") || htmlFontFamily.includes("serif")) {
      categories.add("FONT FAMILY");
    }

    const expectedPx = Number(node?.font?.size || sourceBoxPx?.height || 0);
    const htmlPx = Number(htmlNode?.computedStyle?.fontSizePx || expectedPx);
    if (Math.abs(expectedPx - htmlPx) > 0.75) categories.add("FONT SIZE");

    const srcScaleX = Number(node?.spacing?.horizontalScale || 100) / 100;
    const htmlScaleX = Number(htmlNode?.transform?.scaleX || srcScaleX);
    if (Math.abs(srcScaleX - htmlScaleX) > 0.01) categories.add("FONT METRICS");

    const srcBaseline = Number(node?.baseline || 0);
    const htmlBaseline = Number(htmlNode?.baseline || srcBaseline);
    if (Math.abs(srcBaseline - htmlBaseline) > 0.75) categories.add("TEXT BASELINE");

    if (Number(node?.transform?.rotation || 0) !== 0) categories.add("MATH");
  }

  if (type === "imagePaint") {
    categories.add("IMAGE");
    if (!node?.imageDataUri) categories.add("MISSING CONTENT");
  }

  if (type === "vectorPaint") {
    categories.add("VECTOR");
    categories.add("LINE / BORDER");
  }

  if (type === "header") categories.add("HEADER");
  if (type === "footer") categories.add("FOOTER");
  if (type === "pageNumber") categories.add("PAGE NUMBER");

  if (!categories.size && Number(nodeDiff?.pixelDifference || 0) > 0) {
    categories.add("COLOR");
  }

  return [...categories];
}

function summarizeClassification(nodeRows, extraPixels, totalDiffPixels) {
  const labels = [
    "GLOBAL SCALE",
    "GLOBAL TRANSLATION",
    "TEXT POSITION",
    "TEXT BASELINE",
    "FONT METRICS",
    "FONT FAMILY",
    "FONT SIZE",
    "SUPERSCRIPT / SUBSCRIPT",
    "MATH",
    "IMAGE",
    "VECTOR",
    "LINE / BORDER",
    "HEADER",
    "FOOTER",
    "PAGE NUMBER",
    "COLOR",
    "OPACITY",
    "MISSING CONTENT",
    "EXTRA CONTENT",
    "CLIPPING"
  ];

  const weights = Object.fromEntries(labels.map((label) => [label, 0]));
  for (const row of nodeRows) {
    const value = Number(row.pixelDifference || 0);
    for (const cat of row.classification || []) {
      if (!Object.hasOwn(weights, cat)) continue;
      weights[cat] += value;
    }
  }
  weights["EXTRA CONTENT"] += Number(extraPixels || 0);

  const denominator = Math.max(1, Number(totalDiffPixels || 0));
  const ranked = labels
    .map((label) => ({
      label,
      diffPixels: weights[label],
      ratio: weights[label] / denominator,
      percent: (weights[label] / denominator) * 100
    }))
    .sort((a, b) => b.diffPixels - a.diffPixels);

  return {
    labels,
    ranked,
    weights
  };
}

function buildReportHtml(report) {
  const pageCards = (report.pages || []).map((page) => {
    const rows = (page.differences || []).slice(0, 30).map((d, idx) => `<tr data-diag='${escapeHtml(JSON.stringify(d))}'><td>${idx + 1}</td><td>${d.type}</td><td>${d.severity}</td><td>${d.likelyCause}</td><td>${d.bbox.x},${d.bbox.y},${d.bbox.width},${d.bbox.height}</td></tr>`).join("\n");
    return `<section class="card">
      <h2>Page ${page.page}</h2>
      <div class="quad">
        <figure><figcaption>Source PDF</figcaption><img src="./source/${pageName(page.page)}" /></figure>
        <figure><figcaption>HTML</figcaption><img src="./html/${pageName(page.page)}" /></figure>
        <figure><figcaption>Diff</figcaption><img src="./diff/${pageName(page.page)}" /></figure>
        <figure><figcaption>Overlay 50/50</figcaption><img src="./overlay/${pageName(page.page)}" /></figure>
        <figure><figcaption>Heatmap</figcaption><img src="./heatmaps/${pageName(page.page)}" /></figure>
      </div>
      <p>Status: ${page.status.toUpperCase()} | Diff: ${(page.pixelDifferenceRatio * 100).toFixed(3)}% | Identical: ${(page.identicalPixelRatio * 100).toFixed(3)}% | SSIM: ${page.ssim.toFixed(6)} | MAE: ${page.mae.toFixed(4)} | RMSE: ${page.rmse.toFixed(4)} | Diff BBox: ${page.diffBoundingBox.x},${page.diffBoundingBox.y},${page.diffBoundingBox.width},${page.diffBoundingBox.height}</p>
      <table><thead><tr><th>#</th><th>Type</th><th>Severity</th><th>Likely cause</th><th>BBox</th></tr></thead><tbody>${rows}</tbody></table>
    </section>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Fidelity Report</title>
  <style>
    body{margin:0;background:#0f141a;color:#e8edf3;font-family:system-ui,sans-serif;}
    main{max-width:1300px;margin:0 auto;padding:1rem;}
    .card{background:#161d26;border:1px solid #2a3645;border-radius:10px;padding:0.9rem;margin-bottom:1rem;}
    .quad{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:0.7rem;}
    figure{margin:0;background:#0c1117;border:1px solid #2a3645;border-radius:8px;padding:0.4rem;}
    img{width:100%;height:auto;display:block;background:#fff;}
    table{width:100%;border-collapse:collapse;margin-top:0.7rem;}
    th,td{border:1px solid #2a3645;padding:0.35rem 0.4rem;font-size:12px;}
    tr:hover{background:#203047;cursor:pointer;}
    pre{white-space:pre-wrap;background:#0b1117;border:1px solid #2a3645;border-radius:8px;padding:0.7rem;}
  </style>
</head>
<body>
<main>
  <h1>PDF vs Fidelity HTML report</h1>
  <p>PDF renderer: ${escapeHtml(report.renderers.pdf)} | HTML renderer: ${escapeHtml(report.renderers.html)} | DPI: ${report.dpi}</p>
  ${pageCards}
  <h2>Selected difference</h2>
  <pre id="diag-out">Click a row above.</pre>
</main>
<script>
for (const row of document.querySelectorAll('tbody tr')) {
  row.addEventListener('click', () => {
    const payload = row.getAttribute('data-diag');
    document.getElementById('diag-out').textContent = JSON.stringify(JSON.parse(payload), null, 2);
  });
}
</script>
</body>
</html>`;
}

async function main() {
  logStage("START", "START");
  const args = parseArgs(process.argv.slice(2));
  const sourceFile = args.input ? path.resolve(baseDir, args.input) : DEFAULT_INPUT;
  const primaryDpi = 150;
  const secondaryDpi = 300;

  const sourceDir = path.join(fidelityDir, "source");
  const htmlDir = path.join(fidelityDir, "html");
  const diffDir = path.join(fidelityDir, "diff");
  const overlayDir = path.join(fidelityDir, "overlay");
  const heatmapDir = path.join(fidelityDir, "heatmaps");
  const source300Dir = path.join(fidelityDir, "source-300");
  const html300Dir = path.join(fidelityDir, "html-300");
  const geometryDiagnosticsFile = path.join(fidelityDir, "page-geometry-diagnostics.json");
  const metricsFile = path.join(fidelityDir, "metrics.json");
  const diagnosticsFile = path.join(fidelityDir, "fidelity-diagnostics.json");
  const nodeDiagnosticsFile = path.join(fidelityDir, "node-fidelity-report.json");
  const classificationFile = path.join(fidelityDir, "error-classification.json");
  const pageSummaryFile = path.join(fidelityDir, "page-fidelity-summary.json");
  const fidelityJsonFile = path.join(fidelityDir, "fidelity-report.json");
  const fidelityHtmlFile = path.join(fidelityDir, "fidelity-report.html");

  await withTimeout("prepare-directories", 10000, () => Promise.all([ensureDir(fidelityDir), ensureDir(sourceDir), ensureDir(htmlDir), ensureDir(diffDir), ensureDir(overlayDir), ensureDir(heatmapDir), ensureDir(source300Dir), ensureDir(html300Dir)]));

  const documentTree = JSON.parse(await withTimeout("read-document-json", 5000, () => readFile(path.join(outputDir, "document.json"), "utf8")));
  const fidelityHtml = path.join(outputDir, "document.fidelity.html");
  const pdfGeometry = await withTimeout("read-pdf-geometry", 20000, () => inspectPdfPageGeometry(sourceFile));

  const expectedPages = Number((documentTree.pages || []).length || 0);
  const sourceRaster = await withTimeout("source-raster:primary", 45000, () => rasterizePdf(sourceFile, sourceDir, { dpi: primaryDpi, expectedPageCount: expectedPages }));
  const htmlRaster = await withTimeout("html-raster:primary", 45000, () => rasterizeFidelityHtml(fidelityHtml, htmlDir, primaryDpi, documentTree, sourceRaster.pages));

  const geometryDiagnostics = (documentTree.pages || []).map((page) => {
    const pageNumber = Number(page.pageNumber || 0);
    const pdfInfo = pdfGeometry.find((row) => Number(row.page) === pageNumber)?.pdf || {};
    const sourceInfo = sourceRaster.pages.find((row) => Number(row.pageNumber) === pageNumber) || {};
    const htmlInfo = htmlRaster.pages.find((row) => Number(row.pageNumber) === pageNumber) || {};
    return {
      page: pageNumber,
      pdf: {
        mediaBox: pdfInfo.mediaBox || null,
        cropBox: pdfInfo.cropBox || null,
        bleedBox: pdfInfo.bleedBox || null,
        trimBox: pdfInfo.trimBox || null,
        artBox: pdfInfo.artBox || null,
        rotation: Number(pdfInfo.rotation || page.rotation || 0),
        widthPt: Number(pdfInfo.widthPt || page.widthPt || page.width || 0),
        heightPt: Number(pdfInfo.heightPt || page.heightPt || page.height || 0)
      },
      canonical: {
        widthPt: Number(page.widthPt || page.width || 0),
        heightPt: Number(page.heightPt || page.height || 0),
        coordinateSystem: page.coordinateSystem || "pdf-points"
      },
      html: {
        cssWidthPt: Number(page.widthPt || page.width || 0),
        cssHeightPt: Number(page.heightPt || page.height || 0),
        viewportWidthCssPx: Number(htmlRaster.viewport?.widthCssPx || 0),
        viewportHeightCssPx: Number(htmlRaster.viewport?.heightCssPx || 0),
        pageBoxCssPx: htmlInfo.cssBox || null,
        deviceScaleFactor: Number(htmlRaster.deviceScaleFactor || 0)
      },
      raster: {
        sourceWidthPx: Number(sourceInfo.width || 0),
        sourceHeightPx: Number(sourceInfo.height || 0),
        htmlWidthPx: Number(htmlInfo.width || 0),
        htmlHeightPx: Number(htmlInfo.height || 0)
      }
    };
  });

  // Secondary DPI rasterization for diagnostics reference.
  await withTimeout("source-raster:secondary", 45000, () => rasterizePdf(sourceFile, source300Dir, { dpi: secondaryDpi, expectedPageCount: expectedPages }));
  await withTimeout("html-raster:secondary", 45000, () => rasterizeFidelityHtml(fidelityHtml, html300Dir, secondaryDpi, documentTree, sourceRaster.pages.map((row) => ({
    ...row,
    width: Math.round((Number(row.width || 0) * secondaryDpi) / primaryDpi),
    height: Math.round((Number(row.height || 0) * secondaryDpi) / primaryDpi)
  }))));

  const pages = [];
  const diagnostics = [];
  const nodeDiagnostics = [];
  const pageSummaries = [];
  const allCategoryRows = [];

  for (const page of documentTree.pages || []) {
    logStage(`compare:page-${page.pageNumber}`, "START");
    const name = pageName(page.pageNumber);
    const originalPng = readPng(path.join(sourceDir, name));
    let htmlPng = readPng(path.join(htmlDir, name));

    if (originalPng.width !== htmlPng.width || originalPng.height !== htmlPng.height) {
      throw new Error(`Page dimension mismatch during comparison for page ${page.pageNumber}: source=${originalPng.width}x${originalPng.height}, html=${htmlPng.width}x${htmlPng.height}`);
    }

    const width = originalPng.width;
    const height = originalPng.height;

    const diffPng = new PNG({ width, height });
    const differentPixels = pixelmatch(originalPng.data, htmlPng.data, diffPng.data, width, height, {
      threshold: 0.1,
      includeAA: true,
      alpha: 0.8,
      diffColor: [255, 0, 0]
    });

    const totalPixels = width * height;
    const pixelDifferenceRatio = totalPixels ? differentPixels / totalPixels : 0;
    const identicalPixelRatio = clamp01(1 - pixelDifferenceRatio);
    const maeValue = mae(originalPng, htmlPng);
    const rmseValue = rmse(originalPng, htmlPng);
    const diffMask = buildDiffMask(originalPng, htmlPng, 12);

    let ssimValue = 0;
    try {
      const score = ssim(
        { data: originalPng.data, width, height },
        { data: htmlPng.data, width, height }
      );
      ssimValue = Number(score?.mssim || 0);
    } catch {
      ssimValue = 0;
    }

    const diffFile = path.join(diffDir, name);
    const heatFile = path.join(heatmapDir, name);
    const overlayFile = path.join(overlayDir, name);
    writePng(diffFile, diffPng);
    writePng(heatFile, buildHeatmap(originalPng, diffPng));
    writePng(overlayFile, blendOverlay(originalPng, htmlPng, 0.5));

    const components = findConnectedComponents(diffPng)
      .filter((item) => item.pixels >= 24)
      .sort((a, b) => b.pixels - a.pixels)
      .slice(0, 120);

    const scale = primaryDpi / 72;
    const pageDiffs = components.map((component) => classifyDifference(component, page, scale, pixelDifferenceRatio, page.pageNumber));
    diagnostics.push(...pageDiffs);

    const htmlPage = (htmlRaster.pages || []).find((item) => Number(item.pageNumber) === Number(page.pageNumber)) || null;
    const htmlNodeLookup = new Map((htmlPage?.htmlNodes || []).map((item) => [String(item.nodeId), item]));
    const sourceNodes = Array.isArray(page.fidelityObjects) ? page.fidelityObjects : [];
    const coverage = new Uint8Array(width * height);
    const nodeRows = [];

    for (const node of sourceNodes) {
      const sourceBBoxPx = toPixelBbox(node?.bbox || { x: 0, y: 0, width: 0, height: 0 }, scale);
      markCoverage(coverage, width, height, sourceBBoxPx);

      const htmlNode = htmlNodeLookup.get(String(node?.id || "")) || null;
      const htmlBBoxPx = htmlNode?.bboxPx ? {
        x: Number(htmlNode.bboxPx.x || 0),
        y: Number(htmlNode.bboxPx.y || 0),
        width: Number(htmlNode.bboxPx.width || 0),
        height: Number(htmlNode.bboxPx.height || 0)
      } : null;

      const dx = htmlBBoxPx ? htmlBBoxPx.x - sourceBBoxPx.x : null;
      const dy = htmlBBoxPx ? htmlBBoxPx.y - sourceBBoxPx.y : null;
      const dw = htmlBBoxPx ? htmlBBoxPx.width - sourceBBoxPx.width : null;
      const dh = htmlBBoxPx ? htmlBBoxPx.height - sourceBBoxPx.height : null;

      const nodeDiffPixels = countMaskPixelsInBbox(diffMask.mask, width, height, sourceBBoxPx);
      const nodeArea = Math.max(1, sourceBBoxPx.width * sourceBBoxPx.height);
      const nodeDiffRatio = nodeDiffPixels / nodeArea;

      let status = "match";
      if (!htmlBBoxPx) {
        status = "missing";
      } else if (Math.abs(Number(dw || 0)) > 1 || Math.abs(Number(dh || 0)) > 1) {
        status = "resized";
      } else if (Math.abs(Number(dx || 0)) > 1 || Math.abs(Number(dy || 0)) > 1) {
        status = "shifted";
      } else if (nodeDiffRatio > 0.08) {
        status = "shifted";
      }

      const row = {
        page: page.pageNumber,
        nodeId: String(node?.id || ""),
        type: String(node?.type || "unknown"),
        sourceType: String(node?.type || "unknown"),
        sourceBBox: sourceBBoxPx,
        htmlBBox: htmlBBoxPx,
        positionError: {
          dx: dx === null ? null : Number(dx.toFixed(3)),
          dy: dy === null ? null : Number(dy.toFixed(3))
        },
        sizeError: {
          dw: dw === null ? null : Number(dw.toFixed(3)),
          dh: dh === null ? null : Number(dh.toFixed(3))
        },
        pixelDifference: nodeDiffPixels,
        pixelDifferenceRatio: Number(nodeDiffRatio.toFixed(6)),
        geometryError: {
          dx: dx === null ? null : Number(Math.abs(dx).toFixed(6)),
          dy: dy === null ? null : Number(Math.abs(dy).toFixed(6)),
          dw: dw === null ? null : Number(Math.abs(dw).toFixed(6)),
          dh: dh === null ? null : Number(Math.abs(dh).toFixed(6))
        },
        visualError: Number(nodeDiffRatio.toFixed(6)),
        semanticCoverage: node?.type === "textPaint" ? 1 : (node?.type === "imagePaint" ? 1 : 0),
        provenanceCoverage: Array.isArray(node?.sourceRefs) && node.sourceRefs.length ? 1 : 0,
        status,
        representation: htmlNode?.representation?.selected || "unknown",
        semanticRepresentation: node?.type === "textPaint" ? "html-text" : (node?.type === "imagePaint" ? "image-node" : "vector-node"),
        visualRepresentation: htmlNode?.representation?.visual || "unknown",
        representationReason: htmlNode?.representation?.reason || "",
        sourceRefs: node?.sourceRefs || [],
        sourceOperatorIndex: node?.sourceOperatorIndex ?? null,
        textState: node?.type === "textPaint" ? {
          font: node?.font || null,
          spacing: node?.spacing || null,
          textRise: node?.textRise ?? null,
          transform: node?.transform || null,
          baseline: node?.baseline ?? null,
          text: node?.text || ""
        } : null,
        htmlState: htmlNode ? {
          baseline: htmlNode?.baseline ?? null,
          computedStyle: htmlNode?.computedStyle || null,
          transform: htmlNode?.transform || null
        } : null
      };

      row.classification = classifyNodeMismatch(node, row, htmlNode, sourceBBoxPx);
      nodeRows.push(row);
      nodeDiagnostics.push(row);
      allCategoryRows.push(row);
    }

    let uncoveredDiffPixels = 0;
    for (let i = 0; i < diffMask.mask.length; i += 1) {
      if (diffMask.mask[i] && !coverage[i]) uncoveredDiffPixels += 1;
    }

    const classSummary = summarizeClassification(nodeRows, uncoveredDiffPixels, diffMask.pixels || differentPixels);
    const typeSummary = {};
    const representationSummary = {};
    for (const row of nodeRows) {
      const key = row.type;
      if (!typeSummary[key]) {
        typeSummary[key] = { count: 0, totalPixelDifference: 0, match: 0, shifted: 0, resized: 0, missing: 0, extra: 0 };
      }
      typeSummary[key].count += 1;
      typeSummary[key].totalPixelDifference += Number(row.pixelDifference || 0);
      typeSummary[key][row.status] = (typeSummary[key][row.status] || 0) + 1;

      const repKey = String(row.representation || "unknown");
      if (!representationSummary[repKey]) {
        representationSummary[repKey] = {
          nodes: 0,
          diffPixels: 0,
          avgVisualError: 0,
          maxVisualError: 0
        };
      }
      representationSummary[repKey].nodes += 1;
      representationSummary[repKey].diffPixels += Number(row.pixelDifference || 0);
      representationSummary[repKey].avgVisualError += Number(row.visualError || 0);
      representationSummary[repKey].maxVisualError = Math.max(representationSummary[repKey].maxVisualError, Number(row.visualError || 0));
    }
    for (const value of Object.values(representationSummary)) {
      value.avgVisualError = value.nodes ? Number((value.avgVisualError / value.nodes).toFixed(6)) : 0;
    }

    const textSummary = documentTree?.statistics?.textPaint || {};
    const textFidelity = Number(textSummary.textPaintObjects || 0) ? Number(textSummary.transformMatches || 0) / Number(textSummary.textPaintObjects || 1) : 0;
    const images = (page.fidelityObjects || []).filter((obj) => obj.type === "imagePaint");
    const vectors = (page.fidelityObjects || []).filter((obj) => obj.type === "vectorPaint");
    const imageFidelity = images.length ? images.filter((item) => item.imageDataUri).length / images.length : 1;
    const vectorFidelity = vectors.length ? 0 : 1;
    const geometryFidelity = clamp01(1 - pixelDifferenceRatio * 2);
    const significantPageDiffs = pageDiffs.filter((d) => d.severity === "high" || d.severity === "medium");
    const pageStatus = significantPageDiffs.length === 0 ? "pass" : "fail";

    pages.push({
      page: page.pageNumber,
      width,
      height,
      differentPixels,
      totalPixels,
      pixelDifferenceRatio,
      identicalPixelRatio,
      ssim: ssimValue,
      mae: maeValue,
      rmse: rmseValue,
      diffBoundingBox: diffMask.bbox,
      status: pageStatus,
      geometryFidelity,
      textFidelity,
      imageFidelity,
      vectorFidelity,
      uncoveredDiffPixels,
      classification: classSummary,
      typeSummary,
      representationSummary,
      differences: pageDiffs
    });
    pageSummaries.push({
      page: page.pageNumber,
      width,
      height,
      pixelDifferencePercent: Number((pixelDifferenceRatio * 100).toFixed(6)),
      identicalPixelPercent: Number((identicalPixelRatio * 100).toFixed(6)),
      mae: Number(maeValue.toFixed(6)),
      rmse: Number(rmseValue.toFixed(6)),
      ssim: Number(ssimValue.toFixed(6)),
      diffBoundingBox: diffMask.bbox
    });
    logStage(`compare:page-${page.pageNumber}`, "SUCCESS", `status=${pageStatus} ssim=${ssimValue.toFixed(6)} diff=${pixelDifferenceRatio.toFixed(6)}`);
  }

  const globalClassification = summarizeClassification(allCategoryRows, 0, pages.reduce((sum, p) => sum + Number(p.differentPixels || 0), 0));
  const representationEffectiveness = {};
  for (const row of nodeDiagnostics) {
    const key = String(row.representation || "unknown");
    if (!representationEffectiveness[key]) {
      representationEffectiveness[key] = {
        nodes: 0,
        diffPixels: 0,
        avgVisualError: 0,
        maxVisualError: 0
      };
    }
    representationEffectiveness[key].nodes += 1;
    representationEffectiveness[key].diffPixels += Number(row.pixelDifference || 0);
    representationEffectiveness[key].avgVisualError += Number(row.visualError || 0);
    representationEffectiveness[key].maxVisualError = Math.max(representationEffectiveness[key].maxVisualError, Number(row.visualError || 0));
  }
  for (const value of Object.values(representationEffectiveness)) {
    value.avgVisualError = value.nodes ? Number((value.avgVisualError / value.nodes).toFixed(6)) : 0;
  }

  const metrics = {
    sourceFile,
    generatedAt: new Date().toISOString(),
    status: "pass",
    dpi: primaryDpi,
    secondaryDpi,
    renderers: {
      pdf: sourceRaster.renderer,
      html: htmlRaster.renderer
    },
    sourceRaster: {
      renderer: sourceRaster.renderer,
      dpi: sourceRaster.dpi,
      pageCount: sourceRaster.pageCount,
      config: sourceRaster.config
    },
    htmlRaster: {
      renderer: htmlRaster.renderer,
      dpi: htmlRaster.dpi,
      pageCount: htmlRaster.pages.length,
      deviceScaleFactor: htmlRaster.deviceScaleFactor
    },
    pages,
    pageSummaries,
    nodeDiagnosticsTop20: [...nodeDiagnostics].sort((a, b) => Number(b.pixelDifference || 0) - Number(a.pixelDifference || 0)).slice(0, 20),
    errorClassification: globalClassification,
    representationEffectiveness,
    summary: {
      pageCount: pages.length,
      avgPixelDifferenceRatio: pages.reduce((sum, row) => sum + row.pixelDifferenceRatio, 0) / Math.max(1, pages.length),
      avgSSIM: pages.reduce((sum, row) => sum + row.ssim, 0) / Math.max(1, pages.length),
      avgMAE: pages.reduce((sum, row) => sum + row.mae, 0) / Math.max(1, pages.length),
      avgRMSE: pages.reduce((sum, row) => sum + row.rmse, 0) / Math.max(1, pages.length),
      significantDifferences: diagnostics.filter((d) => d.severity === "high" || d.severity === "medium").length
    }
  };

  metrics.status = pages.every((row) => row.status === "pass") ? "pass" : "fail";

  const fidelityReport = {
    ...metrics,
    diagnosticsFile,
    outputs: {
      sourceDir,
      htmlDir,
      diffDir,
      overlayDir,
      heatmapDir,
      source300Dir,
      html300Dir
    }
  };

  await withTimeout("write-metrics", 10000, () => writeFile(metricsFile, `${JSON.stringify(metrics, null, 2)}\n`, "utf8"));
  await withTimeout("write-diagnostics", 10000, () => writeFile(diagnosticsFile, `${JSON.stringify(diagnostics, null, 2)}\n`, "utf8"));
  await withTimeout("write-node-diagnostics", 10000, () => writeFile(nodeDiagnosticsFile, `${JSON.stringify(nodeDiagnostics, null, 2)}\n`, "utf8"));
  await withTimeout("write-page-summary", 10000, () => writeFile(pageSummaryFile, `${JSON.stringify(pageSummaries, null, 2)}\n`, "utf8"));
  await withTimeout("write-classification", 10000, () => writeFile(classificationFile, `${JSON.stringify(globalClassification, null, 2)}\n`, "utf8"));
  await withTimeout("write-report-json", 10000, () => writeFile(fidelityJsonFile, `${JSON.stringify(fidelityReport, null, 2)}\n`, "utf8"));
  await withTimeout("write-report-html", 10000, () => writeFile(fidelityHtmlFile, buildReportHtml(fidelityReport), "utf8"));
  await withTimeout("write-geometry-diagnostics", 10000, () => writeFile(geometryDiagnosticsFile, `${JSON.stringify(geometryDiagnostics, null, 2)}\n`, "utf8"));

  console.log(JSON.stringify({
    status: metrics.status,
    sourceFile,
    metricsFile,
    diagnosticsFile,
    nodeDiagnosticsFile,
    classificationFile,
    pageSummaryFile,
    geometryDiagnosticsFile,
    fidelityJsonFile,
    fidelityHtmlFile,
    summary: metrics.summary
  }, null, 2));

  if (metrics.status !== "pass") {
    process.exitCode = 1;
  }
  logStage("COMPLETE", "SUCCESS", `status=${metrics.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    if (error?.code === "FIDELITY_TIMEOUT") {
      console.log(`${FIDELITY_PREFIX} RESULT FIDELITY TIMEOUT`);
    } else {
      console.log(`${FIDELITY_PREFIX} RESULT FIDELITY FAIL`);
    }
    logStage("COMPLETE", "ERROR", String(error?.stack || error?.message || error));
    logStage("ACTIVE_HANDLES", "INFO", activeHandleNames().join(", "));
    console.error(error);
    process.exitCode = 1;
  });
}
