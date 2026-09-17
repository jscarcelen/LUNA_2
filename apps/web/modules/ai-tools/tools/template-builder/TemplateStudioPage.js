"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TemplateBuilderPage } from "./TemplateBuilderPage";
import { QUIZ_AGENT } from "../quiz-generator/quizAgent";
import {
  PAGE_MARGIN_MM,
  PAGE_SIZES,
  buildSampleData,
  collectTemplateFields,
  createElement,
  createExamStarter,
  createFlashcardStarter,
  createId,
  createPage,
  createTemplate
} from "../../render/docModel";

/* ------------------------------------------------------------------ styling */
const card = "rounded-[18px] border border-ink/8 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]";
const fieldBase = "rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink placeholder:text-soft-ink/70 outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]";
const fieldClass = `w-full ${fieldBase}`;
const labelClass = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-soft-ink";
const primaryBtn = "inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed] active:scale-[0.98] disabled:opacity-50";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-3.5 py-1.5 text-sm font-semibold text-ink transition hover:bg-[var(--surface-soft)] disabled:opacity-50";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";
const GROUP_COLOR = "#6d4de6";
const MAX_SCALE = 3; // px per mm on the canvas (fits to the column width)

const PALETTE = [
  { type: "text", label: "Text", icon: "T", hint: "Static text" },
  { type: "image", label: "Image", icon: "▣", hint: "Logo or picture" },
  { type: "rect", label: "Shape", icon: "▭", hint: "Box or background" },
  { type: "line", label: "Line", icon: "—", hint: "Divider" },
  { type: "field", label: "AI field", icon: "✦", hint: "Filled by the agent" },
  { type: "group", label: "Group", icon: "⧉", hint: "Repeats per item" }
];

const FIELD_DISPLAYS = [
  { value: "text", label: "Text" },
  { value: "list", label: "Bullet list (one per value)" },
  { value: "choices", label: "Answer choices A, B, C…" },
  { value: "image", label: "Image (URL from the agent)" }
];

