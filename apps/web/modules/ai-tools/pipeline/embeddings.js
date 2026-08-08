export const DEFAULT_EMBEDDING_MODEL = process.env.LUNA_EMBEDDING_MODEL || "text-embedding-3-small";

const MAX_EMBEDDING_INPUT_TOKENS = 7600;
const TOKEN_TO_CHAR_RATIO = 3.4;
const EMBEDDING_RETRY_CHAR_LIMITS = [24000, 16000, 12000, 8000, 6000, 4000, 2500];

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function isEmbeddingProviderConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function getEmbeddingProviderLabel() {
  if (!isEmbeddingProviderConfigured()) return "disabled";
  return `openai:${DEFAULT_EMBEDDING_MODEL}`;
}

export function toVectorLiteral(values) {
  if (!Array.isArray(values) || !values.length) return null;
  return `[${values.map((value) => Number(value).toFixed(8)).join(",")}]`;
}

async function requestEmbeddings(inputs) {
  const apiKey = required("OPENAI_API_KEY");
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: DEFAULT_EMBEDDING_MODEL,
      input: inputs
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "Embedding request failed");
  }

  return (data.data || []).map((item) => item.embedding || []);
}

function clampTextForEmbedding(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return "";

  const maxChars = Math.max(1000, Math.floor(MAX_EMBEDDING_INPUT_TOKENS * TOKEN_TO_CHAR_RATIO));
  if (normalized.length <= maxChars) return normalized;

  // Keep head and tail context to preserve retrieval utility after truncation.
  const half = Math.floor((maxChars - 5) / 2);
  return `${normalized.slice(0, half)}\n...\n${normalized.slice(-half)}`;
}

function shrinkText(text, maxChars) {
  const normalized = String(text || "").trim();
  if (!normalized) return "";
  if (normalized.length <= maxChars) return normalized;

  const half = Math.floor((maxChars - 5) / 2);
  return `${normalized.slice(0, half)}\n...\n${normalized.slice(-half)}`;
}

function isInputTooLongError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("maximum input length")
    || message.includes("too many tokens")
    || /input\[\d+\]/.test(message);
}

async function embedSingleWithRetries(text) {
  for (const charLimit of EMBEDDING_RETRY_CHAR_LIMITS) {
    const candidate = shrinkText(text, charLimit);
    if (!candidate) return null;

    try {
      const [embedding] = await requestEmbeddings([candidate]);
      return embedding || null;
    } catch (error) {
      if (!isInputTooLongError(error)) {
        throw error;
      }
    }
  }

  return null;
}

export async function embedTexts(texts) {
  const normalized = (texts || []).map((text) => clampTextForEmbedding(text));
  const valid = normalized.filter(Boolean);
  if (!valid.length) return normalized.map(() => null);

  let embeddings;
  try {
    embeddings = await requestEmbeddings(valid);
  } catch (error) {
    if (!isInputTooLongError(error)) {
      throw error;
    }

    const perTextEmbeddings = await Promise.all(valid.map((text) => embedSingleWithRetries(text)));
    embeddings = perTextEmbeddings;
  }

  const out = [];
  let cursor = 0;
  for (const text of normalized) {
    if (!text) {
      out.push(null);
      continue;
    }
    out.push(embeddings[cursor] || null);
    cursor += 1;
  }
  return out;
}

export async function embedQuery(text) {
  const [embedding] = await embedTexts([text]);
  return embedding;
}