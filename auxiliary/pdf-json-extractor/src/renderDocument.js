import path from "node:path";
import { readFile } from "node:fs/promises";
import { ensureDir, escapeHtml, writeJson, writeText } from "./utils.js";
import { buildRepresentationPlan } from "./rendering/representationPlanner.js";

const outputDir = path.join(process.cwd(), "output");
const inputFile = path.join(outputDir, "document.json");
const finalHtmlOutputFile = path.join(outputDir, "document.html");
const htmlOutputFile = path.join(outputDir, "document.semantic.html");
const fidelityOutputFile = path.join(outputDir, "document.fidelity.html");
const representationPlanOutputFile = path.join(outputDir, "document.render-plan.json");
const debugOutputFile = path.join(outputDir, "document.debug.html");
const markdownOutputFile = path.join(outputDir, "document.md");

function dominantStyle(node = {}) {
  if (node?.style) return node.style;
  const runs = Array.isArray(node?.children) ? node.children : [];
  const firstRun = runs.find((run) => run?.style);
  return firstRun?.style || { fontSize: 12, fontWeight: 400, italic: false, fontFamily: "serif" };
}

function runToInlineHtml(run = {}) {
  const text = escapeHtml(run.text || "");
  const style = run.style || {};
  const content = style.verticalAlign === "superscript"
    ? `<sup>${text}</sup>`
    : style.verticalAlign === "subscript"
      ? `<sub>${text}</sub>`
      : text;
  const spanStyle = [
    `font-size:${Number(style.fontSize || 12).toFixed(2)}px`,
    `font-family:${escapeHtml(style.fontFamily || "serif")}`,
    `font-weight:${Number(style.fontWeight || 400)}`,
    style.italic ? "font-style:italic" : "font-style:normal"
  ].join(";");
  return `<span style="${spanStyle}">${content}</span>`;
}

function nodeTextHtml(node = {}) {
  const runs = Array.isArray(node?.children) ? node.children : [];
  if (!runs.length) return escapeHtml(node?.text || node?.value || "");
  return runs.map((run) => runToInlineHtml(run)).join("");
}

function renderSemanticNode(node = {}) {
  if (node.type === "heading") {
    const level = Math.min(Math.max(Number(node.level || 2), 1), 6);
    return `<h${level} data-node-id="${node.id}">${nodeTextHtml(node)}</h${level}>`;
  }
  if (node.type === "paragraph") {
    return `<p data-node-id="${node.id}">${nodeTextHtml(node)}</p>`;
  }
  if (node.type === "equation") {
    return `<div class="equation" data-node-id="${node.id}"><code>${escapeHtml(node.math?.source || node.text || "")}</code></div>`;
  }
  if (node.type === "textGroup" && node.semanticCandidate === "math") {
    return `<div class="equation" data-node-id="${node.id}"><code>${nodeTextHtml(node)}</code></div>`;
  }
  if (node.type === "listItem") {
    return `<li data-node-id="${node.id}">${nodeTextHtml(node)}</li>`;
  }
  if (node.type === "table") {
    const rows = (node.rows || []).map((row) => {
      const cells = (row.cells || []).map((cell) => {
        const text = (cell.children || []).map((run) => runToInlineHtml(run)).join("");
        return `<td colspan="${Number(cell.colSpan || 1)}" rowspan="${Number(cell.rowSpan || 1)}">${text}</td>`;
      }).join("");
      return `<tr>${cells}</tr>`;
    }).join("");
    return `<table data-node-id="${node.id}">${rows}</table>`;
  }
  if (node.type === "image") {
    return `<figure class="image-node" data-node-id="${node.id}"><figcaption>Image ${escapeHtml(node?.source?.objectId || node.id || "")}</figcaption></figure>`;
  }
  if (node.type === "vectorPath") {
    return `<div class="vector-node" data-node-id="${node.id}">Vector operator ${escapeHtml(String(node?.path?.operatorCode || ""))}</div>`;
  }
  if (node.type === "header" || node.type === "footer") {
    return `<div class="furniture ${node.type}" data-node-id="${node.id}">${nodeTextHtml(node)}</div>`;
  }
  if (node.type === "pageNumber") {
    return `<div class="page-number" data-node-id="${node.id}">${escapeHtml(node.value || "")}</div>`;
  }
  return "";
}

