function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createNode(tag, attrs = {}, children = []) {
  return {
    tag: String(tag || "div"),
    attrs: attrs || {},
    children: Array.isArray(children) ? children : [children]
  };
}

function renderNode(node) {
  if (node == null) return "";
  if (typeof node === "string") return escapeHtml(node);

  const attrs = Object.entries(node.attrs || {})
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => `${escapeHtml(key)}="${escapeHtml(String(value))}"`)
    .join(" ");

  const renderedChildren = (Array.isArray(node.children) ? node.children : [])
    .map((child) => renderNode(child))
    .join("");

  return attrs
    ? `<${node.tag} ${attrs}>${renderedChildren}</${node.tag}>`
    : `<${node.tag}>${renderedChildren}</${node.tag}>`;
}

function StyledText({ text = "", formatting = {} }) {
  let node = String(text || "");

  if (formatting?.underline) {
    node = createNode("u", {}, [node]);
  }
  if (formatting?.italic) {
    node = createNode("em", {}, [node]);
  }
  if (formatting?.bold) {
    node = createNode("strong", {}, [node]);
  }

  return node;
}

function InlineMath({ latex = "" }) {
  const safeLatex = String(latex || "");
  return createNode("span", { class: "cdm-inline-math", "data-latex": safeLatex }, [`$${safeLatex}$`]);
}

function DisplayMath({ latex = "" }) {
  const safeLatex = String(latex || "");
  return createNode("div", { class: "cdm-display-math", "data-latex": safeLatex }, [`$$ ${safeLatex} $$`]);
}

function InlineContent({ children = [] }) {
  const nodes = (Array.isArray(children) ? children : []).map((child) => {
    if (child?.type === "inline_math") {
      return InlineMath({ latex: child.latex });
    }
    if (child?.type === "display_math") {
      return DisplayMath({ latex: child.latex });
    }
    if (child?.type === "hyperlink") {
      return createNode("a", { href: "#", "data-relationship-id": String(child.relationship_id || "") }, [String(child.text || "")]);
    }
    if (child?.type === "field_code") {
      return createNode("code", { class: "cdm-field-code" }, [String(child.value || "")]);
    }
    if (child?.type === "bookmark") {
      return createNode("span", { class: "cdm-bookmark", "data-bookmark-id": String(child.bookmarkId || "") }, [String(child.name || "")]);
    }
    if (child?.type === "comment_reference") {
      return createNode("sup", { class: "cdm-comment-ref", "data-comment-id": String(child.commentId || "") }, ["* "]);
    }
    return StyledText({ text: String(child?.text || ""), formatting: child?.formatting || {} });
  });

  return nodes;
}

function TableCell({ cell = {} }) {
  const blocks = Array.isArray(cell?.blocks) ? cell.blocks : [];
  return createNode("td", {}, blocks.map((block) => BlockRenderer({ block })));
}

function TableComponent({ rows = [] }) {
  const rowElements = (Array.isArray(rows) ? rows : []).map((row) => {
    const cells = (Array.isArray(row) ? row : []).map((cell) => {
      if (cell?.type === "table_cell") {
        return TableCell({ cell });
      }
      return createNode("td", {}, [String(cell || "")]);
    });
    return createNode("tr", {}, cells);
  });

  return createNode("table", { class: "cdm-table" }, [createNode("tbody", {}, rowElements)]);
}

function BlockRenderer({ block = {} }) {
  const type = String(block?.type || "");

  if (type === "heading") {
    const level = Math.max(1, Math.min(6, Number(block?.level || 2)));
    return createNode(`h${level}`, {}, [String(block?.text || "")]);
  }
  if (type === "paragraph") {
    return createNode("p", {}, InlineContent({ children: block?.children || [] }));
  }
  if (type === "display_math") {
    return DisplayMath({ latex: block?.latex || "" });
  }
  if (type === "list") {
    const listItems = Array.isArray(block?.list_items) ? block.list_items : [];
    if (listItems.length) {
      return createNode("ul", {}, listItems.map((item) => {
        const children = Array.isArray(item?.children) ? item.children : [];
        return createNode("li", {}, InlineContent({ children }));
      }));
    }
    const items = Array.isArray(block?.items) ? block.items : [];
    return createNode("ul", {}, items.map((item) => createNode("li", {}, [String(item || "")])));
  }
  if (type === "table") {
    return TableComponent({ rows: block?.rows || [] });
  }
  if (type === "quote") {
    return createNode("blockquote", {}, InlineContent({ children: block?.children || [] }));
  }
  if (type === "code") {
    return createNode("pre", {}, [createNode("code", {}, [String(block?.text || "")])]);
  }
  if (type === "caption") {
    return createNode("figcaption", {}, InlineContent({ children: block?.children || [] }));
  }
  if (type === "callout") {
    return createNode("aside", { class: "cdm-callout" }, InlineContent({ children: block?.children || [] }));
  }
  if (type === "figure") {
    const children = [createNode("figcaption", {}, [String(block?.caption || "Figure")])];
    if (block?.alt_text) {
      children.push(createNode("p", { class: "cdm-alt-text" }, [String(block.alt_text)]));
    }
    return createNode("figure", {}, children);
  }
  if (type === "footnote" || type === "endnote") {
    return createNode("p", { class: `cdm-${type}` }, [String(block?.text || "")]);
  }

  return "";
}

function SectionComponent({ section = {} }) {
  const blocks = Array.isArray(section?.blocks) ? section.blocks : [];
  const nodes = [];

  for (const block of blocks) {
    nodes.push(BlockRenderer({ block }));
  }

  return createNode("section", { class: "cdm-section" }, nodes);
}

export function renderCanonicalDocumentToHtml(cdm = {}) {
  const sections = Array.isArray(cdm?.sections) ? cdm.sections : [];
  const article = createNode(
    "article",
    { class: "cdm-document", "data-schema-version": String(cdm?.schemaVersion || "1.0") },
    sections.map((section) => SectionComponent({ section }))
  );

  return renderNode(article);
}
