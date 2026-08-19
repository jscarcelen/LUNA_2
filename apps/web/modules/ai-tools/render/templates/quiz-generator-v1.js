import katex from "katex";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderLatexText(value) {
  const source = String(value || "");
  const parts = [];
  const pattern = /\$\$([\s\S]*?)\$\$|\$([^$\n]+)\$/g;
  let cursor = 0;
  let match;
  while ((match = pattern.exec(source))) {
    if (match.index > cursor) parts.push(escapeHtml(source.slice(cursor, match.index)));
    const latex = match[1] ?? match[2] ?? "";
    try {
      // Downloaded HTML has no katex.css to hide the MathML fallback, so it would render twice.
      parts.push(katex.renderToString(latex.trim(), {
        displayMode: Boolean(match[1]),
        throwOnError: false,
        output: "html"
      }));
    } catch {
      parts.push(escapeHtml(match[0]));
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < source.length) parts.push(escapeHtml(source.slice(cursor)));
  return parts.join("");
}

function formatQuestionType(type) {
  const normalized = String(type || "").trim().toLowerCase();
  if (normalized === "true-false") return "True / False";
  if (normalized === "short-answer") return "Short answer";
  return "Multiple choice";
}

function renderQuestion(question, index, renderOptions = {}) {
  const showAnswers = renderOptions.showAnswers !== false;
  const interactive = Boolean(renderOptions.interactive);
  const choiceOptions = Array.isArray(question.options) && question.options.length
    ? `<ol class="quiz-options" type="A">${question.options.map((option) => interactive
      ? `<li><button class="quiz-answer-choice" type="button" data-answer="${escapeHtml(option)}">${renderLatexText(option)}</button></li>`
      : `<li>${renderLatexText(option)}</li>`).join("")}</ol>`
    : interactive ? `<div class="quiz-short-answer"><input class="quiz-answer-input" type="text" placeholder="Type your answer" /><button class="quiz-answer-submit" type="button">Check answer</button></div>` : "";

  const refs = (question.sourceRefs || [])
    .map((ref) => {
      const equationLabel = Array.isArray(ref?.equationIds) && ref.equationIds.length
        ? ` · equations ${escapeHtml(ref.equationIds.join(", "))}`
        : "";
      const label = `Source: ${escapeHtml(ref.documentName)}${equationLabel}`;
      const excerpt = String(ref?.excerpt || "").trim();
      if (!excerpt) return `<li>${label}</li>`;
      // Reveals the actual chunk text the answer was drawn from, instead of a static "chunk N" label.
      return `<li><details class="quiz-source-ref"><summary>${label}</summary><div class="quiz-source-excerpt">${renderLatexText(excerpt)}</div></details></li>`;
    })
    .join("");

  return `
    <article class="quiz-card">
      <div class="quiz-card-head">
        <span class="quiz-number">Q${index + 1}</span>
        <span class="quiz-type">${escapeHtml(formatQuestionType(question.type))}</span>
      </div>
      <h3>${renderLatexText(question.prompt)}</h3>
      ${choiceOptions}
      ${showAnswers ? `<div class="quiz-answer-block">
        <p><strong>Answer:</strong> ${renderLatexText(question.answer)}</p>
        <p><strong>Explanation:</strong> ${renderLatexText(question.explanation)}</p>
        ${refs ? `<ul class="quiz-source-list">${refs}</ul>` : ""}
      </div>` : interactive ? `<div class="quiz-interactive-result" data-correct-answer="${escapeHtml(question.answer)}" data-explanation="${escapeHtml(question.explanation)}">Select an answer to reveal the solution.</div>` : ""}
    </article>
  `;
}

export function renderQuizHtmlDocument(quizJson, options = {}) {
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
        .quiz-source-ref summary {
          cursor: pointer;
          color: #5d4ae6;
          text-decoration: underline;
        }
        .quiz-source-excerpt {
          margin-top: 6px;
          padding: 8px 10px;
          background: #f8f7ff;
          border: 1px solid rgba(132, 129, 205, 0.16);
          border-radius: 10px;
          font-size: 13px;
          line-height: 1.5;
          color: #3d4257;
        }
        .quiz-answer-choice {
          border: 1px solid rgba(132, 129, 205, 0.2);
          border-radius: 12px;
          background: #fff;
          padding: 8px 10px;
          color: inherit;
          font: inherit;
          text-align: left;
          cursor: pointer;
          width: 100%;
        }
        .quiz-answer-choice:hover { border-color: #8b78e8; background: #f7f4ff; }
        .quiz-short-answer { display: flex; gap: 8px; margin-top: 10px; }
        .quiz-answer-input { flex: 1; border: 1px solid rgba(132, 129, 205, 0.25); border-radius: 12px; padding: 9px 10px; font: inherit; }
        .quiz-answer-submit { border: 0; border-radius: 12px; padding: 9px 12px; background: #6553d8; color: #fff; font: inherit; cursor: pointer; }
        .quiz-interactive-result { margin-top: 14px; border-radius: 16px; padding: 12px 14px; background: #f5f2ff; color: #5f6788; }
        .quiz-interactive-result.correct { background: #e8f8f0; color: #176b48; }
        .quiz-interactive-result.incorrect { background: #fff0f3; color: #a43d5b; }
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
        ${quiz.questions.map((question, index) => renderQuestion(question, index, options)).join("")}
      </main>
      ${options.interactive ? `<script>
        function revealSolution(element, selected) {
          const result = element.closest('.quiz-card')?.querySelector('.quiz-interactive-result');
          if (!result) return;
          const correct = result.dataset.correctAnswer || '';
          const isCorrect = selected.trim().toLowerCase() === correct.trim().toLowerCase();
          result.className = 'quiz-interactive-result ' + (isCorrect ? 'correct' : 'incorrect');
          result.textContent = (isCorrect ? 'Correct. ' : 'Not quite. Correct answer: ' + correct + '. ') + (result.dataset.explanation || '');
        }
        document.querySelectorAll('.quiz-answer-choice').forEach((choice) => choice.addEventListener('click', () => {
          revealSolution(choice, choice.dataset.answer || '');
        }));
        document.querySelectorAll('.quiz-answer-submit').forEach((submit) => submit.addEventListener('click', () => {
          const input = submit.parentElement?.querySelector('.quiz-answer-input');
          revealSolution(submit, input?.value || '');
        }));
      </script>` : ""}
    </body>
  </html>`;
}