export function renderSemanticHtml(documentTree = {}) {
  const pages = Array.isArray(documentTree?.pages) ? documentTree.pages : [];
  const body = pages.map((page) => {
    const nodes = (Array.isArray(page.elements) ? page.elements : []).sort((a, b) => Number(a.readingOrder || 0) - Number(b.readingOrder || 0));
    const listItems = nodes.filter((node) => node.type === "listItem").map((node) => renderSemanticNode(node)).join("");
    const nonLists = nodes.filter((node) => node.type !== "listItem").map((node) => renderSemanticNode(node)).join("\n");
    const listBlock = listItems ? `<ul>${listItems}</ul>` : "";
    return `<section class="semantic-page"><h2>Page ${page.pageNumber}</h2>${nonLists}${listBlock}</section>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(documentTree?.metadata?.filename || "PDF semantic render")}</title>
  <style>
    body { margin: 0; background: #f7f1e8; color: #1f1d19; font-family: "Source Serif 4", "Georgia", serif; }
    main { max-width: 940px; margin: 1.6rem auto; padding: 1.2rem; }
    .semantic-page { background: #fffdf8; border: 1px solid #e3d8c8; border-radius: 12px; padding: 1.2rem; margin-bottom: 1.2rem; }
    .equation { background: #f4ecde; border: 1px solid #d8c8b0; border-radius: 8px; padding: 0.7rem; overflow-x: auto; }
    table { border-collapse: collapse; margin: 0.8rem 0; }
    td { border: 1px solid #c4b49a; padding: 0.3rem 0.5rem; }
    .image-node { border: 1px dashed #b9a88f; min-height: 56px; display: flex; align-items: center; justify-content: center; }
    .vector-node { border: 1px dotted #7f8fa6; min-height: 36px; display: flex; align-items: center; justify-content: center; color: #3d4e63; font-size: 0.85rem; }
    .furniture { color: #6c604d; font-size: 0.92rem; }
    .page-number { text-align: center; color: #7a6c55; }
  </style>
</head>
<body>
  <main>${body}</main>
</body>
</html>`;
}

function styleFromNode(node = {}) {
  const style = dominantStyle(node);
  return [
    `font-family:${escapeHtml(style.fontFamily || "serif")}`,
    `font-size:${Number(style.fontSize || 12).toFixed(2)}px`,
    `font-weight:${Number(style.fontWeight || 400)}`,
    style.italic ? "font-style:italic" : "font-style:normal",
    "line-height:1.2"
  ].join(";");
}

function colorToCss(value, fallback = "rgb(0, 0, 0)") {
  if (typeof value === "string" && value.trim()) return value;
  return fallback;
}

function pt(value) {
  return `${Number(value || 0).toFixed(3)}pt`;
}

function segmentHtml(segment = {}) {
  if (segment.type === "adjustment") {
    return `<span class="seg-adjust" data-adjustment="${Number(segment.adjustment || 0)}"></span>`;
  }
  return `<span class="seg-text">${escapeHtml(segment.text || "")}</span>`;
}

function textSegmentsToSvg(node = {}) {
  const segments = Array.isArray(node?.segments) && node.segments.length
    ? node.segments
    : [{ type: "text", text: node.text || "" }];

  const fontSize = Math.max(0.001, Number(node?.font?.size || 12));
  const hScale = Math.max(0.01, Number(node?.spacing?.horizontalScale || 100) / 100);
  const parts = [];

  for (const segment of segments) {
    if (segment.type === "adjustment") {
      const adjust = Number(segment.adjustment || 0);
      const dx = (-adjust / 1000) * fontSize * hScale;
      parts.push(`<tspan dx="${dx.toFixed(4)}"></tspan>`);
      continue;
    }
    parts.push(`<tspan>${escapeHtml(segment.text || "")}</tspan>`);
  }

  return parts.join("");
}

function quotedFontFamily(value = "") {
  return `"${String(value || "").replace(/"/g, "")}"`;
}

function cssFontFamilyFromNode(node = {}) {
  const internal = String(node?.font?.name || "").trim();
  const fallback = String(node?.font?.fallbackName || "").trim();
  const choices = [];
  if (internal) choices.push(quotedFontFamily(internal));
  if (fallback) choices.push(fallback);
  choices.push("serif", "sans-serif");
  return choices.join(", ");
}

function glyphLayoutSvg(node = {}) {
  const layout = Array.isArray(node?.glyphLayout) ? node.glyphLayout : [];
  if (!layout.length) return "";
  return layout.map((glyph) => `<tspan x="${Number(glyph?.x || 0).toFixed(4)}">${escapeHtml(String(glyph?.char || ""))}</tspan>`).join("");
}

function computeSvgBaselineOffset(node = {}, box = {}, fontSize = 12) {
  const fallback = Number(node?.baseline?.start?.[1] ?? (Number(box.y || 0) + Number(box.height || 0))) - Number(box.y || 0);
  const ascent = Number(node?.font?.ascent);
  const descent = Number(node?.font?.descent);
  if (!Number.isFinite(ascent)) return fallback;

  // PDF.js font ascent/descent are in font units; using ascent*fontSize yields
  // a more faithful SVG baseline than bbox-height for many subsetted fonts.
  const metricOffset = ascent * Number(fontSize || 12);
  if (!Number.isFinite(metricOffset) || metricOffset <= 0) return fallback;

  const metricSpan = Number.isFinite(descent) ? Math.max(0.5, (ascent - descent) * Number(fontSize || 12)) : null;
  const boxHeight = Math.max(0.001, Number(box.height || 0));

  // Blend metric and geometry offsets to stay stable for ambiguous fonts.
  const blended = metricSpan
    ? (metricOffset * 0.7 + Math.min(boxHeight, metricOffset) * 0.3)
    : (metricOffset * 0.8 + boxHeight * 0.2);

  return Number.isFinite(blended) ? blended : fallback;
}

function sourceRefsAttr(node = {}) {
  const refs = Array.isArray(node?.sourceRefs) ? node.sourceRefs : [];
  const ids = refs.map((ref) => String(ref?.sourceId || "").trim()).filter(Boolean);
  return escapeHtml(ids.join(","));
}

function renderFidelityNode(node = {}, decision = {}, pageNumber = 0) {
  const rep = String(decision?.representation || "native-html");
  const reason = escapeHtml(String(decision?.reason || "default"));
  const sourceRefs = sourceRefsAttr(node);

  if (node.type === "textPaint") {
    const box = node.bbox || { x: 0, y: 0, width: 0, height: 0 };
    const semanticStyle = [
      "position:absolute",
      `left:${pt(box.x || 0)}`,
      `top:${pt(box.y || 0)}`,
      `width:${pt(Math.max(0.001, Number(box.width || 0)))}`,
      `height:${pt(Math.max(0.001, Number(box.height || 0)))}`,
      "overflow:hidden",
      "white-space:pre",
      "opacity:0",
      "pointer-events:none"
    ].join(";");

    const style = [
      "position:absolute",
      `left:${pt(box.x || 0)}`,
      `top:${pt(box.y || 0)}`,
      `width:${pt(Math.max(0.001, Number(box.width || 0)))}`,
      `height:${pt(Math.max(0.001, Number(box.height || 0)))}`,
      `font-size:${pt(Math.max(0.001, Number(node?.font?.size || box.height || 12)))}`,
      `font-family:${cssFontFamilyFromNode(node)}`,
      `font-weight:${Number(node?.font?.weight || 400)}`,
      node?.font?.italic ? "font-style:italic" : "font-style:normal",
      `letter-spacing:${pt(Number(node?.spacing?.characterSpacing || 0))}`,
      `word-spacing:${pt(Number(node?.spacing?.wordSpacing || 0))}`,
      `transform-origin:left top`,
      `transform:translateY(${pt(Number(-(node?.textRise || 0)))}) scaleX(${Math.max(0.01, Number(node?.spacing?.horizontalScale || 100) / 100).toFixed(6)})`,
      `color:${colorToCss(node?.fillColor)}`,
      `z-index:${Math.max(0, Number(node?.zOrder || 0))}`,
      "line-height:1",
      "white-space:pre",
      "overflow:visible"
    ].join(";");

    const semanticText = Array.isArray(node?.segments) && node.segments.length
      ? node.segments.map((segment) => segmentHtml(segment)).join("")
      : escapeHtml(node.text || "");

    if (rep === "svg-text" || rep === "svg-glyph") {
      const fontSize = Math.max(0.001, Number(node?.font?.size || box.height || 12));
      const baseline = Number(node?.baseline?.start?.[1] ?? (Number(box.y || 0) + Number(box.height || 0) * 0.85));
      const baselineOffset = baseline - Number(box.y || 0);
      const svgText = rep === "svg-glyph" ? glyphLayoutSvg(node) || textSegmentsToSvg(node) : textSegmentsToSvg(node);
      const textLength = Math.max(0.001, Number(box.width || 0));
      const scaleX = Math.max(0.01, Number(node?.spacing?.horizontalScale || 100) / 100);
      const svgFamily = cssFontFamilyFromNode(node);
      const transformAttr = rep === "svg-glyph" ? "" : ` transform="scale(${scaleX.toFixed(6)},1)"`;
      const lengthAttr = rep === "svg-glyph" ? "" : ` textLength="${textLength.toFixed(4)}" lengthAdjust="spacingAndGlyphs"`;

        return `<div class="paint-text-wrap" data-node-id="${node.id}" data-page="${Number(pageNumber || 0)}" data-source-op="${Number(node.sourceOperatorIndex || 0)}" data-source-refs="${sourceRefs}" data-representation="${rep}" data-representation-reason="${reason}" style="position:absolute;left:${pt(box.x || 0)};top:${pt(box.y || 0)};width:${pt(Math.max(0.001, Number(box.width || 0)))};height:${pt(Math.max(0.001, Number(box.height || 0)))};z-index:${Math.max(0, Number(node?.zOrder || 0))};overflow:visible;">
      <span class="semantic-text" data-node-id="${node.id}" data-semantic-node-id="${node.id}" data-source-op="${Number(node.sourceOperatorIndex || 0)}" data-source-refs="${sourceRefs}" data-semantic-representation="html-text" style="${semanticStyle}">${semanticText}</span>
      <svg class="visual-text-svg" data-node-id="${node.id}" data-source-refs="${sourceRefs}" data-visual-representation="${rep}" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.max(0.001, Number(box.width || 0))} ${Math.max(0.001, Number(box.height || 0))}" style="position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;">
        <text x="0" y="${baselineOffset.toFixed(4)}" font-family="${escapeHtml(svgFamily)}" font-size="${fontSize.toFixed(4)}" font-weight="${Number(node?.font?.weight || 400)}" ${node?.font?.italic ? "font-style=\"italic\"" : "font-style=\"normal\""} fill="${colorToCss(node?.fillColor)}"${lengthAttr}${transformAttr} xml:space="preserve">${svgText}</text>
  </svg>
</div>`;
    }

    return `<div class="paint-text-wrap" data-node-id="${node.id}" data-page="${Number(pageNumber || 0)}" data-source-op="${Number(node.sourceOperatorIndex || 0)}" data-source-refs="${sourceRefs}" data-representation="${rep}" data-representation-reason="${reason}" style="position:absolute;left:${pt(box.x || 0)};top:${pt(box.y || 0)};width:${pt(Math.max(0.001, Number(box.width || 0)))};height:${pt(Math.max(0.001, Number(box.height || 0)))};z-index:${Math.max(0, Number(node?.zOrder || 0))};overflow:visible;">
  <span class="semantic-text" data-node-id="${node.id}" data-semantic-node-id="${node.id}" data-source-op="${Number(node.sourceOperatorIndex || 0)}" data-source-refs="${sourceRefs}" data-semantic-representation="html-text" style="${semanticStyle}">${semanticText}</span>
  <div class="paint-text" data-node-id="${node.id}" data-source-refs="${sourceRefs}" data-visual-representation="native-html" aria-hidden="true" style="${style}">${semanticText}</div>
</div>`;
  }

  if (node.type === "imagePaint") {
    const box = node.bbox || { x: 0, y: 0, width: 0, height: 0 };
    const style = [
      "position:absolute",
      `left:${pt(box.x || 0)}`,
      `top:${pt(box.y || 0)}`,
      `width:${pt(Math.max(0.001, Number(box.width || 0)))}`,
      `height:${pt(Math.max(0.001, Number(box.height || 0)))}`,
      `z-index:${Math.max(0, Number(node?.zOrder || 0))}`,
      "overflow:hidden"
    ].join(";");

    if (node.imageDataUri) {
      return `<img class="paint-image" data-node-id="${node.id}" data-source-op="${Number(node.sourceOperatorIndex || 0)}" data-source-refs="${sourceRefs}" data-representation="${rep}" data-visual-representation="image" data-representation-reason="${reason}" alt="${escapeHtml(node.objectId || node.id)}" src="${node.imageDataUri}" style="${style};object-fit:fill;" />`;
    }

    return `<div class="paint-image-missing" data-node-id="${node.id}" data-source-op="${Number(node.sourceOperatorIndex || 0)}" data-source-refs="${sourceRefs}" data-representation="${rep}" data-visual-representation="source-crop" data-representation-reason="${reason}" style="${style}">img:${escapeHtml(node.objectId || node.id)}</div>`;
  }

  if (node.type === "vectorPaint") {
    const style = [
      "position:absolute",
      "left:0",
      "top:0",
      "width:100%",
      "height:100%",
      `z-index:${Math.max(0, Number(node?.zOrder || 0))}`,
      "pointer-events:none"
    ].join(";");
    return `<svg class="paint-vector" data-node-id="${node.id}" data-source-op="${Number(node.sourceOperatorIndex || 0)}" data-source-refs="${sourceRefs}" data-op="${escapeHtml(node.operator || "")}" data-representation="${rep}" data-visual-representation="svg-path" data-representation-reason="${reason}" style="${style}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" preserveAspectRatio="none"><g data-command-count="${Number((node?.commands || []).length)}"></g></svg>`;
  }

  const box = node.bbox || { x: 0, y: 0, width: 0, height: 0 };
  const baseStyle = [
    "position:absolute",
    `left:${pt(box.x || 0)}`,
    `top:${pt(box.y || 0)}`,
    `width:${pt(Math.max(1, Number(box.width || 0)))}`,
    `height:${pt(Math.max(1, Number(box.height || 0)))}`
  ].join(";");

  if (node.type === "image") {
    return `<div class="fidelity-image" data-node-id="${node.id}" style="${baseStyle}">img:${escapeHtml(node?.source?.objectId || node.id || "")}</div>`;
  }

  if (node.type === "table") {
    const rowCount = Array.isArray(node.rows) ? node.rows.length : 0;
    return `<div class="fidelity-table" data-node-id="${node.id}" style="${baseStyle}">table ${rowCount} rows</div>`;
  }

  if (node.type === "vectorPath") {
    return `<div class="fidelity-vector" data-node-id="${node.id}" style="${baseStyle}">vec:${escapeHtml(String(node?.path?.operatorCode || ""))}</div>`;
  }

  const typeClass = `node-${escapeHtml(node.type || "unknown")}`;
  const html = nodeTextHtml(node);
  return `<div class="fidelity-text ${typeClass}" data-node-id="${node.id}" style="${baseStyle};${styleFromNode(node)}">${html}</div>`;
}

export function renderFidelityHtml(documentTree = {}, representationPlan = null) {
  const plan = representationPlan || buildRepresentationPlan(documentTree);
  const decisionMap = new Map((plan?.decisions || []).map((row) => [String(row.nodeId || ""), row]));
  const pages = Array.isArray(documentTree?.pages) ? documentTree.pages : [];
  const pageMarkup = pages.map((page) => {
    const nodes = Array.isArray(page?.fidelityObjects) && page.fidelityObjects.length
      ? page.fidelityObjects
      : (Array.isArray(page?.elements) ? page.elements : []);
    const children = nodes.map((node) => renderFidelityNode(node, decisionMap.get(String(node.id || "")) || null, page.pageNumber)).join("\n");
    return `<section class="pdf-page-wrap"><div class="pdf-page" id="pdf-page-${page.pageNumber}" data-page-number="${page.pageNumber}" data-width-pt="${Number(page.width || 0)}" data-height-pt="${Number(page.height || 0)}" style="width:${pt(Number(page.width || 0))};height:${pt(Number(page.height || 0))};">${children}</div></section>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PDF Fidelity Render</title>
  <style>
    html, body { margin: 0; padding: 0; background: #ffffff; }
    * { box-sizing: border-box; }
    body { font-family: sans-serif; }
    main { margin: 0; padding: 0; }
    .pdf-page-wrap { margin: 0; padding: 0; page-break-after: always; }
    .pdf-page { position: relative; overflow: hidden; background: #ffffff; margin: 0; }
    .paint-text { display: block; }
    .paint-image-missing { display: flex; align-items: center; justify-content: center; color: #7b2e2e; background: rgba(255, 208, 208, 0.8); font-size: 10px; }
    .paint-vector { mix-blend-mode: normal; }
    .seg-adjust { display: inline-block; width: 0; }
  </style>
</head>
<body>
  <main>${pageMarkup}</main>
</body>
</html>`;
}

export function renderDebugHtml(documentTree = {}) {
  const jsonPayload = escapeHtml(JSON.stringify(documentTree));
  const pages = Array.isArray(documentTree?.pages) ? documentTree.pages : [];
  const pageMarkup = pages.map((page) => {
    const boxes = (Array.isArray(page?.elements) ? page.elements : []).map((node) => {
      const box = node.bbox || { x: 0, y: 0, width: 0, height: 0 };
      return `<button class="debug-box" data-node-id="${node.id}" style="left:${Number(box.x || 0).toFixed(2)}px;top:${Number(box.y || 0).toFixed(2)}px;width:${Math.max(1, Number(box.width || 0)).toFixed(2)}px;height:${Math.max(1, Number(box.height || 0)).toFixed(2)}px;">${escapeHtml(node.type || "node")}</button>`;
    }).join("\n");
    return `<section class="dbg-wrap"><h2>Page ${page.pageNumber}</h2><div class="dbg-page" style="width:${Number(page.width || 0).toFixed(2)}px;height:${Number(page.height || 0).toFixed(2)}px;">${boxes}</div></section>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PDF JSON Debugger</title>
  <style>
    body { margin: 0; font-family: "IBM Plex Sans", sans-serif; background: #0f1216; color: #e9edf2; }
    .grid { display: grid; grid-template-columns: 1fr 340px; min-height: 100vh; }
    .left { padding: 1rem; overflow: auto; }
    .right { border-left: 1px solid #2b3440; padding: 1rem; overflow: auto; background: #121820; }
    .dbg-wrap { margin-bottom: 1.2rem; }
    .dbg-page { position: relative; background: #fff; border: 1px solid #3a4656; }
    .debug-box { position: absolute; border: 1px solid rgba(224, 78, 63, 0.8); background: rgba(224, 78, 63, 0.16); color: #2e160f; font-size: 9px; overflow: hidden; cursor: pointer; }
    pre { white-space: pre-wrap; word-break: break-word; background: #0d131a; border: 1px solid #263140; padding: 0.7rem; border-radius: 8px; }
  </style>
</head>
<body>
  <div class="grid">
    <div class="left">${pageMarkup}</div>
    <aside class="right">
      <h3>Node inspector</h3>
      <p>Click any highlighted element.</p>
      <pre id="node-output">No node selected.</pre>
    </aside>
  </div>
  <script>
    const payload = JSON.parse("${jsonPayload}");
    const lookup = new Map();
    for (const page of payload.pages || []) {
      for (const node of page.elements || []) lookup.set(node.id, node);
    }
    const output = document.getElementById("node-output");
    for (const btn of document.querySelectorAll(".debug-box")) {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-node-id");
        const node = lookup.get(id);
        output.textContent = JSON.stringify(node || { id, error: "node not found" }, null, 2);
      });
    }
  </script>
</body>
</html>`;
}

export function renderMarkdown(documentTree = {}) {
  const pages = Array.isArray(documentTree?.pages) ? documentTree.pages : [];
  const chunks = [];
  for (const page of pages) {
    chunks.push(`## Page ${page.pageNumber}`);
    const nodes = (Array.isArray(page.elements) ? page.elements : []).sort((a, b) => Number(a.readingOrder || 0) - Number(b.readingOrder || 0));
    for (const node of nodes) {
      if (node.type === "heading") {
        const level = Math.min(Math.max(Number(node.level || 2), 1), 6);
        chunks.push(`${"#".repeat(level)} ${node.text || ""}`.trim());
      } else if (node.type === "equation") {
        chunks.push(`$$\n${node.math?.source || node.text || ""}\n$$`);
      } else if (node.type === "textGroup" && node.semanticCandidate === "math") {
        chunks.push(`$${node.text || ""}$`);
      } else if (node.type === "listItem") {
        chunks.push(`- ${node.text || ""}`);
      } else if (node.type === "table") {
        chunks.push("[table]");
      } else if (node.type === "image") {
        chunks.push(`![embedded image](${node?.source?.objectId || node.id || "image"})`);
      } else if (node.type === "vectorPath") {
        chunks.push("[vector path]");
      } else if (node.type === "paragraph" || node.type === "header" || node.type === "footer" || node.type === "pageNumber") {
        chunks.push(String(node.text || node.value || "").trim());
      }
    }
    chunks.push("");
  }
  return `${chunks.filter(Boolean).join("\n\n")}\n`;
}

async function main() {
  await ensureDir(outputDir);
  const payload = await readFile(inputFile, "utf8");
  const documentTree = JSON.parse(payload);
  const representationPlan = buildRepresentationPlan(documentTree);
  const finalHtml = renderFidelityHtml(documentTree, representationPlan);

  await writeText(htmlOutputFile, renderSemanticHtml(documentTree));
  await writeText(fidelityOutputFile, finalHtml);
  await writeText(finalHtmlOutputFile, finalHtml);
  await writeText(debugOutputFile, renderDebugHtml(documentTree));
  await writeText(markdownOutputFile, renderMarkdown(documentTree));
  await writeJson(representationPlanOutputFile, representationPlan);

  console.log(JSON.stringify({
    inputFile,
    documentHtml: finalHtmlOutputFile,
    semanticHtml: htmlOutputFile,
    fidelityHtml: fidelityOutputFile,
    representationPlan: representationPlanOutputFile,
    debugHtml: debugOutputFile,
    markdownOutputFile,
    pages: Number(documentTree?.statistics?.pages || 0),
    elements: Number(documentTree?.statistics?.elements || 0)
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
