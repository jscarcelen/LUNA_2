/**
 * AI Vision Extractor
 *
 * Uses OpenAI GPT-4o (vision) to extract rich content from:
 *   - PDF files       → text via pdfjs-dist (no canvas needed) + GPT-4o structuring
 *   - PPTX files      → OOXML text + embedded images → GPT-4o
 *   - Image files     → base64 direct to GPT-4o vision
 *   - Handwritten notes (images) → GPT-4o vision
 *
 * Output: CDM v2 canonical document object, ready for normalizeCanonicalDocument → renderers.
 */

import JSZip from "jszip";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFileSync, existsSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import path from "path";
// Note: zlib import removed — extraction handled by pdfjs in child process

const execFileAsync = promisify(execFile);

// ─── locate pdfjs-dist at startup ────────────────────────────────────────────
// Try candidate locations relative to process.cwd() (which is apps/web when
// Next.js runs, or the repo root when run from root with --workspace).
function findPdfjsPath() {
  const candidates = [
    path.join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.mjs"),
    path.join(process.cwd(), "apps/web/node_modules/pdfjs-dist/legacy/build/pdf.mjs"),
    "/node_modules/pdfjs-dist/legacy/build/pdf.mjs", // Vercel Lambda root
  ];
  // CJS __dirname is reliable even under webpack
  try {
    if (typeof __dirname !== "undefined") {
      candidates.unshift(path.resolve(__dirname, "../../../node_modules/pdfjs-dist/legacy/build/pdf.mjs"));
    }
  } catch { /* ESM context, skip */ }

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0]; // best guess fallback
}

const PDFJS_PATH = findPdfjsPath();
console.log("[aiVisionExtractor] PDFJS_PATH:", PDFJS_PATH, "exists:", existsSync(PDFJS_PATH));

// ─── generate + cache worker in /tmp ─────────────────────────────────────────
// The worker is written to /tmp so it runs as a plain Node.js process outside
// webpack, which means pdfjs-dist ESM imports are handled by Node.js natively.
let _workerPath = null;

// Version tag — bump when the worker code changes so the stale file is never reused.
const WORKER_VERSION = "v3";

function ensureWorker() {
  if (_workerPath) return _workerPath;
  _workerPath = path.join(tmpdir(), `luna-pdfTextWorker-${WORKER_VERSION}.mjs`);
  // Embed the absolute pdfjs path directly in the worker so it works from any cwd.
  const code = `
import path from "path";

if (typeof globalThis.DOMMatrix === "undefined") {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor(){this.a=1;this.b=0;this.c=0;this.d=1;this.e=0;this.f=0;this.m11=1;this.m22=1;this.m33=1;this.m44=1;this.is2D=true;this.isIdentity=true;}
    multiply(){return new DOMMatrix();}translate(tx=0,ty=0){const m=new DOMMatrix();m.e=tx;m.f=ty;return m;}
    scale(sx=1,sy=sx){const m=new DOMMatrix();m.a=sx;m.d=sy;return m;}inverse(){return new DOMMatrix();}
    rotateAxisAngle(){return new DOMMatrix();}static fromMatrix(){return new DOMMatrix();}
    transformPoint(p={x:0,y:0}){return {x:p.x*this.a+p.y*this.c+this.e,y:p.x*this.b+p.y*this.d+this.f};}
  };
}
if (typeof globalThis.DOMPoint === "undefined") globalThis.DOMPoint = class DOMPoint {constructor(x=0,y=0,z=0,w=1){this.x=x;this.y=y;this.z=z;this.w=w;}static fromPoint(p={}){return new DOMPoint(p.x,p.y,p.z,p.w);}};
if (typeof globalThis.ImageData === "undefined") globalThis.ImageData = class ImageData {constructor(w,h){this.width=w;this.height=h;this.data=new Uint8ClampedArray(w*h*4);}};
if (typeof globalThis.Path2D === "undefined") globalThis.Path2D = class Path2D {rect(){}moveTo(){}lineTo(){}arc(){}closePath(){}addPath(){}};

async function main() {
  // Read from temp file path passed as argv[2]. async execFile does not support the
  // "input" option for piping stdin the way execSync/spawnSync do.
  const inputFile = process.argv[2];
  if (!inputFile) { process.stdout.write(JSON.stringify({error:"No input file provided"})); process.exit(1); }
  const { readFileSync } = await import("fs");
  const b64 = readFileSync(inputFile, "utf8").trim();
  if (!b64) { process.stdout.write(JSON.stringify({error:"Empty input file"})); process.exit(1); }

  const buf = Buffer.from(b64, "base64");
  // Absolute pdfjs path embedded at worker-write time:
  const pdfjsLib = await import(${JSON.stringify(PDFJS_PATH)});
  const { getDocument } = pdfjsLib;
  // pdfjs runs a "fake worker" in Node and throws if workerSrc is falsy (an empty string
  // counts), so point it at the real pdf.worker.mjs that sits beside pdf.mjs.
  const { pathToFileURL } = await import("url");
  pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(path.dirname(${JSON.stringify(PDFJS_PATH)}), "pdf.worker.mjs")).href;

  const pdf = await getDocument({
    data: new Uint8Array(buf), disableFontFace: true, isEvalSupported: false,
    useWorkerFetch: false, disableRange: true, disableStream: true, stopAtErrors: false,
  }).promise;

  let text = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    text += tc.items.map(i => i.str + (i.hasEOL ? "\\n" : "")).join("") + "\\n\\n";
  }
  process.stdout.write(JSON.stringify({ text: text.trim(), pageCount: pdf.numPages }));
  process.exit(0);
}

main().catch(err => {
  process.stderr.write(String(err.message || err));
  process.stdout.write(JSON.stringify({ error: String(err.message || err) }));
  process.exit(1);
});
`;
  writeFileSync(_workerPath, code, "utf8");
  console.log("[aiVisionExtractor] Worker written to:", _workerPath);
  return _workerPath;
}

