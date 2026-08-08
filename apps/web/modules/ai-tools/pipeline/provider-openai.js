const DEFAULT_QUIZ_MODEL = process.env.LUNA_QUIZ_MODEL || "gpt-4o-mini";

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function isQuizLlmConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function sanitizeQuestionType(type) {
  const value = String(type || "").trim().toLowerCase();
  if (value === "true-false") return "true-false";
  if (value === "short-answer") return "short-answer";
  return "multiple-choice";
}

function normalizeQuestion(question, index, fallbackDifficulty) {
  const type = sanitizeQuestionType(question?.type);
  const options = Array.isArray(question?.options)
    ? question.options.map((option) => String(option || "").trim()).filter(Boolean)
    : [];
  return {
    id: String(question?.id || `q-${index + 1}`),
    type,
    difficulty: String(question?.difficulty || fallbackDifficulty || "medium"),
    prompt: String(question?.prompt || "").trim(),
    options: type === "multiple-choice" ? options.slice(0, 6) : [],
    answer: String(question?.answer || "").trim(),
    explanation: String(question?.explanation || "").trim(),
    sourceRefs: Array.isArray(question?.sourceRefs)
      ? question.sourceRefs
        .map((ref) => ({
          documentName: String(ref?.documentName || "").trim(),
          chunkIndex: Number(ref?.chunkIndex || 0),
          excerpt: String(ref?.excerpt || "").trim(),
          equationIds: Array.isArray(ref?.equationIds)
            ? ref.equationIds.map((id) => String(id || "").trim()).filter(Boolean)
            : []
        }))
        .filter((ref) => ref.documentName && ref.chunkIndex > 0 && ref.excerpt)
      : []
  };
}

function parseJsonFromContent(content) {
  const text = String(content || "").trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function buildChunksContext(chunks, maxChunks = 12) {
  return chunks.slice(0, maxChunks).map((chunk) => ({
    documentName: chunk.documentName,
    chunkIndex: (chunk.chunkIndex || 0) + 1,
    tags: chunk.tags || [],
    keywords: chunk.keywords || [],
    equationIds: Array.isArray(chunk.equationIds) ? chunk.equationIds : [],
    content: String(chunk.content || "").slice(0, 1800)
  }));
}

async function callOpenAiQuiz(config, chunks, scopeSummary) {
  const apiKey = required("OPENAI_API_KEY");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: DEFAULT_QUIZ_MODEL,
      temperature: 0.2,
      max_tokens: 2400,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "quiz_generation_result",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              instructions: { type: "string" },
              questions: {
                type: "array",
                minItems: 1,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    id: { type: "string" },
                    type: { type: "string", enum: ["multiple-choice", "true-false", "short-answer"] },
                    difficulty: { type: "string" },
                    prompt: { type: "string" },
                    options: {
                      type: "array",
                      items: { type: "string" }
                    },
                    answer: { type: "string" },
                    explanation: { type: "string" },
                    sourceRefs: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          documentName: { type: "string" },
                          chunkIndex: { type: "integer" },
                          excerpt: { type: "string" },
                          equationIds: {
                            type: "array",
                            items: { type: "string" }
                          }
                        },
                        required: ["documentName", "chunkIndex", "excerpt", "equationIds"]
                      }
                    }
                  },
                  required: ["id", "type", "difficulty", "prompt", "options", "answer", "explanation", "sourceRefs"]
                }
              }
            },
            required: ["instructions", "questions"]
          }
        }
      },
      messages: [
        {
          role: "system",
          content: "You are an educational quiz generator. Use only the supplied context chunks. Never invent source references. Output only valid JSON matching the schema."
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Generate a quiz JSON payload",
            config: {
              title: config.title || "",
              topicPrompt: config.topicPrompt || "",
              difficulty: config.difficulty || "medium",
              questionCount: Number(config.questionCount || 6),
              questionTypes: config.questionTypes?.length ? config.questionTypes : ["multiple-choice"]
            },
            scopeSummary,
            contextChunks: buildChunksContext(chunks, Math.max(Number(config.questionCount || 6) * 2, 10)),
            constraints: {
              requireSourceRefs: true,
              ensureAnswersIncluded: true,
              keepQuestionTypeBalance: true
            }
          })
        }
      ]
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || "OpenAI quiz generation failed");
  }

  const content = payload.choices?.[0]?.message?.content;
  const parsed = parseJsonFromContent(content);
  if (!parsed || !Array.isArray(parsed.questions)) {
    throw new Error("OpenAI quiz response could not be parsed into questions");
  }

  return parsed;
}

export async function generateQuizJsonWithOpenAi({ config, chunks, scopeSummary }) {
  const raw = await callOpenAiQuiz(config, chunks, scopeSummary);
  const requestedCount = Math.max(1, Number(config.questionCount || 6));
  const questions = (raw.questions || [])
    .slice(0, requestedCount)
    .map((question, index) => normalizeQuestion(question, index, config.difficulty))
    .filter((question) => question.prompt && question.answer && question.explanation);

  if (!questions.length) {
    throw new Error("OpenAI returned no usable quiz questions");
  }

  return {
    schemaVersion: "quiz-generator-v1",
    pipeline: {
      provider: `openai:${DEFAULT_QUIZ_MODEL}`,
      mode: "configurable-rag-pipeline",
      chunking: {
        chunkWords: config.chunking?.chunkWords,
        overlapWords: config.chunking?.overlapWords
      },
      sourceSummary: scopeSummary
    },
    quiz: {
      title: config.title || `Quiz on ${config.topicPrompt || scopeSummary.subjectName || "selected material"}`,
      topicPrompt: config.topicPrompt || "",
      difficulty: config.difficulty || "medium",
      instructions: String(raw.instructions || "Answer every question using only the provided study material."),
      questions,
      answerKey: questions.map((question) => ({
        id: question.id,
        answer: question.answer,
        explanation: question.explanation
      }))
    }
  };
}