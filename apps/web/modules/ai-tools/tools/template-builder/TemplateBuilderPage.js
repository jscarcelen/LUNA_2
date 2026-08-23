"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const BLOCK_TYPE_LIBRARY = [
  { type: "heading1", label: "Heading", emoji: "T↑", group: "text" },
  { type: "paragraph", label: "Paragraph", emoji: "¶", group: "text" },
  { type: "standalone_text", label: "Text", emoji: "Aa", group: "text" },
  { type: "bullet_list", label: "Bullet List", emoji: "☰", group: "text" },
  { type: "numbered_list", label: "Numbered List", emoji: "①", group: "text" },
  { type: "image", label: "Image", emoji: "🖼", group: "content" },
  { type: "table", label: "Table", emoji: "⊞", group: "content" },
  { type: "standalone_formula", label: "Formula", emoji: "f(x)", group: "content" },
  { type: "divider", label: "Divider", emoji: "—", group: "content" },
  { type: "callout", label: "Callout", emoji: "💡", group: "content" },
  { type: "page_break", label: "Page Break", emoji: "⤓", group: "page" },
  { type: "header", label: "Header", emoji: "▭", group: "page" },
  { type: "footer", label: "Footer", emoji: "▬", group: "page" },
  { type: "page_number", label: "Page Number", emoji: "#", group: "page" },
  { type: "logo", label: "Logo", emoji: "⬡", group: "page" },
  { type: "spacer", label: "Spacer", emoji: "↕", group: "page" },
  { type: "badge", label: "Badge", emoji: "◈", group: "content" },
  { type: "question_number", label: "Question #", emoji: "Q.", group: "content" },
  { type: "answer_choice", label: "Answer Choice", emoji: "◎", group: "content" },
  { type: "explanation", label: "Explanation", emoji: "◆", group: "content" }
];

const BLOCK_GROUPS = [
  { key: "text", label: "Text" },
  { key: "content", label: "Content" },
  { key: "page", label: "Page Elements" }
];

const PAGE_FORMAT_OPTIONS = [
  { value: "html-continuous", label: "HTML \u2014 Continuous" },
  { value: "a4-portrait", label: "A4 Portrait" },
  { value: "a4-landscape", label: "A4 Landscape" },
  { value: "letter-portrait", label: "Letter Portrait" },
  { value: "letter-landscape", label: "Letter Landscape" },
  { value: "ppt-16-9", label: "16:9 Presentation" },
  { value: "ppt-4-3", label: "4:3 Presentation" },
  { value: "custom", label: "Custom" }
];

const OUTPUT_FORMAT_OPTIONS = [
  { value: "html", label: "HTML", icon: "🌐", pageFormat: "html-continuous", extension: "html" },
  { value: "pdf", label: "PDF", icon: "📄", pageFormat: "a4-portrait", extension: "pdf" },
  { value: "docx", label: "Word", icon: "📝", pageFormat: "a4-portrait", extension: "docx" },
  { value: "pptx", label: "PowerPoint", icon: "📊", pageFormat: "ppt-16-9", extension: "pptx" }
];

const LAYOUT_MODE_OPTIONS = ["Flow", "Fixed", "Absolute", "Relative"];
const VERTICAL_POSITION_OPTIONS = ["After previous", "Top of page", "Bottom of page", "Centered"];
const ANCHOR_OPTIONS = ["Page", "Previous block", "Parent component", "Header", "Footer"];
const OVERFLOW_OPTIONS = ["Expand height", "Reduce font size", "Clip", "Continue on next page"];
const DATA_TYPE_OPTIONS = ["string", "number", "boolean", "array", "object"];
const REPEAT_SCOPE_OPTIONS = [
  { value: "once", label: "Once per document" },
  { value: "per-page", label: "Once per page" },
  { value: "per-output", label: "Repeat for each AI output item" },
  { value: "per-field", label: "Repeat for each item in variable" }
];

const DEFAULT_SAMPLE_DATA = {
  question_number: 1,
  question: "What is the probability of getting at least one head in two coin flips?",
  answers: ["0.25", "0.50", "0.75", "1.00"],
  explanation: "Three of the four possible outcomes contain at least one head.",
  difficulty: "Medium",
  points: 2
};

const TEMPLATE_BUILDER_STORAGE_KEY = "luna-template-builder-drafts";

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readTemplatesFromStorage() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TEMPLATE_BUILDER_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeTemplatesToStorage(templates = []) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TEMPLATE_BUILDER_STORAGE_KEY, JSON.stringify(Array.isArray(templates) ? templates : []));
  } catch {
    // Ignore localStorage limits and keep in-memory state only.
  }
}

function starterComponents() {
  return [
    {
      id: createId("comp"),
      name: "Question Card",
      description: "Question, answer choices, and explanation.",
      blocks: [
        { id: createId("blk"), type: "question_number", formatName: "Default", bindField: "", illustrativeText: "Q1" },
        { id: createId("blk"), type: "heading3", formatName: "Default", bindField: "", illustrativeText: "What is the question?" },
        { id: createId("blk"), type: "answer_choice", formatName: "Default", repeatField: "", illustrativeText: "Answer choice" },
        { id: createId("blk"), type: "explanation", formatName: "Default", bindField: "", illustrativeText: "Explanation text" }
      ]
    },
    {
      id: createId("comp"),
      name: "Section Header",
      description: "Divider with a heading.",
      blocks: [
        { id: createId("blk"), type: "heading2", formatName: "Default", bindField: "", illustrativeText: "Section heading" },
        { id: createId("blk"), type: "divider", formatName: "Default", illustrativeText: "Section divider" }
      ]
    }
  ];
}

function defaultFormatSets() {
  return [{ id: "format-set-default", name: "Default", formats: {} }];
}

function defaultPageLayouts(canvasBlocks = []) {
  return [{ id: "page-1", name: "Page 1", pageFormat: "a4-portrait", blocks: canvasBlocks }];
}

function defaultDataFields() {
  return [];
}

function defaultRenderVariants() {
  return [
    { id: "variant-html", format: "html", label: "HTML", pageFormat: "html-continuous", pageLayoutId: "page-1", blocks: [], enabled: true },
    { id: "variant-pdf", format: "pdf", label: "PDF", pageFormat: "a4-portrait", pageLayoutId: "page-1", blocks: [], enabled: true },
    { id: "variant-docx", format: "docx", label: "Word", pageFormat: "a4-portrait", pageLayoutId: "page-1", blocks: [], enabled: true },
    { id: "variant-pptx", format: "pptx", label: "PowerPoint", pageFormat: "ppt-16-9", pageLayoutId: "page-1", blocks: [], enabled: true }
  ];
}

function defaultBlockFormats() {
  const formats = {};
  for (const item of BLOCK_TYPE_LIBRARY) {
    formats[item.type] = [{ name: "Default", className: `tplb-${item.type}`, htmlTemplate: "", style: {} }];
  }
  return formats;
}

function createBlankTemplateDraft() {
  return {
    id: "",
    name: "Untitled Template",
    description: "",
    containerClass: "luna-template-default",
    css: "",
    pageFormat: "a4-portrait",
    customPageSize: { width: 210, height: 297 },
    folderId: "tpl-folder-root",
    blockClasses: {},
    dataFields: defaultDataFields(),
    renderVariants: defaultRenderVariants(),
    repeatCollectionField: "",
    blockFormats: defaultBlockFormats(),
      formatSets: defaultFormatSets(),
      activeFormatSetId: "format-set-default",
      activePageId: "page-1",
      pageLayouts: defaultPageLayouts(),
      canvasSettings: { showGrid: true, showMargins: true, snapToGrid: true, gridSize: 5, margin: 16 },
    components: starterComponents(),
    canvasBlocks: []
  };
}

function cloneDraft(draft) {
  return JSON.parse(JSON.stringify(draft));
}

function labelForType(type) {
  return BLOCK_TYPE_LIBRARY.find((item) => item.type === type)?.label || type;
}

function blockEmoji(type) {
  return BLOCK_TYPE_LIBRARY.find((item) => item.type === type)?.emoji || "▪";
}

// Returns a WYSIWYG-style React style object for rendering a block realistically on canvas
function blockCanvasStyle(type, formatStyle = {}) {
  const base = {
    fontFamily: formatStyle.fontFamily || "Inter, system-ui, sans-serif",
    color: formatStyle.color || "#1f2440",
    backgroundColor: formatStyle.backgroundColor || "transparent",
    textAlign: formatStyle.textAlign || "left",
    lineHeight: formatStyle.lineHeight || "1.4",
    padding: formatStyle.padding || "0",
    fontWeight: formatStyle.fontWeight || "400",
    letterSpacing: formatStyle.letterSpacing || "0",
    borderRadius: formatStyle.radius || "0",
    boxSizing: "border-box",
    width: "100%"
  };
  if (formatStyle.borderColor && formatStyle.borderWidth) {
    base.border = `${formatStyle.borderWidth} solid ${formatStyle.borderColor}`;
  }
  if (type.startsWith("heading")) {
    const sizeMap = { heading1: "26px", heading2: "20px", heading3: "16px", heading4: "14px" };
    base.fontSize = formatStyle.fontSize || sizeMap[type] || "20px";
    base.fontWeight = formatStyle.fontWeight || "700";
    base.margin = "0 0 6px";
  } else if (type === "paragraph") {
    base.fontSize = formatStyle.fontSize || "13px";
    base.margin = "0 0 4px";
  } else if (type === "standalone_text") {
    base.fontSize = formatStyle.fontSize || "13px";
  } else if (type === "question_number") {
    base.fontSize = formatStyle.fontSize || "13px";
    base.fontWeight = "700";
    base.color = formatStyle.color || "#5b3fd6";
  } else if (type === "explanation") {
    base.fontSize = formatStyle.fontSize || "12px";
    base.color = formatStyle.color || "#5f6788";
  } else if (type === "answer_choice") {
    base.fontSize = formatStyle.fontSize || "12px";
  } else if (type === "callout") {
    base.backgroundColor = formatStyle.backgroundColor || "#f2edff";
    base.border = formatStyle.borderColor ? `1.5px solid ${formatStyle.borderColor}` : "1.5px solid rgba(124,92,240,0.25)";
    base.borderRadius = "8px";
    base.padding = "10px 14px";
    base.fontSize = "13px";
  } else if (type === "header" || type === "footer") {
    base.fontSize = formatStyle.fontSize || "11px";
    base.color = formatStyle.color || "#5f6788";
    base.borderBottom = type === "header" ? "1px solid #e4e0f5" : undefined;
    base.borderTop = type === "footer" ? "1px solid #e4e0f5" : undefined;
    base.padding = "6px 0";
    base.display = "flex";
    base.justifyContent = "space-between";
  } else {
    base.fontSize = formatStyle.fontSize || "13px";
  }
  return base;
}

function illustrativeText(type) {
  const examples = {
    heading1: "Exam title",
    paragraph: "Write a paragraph of content here.",
    standalone_text: "Supporting text",
    bullet_list: "List item",
    numbered_list: "Numbered item",
    image: "Image placeholder",
    table: "Table data",
    standalone_formula: "x = a + b",
    divider: "Section divider",
    badge: "Label",
    spacer: "Spacing",
    page_break: "New page",
    question_number: "Q1",
    answer_choice: "Answer choice",
    explanation: "Explanation text"
  };
  return examples[type] || "Content placeholder";
}

function outputFormatMeta(format) {
  return OUTPUT_FORMAT_OPTIONS.find((item) => item.value === format) || OUTPUT_FORMAT_OPTIONS[0];
}

function WysiwygBlock({ type, text, style }) {
  if (type === "divider") {
    return <hr style={{ border: "none", borderTop: "1.5px solid #ddd9f5", margin: "8px 0" }} />;
  }
  if (type === "page_break") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0", color: "#a39dc7", fontSize: 11, fontWeight: 600, letterSpacing: "0.06em" }}>
        <div style={{ flex: 1, height: 1, background: "#e0dcf6" }} />
        PAGE BREAK
        <div style={{ flex: 1, height: 1, background: "#e0dcf6" }} />
      </div>
    );
  }
  if (type === "spacer") {
    return <div style={{ height: 24 }} />;
  }
  if (type === "image") {
    return (
      <div style={{ ...style, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 80, background: "#f5f3ff", border: "1.5px dashed #c0b8e8", borderRadius: 8, color: "#9b93d6", fontSize: 28 }}>
        🖼
      </div>
    );
  }
  if (type === "table") {
    return (
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: style.fontSize || "12px" }}>
        <thead>
          <tr>{["Column 1", "Column 2", "Column 3"].map((col) => (
            <th key={col} style={{ border: "1px solid #ddd9f5", background: "#f5f3ff", padding: "4px 8px", textAlign: "left", fontSize: "inherit" }}>{col}</th>
          ))}</tr>
        </thead>
        <tbody>
          {[1, 2].map((row) => (
            <tr key={row}>{["Cell", "Cell", "Cell"].map((cell, ci) => (
              <td key={ci} style={{ border: "1px solid #ebe8f8", padding: "4px 8px", fontSize: "inherit", color: "#666" }}>{cell}</td>
            ))}</tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (type === "standalone_formula") {
    return <div style={{ ...style, fontFamily: "monospace", background: "#f7f6ff", border: "1px solid #ddd9f5", borderRadius: 6, padding: "6px 12px", display: "inline-block" }}>{text}</div>;
  }
  if (type === "bullet_list") {
    return (
      <ul style={{ margin: 0, paddingLeft: 20, ...style }}>
        {[text, "Second item", "Third item"].map((item, i) => <li key={i} style={{ fontSize: style.fontSize || "13px", color: style.color || "#1f2440" }}>{item}</li>)}
      </ul>
    );
  }
  if (type === "numbered_list") {
    return (
      <ol style={{ margin: 0, paddingLeft: 20, ...style }}>
        {[text, "Second item", "Third item"].map((item, i) => <li key={i} style={{ fontSize: style.fontSize || "13px", color: style.color || "#1f2440" }}>{item}</li>)}
      </ol>
    );
  }
  if (type === "header" || type === "footer") {
    return (
      <div style={style}>
        <span>{text}</span>
        <span>Page 1</span>
      </div>
    );
  }
  if (type === "page_number") {
    return <div style={{ ...style, textAlign: style.textAlign || "center" }}>1 / 5</div>;
  }
  if (type === "logo") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, ...style }}>
        <div style={{ width: 28, height: 28, background: "#7c5cf0", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 700 }}>L</div>
        <span style={{ fontWeight: 600 }}>LUNA</span>
      </div>
    );
  }
  return <div style={style}>{text}</div>;
}

