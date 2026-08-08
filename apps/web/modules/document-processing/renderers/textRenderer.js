function flattenInlineChildren(children = []) {
  return (Array.isArray(children) ? children : []).map((child) => {
    if (child?.type === "inline_math") {
      return ` ${String(child.latex || "").trim()} `;
    }
    if (child?.type === "display_math") {
      return ` ${String(child.latex || "").trim()} `;
    }
    if (child?.type === "hyperlink") {
      return String(child.text || "");
    }
    if (child?.type === "field_code") {
      return `[${String(child.value || "").trim()}]`;
    }
    if (child?.type === "bookmark") {
      return String(child.name || "");
    }
    return String(child?.text || "");
  }).join("");
}

function flattenCellBlocks(blocks = []) {
  return (Array.isArray(blocks) ? blocks : [])
    .map((block) => flattenBlock(block))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function flattenTable(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => (Array.isArray(row)
      ? row.map((cell) => {
        if (cell?.type === "table_cell") {
          return flattenCellBlocks(cell.blocks);
        }
        return String(cell || "");
      }).join(" | ")
      : ""))
    .filter(Boolean)
    .join("\n");
}

function flattenBlock(block = {}) {
  const type = String(block?.type || "");
  if (type === "heading") {
    return String(block?.text || "").trim();
  }
  if (type === "paragraph") {
    return flattenInlineChildren(block?.children).trim();
  }
  if (type === "display_math") {
    return String(block?.latex || "").trim();
  }
  if (type === "list") {
    if (Array.isArray(block?.list_items) && block.list_items.length) {
      return block.list_items
        .map((item) => flattenInlineChildren(item?.children || []).trim())
        .filter(Boolean)
        .join("\n");
    }
    return (Array.isArray(block?.items) ? block.items : []).map((item) => String(item || "")).join("\n");
  }
  if (type === "table") {
    return flattenTable(block?.rows);
  }
  if (type === "quote" || type === "caption" || type === "callout") {
    return flattenInlineChildren(block?.children).trim();
  }
  if (type === "code") {
    return String(block?.text || "").trim();
  }
  if (type === "footnote" || type === "endnote") {
    return String(block?.text || "").trim();
  }
  return "";
}

export function renderCanonicalDocumentToText(cdm = {}) {
  const sections = Array.isArray(cdm?.sections) ? cdm.sections : [];
  const parts = [];

  for (const section of sections) {
    const blocks = Array.isArray(section?.blocks) ? section.blocks : [];
    for (const block of blocks) {
      const value = flattenBlock(block).trim();
      if (value) parts.push(value);
    }
  }

  return parts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}
