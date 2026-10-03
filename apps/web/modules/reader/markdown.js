import katex from "katex";

/**
 * A lean Markdown → HTML renderer for reading: headings, paragraphs, lists, tables, quotes, code,
 * images (as captions), page markers and LaTeX ($…$ inline, $$…$$ display) through KaTeX. Everything
 * else is escaped, so extracted document text can be shown safely. Used by the source-passage page
 * and by the reader, so a passage and a document look the same.
 */

const escapeHtml = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderMath(latex, display = false) {
  try {
    return katex.renderToString(String(latex || "").trim(), { displayMode: display, throwOnError: false, output: "html", strict: "ignore" });
  } catch {
    return `<code>${escapeHtml(latex)}</code>`;
  }
}

/** Inline formatting of one line of text. Math is lifted out first so its symbols are not read as Markdown. */
/** `\( … \)` and `\[ … \]` (how chat models write maths) become `$ … $` and `$$ … $$`. */
export function normaliseMath(value) {
  return String(value ?? "").replace(/\\\[([\s\S]+?)\\\]/g, (_, latex) => `\n$$${latex}$$\n`).replace(/\\\(([\s\S]+?)\\\)/g, (_, latex) => `$${latex.trim()}$`);
}

export function renderInline(text) {
  const maths = [];
  let source = normaliseMath(text).replace(/\$\$([\s\S]+?)\$\$/g, (_, latex) => { maths.push(renderMath(latex, true)); return `\uE000${maths.length - 1}\uE001`; });
  source = source.replace(/\$([^$\n]+?)\$/g, (match, latex) => (/^\s|\s$/.test(latex) || /^\d/.test(latex) && !/[\\^_{}=+\-*/]/.test(latex) ? match : (maths.push(renderMath(latex, false)), `\uE000${maths.length - 1}\uE001`)));
  let html = escapeHtml(source);
  html = html
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt) => `<span class="md-figure">Figure${alt ? `: ${alt}` : ""}</span>`)
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
  return html.replace(/\uE000(\d+)\uE001/g, (_, index) => maths[Number(index)] || "");
}

