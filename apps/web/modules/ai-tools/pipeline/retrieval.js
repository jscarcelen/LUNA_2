function normalizeTerms(value) {
  return Array.from(
    new Set(
      String(value || "")
        .toLowerCase()
        .match(/[a-z0-9][a-z0-9-]{2,}/g) || []
    )
  );
}

function scoreChunkAgainstQuery(chunk, queryTerms, selectedTags) {
  const body = `${chunk.content} ${chunk.section || ""} ${(chunk.headingPath || []).join(" ")} ${chunk.keywords.join(" ")} ${chunk.tags.join(" ")}`.toLowerCase();
  let score = (chunk.semanticScore || 0) + ((chunk.vectorSimilarity || 0) * 3);

  for (const term of queryTerms) {
    if (body.includes(term)) score += 1.8;
    if (chunk.keywords.includes(term)) score += 1.2;
  }

  for (const tag of selectedTags) {
    if (chunk.tags.includes(tag)) score += 1;
  }

  return Number(score.toFixed(4));
}

export function selectTopChunks(chunks, config) {
  const queryTerms = normalizeTerms(`${config.topicPrompt || ""} ${config.title || ""}`);
  const selectedTags = (config.scope?.tagNames || []).map((tag) => String(tag).trim().toLowerCase()).filter(Boolean);
  const chunkTarget = Math.max(Number(config.questionCount || 6) * 3, 8);

  return chunks
    .map((chunk) => ({
      ...chunk,
      retrievalScore: scoreChunkAgainstQuery(chunk, queryTerms, selectedTags)
    }))
    .sort((left, right) => right.retrievalScore - left.retrievalScore)
    .slice(0, chunkTarget);
}

/**
 * Picks the chunks an agent run will actually read. Everything fits when the material is small;
 * otherwise the best-scoring chunks up to `charBudget` are kept, then put back in document order
 * so summaries and explanations read coherently. Chunks are never truncated.
 */
export function selectChunksWithinBudget(chunks, config, charBudget = 48000) {
  const total = chunks.reduce((sum, chunk) => sum + String(chunk.content || "").length, 0);
  const order = (list) => [...list].sort((a, b) => (a.documentName || "").localeCompare(b.documentName || "") || (a.chunkIndex || 0) - (b.chunkIndex || 0));
  if (total <= charBudget) return { chunks: order(chunks), truncated: false, totalChars: total };
  const ranked = selectTopChunks(chunks, { ...config, questionCount: 1000 });
  const picked = [];
  let used = 0;
  for (const chunk of ranked) {
    const size = String(chunk.content || "").length;
    if (used + size > charBudget) continue;
    picked.push(chunk);
    used += size;
  }
  return { chunks: order(picked), truncated: true, totalChars: total };
}
