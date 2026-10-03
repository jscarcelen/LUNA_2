import { renderInline } from "./markdown.js";

/**
 * A generated document as reading HTML: the typed blocks of a block agent (or the items of a quiz
 * or card set, read as blocks) become a clean, reflowable article — headings, paragraphs, lists,
 * callouts, tables — with LaTeX rendered. Static HTML, so highlights keep their place.
 */
const escape = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const text = (value) => (value === undefined || value === null ? "" : Array.isArray(value) ? value.map(text).join(", ") : String(value));

const CALLOUT_LABEL = { info: "Info", tip: "Tip", warning: "Careful", note: "Note", important: "Important" };

export function blocksToReaderHtml(blocks = [], { title = "" } = {}) {
  const out = [];
  let hasTitle = false;
  let table = [];
  const flushTable = () => {
    if (!table.length) return;
    out.push(`<div class="md-table"><table><thead><tr><th>Term</th><th>Meaning</th>${table.some((row) => row.example) ? "<th>Example</th>" : ""}</tr></thead><tbody>${table.map((row) => `<tr><td><strong>${renderInline(row.word)}</strong></td><td>${renderInline(row.translation)}</td>${table.some((entry) => entry.example) ? `<td>${renderInline(row.example)}</td>` : ""}</tr>`).join("")}</tbody></table></div>`);
    table = [];
  };
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const type = String(block.type || "");
    if (type !== "vocabulary") flushTable();
    switch (type) {
      case "document_header":
      case "exam_header":
        if (text(block.title)) { out.push(`<h1>${renderInline(text(block.title))}</h1>`); hasTitle = true; }
        if (text(block.subtitle)) out.push(`<p class="md-sub">${renderInline(text(block.subtitle))}</p>`);
        break;
      case "section_header":
        out.push(`<h2>${renderInline(text(block.title || block.text))}</h2>${text(block.intro) ? `<p class="md-sub">${renderInline(text(block.intro))}</p>` : ""}`);
        break;
      case "heading": {
        const level = Math.min(4, Math.max(1, Number(block.level) || 1));
        out.push(`<h${level + 1}>${renderInline(text(block.text))}</h${level + 1}>`);
        break;
      }
      case "paragraph":
        out.push(`<p>${renderInline(text(block.text))}</p>`);
        break;
      case "bullet_list": {
        const items = (Array.isArray(block.items) ? block.items : []).map((item) => `<li>${renderInline(text(item))}</li>`).join("");
        out.push(`${text(block.title) ? `<p class="md-list-title">${renderInline(text(block.title))}</p>` : ""}<ul>${items}</ul>`);
        break;
      }
      case "callout": {
        const kind = String(block.callout_type || block.type_ || "note").toLowerCase();
        out.push(`<aside class="md-callout md-callout-${escape(kind)}"><strong>${CALLOUT_LABEL[kind] || "Note"}</strong><div>${renderInline(text(block.text))}</div></aside>`);
        break;
      }
      case "vocabulary":
        table.push({ word: text(block.word), translation: text(block.translation), example: text(block.example) });
        break;
      case "divider":
        out.push("<hr>");
        break;
      case "flashcard":
        out.push(`<p><strong>${renderInline(text(block.front))}</strong> — ${renderInline(text(block.back))}</p>`);
        break;
      default: {
        // Questions inside a document: the question and its options, answers left out (read, not graded here).
        const question = text(block.question || block.statement || block.sentence || block.problem);
        if (question) {
          const options = Array.isArray(block.options) ? `<ol type="A">${block.options.map((option) => `<li>${renderInline(text(option))}</li>`).join("")}</ol>` : "";
          out.push(`<div class="md-question"><p><strong>${renderInline(question)}</strong></p>${options}</div>`);
        }
      }
    }
  }
  flushTable();
  const body = out.join("\n");
  return !hasTitle && title ? `<h1>${renderInline(title)}</h1>\n${body}` : body;
}

export const READER_CSS = `
.md h1{font-size:2em;margin-top:.2em}
.md .md-sub{color:#6e6e73;margin-top:-.3em}
.md .md-list-title{font-weight:650;margin-bottom:0}
.md .md-callout{margin:1em 0;padding:12px 16px;border-radius:14px;background:#f5f5f7;border-left:4px solid #0071e3}
.md .md-callout strong{display:block;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#515154;margin-bottom:2px}
.md .md-callout-tip{background:#eef8f0;border-left-color:#34c759}.md .md-callout-warning{background:#fff4e5;border-left-color:#ff9500}
.md .md-callout-info{background:#eaf3ff;border-left-color:#0071e3}
.md .md-question{margin:1em 0;padding:12px 16px;border:1px solid #e5e5ea;border-radius:14px}
`;