// ─── constants ───────────────────────────────────────────────────────────────

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const VISION_MODEL    = "gpt-4o";
const TEXT_MODEL      = "gpt-4o";
const MAX_TOKENS      = 8192;

// ─── helpers ─────────────────────────────────────────────────────────────────

function getApiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set — cannot run AI vision extraction.");
  return key;
}

function base64ToBuffer(b64) {
  return Buffer.from(b64, "base64");
}

async function callOpenAI(messages, { model = VISION_MODEL, maxTokens = MAX_TOKENS } = {}) {
  const key = getApiKey();
  const res = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      response_format: { type: "json_object" }
    })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content || "{}";
  try {
    return JSON.parse(raw);
  } catch {
    // Sometimes GPT wraps JSON in markdown fences
    const fenced = raw.match(/```json\s*([\s\S]*?)```/i)?.[1] || raw.match(/```\s*([\s\S]*?)```/i)?.[1];
    if (fenced) return JSON.parse(fenced.trim());
    throw new Error(`Failed to parse OpenAI JSON response: ${raw.slice(0, 200)}`);
  }
}

// ─── extraction prompt ───────────────────────────────────────────────────────

/**
 * Build the system prompt for CDM extraction.
 * Keeps instructions tight to preserve token budget for content.
 */
function buildSystemPrompt(sourceType) {
  return `You are an expert document parser. Extract the full content of the provided ${sourceType} document and return a JSON object in the exact schema below.

EXTRACTION RULES:
1. ALL mathematical formulas → LaTeX strings (inline: \\(...\\), display: \\[...\\])
2. Tables → preserve all rows, columns, and merged cells
3. Headings → detect hierarchy (h1–h4) from visual size / numbering / style
4. Lists → preserve bullet/numbered, nesting level
5. Code blocks → wrap in code blocks with language
6. Figures/diagrams → describe them precisely in alt_text
7. Colors, highlights, bold, italic → preserve in formatting
8. Do NOT omit any content — completeness is critical
9. Handwritten text → transcribe it faithfully, mark confidence lower if unclear

OUTPUT SCHEMA (return ONLY this JSON, no extra keys, no markdown fences):
{
  "title": "string — document title or first heading",
  "equations": [
    { "id": "eq-1", "latex": "...", "display": true|false, "confidence": 0.95 }
  ],
  "sections": [
    {
      "blocks": [
        {
          "type": "heading",
          "level": 1,
          "text": "...",
          "children": [{ "type": "text", "text": "...", "formatting": { "bold": false, "italic": false, "underline": false, "color": null, "highlight": null } }],
          "confidence": 0.97
        },
        {
          "type": "paragraph",
          "children": [
            { "type": "text", "text": "...", "formatting": { "bold": false, "italic": false, "underline": false, "color": null, "highlight": null } },
            { "type": "inline_math", "equation_id": "eq-1", "latex": "..." }
          ],
          "equation_ids": [],
          "confidence": 0.95
        },
        {
          "type": "display_math",
          "equation_id": "eq-2",
          "latex": "...",
          "confidence": 0.92
        },
        {
          "type": "table",
          "rows": [
            [{ "blocks": [{ "type": "paragraph", "children": [{ "type": "text", "text": "Cell text" }] }] }]
          ],
          "confidence": 0.9
        },
        {
          "type": "list",
          "list_type": "bullet",
          "level": 0,
          "list_items": [{ "children": [{ "type": "text", "text": "..." }] }],
          "confidence": 0.95
        },
        {
          "type": "figure",
          "alt_text": "description of graph/image",
          "caption": "...",
          "confidence": 0.85
        }
      ]
    }
  ]
}

Block types allowed: heading, paragraph, display_math, table, list, figure, code, quote.
Inline child types allowed: text, inline_math.
confidence: float 0–1 (use lower values for uncertain extractions, especially handwriting).`;
}

// ─── CDM builder ─────────────────────────────────────────────────────────────

/**
 * Transform GPT-4o's JSON response into a full CDM v2 object.
 */
function buildCdmFromAiResponse(aiJson, { sourceType, fileName } = {}) {
  const docId = crypto.randomUUID();

  // Collect equations — deduplicate by id
  const equations = Array.isArray(aiJson.equations) ? aiJson.equations.map((eq, i) => ({
    id: String(eq.id || `eq-${i + 1}`),
    latex: String(eq.latex || ""),
    display: Boolean(eq.display),
    confidence: Number.isFinite(eq.confidence) ? eq.confidence : 0.88,
    source: "ai-vision"
  })) : [];

  // Sections
  const rawSections = Array.isArray(aiJson.sections) ? aiJson.sections : [];
  const sections = rawSections.map((sec) => ({
    blocks: Array.isArray(sec.blocks) ? sec.blocks.map(normalizeBlock) : []
  }));

  // If GPT returned a flat blocks array instead of sections
  if (sections.length === 0 && Array.isArray(aiJson.blocks)) {
    sections.push({ blocks: aiJson.blocks.map(normalizeBlock) });
  }

  // Stats
  let blockCount = 0;
  let tableCount = 0;
  for (const sec of sections) {
    blockCount += sec.blocks.length;
    tableCount += sec.blocks.filter((b) => b.type === "table").length;
  }

  return {
    schemaVersion: "2.0",
    schema_version: "cdm.v2",
    document_id: docId,
    metadata: {
      title: String(aiJson.title || fileName || "Untitled"),
      source_type: sourceType || "unknown",
      mime_type: mimeTypeFor(sourceType),
      extraction_method: `ai-vision-${VISION_MODEL}`
    },
    equations,
    sections,
    stats: {
      section_count: sections.length,
      block_count: blockCount,
      equation_count: equations.length,
      table_count: tableCount,
      text_length: extractTotalText(sections).length
    },
    confidence: computeDocConfidence(sections, equations),
    debug: { source: "aiVisionExtractor" }
  };
}