function setPathValue(target, path, value) {
  if (!path) return;
  const keys = String(path).split(".").filter(Boolean);
  if (!keys.length) return;
  let current = target;
  while (keys.length > 1) {
    const key = keys.shift();
    if (!current[key] || typeof current[key] !== "object") current[key] = {};
    current = current[key];
  }
  current[keys[0]] = value;
}

function pageRatio(pageFormat) {
  const ratios = {
    "a4-portrait": 297 / 210,
    "a4-landscape": 210 / 297,
    "letter-portrait": 279 / 216,
    "letter-landscape": 216 / 279,
    "ppt-16-9": 9 / 16,
    "ppt-4-3": 3 / 4
  };
  return ratios[pageFormat] || 297 / 210;
}

function normalizeRepeatScope(scope = "once") {
  return scope === "per-item" ? "per-output" : scope;
}

function repeatBadgeLabel(scope = "once") {
  const normalized = normalizeRepeatScope(scope);
  if (normalized === "per-page") return "PAGE";
  if (normalized === "per-output") return "EACH ITEM";
  if (normalized === "per-field") return "EACH IN VARIABLE";
  return "DOCUMENT";
}

function positionToCanvasStyle(position = {}, pageFormat = "a4-portrait") {
  const pageWidth = pageFormat === "a4-landscape" || pageFormat === "letter-landscape" || pageFormat.startsWith("ppt-") ? 297 : 210;
  const pageHeight = pageWidth * pageRatio(pageFormat);
  const value = (key, fallback = 0) => Number(position[key] ?? fallback);
  return {
    position: "absolute",
    left: `${(value("x") / pageWidth) * 100}%`,
    top: `${(value("y") / pageHeight) * 100}%`,
    width: `${(value("width", value("w", pageWidth - 24)) / pageWidth) * 100}%`,
    minHeight: `${(value("height", value("h", 14)) / pageHeight) * 100}%`
  };
}