const plain = (value) => String(value ?? "").toLowerCase().replace(/[*_`#>|$\\{}]/g, " ").replace(/^\s*(?:[-+]|\d+[.)])\s+/gm, " ").replace(/\s+/g, " ").trim();

/** True when this block of Markdown contains the beginning of `quote`. */
function holds(blockText, quote) {
  const needle = plain(quote).slice(0, 48);
  return needle.length >= 12 && plain(blockText).includes(needle);
}

const isTableLine = (line) => /^\s*\|.*\|\s*$/.test(line);
const isTableRule = (line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
const splitRow = (line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());

/**
 * `quote` marks the block that holds it (class "hit", id "quote"), which the reader scrolls to.
 * Returns an HTML string.
 */
export function markdownToHtml(markdown, { quote = "" } = {}) {
  const lines = normaliseMath(markdown).replace(/\r/g, "").split("\n");
  const out = [];
  let marked = false;
  const wrap = (tag, inner, raw, extra = "") => {
    const hit = !marked && quote && holds(raw, quote);
    if (hit) marked = true;
    out.push(`<${tag}${hit ? ' class="hit" id="quote"' : ""}${extra}>${inner}</${tag}>`);
  };

  let paragraph = [];
  const flushParagraph = () => {
    if (!paragraph.length) return;
    const raw = paragraph.join(" ");
    wrap("p", renderInline(raw), raw);
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const page = line.match(/^\s*<!--\s*page\s+(\d+)\s*-->\s*$/i);
    if (page) { flushParagraph(); out.push(`<div class="md-page">Page ${page[1]}</div>`); continue; }
    if (!line.trim()) { flushParagraph(); continue; }

    if (/^```/.test(line)) {
      flushParagraph();
      const code = [];
      for (index += 1; index < lines.length && !/^```/.test(lines[index]); index += 1) code.push(lines[index]);
      out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }
    if (/^\s*\$\$/.test(line)) {
      flushParagraph();
      let body = line.trim().slice(2);
      if (!/\$\$\s*$/.test(body) || !body.trim()) {
        for (index += 1; index < lines.length; index += 1) { body += `\n${lines[index]}`; if (/\$\$\s*$/.test(lines[index])) break; }
      }
      const latex = body.replace(/\$\$\s*$/, "");
      const mathHit = !marked && quote && holds(latex, quote);
      if (mathHit) marked = true;
      out.push(`<div class="md-math${mathHit ? " hit" : ""}"${mathHit ? ' id="quote"' : ""}>${renderMath(latex, true)}</div>`);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) { flushParagraph(); const level = Math.min(6, heading[1].length); wrap(`h${level}`, renderInline(heading[2]), heading[2]); continue; }

    if (isTableLine(line) && index + 1 < lines.length && isTableRule(lines[index + 1])) {
      flushParagraph();
      const head = splitRow(line);
      const rows = [];
      let raw = line;
      for (index += 2; index < lines.length && isTableLine(lines[index]); index += 1) { rows.push(splitRow(lines[index])); raw += ` ${lines[index]}`; }
      index -= 1;
      const html = `<div class="md-table"><table><thead><tr>${head.map((cell) => `<th>${renderInline(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      const hit = !marked && quote && holds(raw, quote);
      if (hit) marked = true;
      out.push(hit ? html.replace('<div class="md-table">', '<div class="md-table hit" id="quote">') : html);
      continue;
    }

    const bullet = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      const ordered = /\d/.test(bullet[2]);
      const items = [];
      let raw = "";
      for (; index < lines.length; index += 1) {
        const item = lines[index].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (!item) {
          // A continuation line belongs to the item above it.
          if (lines[index].trim() && /^\s{2,}\S/.test(lines[index]) && items.length) { items[items.length - 1].text += ` ${lines[index].trim()}`; continue; }
          break;
        }
        items.push({ depth: Math.min(3, Math.floor(item[1].length / 2)), text: item[3] });
        raw += ` ${item[3]}`;
      }
      index -= 1;
      const html = items.map((entry) => `<li style="margin-left:${entry.depth * 18}px">${renderInline(entry.text)}</li>`).join("");
      wrap(ordered ? "ol" : "ul", html, raw);
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      flushParagraph();
      const quoteLines = [];
      for (; index < lines.length && /^\s*>\s?/.test(lines[index]); index += 1) quoteLines.push(lines[index].replace(/^\s*>\s?/, ""));
      index -= 1;
      wrap("blockquote", renderInline(quoteLines.join(" ")), quoteLines.join(" "));
      continue;
    }
    paragraph.push(line.trim());
  }
  flushParagraph();
  return out.join("\n");
}

/** Styles shared by every place that shows this HTML. */
export const MARKDOWN_CSS = `
.md{font:15px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;color:#1d1d1f}
.md h1,.md h2,.md h3,.md h4{line-height:1.25;letter-spacing:-.01em;margin:1.3em 0 .45em}
.md h1{font-size:1.6em}.md h2{font-size:1.3em}.md h3{font-size:1.12em}.md h4,.md h5,.md h6{font-size:1em}
.md p{margin:.6em 0}.md ul,.md ol{margin:.6em 0;padding-left:1.4em}.md li{margin:.2em 0}
.md strong{font-weight:650}.md code{background:#f0f0f3;border-radius:5px;padding:1px 5px;font-size:.9em}
.md pre{background:#f5f5f7;border-radius:10px;padding:12px 14px;overflow:auto}.md pre code{background:none;padding:0}
.md blockquote{margin:.8em 0;padding:.2em 1em;border-left:3px solid #d2d2d7;color:#515154}
.md .md-page{margin:1.6em 0 .6em;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#8e8e93;border-top:1px solid #e5e5ea;padding-top:6px}
.md .md-figure{display:inline-block;background:#f5f5f7;border-radius:8px;padding:2px 10px;font-size:.88em;color:#6e6e73}
.md .md-math{margin:.8em 0;overflow-x:auto;text-align:center}
.md .md-table{margin:.9em 0;overflow-x:auto;border:1px solid #e5e5ea;border-radius:12px}
.md table{border-collapse:collapse;width:100%;font-size:.93em}.md th{background:#f5f5f7;text-align:left;font-weight:650}
.md th,.md td{padding:8px 12px;border-bottom:1px solid #eeeef0;vertical-align:top}.md tr:last-child td{border-bottom:0}
.md .hit{background:#fff3b0;border-radius:8px;box-shadow:-10px 0 0 #fff3b0,10px 0 0 #fff3b0}
`;