function normalizeBlock(block) {
  const type = String(block?.type || "paragraph");
  const base = {
    type,
    confidence: Number.isFinite(block?.confidence) ? block.confidence : 0.88,
    source: "ai-vision"
  };

  switch (type) {
    case "heading":
      return {
        ...base,
        level: Number(block.level) || 1,
        text: String(block.text || ""),
        children: normalizeChildren(block.children)
      };

    case "paragraph":
      return {
        ...base,
        children: normalizeChildren(block.children),
        equation_ids: Array.isArray(block.equation_ids) ? block.equation_ids : []
      };

    case "display_math":
      return {
        ...base,
        equation_id: String(block.equation_id || ""),
        // Strip \[...\] or \(...\) wrappers GPT sometimes includes in the latex string itself
        latex: stripLatexDelimiters(String(block.latex || ""))
      };

    case "table":
      return {
        ...base,
        rows: normalizeTableRows(block.rows)
      };

    case "list":
      // Renderer checks `list_items` (proper path); accept both `list_items` and `items` from GPT
      return {
        ...base,
        list_type: String(block.list_type || "bullet"),
        level: Number(block.level) || 0,
        list_items: (Array.isArray(block.list_items) ? block.list_items : Array.isArray(block.items) ? block.items : []).map((item) => ({
          children: normalizeChildren(item.children || (item.text ? [{ type: "text", text: String(item.text) }] : []))
        }))
      };

    case "figure":
      return {
        ...base,
        alt_text: String(block.alt_text || ""),
        caption: String(block.caption || "")
      };

    case "code":
      return {
        ...base,
        text: String(block.text || ""),
        language: String(block.language || ""),
        children: normalizeChildren(block.children)
      };

    case "quote":
    case "callout":
      return {
        ...base,
        children: normalizeChildren(block.children)
      };

    default:
      return {
        ...base,
        children: normalizeChildren(block.children)
      };
  }
}

function normalizeChildren(children) {
  if (!Array.isArray(children)) return [];
  const nodes = [];
  for (const child of children) {
    const type = String(child?.type || "text");
    if (type === "inline_math") {
      nodes.push({
        type: "inline_math",
        equation_id: String(child.equation_id || ""),
        latex: stripLatexDelimiters(String(child.latex || "")),
        source: "ai-vision",
        confidence: Number.isFinite(child.confidence) ? child.confidence : 0.88
      });
    } else {
      const rawText = String(child?.text || "");
      const formatting = {
        bold: Boolean(child?.formatting?.bold),
        italic: Boolean(child?.formatting?.italic),
        underline: Boolean(child?.formatting?.underline),
        font: child?.formatting?.font || null,
        color: child?.formatting?.color || null,
        highlight: child?.formatting?.highlight || null
      };
      // Split text on $...$ or \(...\) inline math that GPT embedded as plain text
      const parts = splitInlineMath(rawText);
      for (const part of parts) {
        if (part.type === "inline_math") {
          nodes.push({ type: "inline_math", equation_id: "", latex: part.latex, source: "ai-vision", confidence: 0.88 });
        } else {
          nodes.push({ type: "text", text: part.text, formatting, source: "ai-vision", confidence: Number.isFinite(child?.confidence) ? child.confidence : 0.9 });
        }
      }
    }
  }
  return nodes;
}

/**
 * Split a string on inline math delimiters ($...$  or \(...\)),
 * returning an array of {type:"text",text} | {type:"inline_math",latex} parts.
 */
function splitInlineMath(text) {
  if (!text) return [{ type: "text", text: "" }];
  // Match $...$ (non-greedy, no newlines) or \(...\)
  const INLINE_MATH_RE = /\$([^$\n]+?)\$|\\\((.+?)\\\)/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = INLINE_MATH_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }
    const latex = stripLatexDelimiters(match[1] || match[2] || "");
    parts.push({ type: "inline_math", latex });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", text: text.slice(lastIndex) });
  }
  return parts.length > 0 ? parts : [{ type: "text", text }];
}

/**
 * Strip outer LaTeX delimiters that GPT sometimes wraps the content in.
 * e.g. "\[E=mc^2\]" → "E=mc^2", "\(x\)" → "x"
 */
function stripLatexDelimiters(latex = "") {
  let s = latex.trim();
  if (s.startsWith("\\[") && s.endsWith("\\]")) s = s.slice(2, -2).trim();
  else if (s.startsWith("\\(") && s.endsWith("\\)")) s = s.slice(2, -2).trim();
  else if (s.startsWith("$$") && s.endsWith("$$")) s = s.slice(2, -2).trim();
  else if (s.startsWith("$") && s.endsWith("$")) s = s.slice(1, -1).trim();
  return s;
}

function normalizeTableRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    if (!Array.isArray(row)) return [];
    return row.map((cell) => ({
      // Renderer requires type === "table_cell" to use the proper TableCell path
      type: "table_cell",
      blocks: Array.isArray(cell?.blocks) ? cell.blocks.map(normalizeBlock) : [
        // GPT returned a plain-text cell
        {
          type: "paragraph",
          children: [{ type: "text", text: String(cell?.text || cell || ""), formatting: {}, source: "ai-vision", confidence: 0.88 }],
          equation_ids: [],
          confidence: 0.88,
          source: "ai-vision"
        }
      ]
    }));
  });
}

function extractTotalText(sections) {
  let text = "";
  for (const sec of sections) {
    for (const block of sec.blocks) {
      if (block.children) {
        for (const child of block.children) {
          if (child.text) text += child.text + " ";
        }
      }
    }
  }
  return text;
}

function computeDocConfidence(sections, equations) {
  const allConfidences = [];
  for (const sec of sections) {
    for (const block of sec.blocks) {
      if (Number.isFinite(block.confidence)) allConfidences.push(block.confidence);
    }
  }
  for (const eq of equations) {
    if (Number.isFinite(eq.confidence)) allConfidences.push(eq.confidence);
  }
  if (allConfidences.length === 0) return 0.85;
  return allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length;
}

