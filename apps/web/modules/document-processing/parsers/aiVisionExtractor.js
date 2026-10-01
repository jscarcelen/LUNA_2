/**
 * AI Vision Extractor
 *
 * Uses OpenAI GPT-4o (vision) to extract rich content from:
 *   - PDF files       → text via pdf-parse + GPT-4o structuring
 *   - PPTX files      → OOXML text + embedded images → GPT-4o
 *   - Image files     → base64 direct to GPT-4o vision
 *   - Handwritten notes (images) → GPT-4o vision
 *
 * Output: CDM v2 canonical document object, ready for normalizeCanonicalDocument → renderers.
 */

import JSZip from "jszip";

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
          "items": [{ "children": [{ "type": "text", "text": "..." }] }],
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
        latex: String(block.latex || "")
      };

    case "table":
      return {
        ...base,
        rows: normalizeTaleRows(block.rows)
      };

    case "list":
      return {
        ...base,
        list_type: String(block.list_type || "bullet"),
        level: Number(block.level) || 0,
        items: Array.isArray(block.items) ? block.items.map((item) => ({
          children: normalizeChildren(item.children)
        })) : []
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
  return children.map((child) => {
    const type = String(child?.type || "text");
    if (type === "inline_math") {
      return {
        type: "inline_math",
        equation_id: String(child.equation_id || ""),
        latex: String(child.latex || ""),
        source: "ai-vision",
        confidence: Number.isFinite(child.confidence) ? child.confidence : 0.88
      };
    }
    return {
      type: "text",
      text: String(child?.text || ""),
      formatting: {
        bold: Boolean(child?.formatting?.bold),
        italic: Boolean(child?.formatting?.italic),
        underline: Boolean(child?.formatting?.underline),
        font: child?.formatting?.font || null,
        color: child?.formatting?.color || null,
        highlight: child?.formatting?.highlight || null
      },
      source: "ai-vision",
      confidence: Number.isFinite(child?.confidence) ? child.confidence : 0.9
    };
  });
}

function normalizeTaleRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    if (!Array.isArray(row)) return [];
    return row.map((cell) => ({
      blocks: Array.isArray(cell?.blocks) ? cell.blocks.map(normalizeBlock) : [
        // If cell has plain text
        ...(cell?.text ? [{ type: "paragraph", children: [{ type: "text", text: String(cell.text), formatting: {} }], confidence: 0.88, source: "ai-vision" }] : [])
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

async function extractPdf(file) {
  const buf = base64ToBuffer(file.contentBase64);

  // 1. Extract raw text with pdf-parse
  let rawText = "";
  let pageCount = 1;
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const parsed = await pdfParse(buf);
    rawText = parsed.text || "";
    pageCount = parsed.numpages || 1;
  } catch (err) {
    console.warn("[aiVisionExtractor] pdf-parse failed:", err.message);
  }

  const isScanned = rawText.trim().length < 50 && pageCount > 0;

  // 2. Send to GPT-4o for structured extraction
  const systemPrompt = buildSystemPrompt("PDF");
  const userContent = isScanned
    ? `This appears to be a scanned or image-based PDF (${pageCount} page(s), little/no extractable text). Please note that visual content cannot be read from this format — extract what you can from the text provided and flag figures as needed.

File: ${file.name}
Pages: ${pageCount}`
    : `Extract all content from this PDF document. Pay special attention to mathematical formulas (convert to LaTeX), tables, and document structure.

File: ${file.name}
Pages: ${pageCount}

EXTRACTED TEXT:
${rawText.slice(0, 50000)}`; // GPT-4o context limit buffer

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ];

  const aiJson = await callOpenAI(messages, { model: TEXT_MODEL });
  return buildCdmFromAiResponse(aiJson, { sourceType: "pdf", fileName: file.name });
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
  switch (type) {
    case "pdf":
      canonicalDocument = await extractPdf(file);
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
    markdown: "",    // will be filled by render stage
    sourceRenderHtml: "",  // will be filled by render stage
    sourceMimeType: file.mimeType || "",
    sourcePreview: text.slice(0, 500)
  };
}
