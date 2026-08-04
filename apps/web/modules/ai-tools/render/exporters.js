import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { renderQuizHtmlDocument } from "./templates/quiz-generator-v1.js";

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

export async function renderQuizDocxBuffer(quizJson) {
  const quiz = quizJson.quiz;
  const children = [
    new Paragraph({ text: quiz.title, heading: HeadingLevel.TITLE }),
    new Paragraph({ text: `Difficulty: ${quiz.difficulty}` }),
    new Paragraph({ text: quiz.instructions })
  ];

  for (const [index, question] of quiz.questions.entries()) {
    children.push(new Paragraph({
      spacing: { before: 240 },
      children: [new TextRun({ text: `${index + 1}. ${question.prompt}`, bold: true })]
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
  let page = pdf.addPage([612, 792]);
  let y = 760;
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  function drawLine(text, options = {}) {
    const size = options.size || 11;
    const currentFont = options.bold ? boldFont : font;
    if (y < 60) {
      page = pdf.addPage([612, 792]);
      y = 760;
    }
    page.drawText(text, {
      x: 44,
      y,
      size,
      font: currentFont,
      color: rgb(0.07, 0.14, 0.24)
    });
    y -= options.spacing || (size + 6);
  }

  drawLine(quiz.title, { size: 20, bold: true, spacing: 26 });
  drawLine(`Difficulty: ${quiz.difficulty}`, { size: 12, spacing: 20 });
  drawLine(quiz.instructions, { size: 11, spacing: 20 });

  for (const [index, question] of quiz.questions.entries()) {
    for (const line of wrapText(`${index + 1}. ${question.prompt}`)) {
      drawLine(line, { bold: true });
    }
    for (const option of question.options || []) {
      for (const line of wrapText(`- ${option}`, 78)) {
        drawLine(line);
      }
    }
    for (const line of wrapText(`Answer: ${question.answer}`, 78)) {
      drawLine(line);
    }
    for (const line of wrapText(`Explanation: ${question.explanation}`, 78)) {
      drawLine(line);
    }
    y -= 8;
  }

  return Buffer.from(await pdf.save());
}

export async function renderQuizExports(quizJson) {
  const html = renderQuizHtmlDocument(quizJson);
  const jsonText = JSON.stringify(quizJson, null, 2);
  const docxBuffer = await renderQuizDocxBuffer(quizJson);
  const pdfBuffer = await renderQuizPdfBuffer(quizJson);

  return {
    html,
    files: {
      json: Buffer.from(jsonText, "utf8").toString("base64"),
      html: Buffer.from(html, "utf8").toString("base64"),
      docx: Buffer.from(docxBuffer).toString("base64"),
      pdf: Buffer.from(pdfBuffer).toString("base64")
    }
  };
}
