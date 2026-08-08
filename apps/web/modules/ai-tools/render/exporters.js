import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { renderQuizHtmlDocument } from "./templates/quiz-generator-v1.js";

const QUIZ_COLORS = {
  ink: rgb(0.12, 0.14, 0.25),
  muted: rgb(0.38, 0.4, 0.53),
  violet: rgb(0.61, 0.49, 1),
  lilac: rgb(0.93, 0.91, 1),
  sky: rgb(0.8, 0.89, 1),
  mint: rgb(0.77, 0.95, 0.87),
  gold: rgb(1, 0.91, 0.66)
};

function formatQuestionType(type) {
  const normalized = String(type || "").trim().toLowerCase();
  if (normalized === "true-false") return "True / False";
  if (normalized === "short-answer") return "Short answer";
  return "Multiple choice";
}

function wrapText(text, maxChars = 88) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }

  if (line) lines.push(line);
  return lines;
}

export function renderQuizTextDocument(quizJson) {
  const quiz = quizJson.quiz;
  const lines = [
    quiz.title,
    `Difficulty: ${quiz.difficulty}`,
    `Questions: ${quiz.questions.length}`,
    `Topic prompt: ${quiz.topicPrompt || "Selected material"}`,
    "",
    quiz.instructions,
    ""
  ];

  quiz.questions.forEach((question, index) => {
    lines.push(`${index + 1}. ${question.prompt}`);
    lines.push(`   Type: ${formatQuestionType(question.type)} · Difficulty: ${question.difficulty || quiz.difficulty}`);
    for (const option of question.options || []) {
      lines.push(`   - ${option}`);
    }
    lines.push(`   Answer: ${question.answer}`);
    lines.push(`   Explanation: ${question.explanation}`);

    if (question.sourceRefs?.length) {
      lines.push("   Source refs:");
      for (const ref of question.sourceRefs) {
        const eq = Array.isArray(ref?.equationIds) && ref.equationIds.length
          ? ` · equations ${ref.equationIds.join(", ")}`
          : "";
        lines.push(`   * ${ref.documentName} · chunk ${ref.chunkIndex}${eq}`);
      }
    }

    lines.push("");
  });

  return lines.join("\n").trim();
}

export async function renderQuizDocxBuffer(quizJson) {
  const quiz = quizJson.quiz;
  const children = [
    new Paragraph({ text: quiz.title, heading: HeadingLevel.TITLE }),
    new Paragraph({ text: `Topic prompt: ${quiz.topicPrompt || "Selected material"}` }),
    new Paragraph({ text: `Difficulty: ${quiz.difficulty}` }),
    new Paragraph({ text: `Questions: ${quiz.questions.length}` }),
    new Paragraph({ text: quiz.instructions }),
    new Paragraph({ text: "" })
  ];

  for (const [index, question] of quiz.questions.entries()) {
    children.push(new Paragraph({
      spacing: { before: 240 },
      children: [
        new TextRun({ text: `${index + 1}. `, bold: true, color: "6b57e6" }),
        new TextRun({ text: question.prompt, bold: true })
      ]
    }));

    children.push(new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: `Type: ${formatQuestionType(question.type)} · Difficulty: ${question.difficulty || quiz.difficulty}`, italics: true, color: "6e7390" })]
    }));

    for (const option of question.options || []) {
      children.push(new Paragraph({ text: `- ${option}` }));
    }

    children.push(new Paragraph({ text: `Answer: ${question.answer}` }));
    children.push(new Paragraph({ text: `Explanation: ${question.explanation}` }));
  }

  const document = new Document({
    sections: [{ children }]
  });

  return Packer.toBuffer(document);
}

