"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TemplateBuilderPage } from "./TemplateBuilderPage";
import { QUIZ_AGENT } from "../quiz-generator/quizAgent";
import {
  BLOCK_KINDS,
  FIELD_DISPLAYS,
  PAGE_FORMATS,
  buildSampleData,
  collectFieldTags,
  compileStudio,
  createBlock,
  createEmptyStudio,
  createQuizStarter,
  importLegacyTemplate
} from "./studioModel";

const card = "rounded-[18px] border border-ink/8 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]";
const fieldBase = "rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink placeholder:text-soft-ink/70 outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]";
const fieldClass = `w-full ${fieldBase}`;
const labelClass = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-soft-ink";
const primaryBtn = "inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed] active:scale-[0.98] disabled:opacity-50";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-3.5 py-1.5 text-sm font-semibold text-ink transition hover:bg-[var(--surface-soft)] disabled:opacity-50";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";

/* ------------------------------------------------------------------ tree helpers */
function mapTree(blocks, fn) {
  return blocks.map((block) => {
    const next = fn(block);
    return next.kind === "group" ? { ...next, children: mapTree(next.children || [], fn) } : next;
  });
}
function findBlock(blocks, id) {
  for (const block of blocks) {
    if (block.id === id) return block;
    if (block.kind === "group") {
      const found = findBlock(block.children || [], id);
      if (found) return found;
    }
  }
  return null;
}
function findParent(blocks, id, parent = null) {
  for (const block of blocks) {
    if (block.id === id) return parent;
    if (block.kind === "group") {
      const found = findParent(block.children || [], id, block);
      if (found !== undefined && found !== null) return found;
      if ((block.children || []).some((child) => child.id === id)) return block;
    }
  }
  return null;
}
function removeBlock(blocks, id) {
  return blocks.filter((block) => block.id !== id).map((block) => (block.kind === "group" ? { ...block, children: removeBlock(block.children || [], id) } : block));
}
function insertAfter(blocks, afterId, newBlock) {
  const output = [];
  for (const block of blocks) {
    if (block.kind === "group") output.push({ ...block, children: insertAfter(block.children || [], afterId, newBlock) });
    else output.push(block);
    if (block.id === afterId) output.push(newBlock);
  }
  return output;
}
function moveInSiblings(blocks, id, direction) {
  const index = blocks.findIndex((block) => block.id === id);
  if (index >= 0) {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return blocks;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  }
  return blocks.map((block) => (block.kind === "group" ? { ...block, children: moveInSiblings(block.children || [], id, direction) } : block));
}
function cloneBlock(block) {
  const copy = { ...block, id: createBlock(block.kind).id };
  if (block.kind === "group") copy.children = (block.children || []).map(cloneBlock);
  return copy;
}

function readAgentFieldSuggestions(workspaces = []) {
  const suggestions = new Map();
  for (const field of QUIZ_AGENT.template.fields) suggestions.set(field.name, { name: field.name, label: field.label, source: QUIZ_AGENT.name });
  for (const workspace of workspaces) {
    for (const subject of workspace.subjects || []) {
      for (const document of subject.documents || []) {
        if (document.sourceType !== "generated" || !(document.tags || []).includes("ai-agent")) continue;
        try {
          const parsed = JSON.parse(String(document.content || "{}"));
          for (const field of parsed.template?.fields || []) {
            if (!suggestions.has(field.name)) suggestions.set(field.name, { name: field.name, label: field.label || field.name, source: parsed.name || document.name });
          }
        } catch {
          // skip unreadable agents
        }
      }
    }
  }
  return [...suggestions.values()];
}

function wrapStudioPreview(fragment) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#e9e9ee;}body{padding:20px;}${""}</style></head><body>${fragment}</body></html>`;
}

