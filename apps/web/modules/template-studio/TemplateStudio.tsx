"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./components";
import type { Template } from "./engine/types";
import { CANVAS_PRESETS, createExamStarter, createFlashcardStarter, createPage, createTemplate } from "./engine/model";
import { migrateToV3, normalizeTemplate } from "./engine/migrate";
import { buildSampleData } from "./engine/sample";
import { useTemplateStore } from "./state/useTemplateStore";
import { compileForSave } from "./adapters/agentTemplate";
import { importPages } from "./pdfImport";
import { SourceChooser, type SavedTemplateRow } from "./SourceChooser";
import { StudioShell } from "./StudioShell";
import { DesignMode } from "./design/DesignMode";
import { ViewsMode } from "./views/ViewsMode";
import { PublishBlockDialog, type BlockListingInput } from "./design/PublishBlockDialog";
import type { BlockDef } from "./engine/blocks";
import { readListings, writeListings } from "../agent-marketplace/listings";
import { DataMode, type AgentOption } from "./data/DataMode";
import { PreviewMode } from "./preview/PreviewMode";
import { ExportMode } from "./export/ExportMode";
import { QUIZ_AGENT } from "../ai-tools/tools/quiz-generator/quizAgent";

interface ToolContext {
  openTemplateId?: string;
  workspaces?: any[];
  onListDocumentBlockTemplates?: () => Promise<SavedTemplateRow[]>;
  onSaveDocumentBlockTemplate?: (payload: unknown) => Promise<{ template?: { id?: string }; templates?: SavedTemplateRow[] }>;
  onDeleteDocumentBlockTemplate?: (id: string) => Promise<SavedTemplateRow[]>;
}

function readAgents(workspaces: any[] = []): AgentOption[] {
  const agents: AgentOption[] = [{ id: QUIZ_AGENT.id, name: QUIZ_AGENT.name, fields: QUIZ_AGENT.template.fields }];
  for (const workspace of workspaces) for (const subject of workspace.subjects || []) for (const document of subject.documents || []) {
    if (document.sourceType !== "generated" || !(document.tags || []).includes("ai-agent")) continue;
    try {
      const parsed = JSON.parse(String(document.content || "{}"));
      if (Array.isArray(parsed.template?.fields) && parsed.template.fields.length) agents.push({ id: document.id, name: parsed.name || document.name, fields: parsed.template.fields });
    } catch { /* unreadable agent */ }
  }
  return agents;
}

