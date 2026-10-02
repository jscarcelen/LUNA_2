const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "was", "with", "which", "what", "when", "where", "who", "why", "how", "your", "their", "then", "than", "into", "about", "over", "under", "after", "before"
]);

export const DEFAULT_CHUNK_WORDS = 700;
export const DEFAULT_OVERLAP_WORDS = 80;

const EMBEDDING_SAFE_MAX_TOKENS = 7600;

// Matches CSS-rule-shaped prefixes (e.g. "@page{...}" or ".class{...}") that can leak into
// stored plain text when a template's <style> tag content survives HTML-to-text conversion.
const LEAKED_STYLE_RULE_PATTERN = /^\s*[.#@][\w-]+(?:[\s,>+~]+[.#]?[\w-]+)*\{[^{}]*\}/;

export function stripLeakedStyleTextPrefix(text = "") {
  let source = String(text || "");
  let iterations = 0;
  while (iterations < 200) {
    const match = source.match(LEAKED_STYLE_RULE_PATTERN);
    if (!match) break;
    source = source.slice(match[0].length);
    iterations += 1;
  }
  return source.trimStart();
}

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
  // PDF conversion leaves "<!-- page N -->" markers; they are location data, not content.
  let currentPage = null;
  let blockPage = null;

  function startBlock(type) {
    blockType = type;
    blockLines = [];
    blockHeadingPath = [...headingPath];
    blockPage = currentPage;
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
      page: blockPage,
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

    const pageMarker = line.match(/^\s*<!--\s*page\s+(\d+)\s*-->\s*$/i);
    if (pageMarker) {
      flushBlock();
      currentPage = Number(pageMarker[1]);
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
        page: currentPage,
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
  // Where the chunk *starts* is what a reader needs to find it: the heading path of its first own
  // unit (overlap carried over from the previous chunk does not count), plus every heading inside.
  const own = units.find((unit) => !unit.overlap) || units[0];
  const headingPath = own?.headingPath || [];
  const section = headingPath[headingPath.length - 1] || "";
  const sections = [...new Set(units.filter((unit) => unit.type === "heading" && !unit.overlap).map((unit) => unit.content.replace(/^#{1,6}\s+/, "").trim()))];
  const pages = units.filter((unit) => !unit.overlap && unit.page != null).map((unit) => unit.page);
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
    sections,
    hasOverlap: units.some((unit) => unit.overlap),
    page: pages.length ? pages[0] : null,
    pageEnd: pages.length ? pages[pages.length - 1] : null,
    tokenCount,
    wordCount,
    startWord: startWordApprox,
    endWord: startWordApprox + wordCount,
    keywords,
    semanticScore: scoreIntrinsicChunkQuality(contentMarkdown, keywords)
  };
}

/* ── Semantic boundaries ─────────────────────────────────────────────────────────────────────
 * Chunks follow the document's structure AND its topics:
 *  - a chapter heading always starts a new chunk; a section heading only when the chunk so far is
 *    big enough to stand on its own, so a three-line subsection is kept with its neighbours instead
 *    of becoming a 40-token chunk;
 *  - inside a long section the cut goes where the vocabulary changes most (lexical cohesion between
 *    the text before and after, as in TextTiling), not wherever the size limit happens to fall;
 *  - a clear topic shift ends a chunk that is already reasonably full.
 */
const COHESION_STOP = new Set(["that", "this", "with", "from", "have", "will", "which", "their", "there", "these", "those", "also", "such", "when", "where", "than", "then", "into", "been", "were", "they", "them", "your", "about", "other", "more", "most", "some", "each", "between"]);
// Smallest chunk worth keeping apart, by the depth of the heading that would start the next one.
const MIN_TOKENS_BEFORE_HEADING = { 1: 40, 2: 220, 3: 380 };
const TOPIC_SHIFT_SIMILARITY = 0.1;

function termVector(units) {
  const vector = new Map();
  for (const unit of units) {
    if (unit.type === "heading") continue;
    for (const word of String(unit.content).toLowerCase().match(/[a-z\u00e0-\u00ff][a-z\u00e0-\u00ff-]{3,}/g) || []) {
      if (STOPWORDS.has(word) || COHESION_STOP.has(word)) continue;
      vector.set(word, (vector.get(word) || 0) + 1);
    }
  }
  return vector;
}

function cosine(left, right) {
  if (!left.size || !right.size) return 0.5; // no evidence either way: do not force a cut
  let dot = 0;
  for (const [word, count] of left) dot += count * (right.get(word) || 0);
  const norm = (vector) => Math.sqrt([...vector.values()].reduce((sum, count) => sum + count * count, 0));
  return dot / (norm(left) * norm(right) || 1);
}

/** similarity[i] = how alike the text just before unit i is to the text from unit i on (low = topic change). */
function boundarySimilarities(units, window = 3) {
  return units.map((_, index) => cosine(termVector(units.slice(Math.max(0, index - window), index)), termVector(units.slice(index, index + window))));
}

function semanticChunkMarkdown(markdown, options = {}) {
  const targetTokens = Math.max(300, Number(options.chunkWords || DEFAULT_CHUNK_WORDS));
  const configuredMaxTokens = Math.max(targetTokens, Number(options.maxTokens || 1000));
  const maxTokens = Math.min(configuredMaxTokens, EMBEDDING_SAFE_MAX_TOKENS);
  const overlapTokens = Math.max(30, Math.min(targetTokens - 20, Number(options.overlapWords || DEFAULT_OVERLAP_WORDS)));

  const units = splitMarkdownIntoUnits(markdown)
    .flatMap((unit) => splitOversizedUnit(unit, maxTokens))
    .map((unit, index) => ({ ...unit, index }));
  if (!units.length) return [];
  const similarity = boundarySimilarities(units);

  const chunks = [];
  let bucket = [];
  let bucketTokens = 0;
  let startWordApprox = 0;
  const tokensOf = (list) => list.reduce((sum, unit) => sum + unit.tokenCount, 0);

  /** Emits `emitted` as a chunk; `rest` (units after the cut) and the overlap seed the next one. */
  function emit(emitted, rest, { overlap }) {
    if (!emitted.length) return;
    const chunk = buildChunkFromUnits(emitted, startWordApprox, chunks.length);
    chunks.push(chunk);
    startWordApprox = chunk.endWord;

    let carried = [];
    if (overlap && overlapTokens > 0) {
      let count = 0;
      for (let index = emitted.length - 1; index >= 0; index -= 1) {
        if (emitted[index].type === "heading") break;
        carried.unshift({ ...emitted[index], overlap: true });
        count += emitted[index].tokenCount;
        if (count >= overlapTokens) break;
      }
    }
    bucket = [...carried, ...rest];
    bucketTokens = tokensOf(bucket);
  }

  /** The cut inside the bucket where the topic changes most, leaving both sides a sensible size. */
  function bestCut() {
    let running = 0;
    let best = -1;
    let bestScore = Infinity;
    for (let position = 1; position < bucket.length; position += 1) {
      running += bucket[position - 1].tokenCount;
      const remaining = bucketTokens - running;
      if (running < targetTokens * 0.4 || remaining < 30) continue;
      // Prefer low similarity; a heading right at the cut is the strongest signal of all.
      const score = similarity[bucket[position].index] - (bucket[position].type === "heading" ? 0.3 : 0);
      if (score <= bestScore) { bestScore = score; best = position; }
    }
    return best;
  }

  for (const unit of units) {
    const isHeading = unit.type === "heading";
    const depth = Number(unit.headingDepth || 6);
    const ownTokens = bucket.some((entry) => !entry.overlap) ? tokensOf(bucket.filter((entry) => !entry.overlap)) : 0;

    if (ownTokens) {
      if (isHeading && depth <= 3 && ownTokens >= (MIN_TOKENS_BEFORE_HEADING[depth] || 380)) {
        emit(bucket, [], { overlap: false });
      } else if (!isHeading && bucketTokens >= targetTokens * 0.75 && similarity[unit.index] < TOPIC_SHIFT_SIMILARITY) {
        emit(bucket, [], { overlap: false });
      } else if (bucketTokens + unit.tokenCount > maxTokens) {
        const cut = bestCut();
        if (cut > 0) emit(bucket.slice(0, cut), bucket.slice(cut), { overlap: true });
        else emit(bucket, [], { overlap: true });
      }
    }

    bucket.push(unit);
    bucketTokens += unit.tokenCount;

    if (bucketTokens >= targetTokens && !isHeading) {
      // Full: cut at the best boundary seen so far rather than mid-thought, unless it is all one block.
      const cut = bestCut();
      if (cut > 0 && bucketTokens > targetTokens * 1.1) emit(bucket.slice(0, cut), bucket.slice(cut), { overlap: true });
      else if (bucketTokens >= targetTokens * 1.1) emit(bucket, [], { overlap: true });
    }
  }

  if (bucket.some((entry) => !entry.overlap)) emit(bucket, [], { overlap: false });
  return mergeTinyChunks(chunks, maxTokens);
}

const TINY_CHUNK_TOKENS = 100;

/** A few lines on their own make a poor passage: join them to the neighbour in the same chapter. */
function mergeTinyChunks(chunks, maxTokens) {
  const merged = [];
  const join = (first, second) => {
    const content = normalizeMarkdown(`${first.content}\n\n${second.content}`);
    const keywords = topKeywords(content);
    return {
      ...first,
      content,
      contentMarkdown: content,
      sections: [...new Set([...(first.sections || []), ...(second.sections || [])])],
      pageEnd: second.pageEnd ?? first.pageEnd,
      tokenCount: estimateTokens(content),
      wordCount: content.split(/\s+/).filter(Boolean).length,
      endWord: second.endWord,
      keywords,
      semanticScore: scoreIntrinsicChunkQuality(content, keywords)
    };
  };
  const sameChapter = (left, right) => (left.headingPath?.[0] || "") === (right.headingPath?.[0] || "");
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const previous = merged[merged.length - 1];
    if (chunk.tokenCount < TINY_CHUNK_TOKENS && !chunk.hasOverlap) {
      if (previous && sameChapter(previous, chunk) && previous.tokenCount + chunk.tokenCount <= maxTokens) { merged[merged.length - 1] = join(previous, chunk); continue; }
      const next = chunks[index + 1];
      if (next && !next.hasOverlap && sameChapter(chunk, next) && next.tokenCount + chunk.tokenCount <= maxTokens) { chunks[index + 1] = join(chunk, next); continue; }
    }
    merged.push(chunk);
  }
  return merged.map((chunk, position) => ({ ...chunk, id: `chunk-${position + 1}`, chunkIndex: position }));
}

export function chunkDocument(document, options = {}) {
  const markdown = stripLeakedStyleTextPrefix(String(document?.content || "").trim());
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
    pageEnd: chunk.pageEnd,
    sections: chunk.sections,
    content: chunk.content,
    contentMarkdown: chunk.contentMarkdown,
    keywords: chunk.keywords,
    semanticScore: chunk.semanticScore
  }));
}

export function chunkDocuments(documents, options = {}) {
  return documents.flatMap((document) => chunkDocument(document, options));
}
