const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "was", "with", "which", "what", "when", "where", "who", "why", "how", "your", "their", "then", "than", "into", "about", "over", "under", "after", "before"
]);

export const DEFAULT_CHUNK_WORDS = 500;
export const DEFAULT_OVERLAP_WORDS = 150;

function tokenizeWords(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean);
}

function topKeywords(text, limit = 8) {
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
  const words = tokenizeWords(text);
  if (!words.length) return 0;

  const uniqueRatio = new Set(words.map((word) => word.toLowerCase())).size / words.length;
  const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
  const headingBonus = /[:\-]/.test(text.slice(0, 120)) ? 0.12 : 0;
  const keywordBonus = Math.min(0.2, keywords.length * 0.02);

  return Number((uniqueRatio * 0.6 + (avgWordLength / 10) * 0.2 + headingBonus + keywordBonus).toFixed(4));
}

export function chunkDocument(document, options = {}) {
  const chunkWords = Math.max(120, Number(options.chunkWords || DEFAULT_CHUNK_WORDS));
  const overlapWords = Math.max(40, Math.min(chunkWords - 20, Number(options.overlapWords || DEFAULT_OVERLAP_WORDS)));
  const words = tokenizeWords(document.content || "");
  if (!words.length) return [];

  const chunks = [];
  const step = Math.max(1, chunkWords - overlapWords);

  for (let start = 0; start < words.length; start += step) {
    const end = Math.min(words.length, start + chunkWords);
    const content = words.slice(start, end).join(" ");
    const keywords = topKeywords(content);
    chunks.push({
      id: `${document.id || document.name || "doc"}-chunk-${chunks.length + 1}`,
      documentId: document.id || "",
      documentName: document.name || "Untitled document",
      subjectId: document.subjectId || "",
      folderIds: Array.isArray(document.folderIds) ? document.folderIds : [],
      tags: Array.isArray(document.tags) ? document.tags : [],
      chunkIndex: chunks.length,
      wordCount: tokenizeWords(content).length,
      startWord: start,
      endWord: end,
      content,
      keywords,
      semanticScore: scoreIntrinsicChunkQuality(content, keywords)
    });

    if (end >= words.length) break;
  }

  return chunks;
}

export function chunkDocuments(documents, options = {}) {
  return documents.flatMap((document) => chunkDocument(document, options));
}