/** Template Studio v3 entry. Registered as the "template-builder" AI tool. */
export function TemplateStudio({ toolContext }: { toolContext?: ToolContext }) {
  const store = useTemplateStore();
  const { state, layout, view } = store;
  const [rows, setRows] = useState<SavedTemplateRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [sampleCount, setSampleCount] = useState(4);
  const agents = useMemo(() => readAgents(toolContext?.workspaces), [toolContext?.workspaces]);

  // AppShell recreates toolContext on every render; keep the latest handlers in a ref so effects run once.
  const contextRef = useRef(toolContext);
  contextRef.current = toolContext;
  const refresh = useCallback(async () => {
    const list = contextRef.current?.onListDocumentBlockTemplates;
    if (typeof list !== "function") return;
    try { setRows(await list()); } catch { /* keep */ }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  // The list handler can arrive after mount (AppShell wiring); retry once it exists or when the tab is shown again.
  const hasList = typeof toolContext?.onListDocumentBlockTemplates === "function";
  useEffect(() => { if (hasList && !rows.length) refresh(); }, [hasList, rows.length, refresh]);

  const template = state.template;
  const sampleData = useMemo(() => (template ? buildSampleData(template, sampleCount) : {}), [template, sampleCount]);
  const sampleValues = useMemo(() => {
    // Field id → sample value for the canvas (first item of each array flattened in).
    const values: Record<string, unknown> = {};
    if (!template) return values;
    const walk = (fields: Template["fields"], data: any) => {
      for (const fieldDef of fields) {
        const key = Object.keys(data || {}).find((k) => k.toLowerCase().replace(/[^a-z0-9]+/g, "_") === fieldDef.name.toLowerCase().replace(/[^a-z0-9]+/g, "_"));
        const value = key ? data[key] : undefined;
        if (fieldDef.type === "array") { const first = Array.isArray(value) ? value[0] : undefined; const item = fieldDef.children?.[0]; if (item?.type === "object") walk(item.children || [], first); else if (item) values[item.id] = first; values[fieldDef.id] = value; continue; }
        if (fieldDef.type === "object") { walk(fieldDef.children || [], value); continue; }
        values[fieldDef.id] = value;
      }
    };
    walk(template.fields, sampleData);
    return values;
  }, [template, sampleData]);
  const [folderId, setFolderId] = useState("");
  const compiled = useMemo(() => (template ? { ...compileForSave(template, state.savedId), folderId: folderId || "tpl-folder-root" } : null), [template, state.savedId, folderId]);
  const openedRef = useRef("");
  useEffect(() => {
    const id = toolContext?.openTemplateId;
    if (!id || openedRef.current === id || !rows.length) return;
    const row = rows.find((item) => item.id === id);
    if (row) { openedRef.current = id; openRow(row); }
  });
  async function moveToFolder(row: SavedTemplateRow, folder: string) {
    const saveHandler = contextRef.current?.onSaveDocumentBlockTemplate;
    if (typeof saveHandler !== "function") return;
    try {
      const saved = await saveHandler({ ...(row as any), folderId: folder || "tpl-folder-root" });
      if (Array.isArray(saved?.templates)) setRows(saved.templates); else refresh();
    } catch (error) { setStatus(String((error as Error).message || error)); }
  }

  /* ---------- open / create */
  function openRow(row: SavedTemplateRow) {
    const migrated = normalizeTemplate(migrateToV3(row));
    setFolderId(row.folderId && row.folderId !== "tpl-folder-root" ? row.folderId : "");
    store.open(migrated, row.id);
    setStatus(row.templateV3 ? "" : "Upgraded from the previous editor — check the layout, then save.");
  }
  async function upload(file: File) {
    setBusy(true);
    try {
      const pages = await importPages(file);
      const created = createTemplate(file.name.replace(/\.[^.]+$/, ""));
      const first = pages[0];
      const preset = Object.entries(CANVAS_PRESETS).find(([, spec]) => Math.abs(spec.canvas.width - first.widthMm) < 2 && Math.abs(spec.canvas.height - first.heightMm) < 2);
      created.layouts[0].canvas = preset ? { ...preset[1].canvas } : { width: Math.round(first.widthMm), height: Math.round(first.heightMm), unit: "mm" };
      created.layouts[0].pages = pages.map((item, index) => createPage({ background: { type: file.type === "application/pdf" ? "pdf" : "image", src: item.src, sourcePage: index + 1, locked: true, visible: true, opacity: 1 } }));
      store.open(created);
      setStatus(`${pages.length} page${pages.length === 1 ? "" : "s"} imported as locked backgrounds.`);
    } catch (error) {
      setStatus(String((error as Error).message || error));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    const saveHandler = contextRef.current?.onSaveDocumentBlockTemplate;
    if (!compiled || typeof saveHandler !== "function") return;
    setBusy(true);
    try {
      const saved = await saveHandler(compiled);
      store.dispatch({ type: "saved", id: saved?.template?.id || compiled.id });
      setStatus(`Saved “${compiled.name}”.`);
      if (Array.isArray(saved?.templates)) setRows(saved.templates); else refresh();
    } catch (error) {
      setStatus(String((error as Error).message || error));
    } finally {
      setBusy(false);
    }
  }
  async function deleteRow(row: SavedTemplateRow) {
    const deleteHandler = contextRef.current?.onDeleteDocumentBlockTemplate;
    if (typeof deleteHandler !== "function") return;
    try { const next = await deleteHandler(row.id); if (Array.isArray(next)) setRows(next); else refresh(); setStatus(`Deleted “${row.name}”.`); } catch (error) { setStatus(String((error as Error).message || error)); }
  }
  async function remove() {
    const deleteHandler = contextRef.current?.onDeleteDocumentBlockTemplate;
    if (!state.savedId || typeof deleteHandler !== "function") return;
    try { setRows(await deleteHandler(state.savedId)); store.close(); } catch (error) { setStatus(String((error as Error).message || error)); }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!template || state.mode !== "design") return;
      const editing = ["INPUT", "TEXTAREA", "SELECT"].includes((document.activeElement as HTMLElement)?.tagName);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") { event.preventDefault(); store.dispatch({ type: event.shiftKey ? "redo" : "undo" }); }
      if ((event.key === "Delete" || event.key === "Backspace") && state.selection.length && !editing) { event.preventDefault(); store.deleteElements(state.selection); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const [publishBlock, setPublishBlock] = useState<BlockDef | null>(null);
  const existingBlockListing = useMemo<BlockListingInput | null>(() => {
    if (!publishBlock) return null;
    const found = readListings().find((listing) => listing.kind === "block" && listing.block?.id === publishBlock.id);
    return found ? { price: Number(found.price || 0), pricingType: String(found.pricingType || "one-time"), accent: String(found.accent || "") } : null;
  }, [publishBlock]);
  function confirmPublishBlock(values: BlockListingInput) {
    if (!publishBlock) return;
    const listings = readListings();
    const current = listings.find((listing) => listing.kind === "block" && listing.block?.id === publishBlock.id);
    const listing = {
      ...(current || { id: `listing-block-${publishBlock.id}`, createdAt: new Date().toISOString() }),
      kind: "block",
      name: publishBlock.name,
      description: publishBlock.description,
      author: "You",
      category: "Community",
      price: values.price,
      pricingType: values.pricingType,
      accent: values.accent,
      block: { ...publishBlock, builtIn: false },
      updatedAt: new Date().toISOString()
    };
    writeListings(current ? listings.map((item) => (item.id === current.id ? listing : item)) : [...listings, listing]);
    setPublishBlock(null);
    setStatus(current ? `Listing for “${publishBlock.name}” updated.` : `“${publishBlock.name}” is now in the Marketplace.`);
  }

  if (!template || !layout) {
    return <SourceChooser templates={rows} busy={busy} agents={agents} onDelete={deleteRow} onBlank={() => store.open(createTemplate())} onStarter={(kind) => store.open(kind === "exam" ? createExamStarter() : createFlashcardStarter())} onUpload={upload} onOpen={openRow} onMoveToFolder={moveToFolder} />;
  }

  return (
    <section className="tw-scope grid gap-3">
      <StudioShell store={store} busy={busy} status={status} onSave={save} onDelete={remove} onBack={store.close} />
      {state.mode === "design" ? <DesignMode store={store} sampleValues={sampleValues} onPublishBlock={setPublishBlock} /> : null}
      {publishBlock ? <PublishBlockDialog block={publishBlock} existing={existingBlockListing} onClose={() => setPublishBlock(null)} onConfirm={confirmPublishBlock} /> : null}
      {state.mode === "views" ? <ViewsMode store={store} template={template} sampleData={sampleData} /> : null}
      {state.mode === "data" ? <DataMode template={template} agents={agents} sampleValues={sampleValues} onChangeTemplate={store.update} /> : null}
      {state.mode === "preview" ? <PreviewMode template={template} layoutId={layout.id} viewId={view?.id || ""} sampleData={sampleData} sampleCount={sampleCount} onSampleCount={setSampleCount} compiled={compiled} /> : null}
      {state.mode === "export" ? <ExportMode layout={layout} view={view} fields={template.fields} compiled={compiled} sampleData={sampleData} layoutId={layout.id} viewId={view?.id || ""} name={template.name} dirty={state.dirty} onSave={save} busy={busy} /> : null}
    </section>
  );
}
