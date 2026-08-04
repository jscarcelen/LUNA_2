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
  const body = `${chunk.content} ${chunk.keywords.join(" ")} ${chunk.tags.join(" ")}`.toLowerCase();
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
