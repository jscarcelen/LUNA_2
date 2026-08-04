function sentenceSplit(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 24);
}

function fallbackSegments(text, size = 28) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const out = [];
  for (let index = 0; index < words.length; index += size) {
    const segment = words.slice(index, index + size).join(" ").trim();
    if (segment.length >= 24) out.push(segment);
  }
  return out;
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleCase(value) {
  return String(value || "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function keywordPool(chunks) {
  return Array.from(new Set(chunks.flatMap((chunk) => chunk.keywords || []))).filter((word) => word.length > 3);
}

function chooseAnswerTerm(sentence, pool) {
  const lowered = sentence.toLowerCase();
  const matching = pool.filter((word) => lowered.includes(word.toLowerCase()));
  return matching.sort((left, right) => right.length - left.length)[0] || pool[0] || "concept";
}

function buildDistractors(answer, pool) {
  return pool
    .filter((word) => word.toLowerCase() !== String(answer).toLowerCase())
    .slice(0, 3)
    .map((word) => titleCase(word));
}

function buildMultipleChoiceQuestion(index, chunk, sentence, pool, difficulty) {
  const answer = titleCase(chooseAnswerTerm(sentence, pool));
  const distractors = buildDistractors(answer, pool);
  const maskedSentence = sentence.replace(new RegExp(escapeRegex(answer), "i"), "____");
  const options = [answer, ...distractors].slice(0, 4).sort();

  return {
    id: `q-${index + 1}`,
    type: "multiple-choice",
    difficulty,
    prompt: maskedSentence === sentence
      ? `Which concept best completes this statement from the provided material? ${sentence}`
      : `Complete the statement using the study material: ${maskedSentence}`,
    options,
    answer,
    explanation: `The correct answer is ${answer}. This comes directly from ${chunk.documentName}, chunk ${chunk.chunkIndex + 1}.`,
    sourceRefs: [
      {
        documentName: chunk.documentName,
        chunkIndex: chunk.chunkIndex + 1,
        excerpt: sentence
      }
    ]
  };
}

function buildTrueFalseQuestion(index, chunk, sentence, pool, difficulty) {
  const answer = chooseAnswerTerm(sentence, pool);
  const distractor = pool.find((word) => word !== answer) || answer;
  const makeFalse = index % 2 === 1 && distractor && distractor !== answer;
  const statement = makeFalse
    ? sentence.replace(new RegExp(escapeRegex(answer), "i"), titleCase(distractor))
    : sentence;

  return {
    id: `q-${index + 1}`,
    type: "true-false",
    difficulty,
    prompt: statement,
    answer: makeFalse ? "False" : "True",
    explanation: `The statement is ${makeFalse ? "false" : "true"} based on ${chunk.documentName}, chunk ${chunk.chunkIndex + 1}.`,
    sourceRefs: [
      {
        documentName: chunk.documentName,
        chunkIndex: chunk.chunkIndex + 1,
        excerpt: sentence
      }
    ]
  };
}

function buildShortAnswerQuestion(index, chunk, sentence, pool, difficulty) {
  const answer = titleCase(chooseAnswerTerm(sentence, pool));

  return {
    id: `q-${index + 1}`,
    type: "short-answer",
    difficulty,
    prompt: `Based on the provided material, identify the key concept highlighted here: ${sentence}`,
    answer,
    explanation: `Expected answer: ${answer}. Reference: ${chunk.documentName}, chunk ${chunk.chunkIndex + 1}.`,
    sourceRefs: [
      {
        documentName: chunk.documentName,
        chunkIndex: chunk.chunkIndex + 1,
        excerpt: sentence
      }
    ]
  };
}

function buildQuestion(index, chunk, sentence, pool, config) {
  const types = config.questionTypes?.length ? config.questionTypes : ["multiple-choice"];
  const type = types[index % types.length];
  const difficulty = config.difficulty || "medium";

  if (type === "true-false") {
    return buildTrueFalseQuestion(index, chunk, sentence, pool, difficulty);
  }
  if (type === "short-answer") {
    return buildShortAnswerQuestion(index, chunk, sentence, pool, difficulty);
  }
  return buildMultipleChoiceQuestion(index, chunk, sentence, pool, difficulty);
}

export function generateQuizJsonLocal({ config, chunks, scopeSummary }) {
  const pool = keywordPool(chunks);
  const sentenceCandidates = chunks.flatMap((chunk) => {
    const direct = sentenceSplit(chunk.content).slice(0, 6);
    const fallback = direct.length >= 3 ? [] : fallbackSegments(chunk.content, 24);
    return [...direct, ...fallback].map((sentence) => ({ chunk, sentence }));
  });
  const questionCount = Math.max(1, Number(config.questionCount || 6));
  const used = new Set();
  const questions = [];

  for (const candidate of sentenceCandidates) {
    const key = `${candidate.chunk.documentId}:${candidate.sentence}`;
    if (used.has(key)) continue;
    used.add(key);
    questions.push(buildQuestion(questions.length, candidate.chunk, candidate.sentence, pool, config));
    if (questions.length >= questionCount) break;
  }

  if (questions.length < questionCount && sentenceCandidates.length) {
    let cursor = 0;
    while (questions.length < questionCount) {
      const candidate = sentenceCandidates[cursor % sentenceCandidates.length];
      questions.push(buildQuestion(questions.length, candidate.chunk, candidate.sentence, pool, config));
      cursor += 1;
    }
  }

  return {
    schemaVersion: "quiz-generator-v1",
    pipeline: {
      provider: "local-heuristic-v1",
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
      instructions: "Answer every question using only the provided study material.",
      questions,
      answerKey: questions.map((question) => ({
        id: question.id,
        answer: question.answer,
        explanation: question.explanation
      }))
    }
  };
}
