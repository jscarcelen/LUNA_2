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

// pdf-lib's standard fonts only support WinAnsi encoding, so LaTeX is converted to a plain
// ASCII-safe approximation instead of Unicode math symbols (which would fail to encode).
function convertLatexToReadableText(latex = "") {
  return String(latex || "")
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)")
    .replace(/\\sqrt\{([^{}]*)\}/g, "sqrt($1)")
    .replace(/\\bar\{([^{}]*)\}/g, "$1-bar")
    .replace(/\\sum/g, "sum")
    .replace(/\\int/g, "integral")
    .replace(/\\prod/g, "product")
    .replace(/\\pm/g, "+/-")
    .replace(/\\times/g, "*")
    .replace(/\\cdot/g, "\u00b7")
    .replace(/\\neq/g, "!=")
    .replace(/\\approx/g, "~=")
    .replace(/\\leq/g, "<=")
    .replace(/\\geq/g, ">=")
    .replace(/\\to/g, "->")
    .replace(/_\{([^{}]+)\}/g, "_$1")
    .replace(/\^\{([^{}]+)\}/g, "^$1")
    .replace(/[{}]/g, "")
    .replace(/\\/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function renderLatexForPdf(text = "") {
  const source = String(text || "");
  const pattern = /\$\$([\s\S]*?)\$\$|\$([^$\n]+)\$/g;
  let result = "";
  let cursor = 0;
  let match;
  while ((match = pattern.exec(source))) {
    result += source.slice(cursor, match.index);
    const latex = match[1] ?? match[2] ?? "";
    result += convertLatexToReadableText(latex);
    cursor = match.index + match[0].length;
  }
  result += source.slice(cursor);
  return result;
}

const PDF_TEXT_REPLACEMENTS = {
  "\u2212": "-",
  "\u2013": "-",
  "\u2014": "-",
  "\u2018": "'",
  "\u2019": "'",
  "\u201c": '"',
  "\u201d": '"',
  "\u2026": "...",
  "\u00d7": "x",
  "\u2260": "!=",
  "\u2248": "~=",
  "\u2264": "<=",
  "\u2265": ">=",
  "\u2192": "->",
  "\u221a": "sqrt",
  "\u03a3": "sum",
  "\u222b": "integral",
  "\u03a0": "product",
  "\u0304": ""
};

// pdf-lib's standard fonts only support WinAnsi encoding; any other character crashes drawText.
function sanitizeForPdfText(text = "") {
  let result = String(text || "");
  for (const [from, to] of Object.entries(PDF_TEXT_REPLACEMENTS)) {
    result = result.split(from).join(to);
  }
  return result.replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "");
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

export function renderQuizTextDocument(quizJson, options = {}) {
  const showAnswers = options.showAnswers !== false;
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
    if (showAnswers) {
      lines.push(`   Answer: ${question.answer}`);
      lines.push(`   Explanation: ${question.explanation}`);
    }

    if (showAnswers && question.sourceRefs?.length) {
      lines.push("   Source:");
      for (const ref of question.sourceRefs) {
        const eq = Array.isArray(ref?.equationIds) && ref.equationIds.length
          ? ` · equations ${ref.equationIds.join(", ")}`
          : "";
        lines.push(`   * ${ref.documentName}${eq}`);
        const excerpt = String(ref.excerpt || "").trim();
        if (excerpt) {
          for (const line of wrapText(excerpt, 84)) {
            lines.push(`     ${line}`);
          }
        }
      }
    }

    lines.push("");
  });

  return lines.join("\n").trim();
}

export async function renderQuizDocxBuffer(quizJson, options = {}) {
  const showAnswers = options.showAnswers !== false;
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

    if (showAnswers) {
      children.push(new Paragraph({ text: `Answer: ${question.answer}` }));
      children.push(new Paragraph({ text: `Explanation: ${question.explanation}` }));
    }

    if (showAnswers && question.sourceRefs?.length) {
      for (const ref of question.sourceRefs) {
        const eq = Array.isArray(ref?.equationIds) && ref.equationIds.length
          ? ` · equations ${ref.equationIds.join(", ")}`
          : "";
        children.push(new Paragraph({
          children: [new TextRun({ text: `Source: ${ref.documentName}${eq}`, italics: true, color: "6e7390" })]
        }));
        const excerpt = String(ref.excerpt || "").trim();
        if (excerpt) {
          children.push(new Paragraph({ text: excerpt }));
        }
      }
    }
  }

  const document = new Document({
    sections: [{ children }]
  });

  return Packer.toBuffer(document);
}