function mimeTypeFor(sourceType) {
  switch (sourceType) {
    case "pdf":   return "application/pdf";
    case "pptx":  return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "image": return "image/*";
    default:      return "application/octet-stream";
  }
}

// ─── PDF extraction ──────────────────────────────────────────────────────────

// Characters per chunk — roughly 5-6 pages of dense academic text per GPT-4o call
const PDF_CHUNK_SIZE = 12000;

/**
 * Extract PDF text by running pdfjs-dist in a child process (plain Node.js, outside webpack).
 * The worker script is written to /tmp with the absolute pdfjs path embedded — works on
 * local dev, Vercel Lambda, and any Node.js environment.
 */
async function extractPdfText(buf) {
  const workerPath = ensureWorker();
  const b64 = buf.toString("base64");

  // Write PDF data to a unique temp file.
  // async execFile does NOT support the `input` option for writing to a child process's
  // stdin (unlike execSync / spawnSync). Passing the data via a temp file is reliable.
  const tmpInputPath = path.join(tmpdir(), `luna-pdf-in-${Date.now()}-${Math.random().toString(36).slice(2)}.b64`);
  writeFileSync(tmpInputPath, b64, "utf8");

  console.log(`[aiVisionExtractor] Running pdfTextWorker (pdfjs: ${existsSync(PDFJS_PATH) ? "found" : "MISSING"})`);
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [workerPath, tmpInputPath],
      { maxBuffer: 50 * 1024 * 1024, timeout: 60_000 }
    );
    if (stderr) {
      const errLines = stderr.split("\n").filter(l => l && !l.startsWith("Warning:"));
      if (errLines.length) console.error("[aiVisionExtractor] worker stderr:", errLines.join("|").slice(0, 500));
    }
    if (!stdout?.trim()) throw new Error("worker returned empty stdout");
    const result = JSON.parse(stdout);
    if (result.error) throw new Error(result.error);
    console.log(`[aiVisionExtractor] worker success: ${result.pageCount} pages, ${String(result.text||"").length} chars`);
    return { text: String(result.text || ""), pageCount: Number(result.pageCount || 1) };
  } catch (err) {
    console.error("[aiVisionExtractor] worker FAILED:", err.message);
    if (err.stderr) console.error("stderr:", String(err.stderr).slice(0, 400));
    if (err.stdout) console.error("stdout:", String(err.stdout).slice(0, 200));
    throw err;
  } finally {
    try { unlinkSync(tmpInputPath); } catch { /* ignore cleanup errors */ }
  }
}


/**
 * Fallback for scanned/image-based PDFs: sends the raw PDF to Anthropic's API,
 * which reads PDFs natively (including scanned/image-based ones) via Claude vision.
 * Returns a CDM object, or null if the key is missing or the call fails.
 */
async function extractPdfWithAnthropic(file, pageCount) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    console.log("[aiVisionExtractor] ANTHROPIC_API_KEY not set — skipping Anthropic PDF fallback");
    return null;
  }

  console.log(`[aiVisionExtractor] Anthropic PDF fallback: sending "${file.name}" to Claude`);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: file.contentBase64
            }
          },
          {
            type: "text",
            text: "Extract the full text content of this PDF document. Return ALL text exactly as written, preserving:\n- Headings (mark with ## or ###)\n- Lists (use - for bullets)\n- Tables (use markdown table format)\n- Mathematical formulas (use LaTeX: $...$ for inline, $$...$$ for display)\n- Paragraph breaks\n\nDo not add commentary. Return only the extracted content."
          }
        ]
      }]
    })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const extractedText = data?.content?.[0]?.text || "";
  console.log(`[aiVisionExtractor] Anthropic extracted ${extractedText.length} chars from "${file.name}"`);

  if (extractedText.length < 50) return null;

  // Structure the extracted text into a CDM via OpenAI
  const systemPrompt = buildSystemPrompt("PDF");
  let aiJson;
  try {
    aiJson = await callOpenAI([
      { role: "system", content: systemPrompt },
      { role: "user", content: `File: ${file.name} (${pageCount} page(s), extracted via Anthropic vision)\n\nCONTENT:\n\n${extractedText.slice(0, 12000)}` }
    ]);
  } catch (err) {
    console.warn("[aiVisionExtractor] OpenAI structuring after Anthropic fallback failed:", err.message);
    return buildRawTextCdm(extractedText, file.name, pageCount);
  }

  const cdm = aiJson ? buildCdmFromAiResponse(aiJson, { sourceType: "pdf", fileName: file.name }) : null;
  const hasContent = cdm && Array.isArray(cdm.sections) && cdm.sections.some((s) => s.blocks?.length > 0);
  if (!hasContent) return buildRawTextCdm(extractedText, file.name, pageCount);
  return cdm;
}

// ─── OpenAI-native PDF → Markdown ────────────────────────────────────────────

const DOCUMENT_MODEL = process.env.LUNA_DOCUMENT_MODEL || VISION_MODEL;
const DOCUMENT_MAX_TOKENS = 16384;

