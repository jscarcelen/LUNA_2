function renderInlineChildren(children = []) {
  return (Array.isArray(children) ? children : []).map((child) => {
    if (child?.type === "inline_math") {
      return `$${String(child.latex || "").trim()}$`;
    }
    if (child?.type === "display_math") {
      return `\n$$\n${String(child.latex || "").trim()}\n$$\n`;
    }
    if (child?.type === "hyperlink") {
      const text = String(child.text || "").trim();
      return text ? `[${text}](#)` : "";
    }
    if (child?.type === "field_code") {
      return `\`${String(child.value || "").trim()}\``;
    }
    return String(child?.text || "");
  }).join("");
}

function flattenCellBlocks(blocks = []) {
  return (Array.isArray(blocks) ? blocks : [])
    .map((block) => renderBlock(block).trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function renderTable(rows = []) {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeRows.length) return "";

  const width = safeRows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
  if (!width) return "";

  const normalized = safeRows.map((row) => {
    const cells = Array.isArray(row)
      ? row.map((cell) => {
        if (cell?.type === "table_cell") {
          return flattenCellBlocks(cell.blocks);
        }
        return String(cell || "");
      })
      : [];
    while (cells.length < width) cells.push("");
    return cells;
  });

  const header = normalized[0];
  const divider = new Array(width).fill("---");
  const dataRows = normalized.slice(1);

  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${divider.join(" | ")} |`
  ];

  for (const row of dataRows) {
    lines.push(`| ${row.join(" | ")} |`);
  }

  return lines.join("\n");
}

function renderBlock(block = {}) {
  const type = String(block?.type || "");
  if (type === "heading") {
    const level = Math.max(1, Math.min(6, Number(block?.level || 2)));
    return `${"#".repeat(level)} ${String(block?.text || "").trim()}`;
  }
  if (type === "paragraph") {
    return renderInlineChildren(block?.children);
  }
  if (type === "display_math") {
    return `$$\n${String(block?.latex || "").trim()}\n$$`;
  }
  if (type === "list") {
    const listItems = Array.isArray(block?.list_items) ? block.list_items : [];
    if (listItems.length) {
      return listItems
        .map((item) => `- ${renderInlineChildren(item?.children || []).trim()}`)
        .join("\n");
    }
    return (Array.isArray(block?.items) ? block.items : [])
      .map((item) => `- ${String(item || "").trim()}`)
      .join("\n");
  }
  if (type === "table") {
    return renderTable(block?.rows);
  }
  if (type === "quote") {
    return `> ${renderInlineChildren(block?.children).trim()}`;
  }
  if (type === "code") {
    return `\`\`\`\n${String(block?.text || "").trim()}\n\`\`\``;
  }
  if (type === "caption") {
    return `*${renderInlineChildren(block?.children).trim()}*`;
  }
  if (type === "footnote" || type === "endnote") {
    return `${type === "footnote" ? "Footnote" : "Endnote"} ${String(block?.note_id || "")}: ${String(block?.text || "").trim()}`;
  }
  return "";
}

export function renderCanonicalDocumentToMarkdown(cdm = {}) {
  const sections = Array.isArray(cdm?.sections) ? cdm.sections : [];
  const chunks = [];

  for (const section of sections) {
    const blocks = Array.isArray(section?.blocks) ? section.blocks : [];
    for (const block of blocks) {
      const rendered = renderBlock(block).trim();
      if (rendered) {
        chunks.push(rendered);
      }
    }
  }

  return chunks.join("\n\n").trim();
}