export function TemplateBuilderPage({ toolContext }) {
  const onListDocumentBlockTemplates = toolContext?.onListDocumentBlockTemplates;
  const onSaveDocumentBlockTemplate = toolContext?.onSaveDocumentBlockTemplate;

  const [templates, setTemplates] = useState([]);
  const [activeTemplateId, setActiveTemplateId] = useState("");
  const [draft, setDraft] = useState(createBlankTemplateDraft());
  const [isDirty, setIsDirty] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [multiSelectedIds, setMultiSelectedIds] = useState([]);
  const [rightTab, setRightTab] = useState("properties");
  const [sampleDataText] = useState(JSON.stringify(DEFAULT_SAMPLE_DATA, null, 2));
  const [previewHtml, setPreviewHtml] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isBusyFormat, setIsBusyFormat] = useState("");
  const [componentEditorId, setComponentEditorId] = useState("");
  const [fieldNameDraft, setFieldNameDraft] = useState("");
  const [fieldLabelDraft, setFieldLabelDraft] = useState("");
  const [fieldTypeDraft, setFieldTypeDraft] = useState("string");
  const [fieldRequiredDraft, setFieldRequiredDraft] = useState(false);
  const [openBlockMenuId, setOpenBlockMenuId] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("variant-pdf");
  const [mappingExpanded, setMappingExpanded] = useState(false);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [showComponentPopover, setShowComponentPopover] = useState(false);
  const [showFormatPopover, setShowFormatPopover] = useState(false);
  const [newComponentName, setNewComponentName] = useState("");
  const [newComponentBase, setNewComponentBase] = useState("table");
  const [newFormatType, setNewFormatType] = useState("pdf");
  const [activeBuilderView, setActiveBuilderView] = useState("design");
  const [selectedStructureEntryId, setSelectedStructureEntryId] = useState("");
  const [insertMenuIndex, setInsertMenuIndex] = useState(-1);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [previewFormat, setPreviewFormat] = useState("html");
  const [previewPdfUrl, setPreviewPdfUrl] = useState("");
  const [showQuickVariableCreator, setShowQuickVariableCreator] = useState(false);
  const [quickVariableName, setQuickVariableName] = useState("");
  const [quickVariableLabel, setQuickVariableLabel] = useState("");
  const [quickVariableType, setQuickVariableType] = useState("string");
  const [quickVariableRequired, setQuickVariableRequired] = useState(true);
  const [quickVariableDescription, setQuickVariableDescription] = useState("");
  const [showOverviewPanel, setShowOverviewPanel] = useState(true);
  const [collapsedStructureIds, setCollapsedStructureIds] = useState(new Set());
  const [collapsedBlockGroups, setCollapsedBlockGroups] = useState(new Set());
  const pointerDragRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function loadTemplates() {
      let nextTemplates = readTemplatesFromStorage();
      if (onListDocumentBlockTemplates) {
        try {
          const list = await onListDocumentBlockTemplates();
          if (Array.isArray(list)) {
            nextTemplates = list;
            writeTemplatesToStorage(list);
          }
        } catch {
          if (!cancelled) setStatusMessage("Using locally cached templates while shared storage is unavailable.");
        }
      }
      if (!cancelled) setTemplates(Array.isArray(nextTemplates) ? nextTemplates : []);
    }
    loadTemplates();
    return () => { cancelled = true; };
  }, [onListDocumentBlockTemplates]);

  useEffect(() => {
    if (!draft.canvasBlocks.length) {
      if (selectedStructureEntryId) setSelectedStructureEntryId("");
      return;
    }
    if (!selectedStructureEntryId || !draft.canvasBlocks.some((entry) => entry.id === selectedStructureEntryId)) {
      setSelectedStructureEntryId(draft.canvasBlocks[0].id);
    }
  }, [draft.canvasBlocks, selectedStructureEntryId]);

  const sampleData = useMemo(() => {
    try {
      const parsed = JSON.parse(sampleDataText);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }, [sampleDataText]);

  function pushHistory(nextDraft) {
    setHistory((previous) => {
      const trimmed = previous.slice(0, historyIndex + 1);
      const nextHistory = [...trimmed, cloneDraft(nextDraft)];
      return nextHistory.slice(-40);
    });
    setHistoryIndex((previous) => Math.min(previous + 1, 39));
  }

  function updateDraft(mutator) {
    setDraft((previous) => {
      const next = typeof mutator === "function" ? mutator(cloneDraft(previous)) : mutator;
      const pageLayouts = Array.isArray(next.pageLayouts) && next.pageLayouts.length ? next.pageLayouts : defaultPageLayouts();
      next.pageLayouts = pageLayouts.map((page) => page.id === next.activePageId ? { ...page, pageFormat: next.pageFormat, blocks: next.canvasBlocks } : page);
      next.renderVariants = (next.renderVariants || []).map((variant) => variant.id === selectedVariantId ? { ...variant, blocks: next.canvasBlocks } : variant);
      pushHistory(next);
      return next;
    });
    setIsDirty(true);
    setStatusMessage("");
  }

  function handleUndo() {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    setDraft(cloneDraft(history[nextIndex]));
    setIsDirty(true);
  }

  function handleRedo() {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    setDraft(cloneDraft(history[nextIndex]));
    setIsDirty(true);
  }

  function loadTemplateIntoDraft(template) {
    const savedPages = Array.isArray(template.pageLayouts) && template.pageLayouts.length ? template.pageLayouts : defaultPageLayouts(template.canvasBlocks || []);
    const savedActivePageId = template.activePageId || savedPages[0]?.id || "page-1";
    const savedActivePage = savedPages.find((page) => page.id === savedActivePageId) || savedPages[0];
    const nextDraft = {
      id: template.id,
      name: template.name || "Untitled Template",
      description: template.description || "",
      containerClass: template.containerClass || "luna-template-default",
      css: template.css || "",
      pageFormat: template.pageFormat || "a4-portrait",
      customPageSize: template.customPageSize || { width: 210, height: 297 },
      folderId: template.folderId || "tpl-folder-root",
      blockClasses: template.blockClasses || {},
      dataFields: Array.isArray(template.dataFields) ? template.dataFields : defaultDataFields(),
      renderVariants: Array.isArray(template.renderVariants) && template.renderVariants.length ? template.renderVariants : defaultRenderVariants(),
      repeatCollectionField: String(template.repeatCollectionField || ""),
      canvasSettings: template.canvasSettings || { showGrid: true, showMargins: true, snapToGrid: true, gridSize: 5, margin: 16 },
      blockFormats: Object.keys(template.blockFormats || {}).length ? template.blockFormats : defaultBlockFormats(),
        formatSets: Array.isArray(template.formatSets) && template.formatSets.length ? template.formatSets : defaultFormatSets(),
        activeFormatSetId: template.activeFormatSetId || template.formatSets?.[0]?.id || "format-set-default",
        activePageId: savedActivePageId,
        pageLayouts: savedPages,
      components: Array.isArray(template.components) && template.components.length ? template.components : starterComponents(),
        canvasBlocks: Array.isArray(savedActivePage?.blocks) ? savedActivePage.blocks : (Array.isArray(template.canvasBlocks) ? template.canvasBlocks : [])
    };
      const firstVariant = nextDraft.renderVariants.find((variant) => variant.id === selectedVariantId);
      if (firstVariant?.blocks?.length) nextDraft.canvasBlocks = firstVariant.blocks;
    setDraft(nextDraft);
    setActiveTemplateId(template.id);
    setHistory([cloneDraft(nextDraft)]);
    setHistoryIndex(0);
    setIsDirty(false);
    setSelectedEntryId("");
    setMultiSelectedIds([]);
    setPreviewHtml("");
    setPreviewPdfUrl("");
  }

  function handleNewTemplate() {
    const nextDraft = createBlankTemplateDraft();
    nextDraft.canvasBlocks = [];
    setDraft(nextDraft);
    setActiveTemplateId("");
    setHistory([cloneDraft(nextDraft)]);
    setHistoryIndex(0);
    setIsDirty(true);
    setSelectedEntryId("");
    setMultiSelectedIds([]);
    setPreviewHtml("");
    setPreviewPdfUrl("");
  }

  function createCanvasEntry(type, index = 0) {
    const fallbackY = 18 + index * 20;
    return {
      id: createId("canvas"),
      type,
      formatName: "Default",
      bindField: "",
      repeatField: "",
      repeatScope: "once",
      layoutMode: "Flow",
      illustrativeText: illustrativeText(type),
      position: { x: 12, y: fallbackY, width: 180, height: 14, unit: "mm" }
    };
  }

  function insertCanvasBlockAt(type, insertAt = -1) {
    updateDraft((next) => {
      if (!next.blockFormats[type]) {
        next.blockFormats[type] = [{ name: "Default", className: `tplb-${type}`, htmlTemplate: "", style: {} }];
      }
      const index = insertAt < 0 ? next.canvasBlocks.length : Math.max(0, Math.min(insertAt, next.canvasBlocks.length));
      const formatName = next.blockFormats[type]?.[0]?.name || "Default";
      const entry = { ...createCanvasEntry(type, index), formatName };
      next.canvasBlocks.splice(index, 0, entry);
      return next;
    });
    setSelectedEntryId("");
    setInsertMenuIndex(-1);
  }

  function addCanvasBlock(type) {
    const currentIndex = selectedEntryId ? draft.canvasBlocks.findIndex((entry) => entry.id === selectedEntryId) : -1;
    const insertAt = currentIndex >= 0 ? currentIndex + 1 : -1;
    insertCanvasBlockAt(type, insertAt);
  }

  function addComponentToCanvas(componentId) {
    updateDraft((next) => {
      const currentIndex = selectedEntryId ? next.canvasBlocks.findIndex((entry) => entry.id === selectedEntryId) : -1;
      const insertAt = currentIndex >= 0 ? currentIndex + 1 : next.canvasBlocks.length;
      next.canvasBlocks.splice(insertAt, 0, {
        id: createId("canvas"),
        componentRefId: componentId,
        repeatScope: "once",
        repeatField: "",
        layoutMode: "Flow",
        illustrativeText: "Reusable component",
        position: { x: 12, y: 18 + insertAt * 42, width: 180, height: 38, unit: "mm" }
      });
      return next;
    });
    setInsertMenuIndex(-1);
  }

  function updateComponent(componentId, patch) {
    updateDraft((next) => {
      next.components = (next.components || []).map((component) => component.id === componentId ? { ...component, ...patch } : component);
      return next;
    });
  }

  function addComponentBlock(componentId, type) {
    updateDraft((next) => {
      next.components = (next.components || []).map((component) => component.id === componentId
          ? { ...component, blocks: [...(component.blocks || []), { id: createId("blk"), type, formatName: "Default", bindField: "", illustrativeText: illustrativeText(type) }] }
        : component);
      return next;
    });
  }

  function removeComponentBlock(componentId, blockId) {
    updateDraft((next) => {
      next.components = (next.components || []).map((component) => component.id === componentId
        ? { ...component, blocks: (component.blocks || []).filter((block) => block.id !== blockId) }
        : component);
      return next;
    });
  }

  function deleteComponent(componentId) {
    updateDraft((next) => {
      next.components = (next.components || []).filter((component) => component.id !== componentId);
      next.canvasBlocks = (next.canvasBlocks || []).filter((entry) => entry.componentRefId !== componentId);
      return next;
    });
    setComponentEditorId("");
  }

  function addDataField() {
    const name = fieldNameDraft.trim().replace(/\s+/g, "_");
    if (!name || (draft.dataFields || []).some((field) => field.name === name)) return;
    updateDraft((next) => ({
      ...next,
      dataFields: [...(next.dataFields || []), { id: createId("field"), name, label: fieldLabelDraft.trim() || name, dataType: fieldTypeDraft, required: fieldRequiredDraft }]
    }));
    setFieldNameDraft("");
    setFieldLabelDraft("");
    setFieldTypeDraft("string");
    setFieldRequiredDraft(false);
  }

  function createDataFieldDirect({
    name,
    label,
    dataType = "string",
    required = true,
    description = ""
  }) {
    const normalized = String(name || "").trim().replace(/\s+/g, "_");
    if (!normalized) return "";
    const existing = (draft.dataFields || []).find((field) => field.name === normalized);
    if (existing) return existing.name;
    updateDraft((next) => ({
      ...next,
      dataFields: [...(next.dataFields || []), {
        id: createId("field"),
        name: normalized,
        label: String(label || normalized).trim() || normalized,
        dataType,
        required: Boolean(required),
        description: String(description || "").trim()
      }]
    }));
    return normalized;
  }

  function openQuickVariableCreator(defaults = {}) {
    setQuickVariableName(defaults.name || "");
    setQuickVariableLabel(defaults.label || defaults.name || "");
    setQuickVariableType(defaults.dataType || "string");
    setQuickVariableRequired(defaults.required ?? true);
    setQuickVariableDescription(defaults.description || "");
    setShowQuickVariableCreator(true);
  }

  function updateDataField(fieldId, patch) {
    updateDraft((next) => ({ ...next, dataFields: (next.dataFields || []).map((field) => field.id === fieldId ? { ...field, ...patch } : field) }));
  }

  function deleteDataField(fieldId) {
    updateDraft((next) => ({ ...next, dataFields: (next.dataFields || []).filter((field) => field.id !== fieldId) }));
  }

  function createVariableForSelectedBlock() {
    const createdName = createDataFieldDirect({
      name: quickVariableName,
      label: quickVariableLabel,
      dataType: quickVariableType,
      required: quickVariableRequired,
      description: quickVariableDescription
    });
    if (!createdName || !selectedEntryId) return;
    const selectedScope = normalizeRepeatScope(selectedEntry?.repeatScope || "once");
    if (selectedScope === "per-field") patchSelectedEntry({ repeatField: createdName, bindField: "" });
    else patchSelectedEntry({ bindField: createdName, repeatField: selectedScope === "per-output" ? selectedEntry?.repeatField || "" : "" });
    setShowQuickVariableCreator(false);
  }

  function updatePositionFromPointer(event, mode = "move") {
    const drag = pointerDragRef.current;
    if (!drag) return;
    const rect = drag.canvasRect;
    const pageWidth = drag.pageWidth;
    const pageHeight = drag.pageHeight;
    const deltaX = ((event.clientX - drag.startX) / rect.width) * pageWidth;
    const deltaY = ((event.clientY - drag.startY) / rect.height) * pageHeight;
    const start = drag.position;
    let nextPosition = mode === "resize"
      ? { ...start, width: Math.max(12, start.width + deltaX), height: Math.max(8, start.height + deltaY) }
      : { ...start, x: Math.max(0, start.x + deltaX), y: Math.max(0, start.y + deltaY) };
    if (draft.canvasSettings?.snapToGrid) {
      const grid = Number(draft.canvasSettings.gridSize) || 5;
      nextPosition = Object.fromEntries(Object.entries(nextPosition).map(([key, value]) => (
        [key, ["x", "y", "width", "height"].includes(key) ? Math.round(Number(value) / grid) * grid : value]
      )));
    }
    setDraft((previous) => ({
      ...previous,
      canvasBlocks: previous.canvasBlocks.map((entry) => entry.id === drag.entryId ? { ...entry, position: nextPosition } : entry),
      pageLayouts: previous.pageLayouts.map((page) => page.id === previous.activePageId ? { ...page, blocks: previous.canvasBlocks.map((entry) => entry.id === drag.entryId ? { ...entry, position: nextPosition } : entry) } : page)
    }));
    setIsDirty(true);
  }

  function startPointerInteraction(event, entry, mode = "move") {
    if (event.button !== 0 || entry.locked) return;
    const canvas = event.currentTarget.closest(".tplb-canvas-page");
    if (!canvas) return;
    event.stopPropagation();
    setSelectedEntryId(entry.id);
    pointerDragRef.current = {
      entryId: entry.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      position: { x: Number(entry.position?.x || 0), y: Number(entry.position?.y || 0), width: Number(entry.position?.width || entry.position?.w || 60), height: Number(entry.position?.height || entry.position?.h || 14), unit: "mm" },
      canvasRect: canvas.getBoundingClientRect(),
      pageWidth: draft.pageFormat.startsWith("ppt-") ? 297 : (draft.pageFormat.includes("letter") ? 216 : 210),
      pageHeight: draft.pageFormat.startsWith("ppt-") ? (draft.pageFormat === "ppt-16-9" ? 167 : 222) : (draft.pageFormat.includes("landscape") ? 210 : (draft.pageFormat.includes("letter") ? 279 : 297))
    };
  }

  useEffect(() => {
    function handlePointerMove(event) {
      if (pointerDragRef.current) updatePositionFromPointer(event, pointerDragRef.current.mode);
    }
    function handlePointerUp() {
      if (pointerDragRef.current) {
        pointerDragRef.current = null;
        setHistory((previous) => [...previous, cloneDraft(draft)].slice(-40));
      }
    }
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [draft]);

  function moveCanvasEntry(fromIndex, toIndex) {
    updateDraft((next) => {
      const list = [...next.canvasBlocks];
      const [moved] = list.splice(fromIndex, 1);
      list.splice(toIndex, 0, moved);
      next.canvasBlocks = list;
      return next;
    });
  }

  function duplicateCanvasEntry(entryId) {
    updateDraft((next) => {
      const index = next.canvasBlocks.findIndex((item) => item.id === entryId);
      if (index === -1) return next;
      const copy = { ...next.canvasBlocks[index], id: createId("canvas") };
      next.canvasBlocks.splice(index + 1, 0, copy);
      return next;
    });
  }

  function copyCanvasEntry(entryId) {
    const entry = draft.canvasBlocks.find((item) => item.id === entryId);
    if (!entry) return;
    if (typeof navigator !== "undefined" && navigator.clipboard) navigator.clipboard.writeText(JSON.stringify(entry));
    setStatusMessage("Block copied as JSON. You can paste it into another template workflow.");
  }

  function removeCanvasEntry(entryId) {
    updateDraft((next) => {
      next.canvasBlocks = next.canvasBlocks.filter((item) => item.id !== entryId);
      return next;
    });
    if (selectedEntryId === entryId) setSelectedEntryId("");
  }

  function toggleEntryFlag(entryId, flag) {
    updateDraft((next) => {
      next.canvasBlocks = next.canvasBlocks.map((item) => (item.id === entryId ? { ...item, [flag]: !item[flag] } : item));
      return next;
    });
  }

  function patchSelectedEntry(patch) {
    updateDraft((next) => {
      next.canvasBlocks = next.canvasBlocks.map((item) => (item.id === selectedEntryId ? { ...item, ...patch } : item));
      return next;
    });
  }

  function patchSelectedEntryStyle(stylePatch) {
    updateDraft((next) => {
      const entry = next.canvasBlocks.find((item) => item.id === selectedEntryId);
      if (!entry || entry.componentRefId) return next;
      const formatList = next.blockFormats[entry.type] || [];
      next.blockFormats[entry.type] = formatList.map((format) => (
        format.name === entry.formatName ? { ...format, style: { ...format.style, ...stylePatch } } : format
      ));
      return next;
    });
  }

  function alignSelected(alignment) {
    if (multiSelectedIds.length < 2) return;
    updateDraft((next) => {
      const entries = next.canvasBlocks.filter((entry) => multiSelectedIds.includes(entry.id));
      const left = Math.min(...entries.map((entry) => Number(entry.position?.x || 0)));
      const top = Math.min(...entries.map((entry) => Number(entry.position?.y || 0)));
      const right = Math.max(...entries.map((entry) => Number(entry.position?.x || 0) + Number(entry.position?.width || entry.position?.w || 0)));
      const bottom = Math.max(...entries.map((entry) => Number(entry.position?.y || 0) + Number(entry.position?.height || entry.position?.h || 0)));
      const centerX = (left + right) / 2;
      const centerY = (top + bottom) / 2;
      next.canvasBlocks = next.canvasBlocks.map((entry) => {
        if (!multiSelectedIds.includes(entry.id)) return entry;
        const position = entry.position || {};
        const width = Number(position.width || position.w || 0);
        const height = Number(position.height || position.h || 0);
        const patch = alignment.includes("left") ? { x: left } : alignment.includes("right") ? { x: right - width } : alignment.includes("center") ? { x: centerX - width / 2 } : {};
        const verticalPatch = alignment.includes("top") ? { y: top } : alignment.includes("bottom") ? { y: bottom - height } : alignment.includes("middle") ? { y: centerY - height / 2 } : {};
        return { ...entry, position: { ...position, ...patch, ...verticalPatch } };
      });
      return next;
    });
  }

  function distributeSelected(axis) {
    if (multiSelectedIds.length < 3) return;
    updateDraft((next) => {
      const selected = next.canvasBlocks.filter((entry) => multiSelectedIds.includes(entry.id)).sort((a, b) => Number(a.position?.[axis === "x" ? "x" : "y"] || 0) - Number(b.position?.[axis === "x" ? "x" : "y"] || 0));
      const first = selected[0];
      const last = selected[selected.length - 1];
      const key = axis === "x" ? "x" : "y";
      const endKey = axis === "x" ? "width" : "height";
      const startValue = Number(first.position?.[key] || 0);
      const endValue = Number(last.position?.[key] || 0) + Number(last.position?.[endKey] || last.position?.[axis === "x" ? "w" : "h"] || 0);
      const span = endValue - startValue;
      const step = span / (selected.length - 1);
      const ids = new Set(selected.slice(1, -1).map((entry) => entry.id));
      next.canvasBlocks = next.canvasBlocks.map((entry) => {
        if (!ids.has(entry.id)) return entry;
        const index = selected.findIndex((item) => item.id === entry.id);
        return { ...entry, position: { ...entry.position, [key]: startValue + step * index - Number(entry.position?.[endKey] || 0) / 2 + Number(entry.position?.[endKey] || 0) / 2 } };
      });
      return next;
    });
  }

  function addFormatPage(format = newFormatType) {
    const meta = outputFormatMeta(format);
    const pageId = createId("page");
    const variantId = createId("variant");
    const sameFormatCount = (draft.renderVariants || []).filter((variant) => variant.format === format).length;
    const suffix = sameFormatCount ? ` ${sameFormatCount + 1}` : "";
    const nextPage = {
      id: pageId,
      name: `${meta.label}${suffix}`,
      pageFormat: meta.pageFormat,
      blocks: cloneDraft(draft.canvasBlocks || [])
    };
    const nextVariant = {
      id: variantId,
      format: meta.value,
      label: `${meta.label}${suffix}`,
      pageFormat: meta.pageFormat,
      pageLayoutId: pageId,
      blocks: cloneDraft(draft.canvasBlocks || []),
      enabled: true
    };
    updateDraft((next) => ({
      ...next,
      pageLayouts: [...(next.pageLayouts || []), nextPage],
      renderVariants: [...(next.renderVariants || []), nextVariant],
      activePageId: pageId,
      pageFormat: nextPage.pageFormat,
      canvasBlocks: cloneDraft(nextPage.blocks)
    }));
    setSelectedVariantId(variantId);
    setSelectedEntryId("");
    setShowFormatPopover(false);
  }

  function updateActivePageFormat(pageFormat) {
    updateDraft((next) => ({
      ...next,
      pageFormat,
      pageLayouts: (next.pageLayouts || []).map((page) => page.id === next.activePageId ? { ...page, pageFormat } : page),
      renderVariants: (next.renderVariants || []).map((variant) => variant.pageLayoutId === next.activePageId ? { ...variant, pageFormat: variant.format === "html" ? "html-continuous" : (variant.format === "pptx" ? "ppt-16-9" : pageFormat) } : variant)
    }));
  }

  function updateRenderVariant(variantId, patch) {
    updateDraft((next) => ({ ...next, renderVariants: (next.renderVariants || []).map((variant) => variant.id === variantId ? { ...variant, ...patch } : variant) }));
  }

  function inspectRenderVariant(variant) {
    const currentVariantId = selectedVariantId;
    const currentBlocks = cloneDraft(draft.canvasBlocks || []);
    const targetBlocks = variant.blocks?.length
      ? cloneDraft(variant.blocks)
      : cloneDraft((draft.pageLayouts || []).find((page) => page.id === variant.pageLayoutId)?.blocks || draft.canvasBlocks || []);
    setDraft((previous) => ({
      ...previous,
      canvasBlocks: targetBlocks,
      renderVariants: (previous.renderVariants || []).map((item) => item.id === currentVariantId
        ? { ...item, blocks: currentBlocks }
        : item.id === variant.id ? { ...item, blocks: targetBlocks } : item),
      pageFormat: variant.pageFormat || previous.pageFormat
    }));
    setSelectedVariantId(variant.id);
    setSelectedEntryId("");
    setIsDirty(true);
  }

  function toggleMultiSelect(entryId) {
    setMultiSelectedIds((previous) => (previous.includes(entryId) ? previous.filter((id) => id !== entryId) : [...previous, entryId]));
  }

  function createComponentFromSelection() {
    if (multiSelectedIds.length < 2) return;
    updateDraft((next) => {
      const selectedEntries = next.canvasBlocks.filter((item) => multiSelectedIds.includes(item.id));
      const blocks = [];
      for (const entry of selectedEntries) {
        if (entry.componentRefId) {
          const component = next.components.find((item) => item.id === entry.componentRefId);
          if (component) blocks.push(...component.blocks.map((block) => ({ ...block, id: createId("blk") })));
        } else {
          blocks.push({ id: createId("blk"), type: entry.type, formatName: entry.formatName, bindField: entry.bindField, repeatField: entry.repeatField });
        }
      }
      const newComponent = { id: createId("comp"), name: `Component ${next.components.length + 1}`, description: "Created from selection.", blocks };
      next.components = [...next.components, newComponent];
      const firstIndex = next.canvasBlocks.findIndex((item) => item.id === multiSelectedIds[0]);
      const remaining = next.canvasBlocks.filter((item) => !multiSelectedIds.includes(item.id));
      remaining.splice(firstIndex, 0, { id: createId("canvas"), componentRefId: newComponent.id });
      next.canvasBlocks = remaining;
      return next;
    });
    setMultiSelectedIds([]);
  }

  function createNamedComponent() {
    const name = newComponentName.trim();
    if (!name) return;
    updateDraft((next) => {
      const newComponent = {
        id: createId("comp"),
        name,
        description: `Based on ${labelForType(newComponentBase)}.`,
        blocks: [{ id: createId("blk"), type: newComponentBase, formatName: "Default", bindField: "", illustrativeText: illustrativeText(newComponentBase) }]
      };
      next.components = [...(next.components || []), newComponent];
      return next;
    });
    setNewComponentName("");
    setNewComponentBase("table");
    setShowComponentPopover(false);
  }

  function createIllustrativeRecords(count) {
    return Array.from({ length: Math.max(1, Number(count) || 1) }, (_, index) => ({
      index: index + 1,
      title: `Item ${index + 1}`,
      question_number: index + 1,
      question: `Illustrative item ${index + 1}`,
      explanation: `Illustrative explanation ${index + 1}`,
      answers: DEFAULT_SAMPLE_DATA.answers
    }));
  }

  function getIllustrativeRepeatCount() {
    const specs = [];
    for (const entry of draft.canvasBlocks || []) {
      if (entry.componentRefId) {
        const component = (draft.components || []).find((item) => item.id === entry.componentRefId);
        for (const block of component?.blocks || []) {
          specs.push({
            repeatScope: normalizeRepeatScope(block.repeatScope || entry.repeatScope || "once"),
            illustrativeRepeatCount: Number(block.illustrativeRepeatCount || entry.illustrativeRepeatCount || 0)
          });
        }
      } else {
        specs.push({
          repeatScope: normalizeRepeatScope(entry.repeatScope || "once"),
          illustrativeRepeatCount: Number(entry.illustrativeRepeatCount || 0)
        });
      }
    }
    const counts = specs
      .filter((item) => item.repeatScope === "per-output" || item.repeatScope === "per-field")
      .map((item) => Math.max(0, item.illustrativeRepeatCount || 0))
      .filter(Boolean);
    return counts.length ? Math.max(...counts) : 0;
  }

  function buildRenderRequest(format) {
    const nextTemplate = cloneDraft(draft);
    const nextSampleData = cloneDraft(sampleData);
    const illustrativeRepeatCount = getIllustrativeRepeatCount();
    if (illustrativeRepeatCount > 0) {
      const collectionPath = nextTemplate.repeatCollectionField || "preview_items";
      nextTemplate.repeatCollectionField = collectionPath;
      setPathValue(nextSampleData, collectionPath, createIllustrativeRecords(illustrativeRepeatCount));
    }
    return { template: nextTemplate, sampleData: nextSampleData, format };
  }

  function ungroupComponentEntry(entryId) {
    updateDraft((next) => {
      const index = next.canvasBlocks.findIndex((item) => item.id === entryId);
      if (index === -1) return next;
      const entry = next.canvasBlocks[index];
      const component = next.components.find((item) => item.id === entry.componentRefId);
      if (!component) return next;
      const groupPosition = entry.position || { x: 12, y: 18, width: 180, height: 38, unit: "mm" };
      const childHeight = Math.max(8, Number(groupPosition.height || groupPosition.h || 38) / Math.max(1, component.blocks.length));
      const expanded = component.blocks.map((block, childIndex) => ({
        id: createId("canvas"),
        type: block.type,
        formatName: block.formatName,
        bindField: block.bindField,
        repeatField: block.repeatField,
        repeatScope: normalizeRepeatScope(entry.repeatScope || block.repeatScope || "once"),
        position: {
          ...groupPosition,
          y: Number(groupPosition.y || 0) + childIndex * childHeight,
          height: childHeight
        }
      }));
      next.canvasBlocks.splice(index, 1, ...expanded);
      return next;
    });
  }

  function updateComponentChildBinding(componentId, childId, patch) {
    updateDraft((next) => {
      next.components = next.components.map((component) => (
        component.id === componentId
          ? { ...component, blocks: component.blocks.map((block) => (block.id === childId ? { ...block, ...patch } : block)) }
          : component
      ));
      return next;
    });
  }

  function addStructureBlock(kind = "content") {
    const type = kind === "page_break" ? "page_break" : kind === "section" ? "heading1" : "paragraph";
    const currentIndex = selectedStructureEntryId ? draft.canvasBlocks.findIndex((entry) => entry.id === selectedStructureEntryId) : -1;
    const insertAt = currentIndex >= 0 ? currentIndex + 1 : -1;
    updateDraft((next) => {
      if (!next.blockFormats[type]) {
        next.blockFormats[type] = [{ name: "Default", className: `tplb-${type}`, htmlTemplate: "", style: {} }];
      }
      const index = insertAt < 0 ? next.canvasBlocks.length : Math.max(0, Math.min(insertAt, next.canvasBlocks.length));
      const formatName = next.blockFormats[type]?.[0]?.name || "Default";
      const entry = { ...createCanvasEntry(type, index), formatName, repeatScope: kind === "repeating" ? "per-output" : "once" };
      next.canvasBlocks.splice(index, 0, entry);
      return next;
    });
    setInsertMenuIndex(-1);
  }

  async function requestRender(format) {
    const response = await fetch("/api/templates/render-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildRenderRequest(format))
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error || "Render failed");
    return result;
  }

  function downloadHtmlFile(html, name = "template") {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name}.html`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function openPreview(format = "html") {
    setErrorMessage("");
    setPreviewFormat(format);
    setIsBusyFormat(`preview-${format}`);
    try {
      const result = await requestRender(format);
      if (format === "html") {
        setPreviewHtml(result.html || "");
        setPreviewPdfUrl("");
      } else if (format === "pdf") {
        setPreviewPdfUrl(`data:${result.mimeType};base64,${result.fileBase64}`);
        setPreviewHtml("");
      }
    } catch (error) {
      setErrorMessage(String(error.message || error));
    } finally {
      setIsBusyFormat("");
    }
  }

  async function handleExport(format) {
    setErrorMessage("");
    setIsBusyFormat(format);
    try {
      const result = await requestRender(format);
      if (format === "html") {
        downloadHtmlFile(result.html || "", draft.name || "template");
      } else {
        const link = document.createElement("a");
        link.href = `data:${result.mimeType};base64,${result.fileBase64}`;
        link.download = `${draft.name || "template"}.${outputFormatMeta(format).extension}`;
        link.click();
      }
    } catch (error) {
      setErrorMessage(String(error.message || error));
    } finally {
      setIsBusyFormat("");
    }
  }

  async function handleGenerateAllFormats() {
    await handleExport("pdf");
    await handleExport("docx");
    await openPreview("html");
  }

  async function handleSaveTemplate() {
    setIsSaving(true);
    setErrorMessage("");
    try {
      const payload = {
        id: activeTemplateId || undefined,
        name: draft.name,
        description: draft.description,
        containerClass: draft.containerClass,
        css: draft.css,
        folderId: draft.folderId,
        blockClasses: draft.blockClasses,
        blockHtmlTemplates: {},
        blockFormats: draft.blockFormats,
        components: draft.components,
        canvasBlocks: draft.canvasBlocks,
        pageFormat: draft.pageFormat,
        dataBindings: {},
        dataFields: draft.dataFields,
        renderVariants: draft.renderVariants,
        repeatCollectionField: draft.repeatCollectionField,
        formatSets: draft.formatSets,
        pageLayouts: draft.pageLayouts,
        activeFormatSetId: draft.activeFormatSetId,
        activePageId: draft.activePageId
        ,canvasSettings: draft.canvasSettings
      };
      let savedId = activeTemplateId;
      let nextTemplates = [];
      if (onSaveDocumentBlockTemplate) {
        const saved = await onSaveDocumentBlockTemplate(payload);
        let list = saved?.templates;
        if (typeof onListDocumentBlockTemplates === "function") {
          try {
            list = await onListDocumentBlockTemplates();
          } catch {
            list = saved?.templates || readTemplatesFromStorage();
          }
        }
        nextTemplates = Array.isArray(list) ? list : [];
        savedId = saved?.id || saved?.template?.id || activeTemplateId;
      } else {
        const localId = activeTemplateId || createId("template");
        const localTemplate = { ...payload, id: localId };
        const existing = readTemplatesFromStorage();
        const withoutCurrent = existing.filter((item) => item.id !== localId);
        nextTemplates = [...withoutCurrent, localTemplate];
        writeTemplatesToStorage(nextTemplates);
        savedId = localId;
      }
      setTemplates(nextTemplates);
      writeTemplatesToStorage(nextTemplates);
      if (savedId) setActiveTemplateId(savedId);
      setIsDirty(false);
      setStatusMessage("Template saved.");
    } catch (error) {
      const message = String(error.message || error);
      if (message.toLowerCase().includes("supabase not configured")) {
        const localId = activeTemplateId || createId("template");
        const localTemplate = {
          id: localId,
          name: draft.name,
          description: draft.description,
          containerClass: draft.containerClass,
          css: draft.css,
          folderId: draft.folderId,
          blockClasses: draft.blockClasses,
          blockFormats: draft.blockFormats,
          components: draft.components,
          canvasBlocks: draft.canvasBlocks,
          pageFormat: draft.pageFormat,
          dataFields: draft.dataFields,
          renderVariants: draft.renderVariants,
          repeatCollectionField: draft.repeatCollectionField,
          formatSets: draft.formatSets,
          pageLayouts: draft.pageLayouts,
          activeFormatSetId: draft.activeFormatSetId,
          activePageId: draft.activePageId,
          canvasSettings: draft.canvasSettings
        };
        const existing = readTemplatesFromStorage();
        const nextTemplates = [...existing.filter((item) => item.id !== localId), localTemplate];
        writeTemplatesToStorage(nextTemplates);
        setTemplates(nextTemplates);
        setActiveTemplateId(localId);
        setIsDirty(false);
        setStatusMessage("Template saved locally because shared storage is unavailable.");
      } else {
        setErrorMessage(message);
      }
    } finally {
      setIsSaving(false);
    }
  }

  const selectedEntry = draft.canvasBlocks.find((item) => item.id === selectedEntryId) || null;
  const selectedComponent = selectedEntry?.componentRefId
    ? draft.components.find((item) => item.id === selectedEntry.componentRefId)
    : null;
  const selectedFormat = selectedEntry && !selectedEntry.componentRefId
    ? (draft.blockFormats[selectedEntry.type] || []).find((item) => item.name === selectedEntry.formatName)
    : null;

  const structureItems = draft.canvasBlocks.map((entry, index) => {
    const isComponent = Boolean(entry.componentRefId);
    const component = isComponent ? draft.components.find((item) => item.id === entry.componentRefId) : null;
    const label = isComponent ? (component?.name || "Component") : labelForType(entry.type);
    const repeatScope = normalizeRepeatScope(entry.repeatScope || "once");
    return {
      id: entry.id,
      index,
      label,
      repeatScope,
      repeatField: entry.repeatField || "",
      bindField: entry.bindField || "",
      isComponent,
      component
    };
  });
  const selectedStructureItem = structureItems.find((item) => item.id === selectedStructureEntryId) || null;
  const allTemplateFields = Array.isArray(draft.dataFields) ? draft.dataFields : [];
  const templateFields = allTemplateFields;
  const scalarFields = allTemplateFields.filter((field) => field.dataType !== "array" && field.dataType !== "object");
  const arrayFields = allTemplateFields.filter((field) => field.dataType === "array");
  const activeComponentEditor = (draft.components || []).find((component) => component.id === componentEditorId) || null;

  function isAbsoluteEntry(entry) {
    if (!entry) return false;
    if (entry.layoutMode === "Absolute") return true;
    if (entry.componentRefId) return false;
    const format = (draft.blockFormats[entry.type] || []).find((item) => item.name === entry.formatName);
    return (format?.style?.layoutMode || "Flow") === "Absolute";
  }

  const canvasGroups = useMemo(() => {
    const groups = [];
    for (const entry of draft.canvasBlocks || []) {
      const scope = normalizeRepeatScope(entry.repeatScope || "once");
      const repeatKey = (scope === "per-output" || scope === "per-field") ? `${scope}:${entry.repeatField || ""}` : "";
      const isRepeatGroup = Boolean(repeatKey);
      const last = groups[groups.length - 1];
      if (isRepeatGroup && last?.kind === "repeat-group" && last.repeatKey === repeatKey) {
        last.entries.push(entry);
      } else if (isRepeatGroup) {
        groups.push({ kind: "repeat-group", repeatKey, scope, repeatField: entry.repeatField || "", entries: [entry] });
      } else {
        groups.push({ kind: "single", entries: [entry] });
      }
    }
    return groups;
  }, [draft.canvasBlocks]);
  const canvasEntryIndexMap = useMemo(() => {
    const map = new Map();
    (draft.canvasBlocks || []).forEach((entry, index) => map.set(entry.id, index));
    return map;
  }, [draft.canvasBlocks]);

  const selectedVariant = (draft.renderVariants || []).find((variant) => variant.id === selectedVariantId) || null;
  const canvasDisplayPageFormat = selectedVariant?.pageFormat || draft.pageFormat;
  const canvasPageStyle = {
    position: "relative",
    width: "min(100%, 720px)",
    margin: "0 auto",
    aspectRatio: `1 / ${pageRatio(canvasDisplayPageFormat)}`,
    minHeight: 520,
    overflow: "visible",
    padding: 0,
    background: "#fff",
    backgroundImage: draft.canvasSettings?.showGrid
      ? "linear-gradient(rgba(112, 99, 183, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(112, 99, 183, 0.1) 1px, transparent 1px)"
      : "none",
    backgroundSize: `${Math.max(2, Number(draft.canvasSettings?.gridSize || 5))}mm ${Math.max(2, Number(draft.canvasSettings?.gridSize || 5))}mm`
  };

  return (
    <div className="tplb-tool-page">
      <header className="tplb-header">
        <div className="tplb-header-left">
          <button className="tplb-icon-btn" type="button" aria-label="Back" onClick={() => window.history?.back?.()}>&larr;</button>
          <div className="tplb-header-title">
            <div className="inline-actions" style={{ gap: 8, alignItems: "center" }}>
              <strong>Template Builder</strong>
              <span className="chip" style={{ background: isDirty ? "#fff3cd" : "#e6f6ea", color: isDirty ? "#8a6d1d" : "#1c7a3c" }}>
                {isDirty ? "Draft" : "Saved \u2713"}
              </span>
              <input
                className="tplb-name-input"
                value={draft.name}
                onChange={(event) => updateDraft((next) => ({ ...next, name: event.target.value }))}
                aria-label="Template name"
              />
            </div>
            <p className="hint tplb-header-subtitle">One template &middot; Shared blocks &middot; Export anywhere</p>
          </div>
        </div>
        <div className="tplb-header-right">
          <button className="table-btn" type="button" onClick={handleUndo} disabled={historyIndex <= 0}>Undo</button>
          <button className="table-btn" type="button" onClick={handleRedo} disabled={historyIndex >= history.length - 1}>Redo</button>
          <button className="table-btn" type="button" onClick={() => { setActiveBuilderView("preview"); openPreview("html"); }}>Preview</button>
          <button className="table-btn primary" type="button" onClick={handleSaveTemplate} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Template"}
          </button>
          <div className="tplb-overflow-wrap">
            <button className="table-btn" type="button" aria-label="More actions" onClick={() => setShowOverflowMenu((previous) => !previous)}>&#8942;</button>
            {showOverflowMenu ? (
              <div className="tplb-block-menu">
                <button type="button" onClick={() => { handleNewTemplate(); setShowOverflowMenu(false); }}>New Template</button>
                <button type="button" onClick={() => { updateDraft((next) => ({ ...next })); setActiveTemplateId(""); setShowOverflowMenu(false); }}>Save As New</button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {errorMessage ? <p className="hint tplb-status-error">{errorMessage}</p> : null}
      {statusMessage ? <p className="hint tplb-status-ok">{statusMessage}</p> : null}

      <section className="panel tplb-template-gallery">
        <div className="tplb-panel-header" style={{ marginBottom: 8 }}>
          <span className="tplb-panel-title">TEMPLATES</span>
          <span className="hint">Browse saved templates visually.</span>
        </div>
        <div className="tplb-template-card-row">
          <button className={`tplb-template-card ${!activeTemplateId ? "active" : ""}`} type="button" onClick={handleNewTemplate}>
            <strong>New blank template</strong>
            <span>Start from a clean shared-block layout.</span>
          </button>
          {templates.map((template) => (
            <button
              key={template.id}
              className={`tplb-template-card ${activeTemplateId === template.id ? "active" : ""}`}
              type="button"
              onClick={() => loadTemplateIntoDraft(template)}
            >
              <strong>{template.name || "Untitled Template"}</strong>
              <span>{(template.renderVariants || []).filter((variant) => variant.enabled !== false).map((variant) => variant.label).join(" · ") || "No outputs yet"}</span>
            </button>
          ))}
        </div>
      </section>

      <nav className="panel tplb-builder-nav" aria-label="Builder sections">
        <button className={`table-btn ${activeBuilderView === "design" ? "primary" : ""}`} type="button" onClick={() => setActiveBuilderView("design")}>Design</button>
        <button className={`table-btn ${activeBuilderView === "structure" ? "primary" : ""}`} type="button" onClick={() => setActiveBuilderView("structure")}>Structure</button>
        <button className={`table-btn ${activeBuilderView === "preview" ? "primary" : ""}`} type="button" onClick={() => { setActiveBuilderView("preview"); if (!previewHtml && !previewPdfUrl) openPreview("html"); }}>Preview</button>
      </nav>

      {/* Overview panel */}
      <div className="tplb-overview-panel">
        <button className="tplb-overview-toggle" type="button" onClick={() => setShowOverviewPanel((previous) => !previous)}>
          <span className="tplb-overview-chevron">{showOverviewPanel ? "▾" : "▸"}</span>
          <span className="tplb-overview-label">1. OVERVIEW — How this tool works</span>
        </button>
        {showOverviewPanel ? (
          <div className="tplb-overview-body">
            <p className="tplb-overview-tagline">Define your document once. Map AI data. Export to any format.</p>
            <div className="tplb-overview-columns">
              <div className="tplb-overview-section">
                <p className="tplb-overview-section-title">📚 Use cases</p>
                <div className="tplb-overview-chips">
                  {[["📝","Quiz Generation"],["📋","Summary Generation"],["🃏","Flashcards"],["📖","Vocabulary Lists"],["📊","Reports"],["📄","Study Notes"]].map(([icon, label]) => (
                    <span key={label} className="tplb-overview-chip">{icon} {label}</span>
                  ))}
                </div>
              </div>
              <div className="tplb-overview-section">
                <p className="tplb-overview-section-title">🔁 Repetition rules</p>
                <div className="tplb-overview-rules">
                  <div className="tplb-overview-rule blue"><span className="tplb-overview-rule-dot" />Once — appears once in the document</div>
                  <div className="tplb-overview-rule green"><span className="tplb-overview-rule-dot" />Every Page — header, footer, page numbers</div>
                  <div className="tplb-overview-rule orange"><span className="tplb-overview-rule-dot" />For Each Item — repeats for every AI output (question, flashcard, etc.)</div>
                </div>
              </div>
              <div className="tplb-overview-section">
                <p className="tplb-overview-section-title">🗂 Workflow</p>
                <ol className="tplb-overview-steps">
                  <li>Add blocks or components in <strong>Design</strong></li>
                  <li>Define structure &amp; data in <strong>Structure</strong></li>
                  <li>Preview output in <strong>Preview</strong></li>
                  <li>Switch format tabs to configure HTML / PDF / Word / PowerPoint</li>
                </ol>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {activeBuilderView === "preview" ? (
        <section className="panel tplb-preview-panel">
          <div className="tplb-preview-header">
            <div>
              <h4 style={{ margin: 0 }}>Preview</h4>
              <p className="hint" style={{ margin: "4px 0 0" }}>Generate HTML or PDF from the same shared blocks.</p>
            </div>
            <div className="inline-actions" style={{ gap: 8, flexWrap: "wrap" }}>
              <button className={`table-btn ${previewFormat === "html" ? "primary" : ""}`} type="button" onClick={() => openPreview("html")} disabled={isBusyFormat === "preview-html"}>HTML Preview</button>
              <button className={`table-btn ${previewFormat === "pdf" ? "primary" : ""}`} type="button" onClick={() => openPreview("pdf")} disabled={isBusyFormat === "preview-pdf"}>PDF Preview</button>
              <button className="table-btn" type="button" onClick={() => handleExport("html")} disabled={isBusyFormat === "html"}>Download HTML</button>
              <button className="table-btn" type="button" onClick={() => handleExport("pdf")} disabled={isBusyFormat === "pdf"}>Download PDF</button>
              <button className="table-btn" type="button" onClick={() => setActiveBuilderView("design")}>Close</button>
            </div>
          </div>
          <div className="tplb-preview-surface">
            {previewFormat === "html" ? (
              previewHtml ? <iframe className="tplb-preview-frame" title="HTML template preview" srcDoc={previewHtml} /> : <p className="hint">Generate an HTML preview to inspect the rendered layout.</p>
            ) : (
              previewPdfUrl ? <iframe className="tplb-preview-frame" title="PDF template preview" src={previewPdfUrl} /> : <p className="hint">Generate a PDF preview to inspect the rendered document.</p>
            )}
          </div>
        </section>
      ) : null}

      {activeBuilderView === "design" ? (
        <>
      <div className="tplb-format-tabs" role="tablist" aria-label="Output format canvases">
        <div className="tplb-format-tabs-left">
          {(draft.renderVariants || []).map((variant) => {
            const icons = { pdf: "📄", docx: "📝", pptx: "📊", html: "🌐" };
            return (
              <button key={variant.id} className={`tplb-format-tab${selectedVariantId === variant.id ? " on" : ""}`} type="button" role="tab" aria-selected={selectedVariantId === variant.id} onClick={() => inspectRenderVariant(variant)}>
                <span className="tplb-format-tab-icon">{icons[variant.format] || "📄"}</span>
                {variant.label}
              </button>
            );
          })}
          <div className="tplb-format-popover-wrap">
            <button className="tplb-format-tab tplb-format-tab-add" type="button" onClick={() => setShowFormatPopover((previous) => !previous)} aria-label="Add output format">+</button>
            {showFormatPopover ? (
              <div className="tplb-block-menu tplb-format-menu">
                <label className="hint">Output format
                  <select className="table-btn" style={{ display: "block", marginTop: 4, width: "100%" }} value={newFormatType} onChange={(event) => setNewFormatType(event.target.value)}>
                    {OUTPUT_FORMAT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <button type="button" onClick={() => addFormatPage(newFormatType)}>Add format</button>
              </div>
            ) : null}
          </div>
        </div>
        <div className="tplb-format-tabs-right">
          <select className="tplb-format-page-select" value={draft.pageLayouts?.find((page) => page.id === draft.activePageId)?.pageFormat || draft.pageFormat} onChange={(event) => updateActivePageFormat(event.target.value)}>
            {PAGE_FORMAT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <span className="tplb-zoom-control">
            <button className="tplb-zoom-btn" type="button" onClick={() => setZoomLevel((previous) => Math.max(25, previous - 25))}>−</button>
            <span className="tplb-zoom-label">{zoomLevel}%</span>
            <button className="tplb-zoom-btn" type="button" onClick={() => setZoomLevel((previous) => Math.min(200, previous + 25))}>+</button>
          </span>
        </div>
      </div>

      <div className="tplb-main-grid">
        <article className="panel tplb-left-panel">
          <div className="tplb-panel-header">
            <span className="tplb-panel-title">BLOCKS</span>
            <button className="tplb-icon-btn" type="button" aria-label="Create component" onClick={() => setShowComponentPopover((previous) => !previous)}>+</button>
          </div>

          {showComponentPopover ? (
            <div className="tplb-component-popover">
              <strong>Create component</strong>
              <label className="hint">Name
                <input className="table-btn" style={{ display: "block", marginTop: 4, width: "100%" }} value={newComponentName} onChange={(event) => setNewComponentName(event.target.value)} placeholder="Financial KPI" />
              </label>
              <label className="hint">Based on
                <select className="table-btn" style={{ display: "block", marginTop: 4, width: "100%" }} value={newComponentBase} onChange={(event) => setNewComponentBase(event.target.value)}>
                  {BLOCK_TYPE_LIBRARY.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}
                </select>
              </label>
              <div className="inline-actions" style={{ justifyContent: "flex-end", gap: 6, marginTop: 8 }}>
                <button className="table-btn" type="button" onClick={() => setShowComponentPopover(false)}>Cancel</button>
                <button className="table-btn primary" type="button" onClick={createNamedComponent} disabled={!newComponentName.trim()}>Create</button>
              </div>
            </div>
          ) : null}

          <div className="tplb-block-list">
            {BLOCK_GROUPS.map((group) => {
              const items = BLOCK_TYPE_LIBRARY.filter((item) => item.group === group.key);
              const collapsed = collapsedBlockGroups.has(group.key);
              return (
                <div key={group.key} className="tplb-block-group">
                  <button className="tplb-block-group-header" type="button" onClick={() => setCollapsedBlockGroups((previous) => {
                    const next = new Set(previous);
                    if (next.has(group.key)) next.delete(group.key); else next.add(group.key);
                    return next;
                  })}>
                    <span className="tplb-block-group-chevron">{collapsed ? "›" : "⌄"}</span>
                    <span>{group.label}</span>
                  </button>
                  {!collapsed && items.map((item) => (
                    <button
                      key={item.type}
                      type="button"
                      className="tplb-block-row"
                      draggable
                      onDragStart={(event) => event.dataTransfer.setData("text/tplb-block-type", item.type)}
                      onClick={() => addCanvasBlock(item.type)}
                    >
                      <span className="tplb-block-emoji">{item.emoji}</span>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>

          {(draft.components || []).length ? (
            <>
              <div className="tplb-panel-subheader tplb-panel-subheader-row">
                <span>COMPONENTS</span>
                <button className="tplb-icon-btn" type="button" aria-label="Create component from components section" onClick={() => setShowComponentPopover((previous) => !previous)}>+</button>
              </div>
              {draft.components.map((component) => (
                <div key={component.id} className={`tplb-component-card ${componentEditorId === component.id ? "selected" : ""}`}>
                  <button className="tplb-component-open" type="button" onClick={() => addComponentToCanvas(component.id)}>
                    <strong>{"\ud83e\udde9"} {component.name}</strong>
                    <span>{component.blocks.length} blocks &middot; click to insert</span>
                  </button>
                  <button className="table-btn" type="button" onClick={() => setOpenBlockMenuId((previous) => previous === `component:${component.id}` ? "" : `component:${component.id}`)}>&bull;&bull;&bull;</button>
                  {openBlockMenuId === `component:${component.id}` ? (
                    <div className="tplb-block-menu">
                      <button type="button" onClick={() => { setComponentEditorId(component.id); setOpenBlockMenuId(""); }}>Edit</button>
                      <button type="button" onClick={() => { updateDraft((next) => ({ ...next, components: [...next.components, { ...component, id: createId("comp"), name: `${component.name} Copy` }] })); setOpenBlockMenuId(""); }}>Duplicate</button>
                      <button type="button" onClick={() => { deleteComponent(component.id); setOpenBlockMenuId(""); }}>Delete</button>
                    </div>
                  ) : null}
                </div>
              ))}
            </>
          ) : null}

          {multiSelectedIds.length >= 2 ? (
            <button className="table-btn" type="button" onClick={createComponentFromSelection} style={{ width: "100%", marginTop: 8 }}>
              Create Component From Selection ({multiSelectedIds.length})
            </button>
          ) : null}

          {activeComponentEditor ? (
            <div className="tplb-component-editor">
              <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                <h5 style={{ margin: 0 }}>Edit Component</h5>
                <button className="table-btn" type="button" onClick={() => setComponentEditorId("")}>Close</button>
              </div>
              <label className="hint">Name
                <input className="table-btn" style={{ display: "block", marginTop: 4, width: "100%" }} value={activeComponentEditor.name} onChange={(event) => updateComponent(activeComponentEditor.id, { name: event.target.value })} />
              </label>
              <label className="hint">Description
                <textarea className="table-btn" rows={2} style={{ display: "block", marginTop: 4, width: "100%" }} value={activeComponentEditor.description || ""} onChange={(event) => updateComponent(activeComponentEditor.id, { description: event.target.value })} />
              </label>
              <div className="tplb-component-block-list">
                {(activeComponentEditor.blocks || []).map((block, index) => (
                  <div className="tplb-component-block-row" key={block.id}>
                    <span>{blockEmoji(block.type)} {index + 1}. {labelForType(block.type)}</span>
                    <select className="table-btn" value={block.bindField ? `field:${block.bindField}` : (block.repeatField ? `repeat:${block.repeatField}` : "")} onChange={(event) => {
                      const value = event.target.value;
                      updateComponentChildBinding(activeComponentEditor.id, block.id, value.startsWith("repeat:") ? { repeatField: value.slice(7), bindField: "" } : { bindField: value.replace("field:", ""), repeatField: "" });
                    }}>
                      <option value="">Not mapped</option>
                      {scalarFields.map((field) => <option key={`field:${field.name}`} value={`field:${field.name}`}>{field.name}</option>)}
                      {arrayFields.map((field) => <option key={`repeat:${field.name}`} value={`repeat:${field.name}`}>Repeat: {field.name}</option>)}
                    </select>
                    <button className="table-btn" type="button" onClick={() => removeComponentBlock(activeComponentEditor.id, block.id)}>Delete</button>
                  </div>
                ))}
              </div>
              <div className="inline-actions" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                {BLOCK_TYPE_LIBRARY.slice(0, 8).map((item) => <button className="table-btn" type="button" key={item.type} onClick={() => addComponentBlock(activeComponentEditor.id, item.type)}>+ {item.label}</button>)}
                <button className="table-btn danger" type="button" onClick={() => deleteComponent(activeComponentEditor.id)}>Delete Component</button>
              </div>
            </div>
          ) : null}

          <p className="hint tplb-left-hint">Select a block in the flow and click + Add block to insert after it. Dragging is optional.</p>
        </article>

        <article className="panel tplb-canvas-panel">
          <div className="tplb-canvas-toolbar">
            <label className="hint tplb-toolbar-check"><input type="checkbox" checked={Boolean(draft.canvasSettings?.showGrid)} onChange={(event) => updateDraft((next) => ({ ...next, canvasSettings: { ...next.canvasSettings, showGrid: event.target.checked } }))} /> Grid</label>
            <label className="hint tplb-toolbar-check"><input type="checkbox" checked={Boolean(draft.canvasSettings?.showMargins)} onChange={(event) => updateDraft((next) => ({ ...next, canvasSettings: { ...next.canvasSettings, showMargins: event.target.checked } }))} /> Margins</label>
            <label className="hint tplb-toolbar-check"><input type="checkbox" checked={Boolean(draft.canvasSettings?.snapToGrid)} onChange={(event) => updateDraft((next) => ({ ...next, canvasSettings: { ...next.canvasSettings, snapToGrid: event.target.checked } }))} /> Snap</label>
            <span className="tplb-document-badge">{selectedVariant?.label || "PDF"} · {canvasDisplayPageFormat}</span>
          </div>

          {multiSelectedIds.length >= 2 ? (
            <div className="tplb-align-toolbar">
              <span className="hint">Align</span>
              {[["left", "Left"], ["center", "Center"], ["right", "Right"], ["top", "Top"], ["middle", "Middle"], ["bottom", "Bottom"]].map(([value, label]) => <button className="table-btn" type="button" key={value} onClick={() => alignSelected(value)}>{label}</button>)}
              <button className="table-btn" type="button" disabled={multiSelectedIds.length < 3} onClick={() => distributeSelected("x")}>Distribute H</button>
              <button className="table-btn" type="button" disabled={multiSelectedIds.length < 3} onClick={() => distributeSelected("y")}>Distribute V</button>
            </div>
          ) : null}

          <div className="tplb-canvas-scroll">
            <div
              className="tplb-canvas-page"
              style={{ ...canvasPageStyle, transform: `scale(${zoomLevel / 100})`, transformOrigin: "top center" }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const type = event.dataTransfer.getData("text/tplb-block-type");
                if (type) addCanvasBlock(type);
              }}
            >
              {draft.canvasSettings?.showMargins ? <div className="tplb-margin-guides" style={{ inset: `${(Number(draft.canvasSettings?.margin || 16) / (canvasDisplayPageFormat.startsWith("ppt-") ? 297 : 210)) * 100}%` }} /> : null}
              {draft.canvasBlocks.length === 0 ? (
                <div className="tplb-empty-canvas">
                  <p className="hint" style={{ marginTop: 0 }}>Start designing your template.</p>
                  <button className="table-btn primary" type="button" onClick={() => setInsertMenuIndex(0)}>+ Add block</button>
                </div>
              ) : null}
              {insertMenuIndex === 0 ? (
                <div className="tplb-inline-insert-menu">
                  {BLOCK_TYPE_LIBRARY.map((item) => (
                    <button key={`insert-start-${item.type}`} className="table-btn" type="button" onClick={() => insertCanvasBlockAt(item.type, 0)}>{item.label}</button>
                  ))}
                </div>
              ) : null}
              {canvasGroups.map((group, groupIndex) => (
                <div key={`group-${groupIndex}`} className={group.kind === "repeat-group" ? "tplb-repeat-group" : ""}>
                  {group.kind === "repeat-group" ? <div className="tplb-repeat-group-head">↻ {repeatBadgeLabel(group.scope)}{group.repeatField ? ` · ${group.repeatField}[]` : ""}</div> : null}
                  {group.entries.map((entry) => {
                    const index = canvasEntryIndexMap.get(entry.id) ?? 0;
                    const isComponent = Boolean(entry.componentRefId);
                    const component = isComponent ? draft.components.find((item) => item.id === entry.componentRefId) : null;
                    const normalizedRepeatScope = normalizeRepeatScope(entry.repeatScope || "once");
                    const isAbsolute = isAbsoluteEntry(entry);
                    return (
                      <div key={entry.id}>
                        <button className="tplb-inline-insert" type="button" onClick={() => setInsertMenuIndex((previous) => previous === index ? -1 : index)}>+ Add block</button>
                        {insertMenuIndex === index ? (
                          <div className="tplb-inline-insert-menu">
                            {BLOCK_TYPE_LIBRARY.map((item) => (
                              <button key={`insert-${entry.id}-${item.type}`} className="table-btn" type="button" onClick={() => insertCanvasBlockAt(item.type, index)}>{item.label}</button>
                            ))}
                          </div>
                        ) : null}
                        <div
                          className={`tplb-canvas-entry ${selectedEntryId === entry.id ? "selected" : ""} ${entry.hidden ? "hidden-entry" : ""} ${isAbsolute ? "absolute-entry" : "flow-entry"}`}
                          style={isAbsolute ? positionToCanvasStyle(entry.position, canvasDisplayPageFormat) : undefined}
                          onPointerDown={isAbsolute ? (event) => startPointerInteraction(event, entry) : undefined}
                          onClick={() => setSelectedEntryId(entry.id)}
                        >
                          {/* WYSIWYG block preview */}
                          <div className="tplb-canvas-entry-controls" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
                            <label>
                              <input type="checkbox" checked={multiSelectedIds.includes(entry.id)} onChange={() => toggleMultiSelect(entry.id)} />
                            </label>
                            <div className="tplb-entry-actions">
                              <button className="tplb-micro-btn" type="button" disabled={index === 0} onClick={() => moveCanvasEntry(index, index - 1)} title="Move up">↑</button>
                              <button className="tplb-micro-btn" type="button" disabled={index === draft.canvasBlocks.length - 1} onClick={() => moveCanvasEntry(index, index + 1)} title="Move down">↓</button>
                              <button className="tplb-micro-btn" type="button" onClick={() => setOpenBlockMenuId((previous) => previous === entry.id ? "" : entry.id)} title="More">⋯</button>
                              {openBlockMenuId === entry.id ? (
                                <div className="tplb-block-menu">
                                  <button type="button" onClick={() => { duplicateCanvasEntry(entry.id); setOpenBlockMenuId(""); }}>Duplicate</button>
                                  <button type="button" onClick={() => { copyCanvasEntry(entry.id); setOpenBlockMenuId(""); }}>Copy</button>
                                  <button type="button" onClick={() => { removeCanvasEntry(entry.id); setOpenBlockMenuId(""); }}>Delete</button>
                                </div>
                              ) : null}
                              {isComponent ? <button className="tplb-micro-btn" type="button" onClick={() => setComponentEditorId(entry.componentRefId)} title="Enter component">⤵</button> : null}
                            </div>
                          </div>
                          {/* Actual WYSIWYG content */}
                          {isComponent ? (
                            <div className="tplb-canvas-component-preview">
                              <div className="tplb-canvas-comp-label">{component?.name || "Component"} <span className="tplb-repeat-badge">{repeatBadgeLabel(normalizedRepeatScope)}</span></div>
                              {(component?.blocks || []).map((block) => {
                                const blockFmt = (draft.blockFormats[block.type] || []).find((f) => f.name === (block.formatName || "Default"));
                                const bs = blockCanvasStyle(block.type, blockFmt?.style || {});
                                return <WysiwygBlock key={block.id} type={block.type} text={block.bindField ? `{${block.bindField}}` : (block.illustrativeText || illustrativeText(block.type))} style={bs} />;
                              })}
                            </div>
                          ) : (
                            <div className="tplb-canvas-block-preview">
                              {normalizedRepeatScope !== "once" ? <span className="tplb-repeat-badge tplb-repeat-badge-inline">{repeatBadgeLabel(normalizedRepeatScope)}</span> : null}
                              <WysiwygBlock
                                type={entry.type}
                                text={entry.bindField ? `{${entry.bindField}}` : (entry.illustrativeText || illustrativeText(entry.type))}
                                style={blockCanvasStyle(entry.type, ((draft.blockFormats[entry.type] || []).find((f) => f.name === (entry.formatName || "Default"))?.style || {}))}
                              />
                            </div>
                          )}
                          {isAbsolute ? <span className="tplb-resize-handle" role="button" aria-label="Resize block" onPointerDown={(event) => startPointerInteraction(event, entry, "resize")} /> : null}
                        </div>
                        <div className="tplb-flow-arrow">↓</div>
                      </div>
                    );
                  })}
                </div>
              ))}
              {draft.canvasBlocks.length > 0 ? (
                <button className="tplb-inline-insert" type="button" onClick={() => setInsertMenuIndex((previous) => previous === draft.canvasBlocks.length ? -1 : draft.canvasBlocks.length)}>+ Add block</button>
              ) : null}
              {insertMenuIndex === draft.canvasBlocks.length ? (
                <div className="tplb-inline-insert-menu">
                  {BLOCK_TYPE_LIBRARY.map((item) => (
                    <button key={`insert-end-${item.type}`} className="table-btn" type="button" onClick={() => insertCanvasBlockAt(item.type, draft.canvasBlocks.length)}>{item.label}</button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </article>

        <article className="panel tplb-right-panel">
          <div className="inline-actions" style={{ gap: 8 }}>
            <button className={`table-btn ${rightTab === "properties" ? "primary" : ""}`} type="button" onClick={() => setRightTab("properties")}>Properties</button>
            <button className={`table-btn ${rightTab === "layers" ? "primary" : ""}`} type="button" onClick={() => setRightTab("layers")}>Layers</button>
          </div>

          {rightTab === "properties" ? (
            <div style={{ marginTop: 10 }}>
              {!selectedEntry ? <p className="hint">Select a block to edit its properties.</p> : null}

              {selectedEntry && selectedComponent ? (
                <div>
                  <h4>{selectedComponent.name}</h4>
                  <label className="hint">Component repeat scope
                    <select className="table-btn" style={{ display: "block", marginTop: 4 }} value={normalizeRepeatScope(selectedEntry.repeatScope || "once")} onChange={(event) => patchSelectedEntry({ repeatScope: event.target.value })}>
                      {REPEAT_SCOPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  {(normalizeRepeatScope(selectedEntry.repeatScope || "once") === "per-output" || normalizeRepeatScope(selectedEntry.repeatScope || "once") === "per-field") ? (
                    <div className="tplb-repeat-count-editor">
                      <span className="hint">Illustrative repetitions</span>
                      {[5, 10].map((count) => (
                        <button key={count} className="table-btn" type="button" onClick={() => patchSelectedEntry({ illustrativeRepeatCount: count })}>{count}</button>
                      ))}
                      <input
                        className="table-btn tplb-repeat-input"
                        value={selectedEntry.illustrativeRepeatCount || ""}
                        placeholder="Custom"
                        onChange={(event) => patchSelectedEntry({ illustrativeRepeatCount: event.target.value })}
                      />
                    </div>
                  ) : null}
                  {selectedComponent.blocks.map((block) => (
                    <div key={block.id} className="tplb-mapping-row">
                      <span className="hint">{labelForType(block.type)}</span>
                      <select
                        className="table-btn"
                        value={block.repeatField ? `repeat:${block.repeatField}` : (block.bindField ? `field:${block.bindField}` : "")}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (value.startsWith("repeat:")) {
                            updateComponentChildBinding(selectedComponent.id, block.id, { repeatField: value.slice(7), bindField: "" });
                          } else if (value.startsWith("field:")) {
                            updateComponentChildBinding(selectedComponent.id, block.id, { bindField: value.slice(6), repeatField: "" });
                          } else {
                            updateComponentChildBinding(selectedComponent.id, block.id, { bindField: "", repeatField: "" });
                          }
                        }}
                      >
                        <option value="">Not mapped</option>
                        {scalarFields.map((field) => <option key={`field:${field.name}`} value={`field:${field.name}`}>Field: {field.name} ({field.dataType})</option>)}
                        {arrayFields.map((field) => <option key={`repeat:${field.name}`} value={`repeat:${field.name}`}>Repeat: {field.name} (array)</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              ) : null}

              {selectedEntry && !selectedComponent ? (
                <div>
                  <h4>{labelForType(selectedEntry.type)}</h4>
                  <label className="hint">Repeat scope
                    <select className="table-btn" style={{ display: "block", marginTop: 4 }} value={normalizeRepeatScope(selectedEntry.repeatScope || "once")} onChange={(event) => patchSelectedEntry({ repeatScope: event.target.value })}>
                      {REPEAT_SCOPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  {(normalizeRepeatScope(selectedEntry.repeatScope || "once") === "per-output" || normalizeRepeatScope(selectedEntry.repeatScope || "once") === "per-field") ? (
                    <div className="tplb-repeat-count-editor">
                      <span className="hint">Illustrative repetitions</span>
                      {[5, 10].map((count) => (
                        <button key={count} className="table-btn" type="button" onClick={() => patchSelectedEntry({ illustrativeRepeatCount: count })}>{count}</button>
                      ))}
                      <input
                        className="table-btn tplb-repeat-input"
                        value={selectedEntry.illustrativeRepeatCount || ""}
                        placeholder="Custom"
                        onChange={(event) => patchSelectedEntry({ illustrativeRepeatCount: event.target.value })}
                      />
                    </div>
                  ) : null}
                  {normalizeRepeatScope(selectedEntry.repeatScope || "once") === "per-output" ? (
                    <label className="hint">AI output collection
                      <input className="table-btn" style={{ display: "block", marginTop: 4 }} value={draft.repeatCollectionField || ""} placeholder="questions" onChange={(event) => updateDraft((next) => ({ ...next, repeatCollectionField: event.target.value.trim() }))} />
                    </label>
                  ) : null}
                  {normalizeRepeatScope(selectedEntry.repeatScope || "once") === "per-field" ? (
                    <label className="hint">Repeat for each item in variable
                      <select className="table-btn" style={{ display: "block", marginTop: 4 }} value={selectedEntry.repeatField || ""} onChange={(event) => patchSelectedEntry({ repeatField: event.target.value, bindField: "" })}>
                        <option value="">Select array variable</option>
                        {arrayFields.map((field) => <option key={field.name} value={field.name}>{field.name}</option>)}
                      </select>
                    </label>
                  ) : (
                    <label className="hint">Data variable
                      <select className="table-btn" style={{ display: "block", marginTop: 4 }} value={selectedEntry.bindField || ""} onChange={(event) => patchSelectedEntry({ bindField: event.target.value, repeatField: "" })}>
                        <option value="">Not mapped</option>
                        {scalarFields.map((field) => <option key={field.name} value={field.name}>{field.name} ({field.dataType})</option>)}
                      </select>
                    </label>
                  )}
                  <button className="table-btn" type="button" style={{ marginTop: 6 }} onClick={() => openQuickVariableCreator({
                    name: selectedEntry.bindField || labelForType(selectedEntry.type).toLowerCase().replace(/[^a-z0-9]+/g, "_"),
                    label: labelForType(selectedEntry.type),
                    dataType: normalizeRepeatScope(selectedEntry.repeatScope || "once") === "per-field" ? "array" : "string",
                    required: true
                  })}>+ Create variable</button>
                  {showQuickVariableCreator ? (
                    <div className="tplb-component-popover" style={{ marginTop: 8 }}>
                      <strong>Create variable</strong>
                      <label className="hint">Variable name<input className="table-btn" style={{ display: "block", marginTop: 4, width: "100%" }} value={quickVariableName} onChange={(event) => setQuickVariableName(event.target.value)} /></label>
                      <label className="hint">Label<input className="table-btn" style={{ display: "block", marginTop: 4, width: "100%" }} value={quickVariableLabel} onChange={(event) => setQuickVariableLabel(event.target.value)} /></label>
                      <label className="hint">Type<select className="table-btn" style={{ display: "block", marginTop: 4, width: "100%" }} value={quickVariableType} onChange={(event) => setQuickVariableType(event.target.value)}>{DATA_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
                      <label className="hint">Description<input className="table-btn" style={{ display: "block", marginTop: 4, width: "100%" }} value={quickVariableDescription} onChange={(event) => setQuickVariableDescription(event.target.value)} /></label>
                      <label className="hint"><input type="checkbox" checked={quickVariableRequired} onChange={(event) => setQuickVariableRequired(event.target.checked)} /> Required</label>
                      <div className="inline-actions" style={{ justifyContent: "flex-end", gap: 6, marginTop: 8 }}>
                        <button className="table-btn" type="button" onClick={() => setShowQuickVariableCreator(false)}>Cancel</button>
                        <button className="table-btn primary" type="button" onClick={createVariableForSelectedBlock} disabled={!quickVariableName.trim()}>Create</button>
                      </div>
                    </div>
                  ) : null}

                  <div className="tplb-property-section">
                    <strong>Position (metadata)</strong>
                    <div className="tplb-mapping-row">
                      <input className="table-btn" placeholder="X" value={selectedEntry.position?.x || ""} onChange={(event) => patchSelectedEntry({ position: { ...selectedEntry.position, x: event.target.value } })} />
                      <input className="table-btn" placeholder="Y" value={selectedEntry.position?.y || ""} onChange={(event) => patchSelectedEntry({ position: { ...selectedEntry.position, y: event.target.value } })} />
                    </div>
                    <div className="tplb-mapping-row">
                      <input className="table-btn" placeholder="W" value={selectedEntry.position?.w || ""} onChange={(event) => patchSelectedEntry({ position: { ...selectedEntry.position, w: event.target.value } })} />
                      <input className="table-btn" placeholder="H" value={selectedEntry.position?.h || ""} onChange={(event) => patchSelectedEntry({ position: { ...selectedEntry.position, h: event.target.value } })} />
                    </div>
                    <label className="hint">Anchor to
                      <select className="table-btn" style={{ display: "block", marginTop: 4 }} value={selectedEntry.anchor || "Page"} onChange={(event) => patchSelectedEntry({ anchor: event.target.value })}>
                        {ANCHOR_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>
                  </div>

                  <details className="tplb-property-section">
                    <summary>Layout</summary>
                    <label className="hint">Layout mode
                      <select className="table-btn" style={{ display: "block", marginTop: 4 }} value={selectedFormat?.style?.layoutMode || "Flow"} onChange={(event) => patchSelectedEntryStyle({ layoutMode: event.target.value })}>
                        {LAYOUT_MODE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>
                    <label className="hint">Vertical position
                      <select className="table-btn" style={{ display: "block", marginTop: 4 }} value={selectedFormat?.style?.verticalPosition || "After previous"} onChange={(event) => patchSelectedEntryStyle({ verticalPosition: event.target.value })}>
                        {VERTICAL_POSITION_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>
                  </details>

                  <details className="tplb-property-section">
                    <summary>Constraints</summary>
                    <label className="hint" style={{ display: "block" }}>
                      <input type="checkbox" checked={Boolean(selectedFormat?.style?.keepTogether)} onChange={(event) => patchSelectedEntryStyle({ keepTogether: event.target.checked })} /> Keep together
                    </label>
                    <label className="hint" style={{ display: "block" }}>
                      <input type="checkbox" checked={Boolean(selectedFormat?.style?.allowPageBreak)} onChange={(event) => patchSelectedEntryStyle({ allowPageBreak: event.target.checked })} /> Allow page break
                    </label>
                    <label className="hint">Overflow
                      <select className="table-btn" style={{ display: "block", marginTop: 4 }} value={selectedFormat?.style?.overflow || "Expand height"} onChange={(event) => patchSelectedEntryStyle({ overflow: event.target.value })}>
                        {OVERFLOW_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>
                    {selectedFormat?.style?.overflow === "Reduce font size" ? (
                      <label className="hint">Minimum font size (pt)
                        <input className="table-btn" style={{ display: "block", marginTop: 4 }} value={selectedFormat?.style?.minFontSize || ""} onChange={(event) => patchSelectedEntryStyle({ minFontSize: event.target.value })} />
                      </label>
                    ) : null}
                  </details>

                  <details className="tplb-property-section" open>
                    <summary>Typography</summary>
                    <label className="hint">Font family
                      <input className="table-btn" style={{ display: "block", marginTop: 4 }} value={selectedFormat?.style?.fontFamily || ""} onChange={(event) => patchSelectedEntryStyle({ fontFamily: event.target.value })} />
                    </label>
                    <label className="hint">Font size
                      <input className="table-btn" style={{ display: "block", marginTop: 4 }} value={selectedFormat?.style?.fontSize || ""} onChange={(event) => patchSelectedEntryStyle({ fontSize: event.target.value })} />
                    </label>
                    <label className="hint">Font weight
                      <select className="table-btn" style={{ display: "block", marginTop: 4 }} value={selectedFormat?.style?.fontWeight || "400"} onChange={(event) => patchSelectedEntryStyle({ fontWeight: event.target.value })}>
                        <option value="400">Regular</option><option value="500">Medium</option><option value="700">Bold</option>
                      </select>
                    </label>
                    <label className="hint">Text alignment
                      <select className="table-btn" style={{ display: "block", marginTop: 4 }} value={selectedFormat?.style?.textAlign || "left"} onChange={(event) => patchSelectedEntryStyle({ textAlign: event.target.value })}>
                        <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option><option value="justify">Justify</option>
                      </select>
                    </label>
                    <label className="hint">Line height
                      <input className="table-btn" style={{ display: "block", marginTop: 4 }} placeholder="1.4" value={selectedFormat?.style?.lineHeight || ""} onChange={(event) => patchSelectedEntryStyle({ lineHeight: event.target.value })} />
                    </label>
                    <label className="hint">Letter spacing
                      <input className="table-btn" style={{ display: "block", marginTop: 4 }} placeholder="0px" value={selectedFormat?.style?.letterSpacing || ""} onChange={(event) => patchSelectedEntryStyle({ letterSpacing: event.target.value })} />
                    </label>
                    <label className="hint">Text color
                      <input className="table-btn" style={{ display: "block", marginTop: 4 }} value={selectedFormat?.style?.color || ""} onChange={(event) => patchSelectedEntryStyle({ color: event.target.value })} />
                    </label>
                  </details>

                  <details className="tplb-property-section">
                    <summary>Spacing</summary>
                    <label className="hint">Padding
                      <input className="table-btn" style={{ display: "block", marginTop: 4 }} value={selectedFormat?.style?.padding || ""} onChange={(event) => patchSelectedEntryStyle({ padding: event.target.value })} />
                    </label>
                  </details>

                  <details className="tplb-property-section">
                    <summary>Borders &amp; Background</summary>
                    <label className="hint">Background color
                      <input className="table-btn" style={{ display: "block", marginTop: 4 }} value={selectedFormat?.style?.backgroundColor || ""} onChange={(event) => patchSelectedEntryStyle({ backgroundColor: event.target.value })} />
                    </label>
                    <label className="hint">Border (color)
                      <input className="table-btn" style={{ display: "block", marginTop: 4 }} value={selectedFormat?.style?.borderColor || ""} onChange={(event) => patchSelectedEntryStyle({ borderColor: event.target.value })} />
                    </label>
                    <label className="hint">Border width
                      <input className="table-btn" style={{ display: "block", marginTop: 4 }} value={selectedFormat?.style?.borderWidth || ""} onChange={(event) => patchSelectedEntryStyle({ borderWidth: event.target.value })} />
                    </label>
                    <label className="hint">Radius
                      <input className="table-btn" style={{ display: "block", marginTop: 4 }} value={selectedFormat?.style?.radius || ""} onChange={(event) => patchSelectedEntryStyle({ radius: event.target.value })} />
                    </label>
                  </details>

                  <details className="tplb-property-section">
                    <summary>Conditional Display</summary>
                    <p className="hint">Show or hide this block using layer visibility controls.</p>
                  </details>
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ marginTop: 10 }}>
              {draft.canvasBlocks.map((entry) => {
                const isComponent = Boolean(entry.componentRefId);
                const component = isComponent ? draft.components.find((item) => item.id === entry.componentRefId) : null;
                return (
                  <div key={entry.id} className="tplb-layer-row">
                    <strong>{isComponent ? component?.name || "Component" : labelForType(entry.type)}</strong>
                    <button className="table-btn" type="button" onClick={() => toggleEntryFlag(entry.id, "hidden")}>{entry.hidden ? "Show" : "Hide"}</button>
                    <button className="table-btn" type="button" onClick={() => toggleEntryFlag(entry.id, "locked")}>{entry.locked ? "Unlock" : "Lock"}</button>
                    <button className="table-btn" type="button" onClick={() => duplicateCanvasEntry(entry.id)}>Duplicate</button>
                    <button className="table-btn" type="button" onClick={() => removeCanvasEntry(entry.id)}>Delete</button>
                  </div>
                );
              })}
            </div>
          )}
        </article>
      </div>
      </>
      ) : null}

      {activeBuilderView === "structure" ? (
        <article className="panel tplb-structure-view">
          <div className="tplb-panel-header" style={{ marginBottom: 8 }}>
            <div>
              <h4 style={{ margin: 0 }}>Structure</h4>
              <p className="hint" style={{ margin: "4px 0 0" }}>Define what the document contains and how AI data flows into it.</p>
            </div>
            <div className="inline-actions" style={{ gap: 8, flexWrap: "wrap" }}>
              <button className="table-btn" type="button" onClick={() => addStructureBlock("section")}>+ Section</button>
              <button className="table-btn" type="button" onClick={() => addStructureBlock("content")}>+ Block</button>
              <button className="table-btn" type="button" onClick={() => addStructureBlock("repeating")}>+ Repeating</button>
              <button className="table-btn" type="button" onClick={() => addStructureBlock("page_break")}>+ Page Break</button>
            </div>
          </div>
          <div className="tplb-structure-grid">
            <div className="tplb-structure-flow">
              {structureItems.map((item) => {
                const scope = normalizeRepeatScope(item.repeatScope || "once");
                const isPageBreak = item.type === "page_break";
                const isCollapsed = collapsedStructureIds.has(item.id);
                const hasChildren = item.isComponent && item.component?.blocks?.length > 0;
                const badgeColor = scope === "per-output" || scope === "per-field" ? "orange" : scope === "per-page" ? "green" : "grey";
                const badgeText = scope === "per-output" ? `For each item in ${draft.repeatCollectionField || "output"}[]` :
                  scope === "per-field" ? `For each item in ${item.repeatField || "variable"}[]` :
                  scope === "per-page" ? "Every page" : "Once";
                const badgeIcon = scope === "per-output" || scope === "per-field" ? "🔁" : scope === "per-page" ? "📄" : "1×";
                if (isPageBreak) {
                  return (
                    <div key={item.id} className="tplb-struc-pagebreak" onClick={() => setSelectedStructureEntryId(item.id)}>
                      <span className="tplb-struc-drag">⠿</span>
                      <span className="tplb-struc-pb-line">— PAGE BREAK —</span>
                    </div>
                  );
                }
                return (
                  <div key={item.id} className={`tplb-struc-node ${selectedStructureEntryId === item.id ? "active" : ""}`}>
                    <div className="tplb-struc-row" onClick={() => setSelectedStructureEntryId(item.id)}>
                      <span className="tplb-struc-drag">⠿</span>
                      {hasChildren ? (
                        <button className="tplb-struc-chevron" type="button" onClick={(event) => { event.stopPropagation(); setCollapsedStructureIds((previous) => { const next = new Set(previous); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; }); }}>
                          {isCollapsed ? "▸" : "▾"}
                        </button>
                      ) : <span style={{ width: 16 }} />}
                      <span className="tplb-struc-label">{item.isComponent ? "🧩" : blockEmoji(item.type)} {item.label}</span>
                      <span className={`tplb-struc-badge tplb-struc-badge-${badgeColor}`} title={badgeText}>{badgeIcon} {badgeText}</span>
                    </div>
                    {hasChildren && !isCollapsed ? (
                      <div className="tplb-struc-children">
                        {(item.component?.blocks || []).map((block) => (
                          <div key={block.id} className="tplb-struc-child">
                            <span className="tplb-struc-child-icon">{blockEmoji(block.type)}</span>
                            <span className="tplb-struc-child-label">{labelForType(block.type)}</span>
                            {block.bindField ? <span className="tplb-struc-field-chip">{`{${block.bindField}}`}</span> : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {!structureItems.length ? <p className="hint" style={{ padding: "24px 0" }}>No blocks yet. Add blocks in the Design view or use the buttons above.</p> : null}
            </div>
            <div className="tplb-structure-editor">
              {!selectedStructureItem ? <p className="hint">Select a structure block to configure repetition and mappings.</p> : (
                <>
                  <h5 style={{ marginTop: 0 }}>{selectedStructureItem.label}</h5>
                  <label className="hint">Repeat
                    <select className="table-btn" style={{ display: "block", marginTop: 4 }} value={selectedStructureItem.repeatScope || "once"} onChange={(event) => {
                      updateDraft((next) => {
                        next.canvasBlocks = next.canvasBlocks.map((entry) => entry.id === selectedStructureItem.id ? { ...entry, repeatScope: event.target.value } : entry);
                        return next;
                      });
                    }}>
                      {REPEAT_SCOPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  {(selectedStructureItem.repeatScope || "once") === "per-output" ? (
                    <label className="hint">AI output collection
                      <input className="table-btn" style={{ display: "block", marginTop: 4 }} placeholder="questions" value={draft.repeatCollectionField || ""} onChange={(event) => updateDraft((next) => ({ ...next, repeatCollectionField: event.target.value.trim() }))} />
                    </label>
                  ) : null}
                  {(selectedStructureItem.repeatScope || "once") === "per-field" ? (
                    <label className="hint">Repeat variable
                      <input className="table-btn" style={{ display: "block", marginTop: 4 }} placeholder="questions" value={selectedStructureItem.repeatField || ""} onChange={(event) => {
                        updateDraft((next) => {
                          next.canvasBlocks = next.canvasBlocks.map((entry) => entry.id === selectedStructureItem.id ? { ...entry, repeatField: event.target.value, bindField: "" } : entry);
                          return next;
                        });
                      }} />
                    </label>
                  ) : null}
                  {(selectedStructureItem.repeatScope || "once") !== "per-output" && (selectedStructureItem.repeatScope || "once") !== "per-field" ? (
                    <label className="hint">Field mapping
                      <input className="table-btn" style={{ display: "block", marginTop: 4 }} placeholder="question.text" value={selectedStructureItem.bindField || ""} onChange={(event) => {
                        updateDraft((next) => {
                          next.canvasBlocks = next.canvasBlocks.map((entry) => entry.id === selectedStructureItem.id ? { ...entry, bindField: event.target.value, repeatField: "" } : entry);
                          return next;
                        });
                      }} />
                    </label>
                  ) : null}
                  {selectedStructureItem.isComponent && selectedStructureItem.component ? (
                    <>
                      <h6 style={{ marginBottom: 6 }}>Component field mappings</h6>
                      {(selectedStructureItem.component.blocks || []).map((block) => (
                        <div key={block.id} className="tplb-mapping-row">
                          <span className="hint">{labelForType(block.type)}</span>
                          <select
                            className="table-btn"
                            value={block.repeatField ? `repeat:${block.repeatField}` : (block.bindField ? `field:${block.bindField}` : "")}
                            onChange={(event) => {
                              const value = event.target.value;
                              if (value.startsWith("repeat:")) updateComponentChildBinding(selectedStructureItem.component.id, block.id, { repeatField: value.slice(7), bindField: "" });
                              else if (value.startsWith("field:")) updateComponentChildBinding(selectedStructureItem.component.id, block.id, { bindField: value.slice(6), repeatField: "" });
                              else updateComponentChildBinding(selectedStructureItem.component.id, block.id, { bindField: "", repeatField: "" });
                            }}
                          >
                            <option value="">Not mapped</option>
                            {scalarFields.map((field) => <option key={`field:${field.name}`} value={`field:${field.name}`}>{field.name}</option>)}
                            {arrayFields.map((field) => <option key={`repeat:${field.name}`} value={`repeat:${field.name}`}>Repeat: {field.name}</option>)}
                          </select>
                        </div>
                      ))}
                    </>
                  ) : null}
                </>
              )}
            </div>
          </div>
          <div className="tplb-property-section">
            <div className="inline-actions" style={{ justifyContent: "space-between" }}>
              <h5 style={{ margin: 0 }}>Template data fields</h5>
              <button className="table-btn" type="button" onClick={() => setMappingExpanded((previous) => !previous)}>{mappingExpanded ? "Collapse" : "Expand"}</button>
            </div>
            {templateFields.map((field) => (
              <div className="tplb-field-editor-row" key={field.id}>
                <input className="table-btn" value={field.name} onChange={(event) => updateDataField(field.id, { name: event.target.value.replace(/\s+/g, "_") })} />
                <input className="table-btn" value={field.label || ""} placeholder="Label" onChange={(event) => updateDataField(field.id, { label: event.target.value })} />
                <select className="table-btn" value={field.dataType} onChange={(event) => updateDataField(field.id, { dataType: event.target.value })}>
                  {DATA_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
                <label className="hint"><input type="checkbox" checked={Boolean(field.required)} onChange={(event) => updateDataField(field.id, { required: event.target.checked })} /> Required</label>
                <button className="table-btn" type="button" onClick={() => deleteDataField(field.id)}>Delete</button>
              </div>
            ))}
            {!templateFields.length ? (
              <p className="hint" style={{ marginTop: 10 }}>No variables yet. Variables created for this template will appear here.</p>
            ) : null}
            <div className="tplb-field-create-row">
              <input className="table-btn" placeholder="field_name" value={fieldNameDraft} onChange={(event) => setFieldNameDraft(event.target.value)} />
              <input className="table-btn" placeholder="Label" value={fieldLabelDraft} onChange={(event) => setFieldLabelDraft(event.target.value)} />
              <select className="table-btn" value={fieldTypeDraft} onChange={(event) => setFieldTypeDraft(event.target.value)}>
                {DATA_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <label className="hint"><input type="checkbox" checked={fieldRequiredDraft} onChange={(event) => setFieldRequiredDraft(event.target.checked)} /> Required</label>
              <button className="table-btn primary" type="button" onClick={addDataField}>+ Add variable</button>
            </div>
          </div>
        </article>
      ) : null}

      {activeBuilderView === "preview" ? (
        <article id="tplb-export-test" className="panel tplb-full-width-section">
          <h4 style={{ marginTop: 0 }}>Export &amp; Output</h4>
          <p className="hint" style={{ margin: "5px 0 12px" }}>Choose which formats this template can export.</p>
          <div className="tplb-export-format-row">
            {(draft.renderVariants || []).map((variant) => (
              <label key={variant.id} className="tplb-export-format-chip">
                <input type="checkbox" checked={variant.enabled !== false} onChange={(event) => updateRenderVariant(variant.id, { enabled: event.target.checked })} />
                {variant.label}
              </label>
            ))}
            <button className="table-btn" type="button" onClick={() => setShowFormatPopover(true)}>+ Add format</button>
          </div>
          {showFormatPopover ? (
            <div className="tplb-repeat-count-editor" style={{ marginTop: 0, marginBottom: 12 }}>
              <span className="hint">Add output format</span>
              <select className="table-btn" value={newFormatType} onChange={(event) => setNewFormatType(event.target.value)}>
                {OUTPUT_FORMAT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <button className="table-btn primary" type="button" onClick={() => addFormatPage(newFormatType)}>Add</button>
              <button className="table-btn" type="button" onClick={() => setShowFormatPopover(false)}>Cancel</button>
            </div>
          ) : null}
          <div className="tplb-export-action-row">
            <span>HTML (Continuous)</span>
            <div className="inline-actions" style={{ gap: 8 }}>
              <button className="table-btn" type="button" onClick={() => openPreview("html")} disabled={isBusyFormat === "preview-html"}>Preview</button>
              <button className="table-btn" type="button" onClick={() => handleExport("html")} disabled={isBusyFormat === "html"}>Download</button>
            </div>
          </div>
          <div className="tplb-export-action-row">
            <span>PDF ({draft.pageFormat})</span>
            <div className="inline-actions" style={{ gap: 8 }}>
              <button className="table-btn" type="button" onClick={() => openPreview("pdf")} disabled={isBusyFormat === "preview-pdf"}>Preview</button>
              <button className="table-btn" type="button" onClick={() => handleExport("pdf")} disabled={isBusyFormat === "pdf"}>Download</button>
            </div>
          </div>
          <div className="tplb-export-action-row">
            <span>Word</span>
            <button className="table-btn" type="button" onClick={() => handleExport("docx")} disabled={isBusyFormat === "docx"}>Download</button>
          </div>
          <div className="tplb-export-action-row">
            <span>PowerPoint</span>
            <button className="table-btn" type="button" disabled title="Coming soon: requires adding a pptx export dependency (e.g. pptxgenjs).">Coming soon</button>
          </div>
          <button className="table-btn primary" type="button" style={{ width: "100%", marginTop: 8 }} onClick={handleGenerateAllFormats}>
            Generate all formats
          </button>
          <p className="hint" style={{ marginTop: 8 }}>
            PowerPoint export is not implemented yet &mdash; no pptx generation library is installed in this project. All other formats render from the same underlying template model.
          </p>
        </article>
      ) : null}
    </div>
  );
}