const MARKDOWN_SYSTEM_PROMPT = `You convert documents into clean Markdown that another AI model will read as source material, and that a person will read as a preview.

RULES:
1. Work page by page. Begin each page with the marker <!-- page N --> (N = 1, 2, 3 ...) and then transcribe EVERYTHING on that page, top to bottom, including every paragraph that sits above, below or between figures, tables and equations. Never summarise, shorten, merge or skip anything: if a paragraph is on the page it must be in your answer. No commentary and do not wrap the answer in a code fence.
2. Headings and titles: use # to ###### according to the visual hierarchy. A numbered or bold section title such as "1. Central tendency" is a HEADING: write it as "## 1. Central tendency", never as a list item and never as bold text. Do not indent any content under a heading.
3. Formulas: LaTeX. Inline as $...$, standalone equations on their own lines as $$ ... $$. Convert every symbol and fraction faithfully.
4. Tables: GitHub Markdown tables with a header row. Keep every row and column.
5. Lists: - for bullets, 1. for numbered, indent for nesting.
6. Figures, charts, graphs, diagrams, schemes and pictures: put ![detailed description](figure) on its own line. The description must say what it shows: type of chart, axis titles and ranges, series, key values, shapes, labels and the point it makes. Put the caption, if any, on the next line in italics.
7. Bold and italic: **bold**, *italic*. Code: fenced blocks with the language.
8. Handwriting or scanned pages: transcribe faithfully.
9. Running page headers, footers and page numbers (text repeated at the top or bottom of every page, e.g. the document or course name) are NOT content: omit them entirely, but keep the <!-- page N --> markers.
10. Before finishing, re-check each page for paragraphs you skipped and add them.`;

async function callOpenAIText(messages, { model = DOCUMENT_MODEL, maxTokens = DOCUMENT_MAX_TOKENS } = {}) {
  const res = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getApiKey()}` },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0 })
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI API error ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  return {
    text: String(data?.choices?.[0]?.message?.content || ""),
    finishReason: data?.choices?.[0]?.finish_reason || ""
  };
}

function markdownInlineChildren(text) {
  const MATH_RE = /\$([^$\n]+?)\$|\\\((.+?)\\\)/g;
  const EMPH_RE = /(\*\*[^*]+\*\*|\*[^*\n]+\*)/g;
  const children = [];
  const pushText = (chunk) => {
    for (const part of chunk.split(EMPH_RE)) {
      if (!part) continue;
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        children.push({ type: "text", text: part.slice(2, -2), formatting: { bold: true } });
      } else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
        children.push({ type: "text", text: part.slice(1, -1), formatting: { italic: true } });
      } else {
        children.push({ type: "text", text: part });
      }
    }
  };
  let last = 0;
  let m;
  while ((m = MATH_RE.exec(text)) !== null) {
    if (m.index > last) pushText(text.slice(last, m.index));
    children.push({ type: "inline_math", latex: (m[1] || m[2] || "").trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) pushText(text.slice(last));
  return children.length ? children : [{ type: "text", text: "" }];
}

function markdownToBlocks(markdown) {
  const lines = String(markdown || "").replace(/\r/g, "").split("\n");
  const blocks = [];
  const equations = [];
  let para = [];
  let i = 0;
  let afterPageMarker = false;
  const seenHeadings = new Set();

  const flushPara = () => {
    if (!para.length) return;
    blocks.push({ type: "paragraph", children: markdownInlineChildren(para.join(" ")), equation_ids: [] });
    para = [];
  };
  const isTableSep = (s) => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(s.trim());
  const splitRow = (s) => s.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const listRe = /^\s*([-*+]|\d+[.)])\s+(.*)$/;

  while (i < lines.length) {
    const t = lines[i].trim();
    if (!t) { flushPara(); i++; continue; }

    if (/^<!--\s*page\b/i.test(t)) { flushPara(); afterPageMarker = true; i++; continue; }
    const wasAfterPageMarker = afterPageMarker;
    afterPageMarker = false;

    if (t.startsWith("```")) {
      flushPara();
      const language = t.slice(3).trim();
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) buf.push(lines[i++]);
      i++;
      blocks.push({ type: "code", language, text: buf.join("\n") });
      continue;
    }

    if (t.startsWith("$$") || t.startsWith("\\[")) {
      flushPara();
      const open = t.startsWith("$$") ? "$$" : "\\[";
      const close = t.startsWith("$$") ? "$$" : "\\]";
      let body = t.slice(open.length);
      if (body.includes(close)) {
        body = body.slice(0, body.indexOf(close));
      } else {
        const buf = [body];
        i++;
        while (i < lines.length && !lines[i].includes(close)) buf.push(lines[i++]);
        if (i < lines.length) buf.push(lines[i].slice(0, lines[i].indexOf(close)));
        body = buf.join("\n");
      }
      i++;
      const id = `eq-${equations.length + 1}`;
      equations.push({ id, latex: body.trim(), display: true, confidence: 0.92 });
      blocks.push({ type: "display_math", equation_id: id, latex: body.trim() });
      continue;
    }

    const heading = t.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushPara();
      const text = heading[2].replace(/\*\*|__/g, "").trim();
      const key = text.toLowerCase();
      if (wasAfterPageMarker && seenHeadings.has(key)) { i++; continue; }
      seenHeadings.add(key);
      blocks.push({ type: "heading", level: heading[1].length, text, children: markdownInlineChildren(text) });
      i++;
      continue;
    }

    if (t.startsWith("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flushPara();
      const rows = [splitRow(t)];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(splitRow(lines[i++]));
      blocks.push({ type: "table", rows: rows.map((r) => r.map((text) => ({ text }))) });
      continue;
    }

    const figure = t.match(/^!\[(.*?)\]\(.*?\)\s*$/);
    if (figure) {
      flushPara();
      i++;
      let caption = "";
      const next = (lines[i] || "").trim();
      if (/^\*[^*].*\*$/.test(next) || /^_[^_].*_$/.test(next)) {
        caption = next.slice(1, -1).trim();
        i++;
      }
      blocks.push({ type: "figure", alt_text: figure[1].trim(), caption });
      continue;
    }

    if (listRe.test(lines[i])) {
      flushPara();
      const ordered = /^\s*\d/.test(lines[i]);
      const items = [];
      while (i < lines.length && listRe.test(lines[i])) {
        items.push({ text: lines[i].match(listRe)[2].trim() });
        i++;
      }
      blocks.push({ type: "list", list_type: ordered ? "numbered" : "bullet", level: 0, list_items: items });
      continue;
    }

    if (t.startsWith(">")) {
      flushPara();
      const buf = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) buf.push(lines[i++].trim().replace(/^>\s?/, ""));
      blocks.push({ type: "quote", children: markdownInlineChildren(buf.join(" ")) });
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t) || /^<!--.*-->$/.test(t)) { flushPara(); i++; continue; }

    para.push(t);
    i++;
  }
  flushPara();
  return { blocks, equations };
}