function Segmented({ value, options, onChange, size = "sm" }) {
  return (
    <div className="grid gap-1 rounded-xl bg-[var(--surface-soft)] p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(([optionValue, label]) => (
        <button key={optionValue} type="button" onClick={() => onChange(optionValue)} className={`rounded-lg px-2 ${size === "sm" ? "py-1.5 text-xs" : "py-2 text-sm"} font-semibold transition ${value === optionValue ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink hover:text-ink"}`}>{label}</button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ tree helpers */
function updateElementIn(elements, id, updater) {
  return elements.map((element) => {
    if (element.id === id) return updater(element);
    if (element.type === "group") return { ...element, children: updateElementIn(element.children || [], id, updater) };
    return element;
  });
}
function removeElementIn(elements, id) {
  return elements.filter((element) => element.id !== id).map((element) => (element.type === "group" ? { ...element, children: removeElementIn(element.children || [], id) } : element));
}
function findElementIn(elements, id) {
  for (const element of elements) {
    if (element.id === id) return { element, parent: null };
    if (element.type === "group") {
      const child = (element.children || []).find((item) => item.id === id);
      if (child) return { element: child, parent: element };
    }
  }
  return { element: null, parent: null };
}
function cloneElement(element) {
  const copy = { ...element, id: createId(), style: { ...(element.style || {}) } };
  if (element.type === "group") copy.children = (element.children || []).map(cloneElement);
  return copy;
}

function readAgentOptions(workspaces = []) {
  const agents = [{ id: QUIZ_AGENT.id, name: QUIZ_AGENT.name, fields: QUIZ_AGENT.template.fields }];
  for (const workspace of workspaces) {
    for (const subject of workspace.subjects || []) {
      for (const document of subject.documents || []) {
        if (document.sourceType !== "generated" || !(document.tags || []).includes("ai-agent")) continue;
        try {
          const parsed = JSON.parse(String(document.content || "{}"));
          if (Array.isArray(parsed.template?.fields) && parsed.template.fields.length) agents.push({ id: document.id, name: parsed.name || document.name, fields: parsed.template.fields });
        } catch {
          // skip
        }
      }
    }
  }
  return agents;
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function pdfToPages(file) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    const viewport = page.getViewport({ scale: 110 / 72 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    const base = page.getViewport({ scale: 1 });
    pages.push({ src: canvas.toDataURL("image/jpeg", 0.82), widthMm: base.width * 25.4 / 72, heightMm: base.height * 25.4 / 72 });
  }
  return pages;
}

/* ------------------------------------------------------------------ source chooser */
function SourceChooser({ templates, onBlank, onStarter, onUpload, onOpen, busy }) {
  const fileRef = useRef(null);
  return (
    <section className="tw-scope grid gap-4">
      <div className={`${card} p-6`}>
        <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent-ink)]">Template Studio</span>
        <h3 className="m-0 mt-3 text-[26px] font-bold tracking-tight text-ink">Create a template</h3>
        <p className="m-0 mt-1 max-w-2xl text-sm text-soft-ink">A template is a designed document plus the places where the AI writes. Start from your own exam or worksheet — Luna keeps it as a locked background and you add fields on top — or from a blank page.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { key: "blank", title: "Blank canvas", text: "Build your design from zero.", icon: "▭", action: onBlank },
            { key: "pdf", title: "Upload PDF", text: "Each page becomes a locked background.", icon: "⇪", action: () => fileRef.current?.click() },
            { key: "image", title: "Upload image", text: "A scanned page or a design export.", icon: "▣", action: () => fileRef.current?.click() },
            { key: "word", title: "Import Word", text: "Coming soon — export to PDF meanwhile.", icon: "W", disabled: true }
          ].map((item) => (
            <button key={item.key} type="button" disabled={item.disabled || busy} onClick={item.action} className="flex items-start gap-3 rounded-2xl border border-ink/10 bg-white p-4 text-left transition hover:border-[var(--accent)]/50 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] disabled:opacity-50">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-lg font-bold text-[var(--accent-ink)]">{item.icon}</span>
              <span><span className="block text-sm font-bold text-ink">{item.title}</span><span className="block text-xs text-soft-ink">{item.text}</span></span>
            </button>
          ))}
        </div>
        <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = ""; }} />
        {busy ? <p className="m-0 mt-3 text-xs text-[var(--accent-ink)]">Preparing your pages…</p> : null}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className={`${card} p-5`}>
          <p className={kicker}>Start from an example</p>
          <div className="mt-3 grid gap-2">
            <button type="button" onClick={() => onStarter("exam")} className="flex items-center gap-3 rounded-xl border border-ink/10 px-3 py-2.5 text-left transition hover:bg-[var(--surface-soft)]"><span className="grid size-9 place-items-center rounded-lg bg-[var(--surface-soft)]">📝</span><span><span className="block text-sm font-semibold text-ink">Exam</span><span className="block text-xs text-soft-ink">Header, instructions and a Question group that repeats per question across pages.</span></span></button>
            <button type="button" onClick={() => onStarter("flashcards")} className="flex items-center gap-3 rounded-xl border border-ink/10 px-3 py-2.5 text-left transition hover:bg-[var(--surface-soft)]"><span className="grid size-9 place-items-center rounded-lg bg-[var(--surface-soft)]">🃏</span><span><span className="block text-sm font-semibold text-ink">Flashcards</span><span className="block text-xs text-soft-ink">One card page per item — front, back, topic.</span></span></button>
          </div>
        </div>
        <div className={`${card} p-5`}>
          <p className={kicker}>Open a saved template</p>
          <div className="mt-3 grid max-h-56 gap-1 overflow-auto">
            {templates.map((template) => (
              <button key={template.id} type="button" onClick={() => onOpen(template)} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-[var(--surface-soft)]">
                <span className="truncate text-sm font-semibold text-ink">{template.name}</span>
                <span className="shrink-0 text-xs text-soft-ink">{template.docModel ? `${template.docModel.pages?.length || 1} page${(template.docModel.pages?.length || 1) === 1 ? "" : "s"}` : "legacy"} · {(template.dataFields || []).length} fields</span>
              </button>
            ))}
            {!templates.length ? <p className="m-0 text-sm text-soft-ink">No templates yet.</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ canvas element */
function CanvasElement({ element, selectedIds, sampleValues, sampleMode, onPointerDown, onResizeStart, insideGroup = false, scale }) {
  const SCALE = scale;
  const selected = selectedIds.includes(element.id);
  const left = Number(element.x || 0) * SCALE;
  const top = Number(element.y || 0) * SCALE;
  const width = Number(element.w || 0) * SCALE;
  const height = Math.max(2, Number(element.h || 0)) * SCALE;
  const style = element.style || {};
  const textStyle = { fontSize: `${(Number(style.fontSize) || 11) * SCALE * 0.3528}px`, fontWeight: style.fontWeight === "bold" ? 700 : 400, color: style.color || "#1d1d1f", textAlign: style.align || "left", lineHeight: style.lineHeight || 1.35, fontFamily: style.fontFamily === "serif" ? "Georgia, serif" : style.fontFamily === "mono" ? "Menlo, monospace" : "inherit" };

  let body = null;
  if (element.type === "text") body = <div className="whitespace-pre-wrap break-words" style={textStyle}>{element.content}</div>;
  if (element.type === "field") {
    const value = sampleMode ? sampleValues[element.path] : undefined;
    let shown;
    if (element.display === "image") shown = <div className="grid h-full w-full place-items-center rounded border border-dashed border-[var(--accent)]/50 text-[10px] text-[var(--accent-ink)]">image · {element.path || "field"}</div>;
    else if (value !== undefined) {
      const list = Array.isArray(value) ? value : String(value).split("|");
      shown = element.display === "choices" ? list.map((item, index) => `${String.fromCharCode(65 + index)}.  ${item}`).join("\n") : element.display === "list" ? list.map((item) => `•  ${item}`).join("\n") : Array.isArray(value) ? value.join(", ") : String(value);
    } else {
      shown = element.display === "choices" ? `A.  {${element.path || "field"}}\nB.  …` : `{${element.path || "field"}}`;
    }
    body = (
      <div className="relative h-full">
        {sampleMode ? <span className="absolute -top-3.5 left-0 rounded bg-[var(--accent-soft)] px-1 text-[8px] font-semibold text-[var(--accent-ink)]">AI · {element.path || "field"}</span> : null}
        <div className={`whitespace-pre-wrap break-words ${sampleMode ? "" : "rounded bg-[rgba(0,113,227,0.06)] text-[var(--accent-ink)]"}`} style={textStyle}>{shown}</div>
      </div>
    );
  }
  if (element.type === "image") body = element.src ? <img src={element.src} alt="" className="h-full w-full object-contain" draggable={false} /> : <div className="grid h-full w-full place-items-center rounded border border-dashed border-ink/25 text-[10px] text-soft-ink">image</div>;
  if (element.type === "rect") body = <div className="h-full w-full" style={{ background: style.fill || "transparent", border: style.stroke ? `1px solid ${style.stroke}` : "none", borderRadius: `${(style.radius || 0) * SCALE}px` }} />;
  if (element.type === "line") body = <div className="w-full" style={{ borderTop: `${Math.max(1, Number(element.h || 0.5) * SCALE)}px solid ${style.stroke || "#d2d2d7"}` }} />;

  const isGroup = element.type === "group";
  return (
    <div
      data-element-id={element.id}
      onPointerDown={(event) => onPointerDown(event, element, insideGroup)}
      className={`absolute cursor-move select-none ${selected ? "z-20" : "z-10"}`}
      style={{ left, top, width, height: isGroup ? height : undefined, minHeight: isGroup ? undefined : height, outline: selected ? `2px solid ${isGroup ? GROUP_COLOR : "var(--accent)"}` : isGroup ? `1.5px dashed ${GROUP_COLOR}88` : "1px solid transparent", outlineOffset: 1, borderRadius: 2, background: isGroup ? `${GROUP_COLOR}0a` : undefined }}
    >
      {isGroup ? (
        <>
          <span className="absolute -top-5 left-0 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: GROUP_COLOR }}>
            ↻ {element.label || "Group"}{element.repeat?.source ? " · repeat per item" : " · static"}
          </span>
          {(element.children || []).map((child) => (
            <CanvasElement key={child.id} element={child} selectedIds={selectedIds} sampleValues={sampleValues} sampleMode={sampleMode} onPointerDown={onPointerDown} onResizeStart={onResizeStart} insideGroup scale={scale} />
          ))}
        </>
      ) : body}
      {selected ? <span onPointerDown={(event) => onResizeStart(event, element)} className="absolute -bottom-1.5 -right-1.5 size-3 cursor-nwse-resize rounded-sm border border-white" style={{ background: isGroup ? GROUP_COLOR : "var(--accent)" }} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ inspector */
function Inspector({ selection, parent, page, agentFields, onChange, onChangePage, onDelete, onDuplicate, onGroup, onUngroup, onBackground, canGroup }) {
  const bgRef = useRef(null);
  if (!selection) {
    return (
      <div className="grid gap-4 p-5">
        <p className="m-0 text-sm font-bold text-ink">Page</p>
        <div>
          <label className={labelClass}>Background</label>
          {page.background?.src ? (
            <div className="flex items-center gap-2"><img src={page.background.src} alt="" className="h-14 w-10 rounded border border-ink/10 object-cover" /><button type="button" className={ghostBtn} onClick={() => onBackground(null)}>Remove</button></div>
          ) : (
            <button type="button" className={ghostBtn} onClick={() => bgRef.current?.click()}>Upload PDF page / image</button>
          )}
          <input ref={bgRef} type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onBackground(file); event.target.value = ""; }} />
          <p className="m-0 mt-1.5 text-xs text-soft-ink">Locked layer under everything you add.</p>
        </div>
        <div>
          <label className={labelClass}>Page behaviour</label>
          <Segmented value={page.repeat?.source ? "repeat" : "once"} options={[["once", "Once"], ["repeat", "Repeat per item"]]} onChange={(value) => onChangePage({ repeat: value === "repeat" ? { source: "items" } : null })} />
          <p className="m-0 mt-1.5 text-xs text-soft-ink">{page.repeat?.source ? "One copy of this page for every item the agent returns (flashcards, certificates)." : "Groups on this page can still repeat and flow onto extra pages."}</p>
        </div>
        {canGroup ? <button type="button" className={primaryBtn} onClick={onGroup}>Create group from selection</button> : <p className="m-0 text-xs text-soft-ink">Tip: shift-click several elements, then create a repeating group.</p>}
      </div>
    );
  }
  const element = selection;
  const set = (patch) => onChange(element.id, (current) => ({ ...current, ...patch }));
  const setStyle = (patch) => onChange(element.id, (current) => ({ ...current, style: { ...(current.style || {}), ...patch } }));
  const isGroup = element.type === "group";
  const isTextual = ["text", "field"].includes(element.type);
  return (
    <div className="grid gap-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="m-0 text-sm font-bold text-ink">{PALETTE.find((item) => item.type === element.type)?.label || element.type}</p>
        <div className="flex gap-1">
          <button type="button" className={ghostBtn} onClick={onDuplicate} title="Duplicate">⧉</button>
          {isGroup ? <button type="button" className={ghostBtn} onClick={onUngroup}>Ungroup</button> : null}
          <button type="button" className={`${ghostBtn} text-[var(--color-danger)]`} onClick={onDelete}>Delete</button>
        </div>
      </div>
      {parent ? <p className="m-0 rounded-xl px-3 py-2 text-xs" style={{ background: `${GROUP_COLOR}14`, color: GROUP_COLOR }}>Inside “{parent.label || "Group"}” — {parent.repeat?.source ? "appears once per item." : "static group."}</p> : null}

      {element.type === "text" ? <div><label className={labelClass}>Text</label><textarea className={`${fieldClass} min-h-20 resize-y`} value={element.content || ""} onChange={(event) => set({ content: event.target.value })} /></div> : null}

      {element.type === "field" ? (
        <>
          <div>
            <label className={labelClass}>Agent field</label>
            <input list="studio-agent-fields" className={`${fieldClass} font-mono`} value={element.path || ""} onChange={(event) => set({ path: event.target.value.trim() })} placeholder="e.g. question" />
            <datalist id="studio-agent-fields">{agentFields.map((field) => <option key={field.name} value={field.name}>{field.label}</option>)}</datalist>
            <div className="mt-1.5 flex flex-wrap gap-1">{agentFields.slice(0, 8).map((field) => <button key={field.name} type="button" onClick={() => set({ path: field.name, display: field.type === "array" ? (element.display === "list" ? "list" : "choices") : element.display === "image" ? "text" : element.display })} className={`rounded-full px-2 py-0.5 font-mono text-[11px] ${element.path === field.name ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-soft)] text-soft-ink"}`}>{field.name}</button>)}</div>
            <p className="m-0 mt-1.5 text-xs text-soft-ink">Type a new name to create a field the agent must provide.</p>
          </div>
          <div><label className={labelClass}>Show as</label><select className={fieldClass} value={element.display || "text"} onChange={(event) => set({ display: event.target.value })}>{FIELD_DISPLAYS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
          <div><label className={labelClass}>Sample text (design only)</label><input className={fieldClass} value={element.placeholder || ""} onChange={(event) => set({ placeholder: event.target.value })} placeholder={element.display === "choices" || element.display === "list" ? "Option A|Option B|Option C" : "Shown when sample data is on"} /></div>
        </>
      ) : null}

      {element.type === "image" ? <div><label className={labelClass}>Image URL</label><input className={fieldClass} value={element.src || ""} onChange={(event) => set({ src: event.target.value })} placeholder="https://…/logo.png" /></div> : null}

      {isGroup ? (
        <>
          <div><label className={labelClass}>Group name</label><input className={fieldClass} value={element.label || ""} onChange={(event) => set({ label: event.target.value })} placeholder="Question group" /></div>
          <div>
            <label className={labelClass}>Repeat</label>
            <Segmented value={element.repeat?.source ? "item" : "static"} options={[["static", "Static (once)"], ["item", "Once per item"]]} onChange={(value) => set({ repeat: value === "item" ? { source: "items", mode: "flow" } : null })} />
            {element.repeat?.source ? (
              <div className="mt-2 grid gap-2">
                <label className="flex items-center justify-between gap-3 text-sm text-ink"><span>Continue onto next pages</span><input type="checkbox" checked={element.continueOnNextPage !== false} onChange={(event) => set({ continueOnNextPage: event.target.checked })} /></label>
                <div><label className={labelClass}>Space between items (mm)</label><input type="number" min="0" className={fieldClass} value={element.gap ?? 4} onChange={(event) => set({ gap: Number(event.target.value) || 0 })} /></div>
                <p className="m-0 text-xs text-soft-ink">Items flow downwards; when the page is full the header repeats on a new page.</p>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {isTextual ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelClass}>Size (pt)</label><input type="number" min="5" max="72" className={fieldClass} value={element.style?.fontSize ?? 11} onChange={(event) => setStyle({ fontSize: Number(event.target.value) || 11 })} /></div>
            <div><label className={labelClass}>Weight</label><select className={fieldClass} value={element.style?.fontWeight || "normal"} onChange={(event) => setStyle({ fontWeight: event.target.value })}><option value="normal">Regular</option><option value="bold">Bold</option></select></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelClass}>Font</label><select className={fieldClass} value={element.style?.fontFamily || "sans"} onChange={(event) => setStyle({ fontFamily: event.target.value })}><option value="sans">Sans</option><option value="serif">Serif</option><option value="mono">Mono</option></select></div>
            <div><label className={labelClass}>Colour</label><div className="flex items-center gap-2"><input type="color" value={element.style?.color || "#1d1d1f"} onChange={(event) => setStyle({ color: event.target.value })} className="size-9 cursor-pointer rounded-lg border border-ink/15 bg-white p-0.5" /><span className="font-mono text-xs text-soft-ink">{element.style?.color}</span></div></div>
          </div>
          <div><label className={labelClass}>Alignment</label><Segmented value={element.style?.align || "left"} options={[["left", "Left"], ["center", "Centre"], ["right", "Right"]]} onChange={(value) => setStyle({ align: value })} /></div>
        </>
      ) : null}

      {element.type === "rect" || isGroup ? (
        <div className="grid grid-cols-2 gap-2">
          <div><label className={labelClass}>Fill</label><div className="flex items-center gap-2"><input type="color" value={element.style?.fill || "#ffffff"} onChange={(event) => setStyle({ fill: event.target.value })} className="size-9 cursor-pointer rounded-lg border border-ink/15 bg-white p-0.5" /><button type="button" className="text-xs text-soft-ink hover:underline" onClick={() => setStyle({ fill: "" })}>None</button></div></div>
          <div><label className={labelClass}>Border</label><div className="flex items-center gap-2"><input type="color" value={element.style?.stroke || "#d2d2d7"} onChange={(event) => setStyle({ stroke: event.target.value })} className="size-9 cursor-pointer rounded-lg border border-ink/15 bg-white p-0.5" /><button type="button" className="text-xs text-soft-ink hover:underline" onClick={() => setStyle({ stroke: "" })}>None</button></div></div>
        </div>
      ) : null}
      {element.type === "line" ? <div><label className={labelClass}>Colour</label><input type="color" value={element.style?.stroke || "#d2d2d7"} onChange={(event) => setStyle({ stroke: event.target.value })} className="size-9 cursor-pointer rounded-lg border border-ink/15 bg-white p-0.5" /></div> : null}

      <div>
        <label className={labelClass}>Position &amp; size (mm)</label>
        <div className="grid grid-cols-4 gap-1.5">
          {[["x", "X"], ["y", "Y"], ["w", "W"], ["h", "H"]].map(([key, label]) => (
            <label key={key} className="grid gap-0.5 text-[10px] font-semibold text-soft-ink">{label}<input type="number" step="0.5" className={`${fieldBase} w-full px-2 py-1 text-xs`} value={Math.round((Number(element[key]) || 0) * 10) / 10} onChange={(event) => set({ [key]: Number(event.target.value) || 0 })} /></label>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ page */
export function TemplateStudioPage({ toolContext }) {
  const onList = toolContext?.onListDocumentBlockTemplates;
  const onSave = toolContext?.onSaveDocumentBlockTemplate;
  const onDelete = toolContext?.onDeleteDocumentBlockTemplate;
  const agents = useMemo(() => readAgentOptions(toolContext?.workspaces || []), [toolContext?.workspaces]);

  const [mode, setMode] = useState("chooser"); // chooser | editor | advanced
  const [template, setTemplate] = useState(null);
  const [activeTemplateId, setActiveTemplateId] = useState("");
  const [templates, setTemplates] = useState([]);
  const [tab, setTab] = useState("design");
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState([]);
  const [sampleMode, setSampleMode] = useState(false);
  const [sampleCount, setSampleCount] = useState(4);
  const [agentId, setAgentId] = useState(QUIZ_AGENT.id);
  const [previewHtml, setPreviewHtml] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dragRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const [scale, setScale] = useState(MAX_SCALE);
  useEffect(() => {
    const node = canvasWrapRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width - 32;
      const pageWidth = (template?.pageSize?.width || 210);
      setScale(Math.max(1.2, Math.min(MAX_SCALE, width / pageWidth)));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [template?.pageSize?.width, mode, tab]);

  const refreshTemplates = useCallback(async () => {
    if (typeof onList !== "function") return;
    try {
      const list = await onList();
      setTemplates(Array.isArray(list) ? list : []);
    } catch {
      // keep
    }
  }, [onList]);
  useEffect(() => {
    refreshTemplates();
  }, [refreshTemplates]);

  const page = template?.pages?.[pageIndex] || null;
  const size = template?.pageSize || PAGE_SIZES["a4-portrait"];
  const templateFields = useMemo(() => (template ? collectTemplateFields(template) : []), [template]);
  const sampleData = useMemo(() => (template ? buildSampleData(template, sampleCount) : {}), [template, sampleCount]);
  const sampleValues = useMemo(() => ({ ...sampleData, ...(Array.isArray(sampleData.items) ? sampleData.items[0] : {}) }), [sampleData]);
  const agent = agents.find((item) => item.id === agentId) || agents[0];
  const agentFields = agent?.fields || [];
  const selection = selectedIds.length === 1 && page ? findElementIn(page.elements, selectedIds[0]) : { element: null, parent: null };

  const update = (updater) => {
    setTemplate((current) => updater(current));
    setDirty(true);
  };
  const updatePage = (updater) => update((current) => ({ ...current, pages: current.pages.map((item, index) => (index === pageIndex ? updater(item) : item)) }));
  const changeElement = (id, updater) => updatePage((current) => ({ ...current, elements: updateElementIn(current.elements, id, updater) }));

  /* ---------- source actions */
  function openTemplateDoc(doc, id = "") {
    setTemplate(doc);
    setActiveTemplateId(id);
    setPageIndex(0);
    setSelectedIds([]);
    setTab("design");
    setMode("editor");
    setDirty(!id);
    setStatus("");
  }
  async function handleUpload(file, { intoPage = false } = {}) {
    setBusy(true);
    try {
      let pages = [];
      if (file.type === "application/pdf") pages = await pdfToPages(file);
      else {
        const src = await fileToDataUrl(file);
        const dims = await new Promise((resolve) => { const image = new Image(); image.onload = () => resolve({ w: image.width, h: image.height }); image.src = src; });
        pages = [{ src, widthMm: 210, heightMm: Math.round((210 * dims.h) / dims.w) }];
      }
      if (intoPage && template) {
        updatePage((current) => ({ ...current, background: { type: "image", src: pages[0].src } }));
        return;
      }
      const first = pages[0];
      const doc = createTemplate(file.name.replace(/\.[^.]+$/, ""), "a4-portrait");
      doc.format = Math.abs(first.widthMm - 210) < 2 && Math.abs(first.heightMm - 297) < 2 ? "a4-portrait" : "custom";
      doc.pageSize = { width: Math.round(first.widthMm), height: Math.round(first.heightMm) };
      doc.pages = pages.map((item) => createPage({ background: { type: "image", src: item.src } }));
      openTemplateDoc(doc);
      setStatus(`${pages.length} page${pages.length === 1 ? "" : "s"} imported as locked backgrounds. Add fields on top.`);
    } catch (error) {
      setStatus(String(error.message || error));
    } finally {
      setBusy(false);
    }
  }
  function openSaved(saved) {
    if (saved.docModel) {
      openTemplateDoc({ ...saved.docModel, name: saved.name || saved.docModel.name }, saved.id);
      return;
    }
    // Legacy templates: place their field tags in a repeating group so nothing is lost.
    const format = saved.pageFormat && PAGE_SIZES[saved.pageFormat] ? saved.pageFormat : "a4-portrait";
    const doc = createTemplate(saved.name || "Imported template", format);
    const width = PAGE_SIZES[format].width;
    const fields = saved.dataFields || [];
    const group = createElement("group", { label: "Imported group", x: PAGE_MARGIN_MM, y: 30, w: width - PAGE_MARGIN_MM * 2, h: Math.max(20, fields.length * 9 + 4), repeat: { source: "items", mode: "flow" }, children: fields.map((field, index) => createElement("field", { x: 0, y: index * 9, w: width - PAGE_MARGIN_MM * 2 - 4, h: 8, path: field.name, display: field.dataType === "array" ? "list" : "text" })) });
    doc.pages[0].elements = [createElement("text", { x: PAGE_MARGIN_MM, y: 14, w: 150, h: 10, content: saved.name || "Title", style: { fontSize: 18, fontWeight: "bold", color: "#1d1d1f", align: "left", fontFamily: "sans", lineHeight: 1.3 } }), group];
    openTemplateDoc(doc, saved.id);
    setStatus("This template was made with the old editor — its fields were placed in a group for you to arrange.");
  }

  /* ---------- canvas interactions */
  function onPointerDown(event, element) {
    event.stopPropagation();
    const ids = event.shiftKey ? (selectedIds.includes(element.id) ? selectedIds.filter((id) => id !== element.id) : [...selectedIds, element.id]) : selectedIds.includes(element.id) ? selectedIds : [element.id];
    setSelectedIds(ids);
    const starts = {};
    for (const id of ids) {
      const found = findElementIn(page.elements, id);
      if (found.element) starts[id] = { x: Number(found.element.x || 0), y: Number(found.element.y || 0) };
    }
    dragRef.current = { kind: "move", ids, startX: event.clientX, startY: event.clientY, starts, moved: false };
  }
  function onResizeStart(event, element) {
    event.stopPropagation();
    dragRef.current = { kind: "resize", id: element.id, startX: event.clientX, startY: event.clientY, w: Number(element.w || 0), h: Number(element.h || 0) };
  }
  function onPointerMove(event) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (event.clientX - drag.startX) / scale;
    const dy = (event.clientY - drag.startY) / scale;
    if (drag.kind === "move") {
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && !drag.moved) return;
      drag.moved = true;
      updatePage((current) => {
        let elements = current.elements;
        for (const id of drag.ids) {
          const start = drag.starts[id];
          if (!start) continue;
          elements = updateElementIn(elements, id, (item) => ({ ...item, x: Math.round((start.x + dx) * 2) / 2, y: Math.round((start.y + dy) * 2) / 2 }));
        }
        return { ...current, elements };
      });
    } else {
      changeElement(drag.id, (item) => ({ ...item, w: Math.max(4, Math.round((drag.w + dx) * 2) / 2), h: Math.max(item.type === "line" ? 0.3 : 3, Math.round((drag.h + dy) * 2) / 2) }));
    }
  }
  function onPointerUp() {
    dragRef.current = null;
  }
  useEffect(() => {
    function onKey(event) {
      if (mode !== "editor" || tab !== "design") return;
      if ((event.key === "Delete" || event.key === "Backspace") && selectedIds.length && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
        event.preventDefault();
        deleteSelected();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function addElement(type) {
    const target = selection.element?.type === "group" ? selection.element : selection.parent;
    const element = createElement(type, target ? { x: 4, y: Math.max(2, Number(target.h || 0) - 10) } : { x: PAGE_MARGIN_MM, y: PAGE_MARGIN_MM + 8 });
    if (type === "field" && agentFields.length) {
      const unused = agentFields.find((field) => !templateFields.some((item) => item.name === field.name)) || agentFields[0];
      element.path = unused.name;
      element.display = unused.type === "array" ? "choices" : "text";
      element.w = target ? Math.max(40, Number(target.w || 0) - 8) : 120;
    }
    if (type === "group") element.repeat = { source: "items", mode: "flow" };
    if (target && type !== "group") changeElement(target.id, (group) => ({ ...group, children: [...(group.children || []), element] }));
    else updatePage((current) => ({ ...current, elements: [...current.elements, element] }));
    setSelectedIds([element.id]);
  }
  function deleteSelected() {
    updatePage((current) => ({ ...current, elements: selectedIds.reduce((elements, id) => removeElementIn(elements, id), current.elements) }));
    setSelectedIds([]);
  }
  function duplicateSelected() {
    if (!selection.element) return;
    const copy = cloneElement(selection.element);
    copy.x += 4;
    copy.y += 4;
    if (selection.parent) changeElement(selection.parent.id, (group) => ({ ...group, children: [...(group.children || []), copy] }));
    else updatePage((current) => ({ ...current, elements: [...current.elements, copy] }));
    setSelectedIds([copy.id]);
  }
  function groupSelection() {
    const picked = page.elements.filter((element) => selectedIds.includes(element.id));
    if (picked.length < 1) return;
    const minX = Math.min(...picked.map((item) => Number(item.x || 0)));
    const minY = Math.min(...picked.map((item) => Number(item.y || 0)));
    const maxX = Math.max(...picked.map((item) => Number(item.x || 0) + Number(item.w || 0)));
    const maxY = Math.max(...picked.map((item) => Number(item.y || 0) + Number(item.h || 0)));
    const group = createElement("group", { label: "Question group", x: minX - 2, y: minY - 2, w: maxX - minX + 4, h: maxY - minY + 4, repeat: { source: "items", mode: "flow" }, children: picked.map((item) => ({ ...item, x: Number(item.x || 0) - minX + 2, y: Number(item.y || 0) - minY + 2 })) });
    updatePage((current) => ({ ...current, elements: [...current.elements.filter((element) => !selectedIds.includes(element.id)), group] }));
    setSelectedIds([group.id]);
  }
  function ungroupSelection() {
    const group = selection.element;
    if (!group || group.type !== "group") return;
    const children = (group.children || []).map((child) => ({ ...child, x: Number(child.x || 0) + Number(group.x || 0), y: Number(child.y || 0) + Number(group.y || 0) }));
    updatePage((current) => ({ ...current, elements: [...current.elements.filter((element) => element.id !== group.id), ...children] }));
    setSelectedIds(children.map((child) => child.id));
  }

  /* ---------- pages */
  function addPage() {
    update((current) => ({ ...current, pages: [...current.pages, createPage()] }));
    setPageIndex(template.pages.length);
    setSelectedIds([]);
  }
  function removePage(index) {
    if (template.pages.length <= 1) return;
    update((current) => ({ ...current, pages: current.pages.filter((_, i) => i !== index) }));
    setPageIndex(Math.max(0, index - 1));
  }

  /* ---------- compiled template (what agents and the renderer consume) */
  const compiled = useMemo(() => {
    if (!template) return null;
    return {
      id: activeTemplateId || createId("tpl"),
      name: template.name,
      pageFormat: template.format === "custom" ? "custom" : template.format,
      customPageSize: template.pageSize,
      containerClass: "luna-doc",
      css: "",
      blockClasses: {},
      blockHtmlTemplates: {},
      blockFormats: {},
      components: [],
      canvasBlocks: [],
      pageLayouts: [],
      dataBindings: {},
      dataFields: templateFields.map((field) => ({ id: `field-${field.name}`, name: field.name, label: field.name, dataType: field.isList ? "array" : "string", repeatScope: field.perItem ? "per-output" : "once" })),
      repeatCollectionField: templateFields.some((field) => field.perItem) ? "items" : "",
      renderVariants: [],
      formatSets: [],
      docModel: template
    };
  }, [template, templateFields, activeTemplateId]);

  useEffect(() => {
    if (!compiled || (tab !== "data" && tab !== "export")) return undefined;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/templates/render-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template: compiled, sampleData, format: "html" }) });
        const payload = await response.json();
        setPreviewHtml(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#e9e9ee;}body{padding:10mm;}</style></head><body>${payload.html || ""}</body></html>`);
      } catch (error) {
        setStatus(String(error.message || error));
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [compiled, sampleData, tab]);

  async function exportAs(format) {
    if (!compiled) return;
    setBusy(true);
    try {
      const response = await fetch("/api/templates/render-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template: compiled, sampleData, format }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Export failed");
      const blob = format === "html"
        ? new Blob([`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff">${payload.html}</body></html>`], { type: "text/html" })
        : new Blob([Uint8Array.from(atob(payload.fileBase64), (char) => char.charCodeAt(0))], { type: payload.mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${template.name || "template"}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setStatus(String(error.message || error));
    } finally {
      setBusy(false);
    }
  }
  async function handleSave() {
    if (!compiled || typeof onSave !== "function") return;
    setBusy(true);
    try {
      const saved = await onSave(compiled);
      setActiveTemplateId(saved?.template?.id || compiled.id);
      setDirty(false);
      setStatus(`Saved “${compiled.name}” — available in every agent's Configure output step.`);
      if (Array.isArray(saved?.templates)) setTemplates(saved.templates);
      else refreshTemplates();
    } catch (error) {
      setStatus(String(error.message || error));
    } finally {
      setBusy(false);
    }
  }
  async function handleDeleteTemplate() {
    if (!activeTemplateId || typeof onDelete !== "function") return;
    try {
      const list = await onDelete(activeTemplateId);
      setTemplates(Array.isArray(list) ? list : []);
      setMode("chooser");
      setTemplate(null);
      setActiveTemplateId("");
    } catch (error) {
      setStatus(String(error.message || error));
    }
  }

  /* ---------- render */
  if (mode === "advanced") {
    return (
      <div className="grid gap-3">
        <div className="tw-scope flex items-center justify-between rounded-2xl border border-ink/8 bg-white px-4 py-2 text-sm"><span className="text-soft-ink">Advanced (legacy) editor.</span><button type="button" className={ghostBtn} onClick={() => setMode(template ? "editor" : "chooser")}>← Back to Template Studio</button></div>
        <TemplateBuilderPage toolContext={toolContext} />
      </div>
    );
  }
  if (mode === "chooser" || !template || !page) {
    return <SourceChooser templates={templates} busy={busy} onBlank={() => openTemplateDoc(createTemplate())} onStarter={(kind) => openTemplateDoc(kind === "exam" ? createExamStarter() : createFlashcardStarter())} onUpload={handleUpload} onOpen={openSaved} />;
  }

  const BUILT_IN_FIELDS = ["number"]; // provided by the layout engine (item index)
  const mapping = agentFields.map((field) => ({ field, target: templateFields.find((item) => item.name === field.name) || null }));
  const builtInUsed = templateFields.filter((field) => BUILT_IN_FIELDS.includes(field.name));
  const unmatchedTemplateFields = templateFields.filter((field) => !agentFields.some((item) => item.name === field.name) && !BUILT_IN_FIELDS.includes(field.name));

  return (
    <section className="tw-scope grid gap-3" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      {/* Toolbar */}
      <div className={`${card} flex flex-wrap items-center gap-2 px-4 py-2.5`}>
        <button type="button" className={ghostBtn} onClick={() => setMode("chooser")} title="Back to templates">‹</button>
        <input className={`${fieldBase} min-w-48 font-semibold`} value={template.name} onChange={(event) => update((current) => ({ ...current, name: event.target.value }))} aria-label="Template name" />
        <select className={fieldBase} value={template.format} onChange={(event) => update((current) => ({ ...current, format: event.target.value, pageSize: PAGE_SIZES[event.target.value] ? { ...PAGE_SIZES[event.target.value] } : current.pageSize }))} aria-label="Page format">
          {Object.entries(PAGE_SIZES).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
          {template.format === "custom" ? <option value="custom">Custom ({template.pageSize.width}×{template.pageSize.height} mm)</option> : null}
        </select>
        <div className="mx-auto"><Segmented size="md" value={tab} options={[["design", "Design"], ["data", "Data"], ["export", "Export"]]} onChange={setTab} /></div>
        {tab === "design" ? <label className="flex items-center gap-2 text-xs font-semibold text-ink"><input type="checkbox" checked={sampleMode} onChange={(event) => setSampleMode(event.target.checked)} />Design with sample data</label> : null}
        {activeTemplateId ? <button type="button" className={`${ghostBtn} text-[var(--color-danger)]`} onClick={handleDeleteTemplate}>Delete</button> : null}
        <button type="button" className="text-xs font-semibold text-soft-ink hover:underline" onClick={() => setMode("advanced")}>Advanced</button>
        <button type="button" className={primaryBtn} onClick={handleSave} disabled={busy || typeof onSave !== "function"}>{busy ? "Working…" : dirty ? "Save template" : "Saved"}</button>
      </div>
      {status ? <p className="m-0 px-1 text-xs text-[var(--accent-ink)]">{status}</p> : null}

      {tab === "design" ? (
        <div className="grid items-start gap-3 lg:grid-cols-[190px_minmax(0,1fr)_300px]">
          {/* Pages + blocks */}
          <aside className="grid gap-3">
            <div className={`${card} p-3`}>
              <p className={`${kicker} px-1`}>Pages</p>
              <div className="mt-2 grid gap-2">
                {template.pages.map((item, index) => (
                  <div key={item.id} role="button" tabIndex={0} onClick={() => { setPageIndex(index); setSelectedIds([]); }} onKeyDown={(event) => event.key === "Enter" && setPageIndex(index)} className={`relative cursor-pointer overflow-hidden rounded-xl border p-1.5 text-left transition ${index === pageIndex ? "border-[var(--accent)] ring-4 ring-[var(--accent-soft)]" : "border-ink/10 hover:border-ink/25"}`}>
                    <div className="relative mx-auto overflow-hidden rounded bg-white" style={{ width: 120, height: Math.round((120 * size.height) / size.width), backgroundImage: item.background?.src ? `url(${item.background.src})` : "none", backgroundSize: "100% 100%" }}>
                      {(item.elements || []).map((element) => <span key={element.id} className="absolute rounded-[1px]" style={{ left: `${(Number(element.x || 0) / size.width) * 100}%`, top: `${(Number(element.y || 0) / size.height) * 100}%`, width: `${(Number(element.w || 0) / size.width) * 100}%`, height: `${Math.max(1.5, (Number(element.h || 0) / size.height) * 100)}%`, background: element.type === "group" ? `${GROUP_COLOR}33` : element.type === "field" ? "rgba(0,113,227,0.35)" : "rgba(0,0,0,0.15)" }} />)}
                    </div>
                    <p className="m-0 mt-1 flex items-center justify-between text-[11px] font-semibold text-ink"><span>Page {index + 1}</span>{item.repeat?.source ? <span className="rounded bg-[var(--accent-soft)] px-1 text-[9px] text-[var(--accent-ink)]">per item</span> : null}</p>
                    {template.pages.length > 1 ? <button type="button" onClick={(event) => { event.stopPropagation(); removePage(index); }} className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-white/90 text-[10px] text-soft-ink shadow hover:text-[var(--color-danger)]" aria-label="Remove page">✕</button> : null}
                  </div>
                ))}
                <button type="button" className={ghostBtn} onClick={addPage}>＋ Add page</button>
              </div>
            </div>
            <div className={`${card} p-3`}>
              <p className={`${kicker} px-1`}>Add</p>
              <div className="mt-2 grid grid-cols-2 gap-1">
                {PALETTE.map((item) => (
                  <button key={item.type} type="button" onClick={() => addElement(item.type)} title={item.hint} className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-center transition hover:bg-[var(--surface-soft)] ${item.type === "field" || item.type === "group" ? "text-[var(--accent-ink)]" : "text-ink"}`}>
                    <span className="grid size-8 place-items-center rounded-lg bg-[var(--surface-soft)] text-sm font-bold">{item.icon}</span>
                    <span className="text-[11px] font-semibold">{item.label}</span>
                  </button>
                ))}
              </div>
              {selectedIds.length > 1 ? <button type="button" className={`${primaryBtn} mt-2 w-full`} onClick={groupSelection}>Group {selectedIds.length} elements</button> : null}
            </div>
          </aside>

          {/* Canvas */}
          <div ref={canvasWrapRef} className={`${card} overflow-auto p-4`} style={{ background: "#e9e9ee", minHeight: 620 }}>
            <div className="mb-2 flex items-center justify-between text-[11px] text-soft-ink"><span>Page {pageIndex + 1} of {template.pages.length} · {size.width}×{size.height} mm</span><span>Drag to move · corner handle to resize · shift-click to multi-select · Delete key removes</span></div>
            <div
              onPointerDown={() => setSelectedIds([])}
              className="relative mx-auto bg-white shadow-[0_2px_16px_rgba(0,0,0,0.15)]"
              style={{ width: size.width * scale, height: size.height * scale, backgroundImage: page.background?.src ? `url(${page.background.src})` : "none", backgroundSize: "100% 100%" }}
            >
              {page.repeat?.source ? <span className="absolute left-2 top-2 z-30 rounded-md bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-bold text-white">↻ Page repeats per item</span> : null}
              {page.elements.map((element) => (
                <CanvasElement key={element.id} element={element} selectedIds={selectedIds} sampleValues={sampleValues} sampleMode={sampleMode} onPointerDown={onPointerDown} onResizeStart={onResizeStart} scale={scale} />
              ))}
            </div>
          </div>

          {/* Inspector */}
          <aside className={`${card} min-h-[620px]`}>
            <Inspector
              selection={selection.element}
              parent={selection.parent}
              page={page}
              agentFields={agentFields}
              onChange={changeElement}
              onChangePage={(patch) => updatePage((current) => ({ ...current, ...patch }))}
              onDelete={deleteSelected}
              onDuplicate={duplicateSelected}
              onGroup={groupSelection}
              onUngroup={ungroupSelection}
              onBackground={(file) => (file ? handleUpload(file, { intoPage: true }) : updatePage((current) => ({ ...current, background: null })))}
              canGroup={selectedIds.length > 0}
            />
          </aside>
        </div>
      ) : null}

      {tab === "data" ? (
        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="grid gap-3">
            <section className={`${card} p-5`}>
              <p className={kicker}>AI agent</p>
              <select className={`${fieldClass} mt-2`} value={agent?.id || ""} onChange={(event) => setAgentId(event.target.value)}>{agents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              <p className="m-0 mt-1.5 text-xs text-soft-ink">Choose the agent this template is designed for. Fields with the same name connect automatically.</p>
            </section>
            <section className={`${card} p-5`}>
              <p className={kicker}>Mapping</p>
              <table className="mt-2 w-full border-collapse text-sm">
                <thead><tr className="text-left text-[11px] uppercase tracking-wider text-soft-ink"><th className="py-1.5 font-semibold">Agent output</th><th className="py-1.5 font-semibold">Template field</th><th className="py-1.5 font-semibold">Repeats</th></tr></thead>
                <tbody className="divide-y divide-ink/6">
                  {mapping.map(({ field, target }) => (
                    <tr key={field.name}>
                      <td className="py-2 font-mono text-xs text-ink">{field.name}{field.type === "array" ? "[]" : ""}</td>
                      <td className="py-2">{target ? <span className="rounded-md bg-[var(--accent-soft)] px-1.5 py-0.5 font-mono text-xs text-[var(--accent-ink)]">{`{{${target.name}}}`}</span> : <span className="text-xs text-soft-ink">not used in template</span>}</td>
                      <td className="py-2 text-xs text-soft-ink">{target ? (target.perItem ? "per item" : "once") : "—"}</td>
                    </tr>
                  ))}
                  {builtInUsed.map((field) => (
                    <tr key={`b-${field.name}`}><td className="py-2 text-xs text-soft-ink">automatic (item number)</td><td className="py-2"><span className="rounded-md bg-[var(--accent-soft)] px-1.5 py-0.5 font-mono text-xs text-[var(--accent-ink)]">{`{{${field.name}}}`}</span></td><td className="py-2 text-xs text-soft-ink">per item</td></tr>
                  ))}
                  {unmatchedTemplateFields.map((field) => (
                    <tr key={`t-${field.name}`}><td className="py-2 text-xs text-[var(--color-warn)]">missing from agent</td><td className="py-2"><span className="rounded-md bg-[rgba(178,94,0,0.1)] px-1.5 py-0.5 font-mono text-xs text-[var(--color-warn)]">{`{{${field.name}}}`}</span></td><td className="py-2 text-xs text-soft-ink">{field.perItem ? "per item" : "once"}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="m-0 mt-3 text-xs text-soft-ink">{unmatchedTemplateFields.length ? "Rename the highlighted fields to match the agent, or add those outputs to the agent." : "Every template field is provided by this agent."}</p>
            </section>
            <section className={`${card} p-5`}>
              <p className={kicker}>Preview data</p>
              <div className="mt-2 flex items-center gap-2 text-sm text-ink">Generate <input type="number" min="1" max="60" className={`${fieldBase} w-20 px-2 py-1 text-sm`} value={sampleCount} onChange={(event) => setSampleCount(Math.max(1, Math.min(60, Number(event.target.value) || 1)))} /> sample items</div>
              <pre className="mt-2 max-h-56 overflow-auto rounded-xl bg-[var(--surface-soft)] p-3 font-mono text-[11px] leading-relaxed text-ink">{JSON.stringify(sampleData, null, 2)}</pre>
            </section>
          </div>
          <div className={`${card} overflow-hidden`}><div className="border-b border-ink/8 px-4 py-2.5"><p className={kicker}>Result with {sampleCount} items — pages are created automatically</p></div><iframe title="Data preview" sandbox="" srcDoc={previewHtml} className="h-[720px] w-full border-0" /></div>
        </div>
      ) : null}

      {tab === "export" ? (
        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="grid gap-3">
            <section className={`${card} p-5`}>
              <p className={kicker}>Export with sample data</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[["pdf", "PDF", "Print-ready"], ["docx", "Word", "Editable text"], ["pptx", "PowerPoint", "One slide per page"], ["html", "HTML", "Any browser"]].map(([format, label, hint]) => (
                  <button key={format} type="button" disabled={busy} onClick={() => exportAs(format)} className="rounded-2xl border border-ink/10 bg-white p-4 text-left transition hover:border-[var(--accent)]/50 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] disabled:opacity-50"><span className="block text-base font-bold text-ink">{label}</span><span className="block text-xs text-soft-ink">{hint}</span></button>
                ))}
              </div>
              <p className="m-0 mt-3 text-xs text-soft-ink">Real documents come from the agents: run one, pick this template in Configure output, and export there in the same formats.</p>
            </section>
            <section className={`${card} p-5`}>
              <p className={kicker}>Save</p>
              <button type="button" className={`${primaryBtn} mt-3`} onClick={handleSave} disabled={busy}>{dirty ? "Save template" : "Saved"}</button>
            </section>
          </div>
          <div className={`${card} overflow-hidden`}><div className="border-b border-ink/8 px-4 py-2.5"><p className={kicker}>Preview</p></div><iframe title="Export preview" sandbox="" srcDoc={previewHtml} className="h-[720px] w-full border-0" /></div>
        </div>
      ) : null}
    </section>
  );
}
