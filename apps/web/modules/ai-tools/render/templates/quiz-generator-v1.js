function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderQuestion(question, index) {
  const options = Array.isArray(question.options) && question.options.length
    ? `<ol type="A">${question.options.map((option) => `<li>${escapeHtml(option)}</li>`).join("")}</ol>`
    : "";

  const refs = (question.sourceRefs || [])
    .map((ref) => `<li>${escapeHtml(ref.documentName)} · chunk ${ref.chunkIndex}</li>`)
    .join("");

  return `
    <article class="quiz-question">
      <h3>${index + 1}. ${escapeHtml(question.prompt)}</h3>
      ${options}
      <div class="quiz-answer-block">
        <p><strong>Answer:</strong> ${escapeHtml(question.answer)}</p>
        <p><strong>Explanation:</strong> ${escapeHtml(question.explanation)}</p>
        <ul>${refs}</ul>
      </div>
    </article>
  `;
}

export function renderQuizHtmlDocument(quizJson) {
  const quiz = quizJson.quiz;
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(quiz.title)}</title>
      <style>
        body { font-family: Avenir Next, Arial, sans-serif; margin: 32px; color: #10233f; }
        h1 { margin-bottom: 8px; }
        .meta { color: #486280; margin-bottom: 24px; }
        .quiz-question { border: 1px solid #c9d8eb; border-radius: 12px; padding: 18px; margin-bottom: 16px; }
        .quiz-answer-block { background: #f6f9fc; border-radius: 10px; padding: 12px; margin-top: 12px; }
        ol { padding-left: 20px; }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(quiz.title)}</h1>
      <p class="meta">Difficulty: ${escapeHtml(quiz.difficulty)} · Questions: ${quiz.questions.length}</p>
      <p>${escapeHtml(quiz.instructions)}</p>
      ${quiz.questions.map((question, index) => renderQuestion(question, index)).join("")}
    </body>
  </html>`;
}
