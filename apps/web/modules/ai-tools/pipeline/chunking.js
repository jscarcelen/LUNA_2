const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "was", "with", "which", "what", "when", "where", "who", "why", "how", "your", "their", "then", "than", "into", "about", "over", "under", "after", "before"
]);

export const DEFAULT_CHUNK_WORDS = 700;
export const DEFAULT_OVERLAP_WORDS = 80;

const EMBEDDING_SAFE_MAX_TOKENS = 7600;

function estimateTokens(text) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  if (!words) return 0;
  return Math.max(1, Math.round(words * 1.35));
}

function normalizeMarkdown(markdown) {
  return String(markdown || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function topKeywords(text, limit = 10) {
  const counts = new Map();
  const words = String(text || "")
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9-]{2,}/g) || [];

  for (const word of words) {
    if (STOPWORDS.has(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([word]) => word);
}

function scoreIntrinsicChunkQuality(text, keywords) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 0;

  const uniqueRatio = new Set(words.map((word) => word.toLowerCase())).size / words.length;
  const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
  const headingBonus = /(^|\n)#{1,3}\s+/.test(text) ? 0.12 : 0;
  const tableBonus = /(^|\n)\|.+\|/.test(text) ? 0.08 : 0;
  const keywordBonus = Math.min(0.2, keywords.length * 0.02);

  return Number((uniqueRatio * 0.55 + (avgWordLength / 10) * 0.15 + headingBonus + tableBonus + keywordBonus).toFixed(4));
}

function collectCanonicalEquations(canonicalDocument = {}) {
  const equations = Array.isArray(canonicalDocument?.equations) ? canonicalDocument.equations : [];
  return equations
    .map((equation) => ({
      id: String(equation?.id || "").trim(),
      latex: String(equation?.latex || "").trim()
    }))
    .filter((equation) => equation.id && equation.latex);
}

function matchEquationIdsInChunk(content = "", equations = []) {
  const source = String(content || "");
  if (!source || !Array.isArray(equations) || !equations.length) return [];

  const ids = [];
  for (const equation of equations) {
    if (!equation?.id || !equation?.latex) continue;
    if (source.includes(equation.latex)) {
      ids.push(equation.id);
    }
  }
  return Array.from(new Set(ids));
}

function isHeadingLine(line) {
  return /^(#{1,6})\s+/.test(line);
}

function isListLine(line) {
  return /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line);
}

function isTableLine(line) {
  return /^\s*\|.*\|\s*$/.test(line) || /^\s*[:-]{2,}\s*(\|\s*[:-]{2,}\s*)+$/.test(line);
}

function isBlockquoteLine(line) {
  return /^\s*>\s?/.test(line);
}

function splitMarkdownIntoUnits(markdown) {
  const lines = normalizeMarkdown(markdown).split("\n");
  const units = [];
  const headingPath = [];

  let inCodeFence = false;
  let inMathFence = false;
  let blockLines = [];
  let blockType = "";
  let blockHeadingPath = [];

  function startBlock(type) {
    blockType = type;
    blockLines = [];
    blockHeadingPath = [...headingPath];
  }

  function flushBlock() {
    if (!blockLines.length) return;
    const content = blockLines.join("\n").trim();
    if (!content) {
      blockLines = [];
      blockType = "";
      return;
    }

    units.push({
      type: blockType || "paragraph",
      content,
      headingPath: [...blockHeadingPath],
      tokenCount: estimateTokens(content)
    });

    blockLines = [];
    blockType = "";
  }

  for (const rawLine of lines) {
    const line = String(rawLine || "");

    if (/^```/.test(line)) {
      if (!inCodeFence) {
        flushBlock();
        startBlock("code");
      }
      inCodeFence = !inCodeFence;
      blockLines.push(line);
      if (!inCodeFence) flushBlock();
      continue;
    }

    if (/^\s*\$\$\s*$/.test(line)) {
      if (!inMathFence) {
        flushBlock();
        startBlock("math");
      }
      inMathFence = !inMathFence;
      blockLines.push(line);
      if (!inMathFence) flushBlock();
      continue;
    }

    if (inCodeFence || inMathFence) {
      blockLines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushBlock();
      continue;
    }

    if (isHeadingLine(line)) {
      flushBlock();
      const depth = Number(line.match(/^(#{1,6})\s+/)?.[1]?.length || 1);
      const headingText = line.replace(/^(#{1,6})\s+/, "").trim();
      headingPath[depth - 1] = headingText;
      headingPath.splice(depth);
      units.push({
        type: "heading",
        content: line,
        headingPath: [...headingPath],
        headingDepth: depth,
        tokenCount: estimateTokens(line)
      });
      continue;
    }

    const nextType = isTableLine(line)
      ? "table"
      : (isListLine(line)
        ? "list"
        : (isBlockquoteLine(line)
          ? "blockquote"
          : "paragraph"));

    if (!blockLines.length) {
      startBlock(nextType);
      blockLines.push(line);
      continue;
    }

    const compatible =
      blockType === nextType
      || (blockType === "paragraph" && nextType === "paragraph")
      || (blockType === "list" && /^\s{2,}/.test(line));

    if (!compatible) {
      flushBlock();
      startBlock(nextType);
    }

    blockLines.push(line);
  }

  flushBlock();
  return units.filter((unit) => unit.content);
}

function splitUnitByWords(text, maxTokens) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const approxWordsPerPart = Math.max(120, Math.floor(maxTokens / 1.45));
  const parts = [];
  for (let index = 0; index < words.length; index += approxWordsPerPart) {
    parts.push(words.slice(index, index + approxWordsPerPart).join(" "));
  }
  return parts;
}

function splitUnitBySentences(text, maxTokens) {
  const normalized = String(text || "").trim();
  if (!normalized) return [];

  const sentences = normalized
    .split(/(?<=[.!?])\s+(?=[A-Z0-9(["'])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (!sentences.length) {
    return splitUnitByWords(normalized, maxTokens);
  }

  const parts = [];
  let bucket = [];
  let bucketTokens = 0;

  for (const sentence of sentences) {
    const sentenceTokens = estimateTokens(sentence);
    if (sentenceTokens > maxTokens) {
      if (bucket.length) {
        parts.push(bucket.join(" "));
        bucket = [];
        bucketTokens = 0;
      }
      const splitSentence = splitUnitByWords(sentence, maxTokens);
      parts.push(...splitSentence);
      continue;
    }

    if (bucket.length && bucketTokens + sentenceTokens > maxTokens) {
      parts.push(bucket.join(" "));
      bucket = [];
      bucketTokens = 0;
    }

    bucket.push(sentence);
    bucketTokens += sentenceTokens;
  }

  if (bucket.length) {
    parts.push(bucket.join(" "));
  }

  return parts;
}

function splitOversizedUnit(unit, maxTokens) {
  if (!unit || unit.tokenCount <= maxTokens) return [unit];

  const content = String(unit.content || "").trim();
  if (!content) return [];

  const byLines = ["code", "table", "list", "blockquote"].includes(unit.type);
  const rawParts = byLines
    ? content.split(/\n{2,}|\n/).map((part) => part.trim()).filter(Boolean)
    : splitUnitBySentences(content, maxTokens);

  if (!rawParts.length) return [];

  const safeParts = [];
  for (const part of rawParts) {
    const partTokens = estimateTokens(part);
    if (partTokens <= maxTokens) {
      safeParts.push(part);
      continue;
    }
    safeParts.push(...splitUnitByWords(part, maxTokens));
  }

  return safeParts
    .map((part) => ({
      ...unit,
      content: part,
      tokenCount: estimateTokens(part)
    }))
    .filter((part) => part.content && part.tokenCount > 0);
}

function buildChunkFromUnits(units, startWordApprox, index) {
  const contentMarkdown = normalizeMarkdown(units.map((unit) => unit.content).join("\n\n"));
  const headingPath = units[units.length - 1]?.headingPath || [];
  const section = headingPath[headingPath.length - 1] || "";
  const tokenCount = estimateTokens(contentMarkdown);
  const wordCount = String(contentMarkdown).split(/\s+/).filter(Boolean).length;
  const keywords = topKeywords(contentMarkdown);

  return {
    id: `chunk-${index + 1}`,
    chunkIndex: index,
    content: contentMarkdown,
    contentMarkdown,
    headingPath,
    section,
    page: null,
    tokenCount,
    wordCount,
    startWord: startWordApprox,
    endWord: startWordApprox + wordCount,
    keywords,
    semanticScore: scoreIntrinsicChunkQuality(contentMarkdown, keywords)
  };
}

// Chapter/section-level headings (depth 1-3) force a chunk boundary so a chunk never blends two sections.
const HEADING_HARD_SPLIT_MAX_DEPTH = 3;
const MIN_HARD_SPLIT_TOKENS = 40;

function semanticChunkMarkdown(markdown, options = {}) {
  const targetTokens = Math.max(300, Number(options.chunkWords || DEFAULT_CHUNK_WORDS));
  const configuredMaxTokens = Math.max(targetTokens, Number(options.maxTokens || 1000));
  const maxTokens = Math.min(configuredMaxTokens, EMBEDDING_SAFE_MAX_TOKENS);
  const overlapTokens = Math.max(30, Math.min(targetTokens - 20, Number(options.overlapWords || DEFAULT_OVERLAP_WORDS)));

  const units = splitMarkdownIntoUnits(markdown)
    .flatMap((unit) => splitOversizedUnit(unit, maxTokens));
  if (!units.length) return [];

  const chunks = [];
  let bucket = [];
  let bucketTokens = 0;
  let startWordApprox = 0;

  function pushBucket(pushOptions = {}) {
    if (!bucket.length) return;
    const chunk = buildChunkFromUnits(bucket, startWordApprox, chunks.length);
    chunks.push(chunk);
    startWordApprox = chunk.endWord;

    // Hard section boundaries start the next chunk fresh so section metadata stays unambiguous.
    if (pushOptions.hardBoundary || overlapTokens <= 0) {
      bucket = [];
      bucketTokens = 0;
      return;
    }

    let overlap = [];
    let overlapCount = 0;
    for (let index = bucket.length - 1; index >= 0; index -= 1) {
      overlap.unshift(bucket[index]);
      overlapCount += bucket[index].tokenCount;
      if (overlapCount >= overlapTokens) break;
    }

    bucket = overlap;
    bucketTokens = overlapCount;
  }

  for (const unit of units) {
    const nextTokens = bucketTokens + unit.tokenCount;
    const isHardHeadingBoundary = unit.type === "heading" && Number(unit.headingDepth || 6) <= HEADING_HARD_SPLIT_MAX_DEPTH;

    if (isHardHeadingBoundary && bucket.length && bucketTokens >= MIN_HARD_SPLIT_TOKENS) {
      pushBucket({ hardBoundary: true });
    } else if (bucket.length && nextTokens > maxTokens) {
      pushBucket();
    }

    if (!bucket.length && unit.tokenCount > maxTokens) {
      bucket.push(unit);
      bucketTokens += unit.tokenCount;
      pushBucket();
      continue;
    }

    bucket.push(unit);
    bucketTokens += unit.tokenCount;

    if (bucketTokens >= targetTokens) {
      pushBucket();
    }
  }

  if (bucket.length) pushBucket();
  return chunks;
}

export function chunkDocument(document, options = {}) {
  const markdown = String(document?.content || "").trim();
  if (!markdown) return [];

  const semanticChunks = semanticChunkMarkdown(markdown, options);
  const canonicalEquations = collectCanonicalEquations(document?.canonicalDocument);
  return semanticChunks.map((chunk, index) => ({
    equationIds: matchEquationIdsInChunk(chunk.contentMarkdown || chunk.content, canonicalEquations),
    id: `${document.id || document.name || "doc"}-chunk-${index + 1}`,
    documentId: document.id || "",
    documentName: document.name || "Untitled document",
    subjectId: document.subjectId || "",
    folderIds: Array.isArray(document.folderIds) ? document.folderIds : [],
    tags: Array.isArray(document.tags) ? document.tags : [],
    chunkIndex: index,
    tokenCount: chunk.tokenCount,
    wordCount: chunk.wordCount,
    startWord: chunk.startWord,
    endWord: chunk.endWord,
    section: chunk.section,
    headingPath: chunk.headingPath,
    page: chunk.page,
    content: chunk.content,
    contentMarkdown: chunk.contentMarkdown,
    keywords: chunk.keywords,
    semanticScore: chunk.semanticScore
  }));
}

export function chunkDocuments(documents, options = {}) {
  return documents.flatMap((document) => chunkDocument(document, options));
}
