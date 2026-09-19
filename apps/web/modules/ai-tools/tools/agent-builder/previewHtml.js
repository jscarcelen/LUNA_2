/**
 * Helpers shared by the live preview pane and the "save to workspace" path so what the user
 * sees in the preview is exactly what gets stored.
 */

export const FONT_OPTIONS = [
  { value: "inter", label: "Inter (modern sans)", stack: "Inter, 'Segoe UI', Helvetica, Arial, sans-serif" },
  { value: "georgia", label: "Georgia (classic serif)", stack: "Georgia, 'Times New Roman', serif" },
  { value: "avenir", label: "Avenir Next (LUNA default)", stack: "'Avenir Next', 'Gill Sans', 'Trebuchet MS', sans-serif" },
  { value: "mono", label: "Monospace", stack: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace" }
];

export const ACCENT_PRESETS = ["#2f6df6", "#0ea5a3", "#e0781f", "#c2418a", "#6d4de6", "#1f2937"];

export const BLOCK_TYPE_OPTIONS = [
  { value: "heading1", label: "Heading" },
  { value: "heading2", label: "Heading 2" },
  { value: "heading3", label: "Heading 3" },
  { value: "paragraph", label: "Paragraph" },
  { value: "standalone_text", label: "Standalone Text" },
  { value: "bullet_list", label: "Bullet List" },
  { value: "code", label: "Code" }
];

export function defaultBrand(title = "") {
  return {
    title: String(title || ""),
    subtitle: "",
    logoUrl: "",
    accent: ACCENT_PRESETS[0],
    font: "inter",
    density: "comfortable",
    showDividers: true,
    numbered: false,
    itemLimit: 0
  };
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isSafeImageUrl(url) {
  const value = String(url || "").trim();
  return /^https?:\/\//i.test(value) || /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(value);
}

export function renderFieldAsMarkdown(type, value) {
  const text = Array.isArray(value) ? value.join(", ") : String(value ?? "");
  if (type === "heading1") return `# ${text}`;
  if (type === "heading2") return `## ${text}`;
  if (type === "heading3") return `### ${text}`;
  if (type === "code") return `\`\`\`\n${text}\n\`\`\``;
  if (type === "bullet_list") {
    const items = Array.isArray(value) ? value : String(value || "").split(/\n+/).filter(Boolean);
    return items.map((item) => `- ${item}`).join("\n");
  }
  return text;
}

function renderFieldAsHtml(type, value) {
  if (type === "bullet_list") {
    const items = Array.isArray(value) ? value : String(value || "").split(/\n+/).filter(Boolean);
    return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
  }
  const text = escapeHtml(Array.isArray(value) ? value.join(", ") : String(value ?? ""));
  if (type === "heading1") return `<h1>${text}</h1>`;
  if (type === "heading2") return `<h2>${text}</h2>`;
  if (type === "heading3") return `<h3>${text}</h3>`;
  if (type === "code") return `<pre><code>${text}</code></pre>`;
  if (type === "standalone_text") return `<p class="standalone">${text}</p>`;
  return `<p>${text}</p>`;
}

/** Applies the customization panel's field settings (visibility, order, limit) to raw items. */
export function applyOutputCustomization(items = [], fields = [], customization = {}) {
  const hidden = new Set(customization.hiddenFields || []);
  const order = Array.isArray(customization.fieldOrder) && customization.fieldOrder.length ? customization.fieldOrder : fields.map((field) => field.name);
  const orderedFields = order
    .map((name) => fields.find((field) => field.name === name))
    .filter(Boolean)
    .concat(fields.filter((field) => !order.includes(field.name)))
    .filter((field) => !hidden.has(field.name));
  const limit = Number(customization.brand?.itemLimit || 0);
  const visibleItems = limit > 0 ? items.slice(0, limit) : items;
  return { fields: orderedFields, items: visibleItems };
}

/** Plain (no template) rendering: one card per item, block type per field. Returns an HTML fragment. */
export function renderPlainOutputHtml(items = [], fields = [], fieldTypeByName = {}, brand = {}, rootData = {}, onceFields = []) {
  const itemFields = fields.filter((field) => field.repeatScope !== "once");
  const head = onceFields.filter((field) => rootData[field.name] !== undefined && rootData[field.name] !== "").map((field) => renderFieldAsHtml(fieldTypeByName[field.name] || (field === onceFields[0] ? "heading1" : "paragraph"), rootData[field.name])).join("\n");
  const cards = items.map((item, index) => {
    const inner = itemFields.map((field) => renderFieldAsHtml(fieldTypeByName[field.name] || "paragraph", item[field.name])).join("\n");
    const number = brand.numbered ? `<span class="item-number">${index + 1}</span>` : "";
    return `<section class="item">${number}${inner}</section>`;
  }).join(brand.showDividers === false ? "\n" : '\n<hr class="divider" />\n');
  return `<div class="plain-output">${head ? `<section class="doc-head">${head}</section>` : ""}${cards || '<p class="empty">No items yet.</p>'}</div>`;
}

export function renderPlainOutputText(items = [], fields = [], fieldTypeByName = {}) {
  return items
    .map((item) => fields.map((field) => renderFieldAsMarkdown(fieldTypeByName[field.name] || "paragraph", item[field.name])).join("\n\n"))
    .join("\n\n---\n\n");
}

/**
 * Wraps an HTML fragment (from the template renderer or renderPlainOutputHtml) in a complete,
 * self-contained document carrying the brand overrides. Used for the iframe preview and for the
 * saved .html document so the two never drift apart.
 */
export function wrapPreviewDocument(fragment, brand = {}, { forPrint = false, header = true } = {}) {
  const font = FONT_OPTIONS.find((option) => option.value === brand.font) || FONT_OPTIONS[0];
  const accent = /^#[0-9a-f]{3,8}$/i.test(String(brand.accent || "")) ? brand.accent : ACCENT_PRESETS[0];
  const dense = brand.density === "compact";
  const logo = isSafeImageUrl(brand.logoUrl) ? `<img class="brand-logo" src="${escapeHtml(brand.logoUrl)}" alt="" />` : "";
  const headerHtml = header && (brand.title || brand.subtitle || logo)
    ? `<header class="brand-header">${logo}<div>${brand.title ? `<h1 class="brand-title">${escapeHtml(brand.title)}</h1>` : ""}${brand.subtitle ? `<p class="brand-subtitle">${escapeHtml(brand.subtitle)}</p>` : ""}</div></header>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root { --accent: ${accent}; --font: ${font.stack}; --gap: ${dense ? "10px" : "18px"}; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: ${forPrint ? "#fff" : "#f4f5f9"}; color: #1c2033; font-family: var(--font); line-height: 1.55; }
  body { padding: ${forPrint ? "0" : "28px"}; }
  .brand-header { display: flex; align-items: center; gap: 16px; margin: 0 auto var(--gap); max-width: 820px; padding-bottom: 14px; border-bottom: 3px solid var(--accent); }
  .brand-logo { width: 56px; height: 56px; object-fit: contain; border-radius: 12px; }
  .brand-title { margin: 0; font-size: 26px; letter-spacing: -0.01em; color: var(--accent); }
  .brand-subtitle { margin: 2px 0 0; color: #5a607a; font-size: 14px; }
  .plain-output { max-width: 820px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--gap); }
  .plain-output .doc-head { padding: 0 4px 6px; }
  .plain-output .doc-head h1 { font-size: 26px; margin: 0 0 4px; }
  .plain-output .item { position: relative; background: #fff; border: 1px solid #e4e6ef; border-left: 4px solid var(--accent); border-radius: 14px; padding: ${dense ? "12px 16px" : "18px 22px"}; box-shadow: 0 2px 10px rgba(28, 32, 51, 0.05); }
  .plain-output .item-number { position: absolute; top: 12px; right: 14px; font-size: 12px; font-weight: 700; color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, #fff); padding: 2px 8px; border-radius: 999px; }
  .plain-output h1, .plain-output h2, .plain-output h3 { margin: 0 0 6px; color: #12162a; }
  .plain-output h1 { font-size: 22px; } .plain-output h2 { font-size: 18px; } .plain-output h3 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--accent); }
  .plain-output p { margin: 0 0 8px; } .plain-output p:last-child { margin-bottom: 0; }
  .plain-output .standalone { font-size: 17px; font-weight: 600; }
  .plain-output ul { margin: 0 0 8px; padding-left: 20px; }
  .plain-output pre { background: #0f172a; color: #e2e8f0; padding: 12px 14px; border-radius: 10px; overflow: auto; font-size: 13px; }
  .plain-output .divider { border: 0; height: 1px; background: #e4e6ef; margin: 0; }
  .plain-output .empty { color: #8a90a8; text-align: center; padding: 40px 0; }
  .luna-template-default { --accent-override: var(--accent); }
</style>
</head>
<body>${headerHtml}${fragment}</body>
</html>`;
}
