export const DEFAULT_EMBEDDING_MODEL = process.env.LUNA_EMBEDDING_MODEL || "text-embedding-3-small";

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

export async function embedTexts(texts) {
  const normalized = (texts || []).map((text) => String(text || "").trim());
  const valid = normalized.filter(Boolean);
  if (!valid.length) return normalized.map(() => null);

  const embeddings = await requestEmbeddings(valid);
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