export async function renderQuizPdfBuffer(quizJson, options = {}) {
  const showAnswers = options.showAnswers !== false;
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
    page.drawText(sanitizeForPdfText(text), {
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
    // Wrap the prompt (it can span multiple sentences/paragraphs) so the card height matches
    // the real number of rendered lines instead of assuming a single line.
    for (const line of wrapText(renderLatexForPdf(`${index + 1}. ${question.prompt}`), 64)) {
      lines.push({ text: line, bold: true, size: 13, color: QUIZ_COLORS.ink });
    }
    lines.push({ text: `Type: ${formatQuestionType(question.type)} · Difficulty: ${question.difficulty || quiz.difficulty}`, size: 9.5, color: QUIZ_COLORS.muted });

    for (const option of question.options || []) {
      for (const line of wrapText(renderLatexForPdf(`- ${option}`), 76)) {
        lines.push({ text: line, size: 10.5, color: QUIZ_COLORS.ink });
      }
    }

    if (showAnswers) {
      for (const line of wrapText(renderLatexForPdf(`Answer: ${question.answer}`), 76)) {
        lines.push({ text: line, size: 10.5, bold: true, color: QUIZ_COLORS.violet });
      }

      for (const line of wrapText(renderLatexForPdf(`Explanation: ${question.explanation}`), 76)) {
        lines.push({ text: line, size: 10.5, color: QUIZ_COLORS.muted });
      }
    }

    if (showAnswers && question.sourceRefs?.length) {
      lines.push({ text: "Source:", size: 9.5, bold: true, color: QUIZ_COLORS.muted });
      for (const ref of question.sourceRefs) {
        const eq = Array.isArray(ref?.equationIds) && ref.equationIds.length
          ? ` · equations ${ref.equationIds.join(", ")}`
          : "";
        for (const line of wrapText(`${ref.documentName}${eq}`, 76)) {
          lines.push({ text: line, size: 9.5, color: QUIZ_COLORS.muted });
        }
        const excerpt = String(ref.excerpt || "").trim();
        if (excerpt) {
          for (const line of wrapText(renderLatexForPdf(excerpt), 76)) {
            lines.push({ text: line, size: 9, color: QUIZ_COLORS.muted });
          }
        }
      }
    }

    return lines;
  }

  function drawQuestionCard(question, index) {
    const lines = wrapQuestionLines(question, index);
    const headerHeight = 32;
    const headerToContentGap = 14;
    const bottomPadding = 14;
    const contentHeight = lines.reduce((sum, line) => sum + (line.size + 6), 0);
    const totalHeight = headerHeight + headerToContentGap + contentHeight + bottomPadding;

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
      y: cardTop - headerHeight,
      width: 540,
      height: headerHeight,
      color: rgb(0.94, 0.9, 1)
    });

    page.drawText(sanitizeForPdfText(`Question ${index + 1}`), {
      x: 50,
      y: cardTop - headerHeight / 2 - 3.5,
      size: 10,
      font: boldFont,
      color: QUIZ_COLORS.violet
    });

    y = cardTop - headerHeight - headerToContentGap;

    for (const line of lines) {
      drawLine(line.text, { x: 50, size: line.size, bold: line.bold, color: line.color, spacing: line.size + 4 });
    }

    y = cardTop - totalHeight - 12;
  }

  createPage();
  drawLine("AI QUIZ GENERATOR", { x: 44, size: 10, bold: true, color: QUIZ_COLORS.violet, spacing: 20 });
  for (const line of wrapText(quiz.title, 46)) {
    drawLine(line, { x: 44, size: 24, bold: true, spacing: 28 });
  }

  y -= 4;
  const metaColumns = [
    { label: "Difficulty", value: String(quiz.difficulty || "medium") },
    { label: "Questions", value: String(quiz.questions.length) },
    { label: "Topic", value: String(quiz.topicPrompt || "Selected material") }
  ];
  const metaY = y;
  let metaRowHeight = 0;
  metaColumns.forEach((column, columnIndex) => {
    const columnX = 44 + columnIndex * 170;
    page.drawText(sanitizeForPdfText(column.label.toUpperCase()), { x: columnX, y: metaY, size: 8.5, font: boldFont, color: QUIZ_COLORS.muted });
    const valueLines = wrapText(column.value, 24);
    valueLines.forEach((line, lineIndex) => {
      page.drawText(sanitizeForPdfText(line), { x: columnX, y: metaY - 15 - lineIndex * 13, size: 11, font, color: QUIZ_COLORS.ink });
    });
    metaRowHeight = Math.max(metaRowHeight, 15 + valueLines.length * 13);
  });
  y = metaY - metaRowHeight - 14;

  for (const line of wrapText(quiz.instructions, 92)) {
    drawLine(line, { x: 44, size: 11, spacing: 16, color: QUIZ_COLORS.ink });
  }

  y -= 8;

  for (const [index, question] of quiz.questions.entries()) {
    drawQuestionCard(question, index);
  }

  return Buffer.from(await pdf.save());
}

function quizWithoutAnswers(quizJson) {
  return {
    ...quizJson,
    quiz: {
      ...quizJson.quiz,
      questions: quizJson.quiz.questions.map(({ answer, explanation, ...question }) => question),
      answerKey: []
    }
  };
}

async function renderQuizFiles(quizJson, options = {}) {
  const html = renderQuizHtmlDocument(quizJson, options);
  const jsonPayload = options.stripAnswers ? quizWithoutAnswers(quizJson) : quizJson;
  const jsonText = JSON.stringify(jsonPayload, null, 2);
  const text = renderQuizTextDocument(quizJson, options);
  const docxBuffer = await renderQuizDocxBuffer(quizJson, options);
  const pdfBuffer = await renderQuizPdfBuffer(quizJson, options);

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

export async function renderQuizExports(quizJson) {
  const answerVersion = await renderQuizFiles(quizJson, { showAnswers: true });
  const studentVersion = await renderQuizFiles(quizJson, { showAnswers: false, interactive: true, stripAnswers: true });

  return {
    html: answerVersion.html,
    files: answerVersion.files,
    studentHtml: studentVersion.html,
    studentFiles: studentVersion.files
  };
}
