"use client";

import { useEffect, useMemo, useState } from "react";

const BLOCK_TYPE_LIBRARY = [
  { type: "heading1", label: "Heading" },
  { type: "paragraph", label: "Paragraph" },
  { type: "standalone_text", label: "Text" },
  { type: "bullet_list", label: "Bullet List" },
  { type: "numbered_list", label: "Numbered List" },
  { type: "image", label: "Image" },
  { type: "table", label: "Table" },
  { type: "standalone_formula", label: "Formula" },
  { type: "divider", label: "Divider" },
  { type: "badge", label: "Badge" },
  { type: "spacer", label: "Spacer" },
  { type: "page_break", label: "Page Break" },
  { type: "question_number", label: "Question #" },
  { type: "answer_choice", label: "Answer Choice" },
  { type: "explanation", label: "Explanation" }
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

const LAYOUT_MODE_OPTIONS = ["Flow", "Fixed", "Absolute", "Relative"];
const VERTICAL_POSITION_OPTIONS = ["After previous", "Top of page", "Bottom of page", "Centered"];
const ANCHOR_OPTIONS = ["Page", "Previous block", "Parent component", "Header", "Footer"];
const OVERFLOW_OPTIONS = ["Expand height", "Reduce font size", "Clip", "Continue on next page"];

const DEFAULT_SAMPLE_DATA = {
  question_number: 1,
  question: "What is the probability of getting at least one head in two coin flips?",
  answers: ["0.25", "0.50", "0.75", "1.00"],
  explanation: "Three of the four possible outcomes contain at least one head.",
  difficulty: "Medium",
  points: 2
};

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function starterComponents() {
  return [
    {
      id: createId("comp"),
      name: "Question Card",
      description: "Question, answer choices, and explanation.",
      blocks: [
        { id: createId("blk"), type: "question_number", formatName: "Default", bindField: "question_number" },
        { id: createId("blk"), type: "heading3", formatName: "Default", bindField: "question" },
        { id: createId("blk"), type: "answer_choice", formatName: "Default", repeatField: "answers" },
        { id: createId("blk"), type: "explanation", formatName: "Default", bindField: "explanation" }
      ]
    },
    {
      id: createId("comp"),
      name: "Section Header",
      description: "Divider with a heading.",
      blocks: [
        { id: createId("blk"), type: "heading2", formatName: "Default", bindField: "question" },
        { id: createId("blk"), type: "divider", formatName: "Default" }
      ]
    }
  ];
}

function starterCanvasBlocks(components) {
  return [{ id: createId("canvas"), componentRefId: components[0]?.id || "" }];
}

function defaultFormatSets() {
  return [{ id: "format-set-default", name: "Default", formats: {} }];
}

function defaultPageLayouts(canvasBlocks = []) {
  return [{ id: "page-1", name: "Page 1", pageFormat: "a4-portrait", blocks: canvasBlocks }];
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
    blockFormats: defaultBlockFormats(),
      formatSets: defaultFormatSets(),
      activeFormatSetId: "format-set-default",
      activePageId: "page-1",
      pageLayouts: defaultPageLayouts(),
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

function summarizeBinding(spec) {
  if (spec.repeatField) return `Repeats over "${spec.repeatField}"`;
  if (spec.bindField) return `Bound to "${spec.bindField}"`;
  return "Not mapped";
}

function getSampleKeys(sampleData, arraysOnly) {
  return Object.keys(sampleData || {}).filter((key) => (arraysOnly ? Array.isArray(sampleData[key]) : !Array.isArray(sampleData[key])));
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
  const [sampleDataText, setSampleDataText] = useState(JSON.stringify(DEFAULT_SAMPLE_DATA, null, 2));
  const [sampleDataTab, setSampleDataTab] = useState("json");
  const [previewHtml, setPreviewHtml] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isBusyFormat, setIsBusyFormat] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadTemplates() {
      if (!onListDocumentBlockTemplates) return;
      const list = await onListDocumentBlockTemplates();
      if (!cancelled) setTemplates(Array.isArray(list) ? list : []);
    }
    loadTemplates();
    return () => { cancelled = true; };
  }, [onListDocumentBlockTemplates]);

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
      blockFormats: Object.keys(template.blockFormats || {}).length ? template.blockFormats : defaultBlockFormats(),
        formatSets: Array.isArray(template.formatSets) && template.formatSets.length ? template.formatSets : defaultFormatSets(),
        activeFormatSetId: template.activeFormatSetId || template.formatSets?.[0]?.id || "format-set-default",
        activePageId: template.activePageId || template.pageLayouts?.[0]?.id || "page-1",
        pageLayouts: Array.isArray(template.pageLayouts) && template.pageLayouts.length ? template.pageLayouts : defaultPageLayouts(template.canvasBlocks || []),
      components: Array.isArray(template.components) && template.components.length ? template.components : starterComponents(),
        canvasBlocks: Array.isArray(template.pageLayouts?.[0]?.blocks) ? template.pageLayouts[0].blocks : (Array.isArray(template.canvasBlocks) ? template.canvasBlocks : [])
    };
    setDraft(nextDraft);
    setActiveTemplateId(template.id);
    setHistory([cloneDraft(nextDraft)]);
    setHistoryIndex(0);
    setIsDirty(false);
    setSelectedEntryId("");
    setMultiSelectedIds([]);
    setPreviewHtml("");
  }

  function handleNewTemplate() {
    const nextDraft = createBlankTemplateDraft();
    nextDraft.canvasBlocks = starterCanvasBlocks(nextDraft.components);
    setDraft(nextDraft);
    setActiveTemplateId("");
    setHistory([cloneDraft(nextDraft)]);
    setHistoryIndex(0);
    setIsDirty(true);
    setSelectedEntryId("");
    setMultiSelectedIds([]);
    setPreviewHtml("");
  }

  function addCanvasBlock(type) {
    updateDraft((next) => {
      const formatName = next.blockFormats[type]?.[0]?.name || "Default";
      if (!next.blockFormats[type]) {
        next.blockFormats[type] = [{ name: "Default", className: `tplb-${type}`, htmlTemplate: "", style: {} }];
      }
      const entry = {
        id: createId("canvas"),
        type,
        formatName,
        bindField: "",
        position: { x: 12, y: 18 + next.canvasBlocks.length * 20, width: 180, height: 14, unit: "mm" }
      };
      next.canvasBlocks = [...next.canvasBlocks, entry];
      return next;
    });
  }

  function addComponentToCanvas(componentId) {
    updateDraft((next) => {
      next.canvasBlocks = [...next.canvasBlocks, {
        id: createId("canvas"),
        componentRefId: componentId,
        position: { x: 12, y: 18 + next.canvasBlocks.length * 42, width: 180, height: 38, unit: "mm" }
      }];
      return next;
    });
  }

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

  function addPageLayout() {
        updateDraft((next) => {
          const page = { id: createId("page"), name: `Page ${(next.pageLayouts || []).length + 1}`, pageFormat: next.pageFormat, blocks: [] };
          next.pageLayouts = [...(next.pageLayouts || []), page];
          next.activePageId = page.id;
          next.canvasBlocks = [];
          return next;
        });
        setSelectedEntryId("");
  }

      function selectPageLayout(pageId) {
        setDraft((previous) => {
          const pages = (previous.pageLayouts || []).map((page) => page.id === previous.activePageId ? { ...page, blocks: previous.canvasBlocks } : page);
          const nextPage = pages.find((page) => page.id === pageId) || pages[0];
          const next = { ...previous, pageLayouts: pages, activePageId: nextPage.id, pageFormat: nextPage.pageFormat || previous.pageFormat, canvasBlocks: nextPage.blocks || [] };
          setHistory((historyItems) => [...historyItems, cloneDraft(next)].slice(-40));
          setHistoryIndex((previousIndex) => Math.min(previousIndex + 1, 39));
          return next;
        });
        setSelectedEntryId("");
        setIsDirty(true);
  }

      function addFormatSet() {
        updateDraft((next) => {
          const id = createId("format-set");
          const set = { id, name: `Format Set ${(next.formatSets || []).length + 1}`, formats: {} };
          next.formatSets = [...(next.formatSets || []), set];
          next.activeFormatSetId = id;
          return next;
        });
  }

  function captureCurrentFormatsInSet() {
    updateDraft((next) => {
      const activeId = next.activeFormatSetId || next.formatSets?.[0]?.id;
      next.formatSets = (next.formatSets || []).map((formatSet) => formatSet.id === activeId
        ? {
          ...formatSet,
          formats: Object.fromEntries(Object.entries(next.blockFormats || {}).map(([type, formats]) => [type, formats?.[0]?.name || "Default"]))
        }
        : formatSet);
      return next;
    });
    setStatusMessage("Current block formats captured in the active format set.");
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

  function ungroupComponentEntry(entryId) {
    updateDraft((next) => {
      const index = next.canvasBlocks.findIndex((item) => item.id === entryId);
      if (index === -1) return next;
      const entry = next.canvasBlocks[index];
      const component = next.components.find((item) => item.id === entry.componentRefId);
      if (!component) return next;
      const expanded = component.blocks.map((block) => ({ id: createId("canvas"), type: block.type, formatName: block.formatName, bindField: block.bindField, repeatField: block.repeatField }));
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

  async function handleRefreshPreview() {
    setErrorMessage("");
    try {
      const response = await fetch("/api/templates/render-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: draft, sampleData, format: "html" })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Preview failed");
      setPreviewHtml(result.html || "");
    } catch (error) {
      setErrorMessage(String(error.message || error));
    }
  }

  async function handleExport(format) {
    setErrorMessage("");
    setIsBusyFormat(format);
    try {
      const response = await fetch("/api/templates/render-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: draft, sampleData, format })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Export failed");
      if (format === "html") {
        setPreviewHtml(result.html || "");
      } else {
        const link = document.createElement("a");
        link.href = `data:${result.mimeType};base64,${result.fileBase64}`;
        link.download = `${draft.name || "template"}.${format === "docx" ? "docx" : "pdf"}`;
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
    await handleRefreshPreview();
  }

  async function handleSaveTemplate() {
    if (!onSaveDocumentBlockTemplate) return;
    setIsSaving(true);
    setErrorMessage("");
    try {
      const saved = await onSaveDocumentBlockTemplate({
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
        formatSets: draft.formatSets,
        pageLayouts: draft.pageLayouts,
        activeFormatSetId: draft.activeFormatSetId,
        activePageId: draft.activePageId
      });
      const list = await onListDocumentBlockTemplates();
      setTemplates(Array.isArray(list) ? list : []);
      const savedId = saved?.id || saved?.template?.id || activeTemplateId;
      if (savedId) setActiveTemplateId(savedId);
      setIsDirty(false);
      setStatusMessage("Template saved.");
    } catch (error) {
      setErrorMessage(String(error.message || error));
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

  const scalarKeys = getSampleKeys(sampleData, false);
  const arrayKeys = getSampleKeys(sampleData, true);

  const mappingRows = [];
  draft.canvasBlocks.forEach((entry) => {
    if (entry.componentRefId) {
      const component = draft.components.find((item) => item.id === entry.componentRefId);
      (component?.blocks || []).forEach((block) => {
        mappingRows.push({ key: block.id, label: `${component.name} \u2192 ${labelForType(block.type)}`, componentId: component.id, childId: block.id, spec: block });
      });
    } else {
      mappingRows.push({ key: entry.id, label: labelForType(entry.type), entryId: entry.id, spec: entry });
    }
  });

  const canvasPageStyle = {
    position: "relative",
    width: "min(100%, 720px)",
    margin: "0 auto",
    aspectRatio: `1 / ${pageRatio(draft.pageFormat)}`,
    minHeight: 520,
    overflow: "hidden",
    padding: 0,
    background: "#fff"
  };

  return (
    <div className="tplb-tool-page">
      <article className="panel">
        <div className="inline-actions" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <p className="hint" style={{ margin: 0 }}>Templates &gt; {draft.name}</p>
            <div className="inline-actions" style={{ gap: 8 }}>
              <h4 style={{ margin: 0 }}>{draft.name}</h4>
              <span className="chip" style={{ background: isDirty ? "#fff3cd" : "#e6f6ea", color: isDirty ? "#8a6d1d" : "#1c7a3c" }}>
                {isDirty ? "Draft" : "Saved"}
              </span>
            </div>
          </div>
          <div className="inline-actions" style={{ gap: 8, flexWrap: "wrap" }}>
            <select
              className="table-btn"
              value={activeTemplateId}
              onChange={(event) => {
                const template = templates.find((item) => item.id === event.target.value);
                if (template) loadTemplateIntoDraft(template);
              }}
            >
              <option value="">Choose saved template...</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>
            <button className="table-btn" type="button" onClick={handleNewTemplate}>New Template</button>
            <button className="table-btn" type="button" onClick={handleUndo} disabled={historyIndex <= 0}>Undo</button>
            <button className="table-btn" type="button" onClick={handleRedo} disabled={historyIndex >= history.length - 1}>Redo</button>
            <button className="table-btn" type="button" onClick={handleRefreshPreview}>Preview</button>
            <button className="table-btn primary" type="button" onClick={handleSaveTemplate} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Template"}
            </button>
          </div>
        </div>
        <div className="inline-actions" style={{ gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <label className="hint">Template name
            <input
              className="table-btn"
              style={{ display: "block", marginTop: 4 }}
              value={draft.name}
              onChange={(event) => updateDraft((next) => ({ ...next, name: event.target.value }))}
            />
          </label>
          <label className="hint">Page format
            <select
              className="table-btn"
              style={{ display: "block", marginTop: 4 }}
              value={draft.pageFormat}
              onChange={(event) => updateDraft((next) => ({ ...next, pageFormat: event.target.value }))}
            >
              {PAGE_FORMAT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
        {errorMessage ? <p className="hint" style={{ color: "#b3261e", marginTop: 8 }}>{errorMessage}</p> : null}
        {statusMessage ? <p className="hint" style={{ color: "#1c7a3c", marginTop: 8 }}>{statusMessage}</p> : null}
      </article>

      <article className="panel">
        <div className="inline-actions" style={{ gap: 10, flexWrap: "wrap", justifyContent: "space-between" }}>
          <div>
            <h4 style={{ margin: 0 }}>Document Pages &amp; Format Sets</h4>
            <p className="hint" style={{ margin: "5px 0 0" }}>Build reusable page arrangements for A4 documents and presentation slides. Block formats remain shared across every page.</p>
          </div>
          <div className="inline-actions" style={{ gap: 8, flexWrap: "wrap" }}>
            <select className="table-btn" value={draft.activePageId} onChange={(event) => selectPageLayout(event.target.value)}>
              {(draft.pageLayouts || []).map((page) => <option key={page.id} value={page.id}>{page.name} ({page.pageFormat || draft.pageFormat})</option>)}
            </select>
            <button className="table-btn" type="button" onClick={addPageLayout}>Add Page</button>
            <select
              className="table-btn"
              value={draft.activeFormatSetId || ""}
              onChange={(event) => updateDraft((next) => ({ ...next, activeFormatSetId: event.target.value }))}
            >
              {(draft.formatSets || []).map((formatSet) => <option key={formatSet.id} value={formatSet.id}>{formatSet.name} format set</option>)}
            </select>
            <button className="table-btn" type="button" onClick={addFormatSet}>Add Format Set</button>
            <button className="table-btn" type="button" onClick={captureCurrentFormatsInSet}>Capture Current Formats</button>
          </div>
        </div>
      </article>

      <div className="tplb-main-grid">
        <article className="panel">
          <h4 style={{ marginTop: 0 }}>Blocks</h4>
          <div className="tplb-block-grid">
            {BLOCK_TYPE_LIBRARY.map((item) => (
              <button key={item.type} type="button" className="tplb-block-btn" onClick={() => addCanvasBlock(item.type)}>
                {item.label}
              </button>
            ))}
          </div>
          <h4>Components</h4>
          {draft.components.map((component) => (
            <div key={component.id} className="tplb-component-card" onClick={() => addComponentToCanvas(component.id)}>
              <strong>{component.name}</strong>
              <span>{component.blocks.length} blocks &middot; click to insert</span>
            </div>
          ))}
          <button
            className="table-btn"
            type="button"
            onClick={createComponentFromSelection}
            disabled={multiSelectedIds.length < 2}
            style={{ width: "100%" }}
          >
            Create Component From Selection ({multiSelectedIds.length})
          </button>
        </article>

        <article className="panel">
          <h4 style={{ marginTop: 0 }}>Canvas</h4>
          <p className="hint">Select a block with the checkbox to include it when creating a component. Click a row to edit its properties.</p>
          <div className="tplb-canvas-page" style={canvasPageStyle}>
            {draft.canvasBlocks.length === 0 ? <p className="hint">Canvas is empty. Add a block or component from the left sidebar.</p> : null}
            {draft.canvasBlocks.map((entry, index) => {
              const isComponent = Boolean(entry.componentRefId);
              const component = isComponent ? draft.components.find((item) => item.id === entry.componentRefId) : null;
              return (
                <div
                  key={entry.id}
                  className={`tplb-canvas-entry ${selectedEntryId === entry.id ? "selected" : ""} ${entry.hidden ? "hidden-entry" : ""}`}
                  style={positionToCanvasStyle(entry.position, draft.pageFormat)}
                  onClick={() => setSelectedEntryId(entry.id)}
                >
                  <div className="tplb-canvas-entry-head">
                    <label onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={multiSelectedIds.includes(entry.id)}
                        onChange={() => toggleMultiSelect(entry.id)}
                      />
                    </label>
                    <div style={{ flex: 1 }}>
                      <strong>{isComponent ? component?.name || "Component" : labelForType(entry.type)}</strong>
                      <div className="hint">{isComponent ? `${component?.blocks?.length || 0} nested blocks` : summarizeBinding(entry)}</div>
                    </div>
                    <div className="inline-actions" style={{ gap: 4 }} onClick={(event) => event.stopPropagation()}>
                      <button className="table-btn" type="button" disabled={index === 0} onClick={() => moveCanvasEntry(index, index - 1)}>↑</button>
                      <button className="table-btn" type="button" disabled={index === draft.canvasBlocks.length - 1} onClick={() => moveCanvasEntry(index, index + 1)}>↓</button>
                      <button className="table-btn" type="button" onClick={() => duplicateCanvasEntry(entry.id)}>Duplicate</button>
                      {isComponent ? <button className="table-btn" type="button" onClick={() => ungroupComponentEntry(entry.id)}>Ungroup</button> : null}
                      <button className="table-btn" type="button" onClick={() => removeCanvasEntry(entry.id)}>Delete</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="panel">
          <div className="inline-actions" style={{ gap: 8 }}>
            <button className={`table-btn ${rightTab === "properties" ? "primary" : ""}`} type="button" onClick={() => setRightTab("properties")}>Properties</button>
            <button className={`table-btn ${rightTab === "layers" ? "primary" : ""}`} type="button" onClick={() => setRightTab("layers")}>Layers</button>
          </div>

          {rightTab === "properties" ? (
            <div style={{ marginTop: 10 }}>
              {!selectedEntry ? <p className="hint">Select a canvas block to edit its properties.</p> : null}

              {selectedEntry && selectedComponent ? (
                <div>
                  <h4>{selectedComponent.name}</h4>
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
                        {scalarKeys.map((key) => <option key={`field:${key}`} value={`field:${key}`}>Field: {key}</option>)}
                        {arrayKeys.map((key) => <option key={`repeat:${key}`} value={`repeat:${key}`}>Repeat: {key}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              ) : null}

              {selectedEntry && !selectedComponent ? (
                <div>
                  <h4>{labelForType(selectedEntry.type)}</h4>
                  <label className="hint">Data binding
                    <select
                      className="table-btn"
                      style={{ display: "block", marginTop: 4 }}
                      value={selectedEntry.repeatField ? `repeat:${selectedEntry.repeatField}` : (selectedEntry.bindField ? `field:${selectedEntry.bindField}` : "")}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value.startsWith("repeat:")) patchSelectedEntry({ repeatField: value.slice(7), bindField: "" });
                        else if (value.startsWith("field:")) patchSelectedEntry({ bindField: value.slice(6), repeatField: "" });
                        else patchSelectedEntry({ bindField: "", repeatField: "" });
                      }}
                    >
                      <option value="">Not mapped</option>
                      {scalarKeys.map((key) => <option key={`field:${key}`} value={`field:${key}`}>Field: {key}</option>)}
                      {arrayKeys.map((key) => <option key={`repeat:${key}`} value={`repeat:${key}`}>Repeat: {key}</option>)}
                    </select>
                  </label>

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

                  <div className="tplb-property-section">
                    <strong>Layout</strong>
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
                  </div>

                  <div className="tplb-property-section">
                    <strong>Constraints</strong>
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
                  </div>

                  <div className="tplb-property-section">
                    <strong>Appearance</strong>
                    <label className="hint">Font family
                      <input className="table-btn" style={{ display: "block", marginTop: 4 }} value={selectedFormat?.style?.fontFamily || ""} onChange={(event) => patchSelectedEntryStyle({ fontFamily: event.target.value })} />
                    </label>
                    <label className="hint">Font size
                      <input className="table-btn" style={{ display: "block", marginTop: 4 }} value={selectedFormat?.style?.fontSize || ""} onChange={(event) => patchSelectedEntryStyle({ fontSize: event.target.value })} />
                    </label>
                    <label className="hint">Text color
                      <input className="table-btn" style={{ display: "block", marginTop: 4 }} value={selectedFormat?.style?.color || ""} onChange={(event) => patchSelectedEntryStyle({ color: event.target.value })} />
                    </label>
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
                    <label className="hint">Padding
                      <input className="table-btn" style={{ display: "block", marginTop: 4 }} value={selectedFormat?.style?.padding || ""} onChange={(event) => patchSelectedEntryStyle({ padding: event.target.value })} />
                    </label>
                  </div>
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

      <div className="tplb-bottom-grid">
        <article className="panel">
          <h4 style={{ marginTop: 0 }}>Data Mapping</h4>
          {mappingRows.map((row) => (
            <div key={row.key} className="tplb-mapping-row">
              <span className="hint">{row.label}</span>
              <span className="hint">{summarizeBinding(row.spec)}</span>
            </div>
          ))}
        </article>

        <article className="panel">
          <h4 style={{ marginTop: 0 }}>Sample Preview</h4>
          <div className="inline-actions" style={{ gap: 8 }}>
            <button className={`table-btn ${sampleDataTab === "json" ? "primary" : ""}`} type="button" onClick={() => setSampleDataTab("json")}>JSON</button>
            <button className={`table-btn ${sampleDataTab === "table" ? "primary" : ""}`} type="button" onClick={() => setSampleDataTab("table")}>Table</button>
            <button className="table-btn" type="button" onClick={handleRefreshPreview}>Refresh preview</button>
          </div>
          {sampleDataTab === "json" ? (
            <textarea
              className="table-btn"
              style={{ width: "100%", minHeight: 140, marginTop: 8, fontFamily: "monospace" }}
              value={sampleDataText}
              onChange={(event) => setSampleDataText(event.target.value)}
            />
          ) : (
            <div style={{ marginTop: 8 }}>
              {Object.entries(sampleData).map(([key, value]) => (
                <div key={key} className="tplb-mapping-row">
                  <span className="hint">{key}</span>
                  <span className="hint">{Array.isArray(value) ? value.join(", ") : String(value)}</span>
                </div>
              ))}
            </div>
          )}
          {previewHtml ? (
            <div style={{ marginTop: 10, border: "1px solid var(--tplb-line)", borderRadius: 10, padding: 10, maxHeight: 260, overflow: "auto", background: "#fff" }}
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          ) : null}
        </article>

        <article className="panel">
          <h4 style={{ marginTop: 0 }}>Export &amp; Test</h4>
          <div className="tplb-mapping-row">
            <span>HTML (Continuous)</span>
            <button className="table-btn" type="button" onClick={() => handleExport("html")} disabled={isBusyFormat === "html"}>Preview</button>
          </div>
          <div className="tplb-mapping-row">
            <span>PDF ({draft.pageFormat})</span>
            <button className="table-btn" type="button" onClick={() => handleExport("pdf")} disabled={isBusyFormat === "pdf"}>Download</button>
          </div>
          <div className="tplb-mapping-row">
            <span>Word</span>
            <button className="table-btn" type="button" onClick={() => handleExport("docx")} disabled={isBusyFormat === "docx"}>Download</button>
          </div>
          <div className="tplb-mapping-row">
            <span>PowerPoint</span>
            <button className="table-btn" type="button" disabled title="Coming soon: requires adding a pptx export dependency (e.g. pptxgenjs).">Coming soon</button>
          </div>
          <button className="table-btn primary" type="button" style={{ width: "100%", marginTop: 8 }} onClick={handleGenerateAllFormats}>
            Generate all formats
          </button>
          <p className="hint" style={{ marginTop: 8 }}>
            PowerPoint export is not implemented yet \u2014 no pptx generation library is installed in this project. All other formats render from the same underlying template model.
          </p>
        </article>
      </div>
    </div>
  );
}