export async function renderQuizPdfBuffer(quizJson) {
  const quiz = quizJson.quiz;
  const pdf = await PDFDocument.create();
  let page = null;
  let y = 0;
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  function createPage() {
    const nextPage = pdf.addPage([612, 792]);
    nextPage.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(0.98, 0.975, 1) });
    nextPage.drawRectangle({ x: 0, y: 726, width: 612, height: 66, color: rgb(0.94, 0.9, 1), opacity: 0.82 });
    nextPage.drawRectangle({ x: 34, y: 726, width: 6, height: 66, color: rgb(0.61, 0.49, 1) });
    page = nextPage;
    y = 760;
  }

  function drawLine(text, options = {}) {
    const size = options.size || 11;
    const currentFont = options.bold ? boldFont : font;
    const x = options.x || 44;
    const color = options.color || QUIZ_COLORS.ink;
    if (y < 60) {
      createPage();
    }
    page.drawText(text, {
      x,
      y,
      size,
      font: currentFont,
      color
    });
    y -= options.spacing || (size + 6);
  }

  function wrapQuestionLines(question, index) {
    const lines = [];
    lines.push({ text: `${index + 1}. ${question.prompt}`, bold: true, size: 13, color: QUIZ_COLORS.ink });
    lines.push({ text: `Type: ${formatQuestionType(question.type)} · Difficulty: ${question.difficulty || quiz.difficulty}`, size: 9.5, color: QUIZ_COLORS.muted });

    for (const option of question.options || []) {
      for (const line of wrapText(`- ${option}`, 76)) {
        lines.push({ text: line, size: 10.5, color: QUIZ_COLORS.ink });
      }
    }

    for (const line of wrapText(`Answer: ${question.answer}`, 76)) {
      lines.push({ text: line, size: 10.5, bold: true, color: QUIZ_COLORS.violet });
    }

    for (const line of wrapText(`Explanation: ${question.explanation}`, 76)) {
      lines.push({ text: line, size: 10.5, color: QUIZ_COLORS.muted });
    }

    if (question.sourceRefs?.length) {
      lines.push({ text: "Source refs:", size: 9.5, bold: true, color: QUIZ_COLORS.muted });
      for (const ref of question.sourceRefs) {
        const eq = Array.isArray(ref?.equationIds) && ref.equationIds.length
          ? ` · equations ${ref.equationIds.join(", ")}`
          : "";
        lines.push({ text: `${ref.documentName} · chunk ${ref.chunkIndex}${eq}`, size: 9.5, color: QUIZ_COLORS.muted });
      }
    }

    return lines;
  }

  function drawQuestionCard(question, index) {
    const lines = wrapQuestionLines(question, index);
    const totalHeight = lines.reduce((sum, line) => sum + (line.size + 6), 0) + 24;

    if (y - totalHeight < 64) {
      createPage();
    }

    const cardTop = y;
    page.drawRectangle({
      x: 36,
      y: cardTop - totalHeight,
      width: 540,
      height: totalHeight,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.85, 0.82, 0.97),
      borderWidth: 1
    });

    page.drawRectangle({
      x: 36,
      y: cardTop - 28,
      width: 540,
      height: 28,
      color: rgb(0.94, 0.9, 1)
    });

    y = cardTop - 18;
    drawLine(`Question ${index + 1}`, { x: 50, size: 10, bold: true, color: QUIZ_COLORS.violet, spacing: 18 });

    for (const line of lines) {
      drawLine(line.text, { x: 50, size: line.size, bold: line.bold, color: line.color, spacing: line.size + 4 });
    }

    y = cardTop - totalHeight - 12;
  }

  createPage();
  drawLine("AI Quiz Generator", { x: 44, size: 10, bold: true, color: QUIZ_COLORS.violet, spacing: 16 });
  drawLine(quiz.title, { x: 44, size: 22, bold: true, spacing: 26 });
  drawLine(`Difficulty: ${quiz.difficulty}`, { x: 44, size: 12, spacing: 18, color: QUIZ_COLORS.muted });
  drawLine(`Questions: ${quiz.questions.length}`, { x: 184, size: 12, spacing: 18, color: QUIZ_COLORS.muted });
  drawLine(`Topic: ${quiz.topicPrompt || "Selected material"}`, { x: 44, size: 11, spacing: 18, color: QUIZ_COLORS.muted });
  drawLine(quiz.instructions, { x: 44, size: 11, spacing: 22, color: QUIZ_COLORS.ink });

  y -= 4;

  for (const [index, question] of quiz.questions.entries()) {
    drawQuestionCard(question, index);
  }

  return Buffer.from(await pdf.save());
}

export async function renderQuizExports(quizJson) {
  const html = renderQuizHtmlDocument(quizJson);
  const jsonText = JSON.stringify(quizJson, null, 2);
  const text = renderQuizTextDocument(quizJson);
  const docxBuffer = await renderQuizDocxBuffer(quizJson);
  const pdfBuffer = await renderQuizPdfBuffer(quizJson);

  return {
    html,
    files: {
      txt: Buffer.from(text, "utf8").toString("base64"),
      json: Buffer.from(jsonText, "utf8").toString("base64"),
      html: Buffer.from(html, "utf8").toString("base64"),
      docx: Buffer.from(docxBuffer).toString("base64"),
      pdf: Buffer.from(pdfBuffer).toString("base64")
    }
  };
}