/**
 * Primary PDF path: hand the PDF to OpenAI, get Markdown back, then derive the CDM from that
 * Markdown. OpenAI reads both the embedded text and the page images, so scanned PDFs,
 * charts and formulas work without server-side rendering.
 * Returns { cdm, markdown }.
 */
async function extractPdfViaMarkdown(file) {
  console.log(`[aiVisionExtractor] PDF "${file.name}": converting to Markdown with ${DOCUMENT_MODEL}`);
  const { text, finishReason } = await callOpenAIText([
    { role: "system", content: MARKDOWN_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        {
          type: "file",
          file: {
            filename: file.name || "document.pdf",
            file_data: `data:application/pdf;base64,${file.contentBase64}`
          }
        },
        { type: "text", text: "Convert this entire document to Markdown following the rules." }
      ]
    }
  ]);

  let markdown = text.trim().replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i, "$1").trim();
  if (markdown.length < 20) throw new Error("OpenAI returned no usable Markdown for the PDF");
  if (finishReason === "length") {
    markdown += "\n\n> Note: this document is longer than the converter's output limit, so the end was cut off.";
  }

  const { blocks, equations } = markdownToBlocks(markdown);
  const firstHeading = blocks.find((b) => b.type === "heading")?.text || "";
  const title = firstHeading && !/^\d/.test(firstHeading) ? firstHeading : (file.name || "Untitled").replace(/\.pdf$/i, "");
  const cdm = buildCdmFromAiResponse({ title, equations, sections: [{ blocks }] }, { sourceType: "pdf", fileName: file.name });
  cdm.metadata.extraction_method = `openai-pdf-markdown-${DOCUMENT_MODEL}`;
  console.log(`[aiVisionExtractor] PDF "${file.name}": ${markdown.length} chars of Markdown, ${blocks.length} blocks`);
  return { cdm, markdown };
}

async function extractPdf(file) {
  const buf = base64ToBuffer(file.contentBase64);

  // 1. Extract raw text using pdfjs-dist directly (pdf-parse v2 requires @napi-rs/canvas which isn't available)
  let rawText = "";
  let pageCount = 1;
  try {
    const result = await extractPdfText(buf);
    rawText = result.text;
    pageCount = result.pageCount;
    console.log(`[aiVisionExtractor] pdfjs extracted ${rawText.length} chars from ${pageCount} pages`);
  } catch (err) {
    console.error("[aiVisionExtractor] pdfjs text extraction FAILED — falling back to scanned path:", err.message, err.stack?.split("\n").slice(0, 3).join(" | "));
  }

  console.log(`[aiVisionExtractor] PDF text length after extraction: ${rawText.trim().length} chars`);
  const isScanned = rawText.trim().length < 50;

  const systemPrompt = buildSystemPrompt("PDF");

  if (isScanned) {
    // pdfjs found no selectable text — try Anthropic API which natively reads PDFs (including scanned).
    console.log(`[aiVisionExtractor] PDF "${file.name}" has no extractable text — trying Anthropic vision fallback`);
    try {
      const anthropicCdm = await extractPdfWithAnthropic(file, pageCount);
      if (anthropicCdm) return anthropicCdm;
    } catch (err) {
      console.warn("[aiVisionExtractor] Anthropic fallback failed:", err.message);
    }
    // Final fallback: honest "no text" message
    const docId = crypto.randomUUID();
    const pageLabel = `${pageCount} page${pageCount !== 1 ? "s" : ""}`;
    return {
      schemaVersion: "2.0",
      schema_version: "cdm.v2",
      document_id: docId,
      metadata: {
        title: file.name || "Untitled",
        source_type: "pdf",
        mime_type: "application/pdf",
        extraction_method: "scanned-pdf-no-text"
      },
      equations: [],
      sections: [{
        blocks: [{
          type: "paragraph",
          children: [{ type: "text", text: `This PDF (${pageLabel}) does not contain selectable text. It may be a scanned or image-based document. Upload a text-based PDF or DOCX for full content extraction.` }],
          equation_ids: [],
          confidence: 0.5,
          source: "scanned-fallback"
        }]
      }],
      stats: { section_count: 1, block_count: 1, equation_count: 0, table_count: 0, text_length: 0 },
      confidence: 0.5,
      debug: { source: "aiVisionExtractor", fallback: "scanned-pdf", pageCount }
    };
  }

  // 2. Chunk large documents — process each chunk, merge sections
  const chunks = chunkText(rawText, PDF_CHUNK_SIZE);
  console.log(`[aiVisionExtractor] PDF "${file.name}": ${pageCount} pages, ${chunks.length} chunk(s), ${rawText.length} chars`);

  if (chunks.length === 1) {
    // Small document — single call
    let aiJson;
    try {
      const userContent = buildPdfUserPrompt(file.name, pageCount, chunks[0], 1, 1);
      aiJson = await callOpenAI([{ role: "system", content: systemPrompt }, { role: "user", content: userContent }]);
    } catch (err) {
      console.warn(`[aiVisionExtractor] GPT-4o call failed for "${file.name}", falling back to raw text CDM:`, err.message);
      aiJson = null;
    }
    const cdm = aiJson ? buildCdmFromAiResponse(aiJson, { sourceType: "pdf", fileName: file.name }) : null;
    // Guard: if GPT returned empty sections (or call failed), build a plain-text CDM from rawText so
    // the document preview and exports always contain the extracted content.
    const hasContent = cdm && Array.isArray(cdm.sections) && cdm.sections.some((s) => s.blocks?.length > 0);
    if (!hasContent) {
      console.warn(`[aiVisionExtractor] GPT returned empty sections for "${file.name}" — using raw-text fallback CDM`);
      return buildRawTextCdm(rawText, file.name, pageCount);
    }
    return cdm;
  }

  // Large document — parallel chunk calls, then merge
  const chunkPromises = chunks.map((chunk, i) => {
    const userContent = buildPdfUserPrompt(file.name, pageCount, chunk, i + 1, chunks.length);
    return callOpenAI([{ role: "system", content: systemPrompt }, { role: "user", content: userContent }])
      .catch((err) => {
        console.warn(`[aiVisionExtractor] chunk ${i + 1}/${chunks.length} failed:`, err.message);
        return null;
      });
  });

  const chunkResults = await Promise.all(chunkPromises);

  // Merge: gather equations globally, concatenate sections from each chunk
  const mergedEquations = [];
  const mergedSections = [];
  const eqIdSet = new Set();

  for (const result of chunkResults) {
    if (!result) continue;
    if (Array.isArray(result.equations)) {
      for (const eq of result.equations) {
        if (!eqIdSet.has(eq.id)) {
          eqIdSet.add(eq.id);
          mergedEquations.push(eq);
        }
      }
    }
    if (Array.isArray(result.sections)) {
      mergedSections.push(...result.sections);
    } else if (Array.isArray(result.blocks)) {
      mergedSections.push({ blocks: result.blocks });
    }
  }

  // Build merged CDM directly
  const docId = crypto.randomUUID();
  const sections = mergedSections.map((sec) => ({
    blocks: Array.isArray(sec.blocks) ? sec.blocks.map(normalizeBlock) : []
  }));
  const equations = mergedEquations.map((eq, i) => ({
    id: String(eq.id || `eq-${i + 1}`),
    latex: stripLatexDelimiters(String(eq.latex || "")),
    display: Boolean(eq.display),
    confidence: Number.isFinite(eq.confidence) ? eq.confidence : 0.88,
    source: "ai-vision"
  }));

  let blockCount = 0, tableCount = 0;
  for (const sec of sections) { blockCount += sec.blocks.length; tableCount += sec.blocks.filter((b) => b.type === "table").length; }

  // Use first non-empty title
  let title = file.name;
  for (const result of chunkResults) {
    if (result?.title && String(result.title).trim() && String(result.title) !== "Untitled") {
      title = String(result.title).trim();
      break;
    }
  }

  const mergedHasContent = sections.some((s) => s.blocks?.length > 0);
  if (!mergedHasContent) {
    console.warn(`[aiVisionExtractor] All chunks returned empty sections for "${file.name}" — using raw-text fallback CDM`);
    return buildRawTextCdm(rawText, file.name, pageCount);
  }

  return {
    schemaVersion: "2.0",
    schema_version: "cdm.v2",
    document_id: docId,
    metadata: { title, source_type: "pdf", mime_type: "application/pdf", extraction_method: `ai-vision-${VISION_MODEL}` },
    equations,
    sections,
    stats: { section_count: sections.length, block_count: blockCount, equation_count: equations.length, table_count: tableCount, text_length: rawText.length },
    confidence: computeDocConfidence(sections, equations),
    debug: { source: "aiVisionExtractor", chunks: chunks.length }
  };
}

