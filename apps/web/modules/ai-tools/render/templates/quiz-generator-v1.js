function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatQuestionType(type) {
  const normalized = String(type || "").trim().toLowerCase();
  if (normalized === "true-false") return "True / False";
  if (normalized === "short-answer") return "Short answer";
  return "Multiple choice";
}

function renderQuestion(question, index) {
  const options = Array.isArray(question.options) && question.options.length
    ? `<ol class="quiz-options" type="A">${question.options.map((option) => `<li>${escapeHtml(option)}</li>`).join("")}</ol>`
    : "";

  const refs = (question.sourceRefs || [])
    .map((ref) => {
      const equationLabel = Array.isArray(ref?.equationIds) && ref.equationIds.length
        ? ` · equations ${escapeHtml(ref.equationIds.join(", "))}`
        : "";
      return `<li>${escapeHtml(ref.documentName)} · chunk ${ref.chunkIndex}${equationLabel}</li>`;
    })
    .join("");

  return `
    <article class="quiz-card">
      <div class="quiz-card-head">
        <span class="quiz-number">Q${index + 1}</span>
        <span class="quiz-type">${escapeHtml(formatQuestionType(question.type))}</span>
      </div>
      <h3>${escapeHtml(question.prompt)}</h3>
      ${options}
      <div class="quiz-answer-block">
        <p><strong>Answer:</strong> ${escapeHtml(question.answer)}</p>
        <p><strong>Explanation:</strong> ${escapeHtml(question.explanation)}</p>
        ${refs ? `<ul class="quiz-source-list">${refs}</ul>` : ""}
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
        body {
          margin: 0;
          color: #1f2440;
          font-family: Avenir Next, "Segoe UI", sans-serif;
          background:
            radial-gradient(circle at top right, rgba(155, 124, 255, 0.22), transparent 30%),
            linear-gradient(180deg, #faf9ff 0%, #f6f3ff 100%);
        }
        .quiz-page {
          max-width: 920px;
          margin: 0 auto;
          padding: 28px 22px 40px;
        }
        .quiz-cover {
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(132, 129, 205, 0.18);
          border-radius: 28px;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(239, 231, 255, 0.92));
          padding: 24px;
          margin-bottom: 18px;
        }
        .quiz-cover::after {
          content: "";
          position: absolute;
          right: -40px;
          top: -40px;
          width: 180px;
          height: 180px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(155, 124, 255, 0.18), transparent 70%);
        }
        .quiz-kicker {
          display: inline-flex;
          padding: 8px 12px;
          border-radius: 999px;
          background: rgba(155, 124, 255, 0.12);
          color: #5d4ae6;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .quiz-cover h1 {
          margin: 12px 0 10px;
          font-size: 42px;
          line-height: 1;
          letter-spacing: -0.05em;
        }
        .quiz-meta {
          color: #5f6788;
          font-size: 15px;
          line-height: 1.6;
          margin: 0;
        }
        .quiz-meta-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin-top: 18px;
        }
        .quiz-meta-card {
          border-radius: 18px;
          padding: 14px 16px;
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid rgba(132, 129, 205, 0.16);
        }
        .quiz-meta-card span {
          display: block;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #7f84a0;
          margin-bottom: 5px;
        }
        .quiz-meta-card strong {
          display: block;
          font-size: 14px;
          line-height: 1.4;
        }
        .quiz-card {
          border: 1px solid rgba(132, 129, 205, 0.16);
          border-radius: 24px;
          background: rgba(255, 255, 255, 0.92);
          padding: 18px 18px 16px;
          margin-bottom: 16px;
          box-shadow: 0 16px 30px rgba(111, 98, 177, 0.08);
        }
        .quiz-card-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 10px;
        }
        .quiz-number,
        .quiz-type {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 700;
        }
        .quiz-number {
          color: #5d4ae6;
          background: rgba(155, 124, 255, 0.14);
        }
        .quiz-type {
          color: #50607e;
          background: rgba(203, 226, 255, 0.72);
        }
        .quiz-card h3 {
          margin: 0 0 12px;
          font-size: 22px;
          line-height: 1.25;
        }
        .quiz-options {
          margin: 0;
          padding-left: 24px;
          display: grid;
          gap: 8px;
        }
        .quiz-answer-block {
          margin-top: 14px;
          background: rgba(239, 231, 255, 0.74);
          border-radius: 18px;
          padding: 12px 14px;
        }
        .quiz-answer-block p {
          margin: 0 0 8px;
          line-height: 1.55;
        }
        .quiz-answer-block p:last-child {
          margin-bottom: 0;
        }
        .quiz-source-list {
          margin: 10px 0 0;
          padding-left: 18px;
          color: #5f6788;
        }
        @media print {
          body { background: white; }
          .quiz-page { padding: 0; }
          .quiz-cover,
          .quiz-card { box-shadow: none; }
        }
      </style>
    </head>
    <body>
      <main class="quiz-page">
        <section class="quiz-cover">
          <span class="quiz-kicker">AI Quiz Generator</span>
          <h1>${escapeHtml(quiz.title)}</h1>
          <p class="quiz-meta">${escapeHtml(quiz.instructions)}</p>
          <div class="quiz-meta-grid">
            <div class="quiz-meta-card"><span>Difficulty</span><strong>${escapeHtml(quiz.difficulty)}</strong></div>
            <div class="quiz-meta-card"><span>Questions</span><strong>${quiz.questions.length}</strong></div>
            <div class="quiz-meta-card"><span>Topic prompt</span><strong>${escapeHtml(quiz.topicPrompt || "Selected material")}</strong></div>
          </div>
        </section>
        ${quiz.questions.map((question, index) => renderQuestion(question, index)).join("")}
      </main>
    </body>
  </html>`;
}