/* ------------------------------------------------------------------ canvas block */
function BlockCard({ block, depth, selectedId, onSelect, onDragStart, onDrop, dragOverId, setDragOverId, children }) {
  const meta = BLOCK_KINDS.find((item) => item.kind === block.kind) || BLOCK_KINDS[1];
  const selected = selectedId === block.id;
  const isGroup = block.kind === "group";
  const preview = (() => {
    if (block.kind === "field") return <span className="rounded-md bg-[var(--accent-soft)] px-1.5 py-0.5 font-mono text-xs text-[var(--accent-ink)]">{`{${block.field || "choose a field"}}`}</span>;
    if (block.kind === "heading") return <span className={`${block.size === "xl" ? "text-xl" : block.size === "l" ? "text-lg" : "text-base"} font-bold`}>{block.text || "Heading"}</span>;
    if (block.kind === "text") return <span className="text-sm text-ink/80">{block.text || "Text"}</span>;
    if (block.kind === "number") return <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-bold text-[var(--accent-ink)]">1</span>;
    if (block.kind === "image") return <span className="text-xs text-soft-ink">{block.src ? block.src.slice(0, 40) : "No image yet"}</span>;
    if (block.kind === "divider") return <span className="block h-px w-full bg-ink/15" />;
    if (block.kind === "spacer") return <span className="text-xs text-soft-ink">Space</span>;
    if (block.kind === "pageBreak") return <span className="text-xs text-soft-ink">— new page —</span>;
    return null;
  })();

  return (
    <div
      draggable
      onDragStart={(event) => {
        event.stopPropagation();
        onDragStart(block.id);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragOverId(block.id);
      }}
      onDragLeave={() => setDragOverId((current) => (current === block.id ? "" : current))}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDrop(block.id);
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(block.id);
      }}
      className={`group relative rounded-xl border transition ${selected ? "border-[var(--accent)] ring-4 ring-[var(--accent-soft)]" : "border-ink/10 hover:border-ink/25"} ${dragOverId === block.id ? "border-t-4 border-t-[var(--accent)]" : ""} ${isGroup ? "border-dashed bg-[var(--surface-soft)]/60 p-3" : "bg-white px-3 py-2"}`}
      style={{ textAlign: block.align || "left" }}
    >
      <div className="flex items-start gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-[var(--surface-soft)] text-[10px] font-bold text-soft-ink" title={meta.label}>{meta.icon}</span>
        <div className="min-w-0 flex-1">
          {isGroup ? <p className="m-0 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent-ink)]">Repeats for each item</p> : preview}
        </div>
      </div>
      {isGroup ? (
        <div className="mt-2 grid gap-1.5 pl-2" style={{ paddingLeft: depth ? 8 : 8 }}>
          {children}
          {!(block.children || []).length ? <p className="m-0 rounded-lg border border-dashed border-ink/15 p-2 text-center text-xs text-soft-ink">Empty group — add blocks from the left with this group selected.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ inspector */
function Inspector({ block, parent, suggestions, onChange, onDelete, onDuplicate, onMove, siblings, onPlaceAfter }) {
  if (!block) {
    return (
      <div className="p-5">
        <p className={kicker}>Inspector</p>
        <p className="m-0 mt-2 text-sm text-soft-ink">Select a block on the page to edit its content, field tag, position and style.</p>
      </div>
    );
  }
  const set = (patch) => onChange({ ...block, ...patch });
  const meta = BLOCK_KINDS.find((item) => item.kind === block.kind);
  const otherSiblings = siblings.filter((item) => item.id !== block.id);
  return (
    <div className="grid gap-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="m-0 text-sm font-bold text-ink">{meta?.label}</p>
        <div className="flex gap-1">
          <button type="button" className={ghostBtn} onClick={onDuplicate} title="Duplicate">⧉</button>
          <button type="button" className={`${ghostBtn} text-[var(--color-danger)]`} onClick={onDelete} title="Delete">Delete</button>
        </div>
      </div>
      {parent ? <p className="m-0 rounded-xl bg-[var(--accent-soft)] px-3 py-2 text-xs text-[var(--accent-ink)]">Inside a repeating group — this appears once per item.</p> : null}

      {block.kind === "heading" || block.kind === "text" ? (
        <div>
          <label className={labelClass}>Text</label>
          <textarea className={`${fieldClass} min-h-20 resize-y`} value={block.text} onChange={(event) => set({ text: event.target.value })} />
        </div>
      ) : null}

      {block.kind === "field" ? (
        <>
          <div>
            <label className={labelClass}>Field tag</label>
            <input list="studio-field-suggestions" className={`${fieldClass} font-mono`} value={block.field} onChange={(event) => set({ field: event.target.value.trim() })} placeholder="e.g. question" />
            <datalist id="studio-field-suggestions">
              {suggestions.map((item) => <option key={item.name} value={item.name}>{item.label} · {item.source}</option>)}
            </datalist>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {suggestions.slice(0, 8).map((item) => (
                <button key={item.name} type="button" onClick={() => set({ field: item.name })} className={`rounded-full px-2 py-0.5 font-mono text-[11px] transition ${block.field === item.name ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-soft)] text-soft-ink hover:text-ink"}`}>{item.name}</button>
              ))}
            </div>
            <p className="m-0 mt-1.5 text-xs text-soft-ink">Must match a field name in the agent's output. The agent's fields are suggested above.</p>
          </div>
          <div>
            <label className={labelClass}>Show as</label>
            <select className={fieldClass} value={block.display} onChange={(event) => set({ display: event.target.value })}>
              {FIELD_DISPLAYS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
        </>
      ) : null}

      {block.kind === "image" ? (
        <div>
          <label className={labelClass}>Image URL</label>
          <input className={fieldClass} value={block.src} onChange={(event) => set({ src: event.target.value })} placeholder="https://…/logo.png" />
        </div>
      ) : null}

      {block.kind === "heading" ? (
        <div>
          <label className={labelClass}>Level</label>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
            {[1, 2, 3].map((level) => <button key={level} type="button" onClick={() => set({ level })} className={`rounded-lg px-2 py-1.5 text-xs font-semibold ${block.level === level ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink"}`}>H{level}</button>)}
          </div>
        </div>
      ) : null}

      {!["divider", "pageBreak", "number"].includes(block.kind) ? (
        <div>
          <label className={labelClass}>Position on the page</label>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
            {[["left", "Left"], ["center", "Centre"], ["right", "Right"]].map(([value, label]) => <button key={value} type="button" onClick={() => set({ align: value })} className={`rounded-lg px-2 py-1.5 text-xs font-semibold ${(block.align || "left") === value ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink"}`}>{label}</button>)}
          </div>
        </div>
      ) : null}

      {otherSiblings.length ? (
        <div>
          <label className={labelClass}>Comes after</label>
          <select className={fieldClass} value="" onChange={(event) => event.target.value && onPlaceAfter(event.target.value)}>
            <option value="">Choose a block…</option>
            <option value="__first">(first on this level)</option>
            {otherSiblings.map((item) => <option key={item.id} value={item.id}>{BLOCK_KINDS.find((meta2) => meta2.kind === item.kind)?.label}{item.text ? ` · ${item.text.slice(0, 24)}` : item.field ? ` · {${item.field}}` : ""}</option>)}
          </select>
          <div className="mt-1.5 flex gap-1">
            <button type="button" className={ghostBtn} onClick={() => onMove(-1)}>▲ Up</button>
            <button type="button" className={ghostBtn} onClick={() => onMove(1)}>▼ Down</button>
          </div>
        </div>
      ) : null}

      {["heading", "text", "field", "number"].includes(block.kind) ? (
        <>
          <div>
            <label className={labelClass}>Size</label>
            <div className="grid grid-cols-4 gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
              {["s", "m", "l", "xl"].map((size) => <button key={size} type="button" onClick={() => set({ size })} className={`rounded-lg px-2 py-1.5 text-xs font-semibold uppercase ${block.size === size ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink"}`}>{size}</button>)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Weight</label>
              <select className={fieldClass} value={block.weight} onChange={(event) => set({ weight: event.target.value })}><option value="normal">Regular</option><option value="bold">Bold</option></select>
            </div>
            <div>
              <label className={labelClass}>Colour</label>
              <div className="flex items-center gap-2">
                <input type="color" value={block.color || "#1d1d1f"} onChange={(event) => set({ color: event.target.value })} className="size-9 cursor-pointer rounded-lg border border-ink/15 bg-white p-0.5" />
                <button type="button" className="text-xs text-soft-ink hover:underline" onClick={() => set({ color: "" })}>Reset</button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {["group", "text", "field", "heading", "spacer"].includes(block.kind) ? (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>{block.kind === "spacer" ? "Height" : "Padding"}</label>
            <input type="number" min="0" max="60" className={fieldClass} value={block.padding || 0} onChange={(event) => set({ padding: Number(event.target.value) || 0 })} />
          </div>
          {block.kind !== "spacer" ? (
            <div>
              <label className={labelClass}>Background</label>
              <div className="flex items-center gap-2">
                <input type="color" value={block.background || "#ffffff"} onChange={(event) => set({ background: event.target.value })} className="size-9 cursor-pointer rounded-lg border border-ink/15 bg-white p-0.5" />
                <button type="button" className="text-xs text-soft-ink hover:underline" onClick={() => set({ background: "" })}>None</button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ page */
export function TemplateStudioPage({ toolContext }) {
  const [mode, setMode] = useState("studio");
  const [view, setView] = useState("design");
  const [studio, setStudio] = useState(() => createEmptyStudio());
  const [activeTemplateId, setActiveTemplateId] = useState("");
  const [activeCreatedAt, setActiveCreatedAt] = useState("");
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [dragId, setDragId] = useState("");
  const [dragOverId, setDragOverId] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const previewTimer = useRef(null);

  const onList = toolContext?.onListDocumentBlockTemplates;
  const onSave = toolContext?.onSaveDocumentBlockTemplate;
  const onDelete = toolContext?.onDeleteDocumentBlockTemplate;
  const suggestions = useMemo(() => readAgentFieldSuggestions(toolContext?.workspaces || []), [toolContext?.workspaces]);

  const refreshTemplates = useCallback(async () => {
    if (typeof onList !== "function") return;
    try {
      const list = await onList();
      setTemplates(Array.isArray(list) ? list : []);
    } catch {
      // keep current list
    }
  }, [onList]);

  useEffect(() => {
    refreshTemplates();
  }, [refreshTemplates]);

  const update = (next) => {
    setStudio(next);
    setDirty(true);
  };
  const compiled = useMemo(() => compileStudio(studio, { id: activeTemplateId, createdAt: activeCreatedAt }), [studio, activeTemplateId, activeCreatedAt]);
  const tags = useMemo(() => collectFieldTags(studio), [studio]);

  // Live preview (debounced) through the same renderer used for exports.
  useEffect(() => {
    window.clearTimeout(previewTimer.current);
    previewTimer.current = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/templates/render-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template: compiled, sampleData: buildSampleData(studio), format: "html" })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "Preview failed");
        setPreviewHtml(wrapStudioPreview(payload.html || ""));
        setPreviewError("");
      } catch (error) {
        setPreviewError(String(error.message || error));
      }
    }, 350);
    return () => window.clearTimeout(previewTimer.current);
  }, [compiled, studio]);

  const selected = selectedId ? findBlock(studio.blocks, selectedId) : null;
  const selectedParent = selectedId ? findParent(studio.blocks, selectedId) : null;
  const siblings = selectedParent ? selectedParent.children || [] : studio.blocks;

  function addBlock(kind) {
    const block = createBlock(kind);
    if (selected && selected.kind === "group" && kind !== "group") {
      update({ ...studio, blocks: mapTree(studio.blocks, (item) => (item.id === selected.id ? { ...item, children: [...(item.children || []), block] } : item)) });
    } else if (selected) {
      update({ ...studio, blocks: insertAfter(studio.blocks, selected.id, block) });
    } else {
      update({ ...studio, blocks: [...studio.blocks, block] });
    }
    setSelectedId(block.id);
  }

  function changeBlock(next) {
    update({ ...studio, blocks: mapTree(studio.blocks, (item) => (item.id === next.id ? next : item)) });
  }

  function deleteSelected() {
    if (!selected) return;
    update({ ...studio, blocks: removeBlock(studio.blocks, selected.id) });
    setSelectedId("");
  }

  function duplicateSelected() {
    if (!selected) return;
    const copy = cloneBlock(selected);
    update({ ...studio, blocks: insertAfter(studio.blocks, selected.id, copy) });
    setSelectedId(copy.id);
  }

  function placeAfter(targetId) {
    if (!selected) return;
    const without = removeBlock(studio.blocks, selected.id);
    if (targetId === "__first") {
      const parent = selectedParent;
      const next = parent
        ? mapTree(without, (item) => (item.id === parent.id ? { ...item, children: [selected, ...(item.children || [])] } : item))
        : [selected, ...without];
      update({ ...studio, blocks: next });
      return;
    }
    update({ ...studio, blocks: insertAfter(without, targetId, selected) });
  }

  function handleDrop(targetId) {
    if (!dragId || dragId === targetId) {
      setDragId("");
      setDragOverId("");
      return;
    }
    const moving = findBlock(studio.blocks, dragId);
    const target = findBlock(studio.blocks, targetId);
    if (!moving || !target) return;
    // Dropping a group into itself is not allowed.
    if (moving.kind === "group" && findBlock(moving.children || [], targetId)) return;
    let without = removeBlock(studio.blocks, dragId);
    if (target.kind === "group" && moving.kind !== "group") {
      without = mapTree(without, (item) => (item.id === targetId ? { ...item, children: [...(item.children || []), moving] } : item));
    } else {
      without = insertAfter(without, targetId, moving);
    }
    update({ ...studio, blocks: without });
    setDragId("");
    setDragOverId("");
  }

  async function handleSave() {
    if (typeof onSave !== "function") return;
    setIsSaving(true);
    setStatus("");
    try {
      const saved = await onSave(compiled);
      const savedId = saved?.template?.id || compiled.id;
      setActiveTemplateId(savedId);
      setActiveCreatedAt(compiled.createdAt);
      setDirty(false);
      setStatus(`Saved "${compiled.name}". It is now available in every agent's Configure output step.`);
      if (Array.isArray(saved?.templates)) setTemplates(saved.templates);
      else refreshTemplates();
    } catch (error) {
      setStatus(String(error.message || error));
    } finally {
      setIsSaving(false);
    }
  }

  function openTemplate(template) {
    setStudio(importLegacyTemplate(template));
    setActiveTemplateId(template.id || "");
    setActiveCreatedAt(template.createdAt || "");
    setSelectedId("");
    setDirty(false);
    setStatus(template.studio ? "" : "Imported from the advanced builder — check the layout, some details may differ.");
  }

  function startNew(starter) {
    setStudio(starter === "quiz" ? createQuizStarter() : createEmptyStudio());
    setActiveTemplateId("");
    setActiveCreatedAt("");
    setSelectedId("");
    setDirty(true);
    setStatus("");
  }

  async function handleDeleteTemplate() {
    if (!activeTemplateId || typeof onDelete !== "function") return;
    try {
      const list = await onDelete(activeTemplateId);
      setTemplates(Array.isArray(list) ? list : []);
      startNew();
      setStatus("Template deleted.");
    } catch (error) {
      setStatus(String(error.message || error));
    }
  }

  function renderBlocks(blocks, depth = 0) {
    return blocks.map((block) => (
      <BlockCard key={block.id} block={block} depth={depth} selectedId={selectedId} onSelect={setSelectedId} onDragStart={setDragId} onDrop={handleDrop} dragOverId={dragOverId} setDragOverId={setDragOverId}>
        {block.kind === "group" ? renderBlocks(block.children || [], depth + 1) : null}
      </BlockCard>
    ));
  }

  if (mode === "advanced") {
    return (
      <div className="grid gap-3">
        <div className="tw-scope flex items-center justify-between rounded-2xl border border-ink/8 bg-white px-4 py-2 text-sm">
          <span className="text-soft-ink">Advanced editor (full control, more complex).</span>
          <button type="button" className={ghostBtn} onClick={() => setMode("studio")}>← Back to Template Studio</button>
        </div>
        <TemplateBuilderPage toolContext={toolContext} />
      </div>
    );
  }

  return (
    <section className="tw-scope grid gap-3">
      {/* Toolbar */}
      <div className={`${card} flex flex-wrap items-center gap-3 px-4 py-3`}>
        <input className={`${fieldBase} min-w-52 font-semibold`} value={studio.name} onChange={(event) => update({ ...studio, name: event.target.value })} placeholder="Template name" aria-label="Template name" />
        <select className={fieldBase} value={studio.pageFormat} onChange={(event) => update({ ...studio, pageFormat: event.target.value })} aria-label="Page format">
          {PAGE_FORMATS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <select className={fieldBase} value="" onChange={(event) => { const template = templates.find((item) => item.id === event.target.value); if (template) openTemplate(template); }} aria-label="Open template">
          <option value="">Open…</option>
          {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
        </select>
        <div className="flex gap-1">
          <button type="button" className={ghostBtn} onClick={() => startNew()}>New</button>
          <button type="button" className={ghostBtn} onClick={() => startNew("quiz")}>Quiz starter</button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {activeTemplateId ? <button type="button" className={`${ghostBtn} text-[var(--color-danger)]`} onClick={handleDeleteTemplate}>Delete</button> : null}
          <button type="button" className="text-xs font-semibold text-soft-ink hover:underline" onClick={() => setMode("advanced")}>Advanced editor</button>
          <button type="button" className={primaryBtn} onClick={handleSave} disabled={isSaving || typeof onSave !== "function"}>{isSaving ? "Saving…" : dirty ? "Save template" : "Saved"}</button>
        </div>
      </div>
      {status ? <p className="m-0 px-1 text-xs text-accent">{status}</p> : null}

      <div className="grid items-start gap-3 lg:grid-cols-[210px_minmax(0,1fr)_320px]">
        {/* Palette */}
        <aside className={`${card} p-3`}>
          <p className={`${kicker} px-2`}>Add a block</p>
          <p className="m-0 mb-2 px-2 text-[11px] text-soft-ink">{selected ? (selected.kind === "group" ? "Added inside the selected group." : "Added after the selected block.") : "Added at the end."}</p>
          <div className="grid gap-1">
            {BLOCK_KINDS.map((item) => (
              <button key={item.kind} type="button" onClick={() => addBlock(item.kind)} className="flex items-center gap-2.5 rounded-xl px-2 py-2 text-left transition hover:bg-[var(--surface-soft)]" title={item.hint}>
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--surface-soft)] text-xs font-bold text-ink">{item.icon}</span>
                <span className="min-w-0"><span className="block text-sm font-semibold text-ink">{item.label}</span><span className="block truncate text-[11px] text-soft-ink">{item.hint}</span></span>
              </button>
            ))}
          </div>
          <div className="mt-4 border-t border-ink/8 pt-3">
            <p className={`${kicker} px-2`}>Fields this template expects</p>
            {tags.length ? (
              <ul className="m-0 mt-2 grid list-none gap-1 p-0 px-2">
                {tags.map((tag) => <li key={tag.name} className="flex items-center justify-between gap-2 text-xs"><span className="font-mono text-ink">{tag.name}</span><span className="text-soft-ink">{tag.perItem ? "per item" : "once"}</span></li>)}
              </ul>
            ) : <p className="m-0 mt-2 px-2 text-xs text-soft-ink">Add a Field block and give it a tag.</p>}
          </div>
        </aside>

        {/* Canvas / preview */}
        <div className={`${card} min-h-[560px] p-4`} onClick={() => setSelectedId("")}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 rounded-xl bg-[var(--surface-soft)] p-1" onClick={(event) => event.stopPropagation()}>
              {[["design", "Design"], ["preview", "Preview with sample data"]].map(([value, label]) => (
                <button key={value} type="button" onClick={() => setView(value)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${view === value ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink hover:text-ink"}`}>{label}</button>
              ))}
            </div>
            <p className="m-0 text-[11px] text-soft-ink">{view === "design" ? "Click to select · drag to reorder · drop onto a group to move inside" : previewError || "Exactly what PDF / Word / HTML exports will contain"}</p>
          </div>
          {view === "design" ? (
            <div className="mx-auto grid max-w-[640px] gap-1.5 rounded-2xl border border-ink/10 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)]" style={{ minHeight: 480 }}>
              {renderBlocks(studio.blocks)}
              {!studio.blocks.length ? <p className="m-0 py-16 text-center text-sm text-soft-ink">Your page is empty. Add a block from the left.</p> : null}
            </div>
          ) : (
            <iframe title="Template preview" sandbox="" srcDoc={previewHtml} className="h-[600px] w-full rounded-2xl border border-ink/10 bg-[#e9e9ee]" />
          )}
        </div>

        {/* Inspector */}
        <aside className={`${card} min-h-[560px]`}>
          <Inspector
            block={selected}
            parent={selectedParent}
            suggestions={suggestions}
            onChange={changeBlock}
            onDelete={deleteSelected}
            onDuplicate={duplicateSelected}
            onMove={(direction) => update({ ...studio, blocks: moveInSiblings(studio.blocks, selected.id, direction) })}
            siblings={siblings}
            onPlaceAfter={placeAfter}
          />
        </aside>
      </div>

    </section>
  );
}