/**
 * Build a minimal CDM from raw extracted text when GPT-4o returns empty sections.
 * Splits the text at double-newlines into paragraph blocks so the document is always readable.
 */
function buildRawTextCdm(rawText, fileName, pageCount) {
  const paragraphs = String(rawText || "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  // Try to detect the first line as a heading
  const blocks = paragraphs.map((p, i) => {
    if (i === 0 && p.length < 120 && !p.includes("\n")) {
      return {
        type: "heading",
        level: 1,
        text: p,
        children: [],
        confidence: 0.75,
        source: "raw-text-fallback"
      };
    }
    return {
      type: "paragraph",
      children: [{ type: "text", text: p }],
      equation_ids: [],
      confidence: 0.75,
      source: "raw-text-fallback"
    };
  });

  const docId = crypto.randomUUID();
  return {
    schemaVersion: "2.0",
    schema_version: "cdm.v2",
    document_id: docId,
    metadata: {
      title: fileName || "Untitled",
      source_type: "pdf",
      mime_type: "application/pdf",
      extraction_method: "raw-text-fallback"
    },
    equations: [],
    sections: [{ blocks }],
    stats: {
      section_count: 1,
      block_count: blocks.length,
      equation_count: 0,
      table_count: 0,
      text_length: rawText.length
    },
    confidence: 0.75,
    debug: { source: "aiVisionExtractor", fallback: "raw-text", pageCount }
  };
}

function buildPdfUserPrompt(fileName, pageCount, chunkText, chunkIndex, totalChunks) {
  const chunkNote = totalChunks > 1
    ? `\n\nNOTE: This is chunk ${chunkIndex} of ${totalChunks}. Extract only the content in this chunk. Use equation IDs like "eq-${chunkIndex}-1", "eq-${chunkIndex}-2", etc. to avoid collisions.`
    : "";
  return `Extract all content from this PDF document. Pay special attention to mathematical formulas (output as clean LaTeX without delimiters), tables, and document structure.

File: ${fileName}
Total pages: ${pageCount}${chunkNote}

EXTRACTED TEXT:
${chunkText}`;
}

/**
 * Split text into chunks at natural boundaries (paragraphs, newlines).
 * Tries not to cut mid-formula or mid-sentence.
 */
function chunkText(text, maxChars) {
  if (text.length <= maxChars) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining);
      break;
    }
    // Find a good split point near maxChars — prefer double-newline (paragraph break)
    let splitAt = maxChars;
    const doubleNewline = remaining.lastIndexOf("\n\n", maxChars);
    const singleNewline = remaining.lastIndexOf("\n", maxChars);
    if (doubleNewline > maxChars * 0.6) splitAt = doubleNewline + 2;
    else if (singleNewline > maxChars * 0.6) splitAt = singleNewline + 1;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  return chunks;
}

// ─── Image extraction ────────────────────────────────────────────────────────

async function extractImage(file) {
  const mimeType = file.mimeType || "image/jpeg";
  const imageDataUrl = `data:${mimeType};base64,${file.contentBase64}`;

  const systemPrompt = buildSystemPrompt("image/handwritten document");
  const messages = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: { url: imageDataUrl, detail: "high" }
        },
        {
          type: "text",
          text: `Extract all content from this image. If it contains handwriting, transcribe it faithfully. If it contains formulas, convert them to LaTeX. File: ${file.name}`
        }
      ]
    }
  ];

  const aiJson = await callOpenAI(messages, { model: VISION_MODEL });
  return buildCdmFromAiResponse(aiJson, { sourceType: "image", fileName: file.name });
}

// ─── PPTX extraction ─────────────────────────────────────────────────────────

async function extractPptx(file) {
  const buf = base64ToBuffer(file.contentBase64);
  const zip = await JSZip.loadAsync(buf);

  // Extract slides text from OOXML
  const slideEntries = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)?.[0] || "0", 10);
      const nb = parseInt(b.match(/\d+/)?.[0] || "0", 10);
      return na - nb;
    });

  const slidesContent = [];
  const imageMessages = [];

  for (let i = 0; i < slideEntries.length; i++) {
    const slideXml = await zip.files[slideEntries[i]].async("string");
    const slideText = extractPptxSlideText(slideXml);
    slidesContent.push(`--- SLIDE ${i + 1} ---\n${slideText}`);
  }

  // Extract embedded images from ppt/media/ (up to 5 for token budget)
  const mediaEntries = Object.keys(zip.files)
    .filter((name) => /^ppt\/media\//i.test(name) && /\.(png|jpg|jpeg|gif|webp)$/i.test(name))
    .slice(0, 5);

  for (const mediaPath of mediaEntries) {
    try {
      const imgBuf = await zip.files[mediaPath].async("base64");
      const ext = mediaPath.split(".").pop().toLowerCase();
      const mimeMap = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
      const mime = mimeMap[ext] || "image/png";
      imageMessages.push({
        type: "image_url",
        image_url: { url: `data:${mime};base64,${imgBuf}`, detail: "high" }
      });
    } catch {
      // skip unreadable images
    }
  }

  const systemPrompt = buildSystemPrompt("PowerPoint presentation");
  const userParts = [
    {
      type: "text",
      text: `Extract all content from this PowerPoint presentation. Preserve slide structure as sections, each slide as a section.

File: ${file.name}
Total slides: ${slideEntries.length}

SLIDE TEXT CONTENT:
${slidesContent.join("\n\n").slice(0, 40000)}`
    },
    ...imageMessages
  ];

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userParts }
  ];

  const aiJson = await callOpenAI(messages, { model: VISION_MODEL });
  return buildCdmFromAiResponse(aiJson, { sourceType: "pptx", fileName: file.name });
}

/**
 * Extract plain text from a slide's OOXML XML string.
 * Handles: text runs (a:t), paragraph breaks, and shape titles.
 */
function extractPptxSlideText(slideXml) {
  const lines = [];

  // Extract shape bodies in order
  const spMatches = slideXml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g);
  for (const match of spMatches) {
    const sp = match[0];

    // Check if it's a title placeholder
    const isTitle = /<p:ph\b[^>]*type="(title|ctrTitle)"/i.test(sp);

    // Extract paragraphs
    const parasMatches = sp.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g);
    for (const paraMatch of parasMatches) {
      const para = paraMatch[0];
      // Extract text runs
      const texts = [...para.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g)]
        .map((m) => decodeXmlEntities(m[1] || ""))
        .join("");
      if (texts.trim()) {
        lines.push(isTitle ? `# ${texts.trim()}` : texts.trim());
      }
    }
  }

  return lines.join("\n");
}

function decodeXmlEntities(text = "") {
  return String(text || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Main entry point. Extracts content from a file using GPT-4o vision.
 *
 * @param {object} file   - { name, contentBase64, mimeType, sizeBytes }
 * @param {object} opts   - { detectedType }
 * @returns {object}      - Full CDM v2 canonical document object
 */
export async function extractWithAIVision(file, { detectedType } = {}) {
  const type = detectedType || "unknown";

  let canonicalDocument;
  let sourceMarkdown = "";
  switch (type) {
    case "pdf":
      try {
        const viaMarkdown = await extractPdfViaMarkdown(file);
        canonicalDocument = viaMarkdown.cdm;
        sourceMarkdown = viaMarkdown.markdown;
      } catch (err) {
        console.warn(`[aiVisionExtractor] OpenAI PDF→Markdown failed for "${file.name}", using pdfjs path:`, err.message);
        canonicalDocument = await extractPdf(file);
      }
      break;
    case "pptx":
      canonicalDocument = await extractPptx(file);
      break;
    case "image":
      canonicalDocument = await extractImage(file);
      break;
    default:
      throw new Error(`aiVisionExtractor: unsupported type "${type}"`);
  }

  // Build extraction envelope matching what the pipeline render/verify stages expect
  const text = extractTotalText(canonicalDocument.sections);
  return {
    canonicalDocument,
    method: `ai-vision-${type}`,
    confidence: canonicalDocument.confidence,
    requiresReview: canonicalDocument.confidence < 0.80,
    issues: canonicalDocument.confidence < 0.72 ? ["low-confidence-extraction"] : [],
    riskMarkers: [],
    text,
    markdown: sourceMarkdown, // OpenAI's own Markdown when available; otherwise rendered from the CDM in index.js
    sourceRenderHtml: "", // filled by render stage in index.js
    sourceMimeType: file.mimeType || "",
    // Original file bytes — required for "Download original" / re-processing
    sourceContentBase64: file.contentBase64 || "",
    sourcePreview: text.slice(0, 500)
  };
}
