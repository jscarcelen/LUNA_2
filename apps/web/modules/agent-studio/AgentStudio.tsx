"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentSpec } from "./engine/types";
import { createAgentSpec, createVocabularyFlashcardsSpec, createQuizSpec, primaryCollection, collectionFields } from "./engine/model";
import { runConfigFromSpec, specFromLegacy } from "./engine/migrate";
import { useAgentStore, type Step } from "./state/useAgentStore";
import { PurposeStep } from "./steps/PurposeStep";
import { InputSchemaBuilder } from "./steps/InputSchemaBuilder";
import { ContextBuilder } from "./steps/ContextBuilder";
import { OutputSchemaBuilder } from "./steps/OutputSchemaBuilder";
import { OutputComposer } from "./steps/OutputComposer";
import { GeneratedTemplate } from "./steps/GeneratedTemplate";
import { TestStep } from "./test/TestStep";
import { AdvancedEditor } from "./AdvancedEditor";
import { ensureRefined } from "./engine/refine";
import { useAgentGenerationStream } from "../ai-tools/tools/agent-builder/useAgentGenerationStream";
import { card, ghostBtn, primaryBtn, kicker, stepTitles } from "./ui";

interface ToolContext {
  editAgentDocumentId?: string;
  workspaces?: any[];
  selectedWorkspaceId?: string;
  selectedSubjectId?: string;
  onSaveGeneratedQuizDocument?: (payload: unknown) => Promise<{ id?: string } | null>;
  onUpdateGeneratedDocument?: (id: string, payload: unknown) => Promise<unknown>;
  onListDocumentBlockTemplates?: () => Promise<any[]>;
  onSaveDocumentBlockTemplate?: (payload: unknown) => Promise<any>;
  onOpenTool?: (toolId: string) => void;
}

const MARKETPLACE_KEY = "luna.agentMarketplaceListings.v1";

function SavedAgents({ docs, onOpen, onNew, onStarter }: { docs: { id: string; name: string; content: string }[]; onOpen: (doc: { id: string; content: string }) => void; onNew: () => void; onStarter: (kind: "flashcards" | "quiz") => void }) {
  return (
    <section className="tw-scope grid gap-4">
      <div className={`${card} p-6`}>
        <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent-ink)]">Agent Studio</span>
        <h3 className="m-0 mt-3 text-[26px] font-bold tracking-tight text-ink">Create an AI agent</h3>
        <p className="m-0 mt-1 max-w-2xl text-sm text-soft-ink">An agent is a recipe: what it creates, what people can customise, what it reads, and what each item contains. Luna handles the AI behind the scenes.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className={primaryBtn} onClick={onNew}>Start from scratch</button>
          <button type="button" className={ghostBtn} onClick={() => onStarter("flashcards")}>Example: Vocabulary Flashcards</button>
          <button type="button" className={ghostBtn} onClick={() => onStarter("quiz")}>Example: Quiz Generator</button>
        </div>
      </div>
      <div className={`${card} p-5`}>
        <p className={kicker}>Your agents</p>
        <div className="mt-3 grid gap-1">{docs.map((doc) => <button key={doc.id} type="button" onClick={() => onOpen(doc)} className="flex items-center justify-between rounded-xl px-3 py-2 text-left transition hover:bg-[var(--surface-soft)]"><span className="text-sm font-semibold text-ink">{doc.name.replace(/\.agent\.json$/, "")}</span><span className="text-xs text-soft-ink">Open</span></button>)}{!docs.length ? <p className="m-0 text-sm text-soft-ink">No agents in this subject yet.</p> : null}</div>
      </div>
    </section>
  );
}

const PRICING = [["per-use", "Per use", "Charged each time it runs"], ["subscription", "Subscription", "Monthly access"], ["one-time", "One-time purchase", "Buy once, keep forever"]] as const;

function PublishDialog({ initial, onCancel, onConfirm }: { initial: { price: number; pricingType: string } | null; onCancel: () => void; onConfirm: (values: { price: number; pricingType: string }) => void }) {
  const [price, setPrice] = useState(initial?.price ?? 0);
  const [pricingType, setPricingType] = useState(initial?.pricingType || "per-use");
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onPointerDown={onCancel}>
      <div className={`${card} w-full max-w-md p-5`} onPointerDown={(event) => event.stopPropagation()}>
        <p className="m-0 text-base font-bold text-ink">{initial ? "Update marketplace listing" : "Publish to the marketplace"}</p>
        <p className="m-0 mt-1 text-xs text-soft-ink">Other people will be able to use this agent with their own material. Payments are a preview for now.</p>
        <div className="mt-3 grid gap-1">{PRICING.map(([value, title, hint]) => <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2 ${pricingType === value ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]" : "border-ink/10"}`}><input type="radio" className="mt-1" checked={pricingType === value} onChange={() => setPricingType(value)} /><span><span className="block text-sm font-semibold text-ink">{title}</span><span className="block text-xs text-soft-ink">{hint}</span></span></label>)}</div>
        <div className="mt-3"><label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-soft-ink">Price (USD, 0 = free)</label><input type="number" min="0" step="0.5" className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink" value={price} onChange={(event) => setPrice(Math.max(0, Number(event.target.value) || 0))} /></div>
        <div className="mt-4 flex justify-end gap-2"><button type="button" className={ghostBtn} onClick={onCancel}>Cancel</button><button type="button" className={primaryBtn} onClick={() => onConfirm({ price, pricingType })}>{initial ? "Update listing" : "Publish"}</button></div>
      </div>
    </div>
  );
}

function Dashboard({ spec, lastRun, onStep, onPublish, published, onSave, dirty }: { spec: AgentSpec; lastRun: any; onStep: (step: Step) => void; onPublish: () => void; published: boolean; onSave: () => void; dirty: boolean }) {
  const fields = collectionFields(primaryCollection(spec));
  const cards: [Step, string, string][] = [
    [1, "What it creates", spec.purpose.headline || spec.name],
    [2, "Customize", spec.inputs.map((i) => i.name).join(" · ") || "Nothing to choose"],
    [3, "Material", spec.contextSlots.map((s) => `${s.name}${s.required ? " (required)" : ""}`).join(" · ") || "Own knowledge only"],
    [4, "Output", `${primaryCollection(spec)?.name || "Items"}[] — ${fields.map((f) => f.name).join(", ")}`],
    [5, "Test & improve", lastRun ? `Last test: ${lastRun.checks.filter((c: any) => c.ok).length}/${lastRun.checks.length} checks · ${lastRun.output?.items?.length || 0} items` : "Not tested yet"]
  ];
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="grid gap-2">{cards.map(([step, title, text]) => <button key={step} type="button" onClick={() => onStep(step)} className={`${card} flex items-start gap-3 p-4 text-left transition hover:border-[var(--accent)]/40`}><span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-xs font-bold text-[var(--accent-ink)]">{step}</span><span><span className="block text-[11px] font-semibold uppercase tracking-wider text-soft-ink">{title}</span><span className="block text-sm text-ink">{text}</span></span></button>)}</div>
      <aside className={`${card} p-5`}>
        <p className={kicker}>Marketplace card</p>
        <div className="mt-2 rounded-2xl border border-ink/10 p-4">
          <p className="m-0 text-base font-bold text-ink">{spec.name}</p>
          <p className="m-0 text-xs text-soft-ink">Creates: {spec.purpose.headline || "—"}</p>
          <p className={`${kicker} mt-3`}>User chooses</p><p className="m-0 text-sm text-ink">{spec.inputs.map((i) => i.name).join(", ") || "—"}{spec.contextSlots.some((s) => s.kind === "user_material") ? ", source material" : ""}</p>
          <p className={`${kicker} mt-3`}>Returns</p><p className="m-0 text-sm text-ink">{fields.map((f) => f.name).join(", ")}</p>
        </div>
        <div className="mt-3 grid gap-2">
          <button type="button" className={`${primaryBtn} w-full`} onClick={onSave} disabled={!dirty}>{dirty ? "Save to my AI Tools" : "Saved to my AI Tools"}</button>
          <button type="button" className={`${ghostBtn} w-full`} onClick={onPublish}>{published ? "Update marketplace listing" : "Publish to marketplace…"}</button>
          {published ? <p className="m-0 text-[11px] text-soft-ink">Listed. Updating pushes the new version to everyone who uses it.</p> : null}
        </div>
      </aside>
    </div>
  );
}

export function AgentStudio({ toolContext }: { toolContext?: ToolContext }) {
  const { state, dispatch, update } = useAgentStore();
  const generation = useAgentGenerationStream();
  const [advanced, setAdvanced] = useState(false);
  const [outputMode, setOutputMode] = useState<"blocks" | "fields">("blocks");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [published, setPublished] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const contextRef = useRef(toolContext);
  contextRef.current = toolContext;
  const workspaceId = toolContext?.selectedWorkspaceId || "";
  const subjectId = toolContext?.selectedSubjectId || "";
  const subject = useMemo(() => (toolContext?.workspaces || []).find((w: any) => w.id === workspaceId)?.subjects?.find((s: any) => s.id === subjectId), [toolContext?.workspaces, workspaceId, subjectId]);
  const docs = useMemo(() => (subject?.documents || []).filter((d: any) => d.sourceType !== "generated" && String(d.reviewStatus || "approved") === "approved").map((d: any) => ({ id: d.id, name: d.name })), [subject]);
  const agentDocs = useMemo(() => (subject?.documents || []).filter((d: any) => d.sourceType === "generated" && (d.tags || []).includes("ai-agent")).map((d: any) => ({ id: d.id, name: d.name, content: d.content })), [subject]);
  const spec = state.spec;
  // Saved templates, so the output step can offer them instead of the generated document.
  const [templateRows, setTemplateRows] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    const list = contextRef.current?.onListDocumentBlockTemplates;
    if (typeof list !== "function") return;
    list().then((rows: any) => setTemplateRows(Array.isArray(rows) ? rows : [])).catch(() => undefined);
  }, []);
  const editId = toolContext?.editAgentDocumentId || "";
  const openedEditRef = useRef("");
  if (editId && openedEditRef.current !== editId && agentDocs.length) {
    const doc = agentDocs.find((d: any) => d.id === editId);
    if (doc) { openedEditRef.current = editId; try { dispatch({ type: "open", spec: specFromLegacy(JSON.parse(doc.content || "{}")), savedId: doc.id, wizard: false }); } catch { /* ignore */ } }
  }

  function openDoc(doc: { id: string; content: string }) {
    try { dispatch({ type: "open", spec: specFromLegacy(JSON.parse(doc.content || "{}")), savedId: doc.id, wizard: false }); } catch { setStatus("Could not read this agent."); }
  }
  async function save() {
    if (!spec) return;
    const ctx = contextRef.current;
    if (!ctx?.onSaveGeneratedQuizDocument || !subjectId) { setStatus("Select a workspace and subject before saving."); return; }
    setBusy(true);
    try {
      const ready = await ensureRefined(spec);
      if (ready !== spec) update(() => ready);
      const content = JSON.stringify({ ...runConfigFromSpec(ready), savedOutput: state.lastRun?.output || null }, null, 2);
      const file = { name: `${spec.name || "Untitled agent"}.agent.json`, content, sizeBytes: content.length };
      const saved = state.savedId && ctx.onUpdateGeneratedDocument ? await ctx.onUpdateGeneratedDocument(state.savedId, { file }) : await ctx.onSaveGeneratedQuizDocument({ folderIds: [], tags: ["ai-agent"], file });
      dispatch({ type: "saved", id: (saved as any)?.id || state.savedId });
      setStatus(`Saved “${spec.name}”. It now appears in AI Tools.`);
    } catch (error) { setStatus(String((error as Error).message || error)); } finally { setBusy(false); }
  }
  function readListings(): any[] { try { return JSON.parse(window.localStorage.getItem(MARKETPLACE_KEY) || "[]"); } catch { return []; } }
  const existingListing = spec ? readListings().find((l) => l.sourceAgentId === spec.id) : null;
  function publish({ price, pricingType }: { price: number; pricingType: string }) {
    if (!spec) return;
    try {
      const listings = readListings();
      const agent = runConfigFromSpec(spec);
      const listing = { id: existingListing?.id || `agent-listing-${Date.now().toString(36)}`, sourceAgentId: spec.id, name: spec.name, description: spec.purpose.description || spec.purpose.headline, price, pricingType, author: "You", category: spec.purpose.category || "Community", agent, spec, createdAt: existingListing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
      const next = existingListing ? listings.map((l) => (l.id === listing.id ? listing : l)) : [listing, ...listings];
      window.localStorage.setItem(MARKETPLACE_KEY, JSON.stringify(next));
      setPublished(true);
      setPublishing(false);
      setStatus(existingListing ? "Listing updated — everyone using it gets this version." : "Listed on the marketplace (preview — no payments yet).");
    } catch (error) { setStatus(String((error as Error).message || error)); }
  }

  if (!spec) return <SavedAgents docs={agentDocs} onOpen={openDoc} onNew={() => dispatch({ type: "open", spec: createAgentSpec("New agent"), savedId: "", wizard: true })} onStarter={(kind) => dispatch({ type: "open", spec: kind === "quiz" ? createQuizSpec() : createVocabularyFlashcardsSpec(), savedId: "", wizard: true })} />;

  const step = state.step;
  const [title, subtitle] = stepTitles[step];
  // Blocks mode: the composition is the source of truth and syncs asynchronously — always allow
  // Next so the user is not blocked while the effect hasn't fired yet.
  const canNext = step === 1 ? Boolean(spec.name && spec.instructions.core) : step === 4 ? (outputMode === "blocks" || collectionFields(primaryCollection(spec)).some((f) => f.name)) : true;

  return (
    <section className="tw-scope grid gap-3">
      <div className={`${card} flex flex-wrap items-center gap-2 px-4 py-2.5`}>
        <button type="button" className={ghostBtn} onClick={() => dispatch({ type: "close" })} title="Back">‹</button>
        <span className="text-sm font-bold text-ink">{spec.name || "New agent"}</span>
        <span className="rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[10px] font-semibold text-soft-ink">{state.savedId ? (state.dirty ? "Unsaved changes" : "Saved") : "Draft"}</span>
        <div className="mx-auto flex gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
          {([1, 2, 3, 4, 5] as Step[]).map((s) => <button key={s} type="button" onClick={() => dispatch({ type: "step", step: s })} onClickCapture={() => dispatch({ type: "wizard", on: true })} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${step === s && state.wizard ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink hover:text-ink"}`}>{s} · {stepTitles[s][0]}</button>)}
          <button type="button" onClick={() => dispatch({ type: "wizard", on: false })} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${!state.wizard ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink hover:text-ink"}`}>Overview</button>
        </div>
        <button type="button" className="text-xs font-semibold text-soft-ink hover:underline" onClick={() => setAdvanced((v) => !v)}>{advanced ? "Hide advanced" : "Advanced"}</button>
        <button type="button" className={primaryBtn} onClick={save} disabled={busy || !state.dirty}>{busy ? "Saving…" : state.dirty ? "Save agent" : "Saved"}</button>
      </div>
      {status ? <p className="m-0 px-1 text-xs text-[var(--accent-ink)]">{status}</p> : null}
      {advanced ? <AdvancedEditor spec={spec} onChange={update} /> : null}

      {publishing ? <PublishDialog initial={existingListing ? { price: existingListing.price, pricingType: existingListing.pricingType } : null} onCancel={() => setPublishing(false)} onConfirm={publish} /> : null}
      {!state.wizard ? <Dashboard spec={spec} lastRun={state.lastRun} onStep={(s) => { dispatch({ type: "wizard", on: true }); dispatch({ type: "step", step: s }); }} onPublish={() => setPublishing(true)} published={published || Boolean(existingListing)} onSave={save} dirty={state.dirty} /> : (
        <>
          <div className="px-1"><h3 className="m-0 text-[22px] font-bold tracking-tight text-ink">{step}. {title}</h3><p className="m-0 text-sm text-soft-ink">{subtitle}</p></div>
          {step === 1 ? <PurposeStep spec={spec} onChange={update} /> : null}
          {step === 2 ? <InputSchemaBuilder spec={spec} onChange={update} /> : null}
          {step === 3 ? <ContextBuilder spec={spec} docs={docs} onChange={update} /> : null}
          {step === 4 ? (
            <div className="grid gap-3">
              <div className="flex gap-1 self-start rounded-xl bg-[var(--surface-soft)] p-1">
                {([["blocks", "Blocks (recommended)"], ["fields", "Fields (manual)"]] as const).map(([value, text]) => <button key={value} type="button" onClick={() => setOutputMode(value)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${outputMode === value ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink"}`}>{text}</button>)}
              </div>
              {outputMode === "blocks"
                ? <OutputComposer spec={spec} onChange={update} listTemplates={contextRef.current?.onListDocumentBlockTemplates} saveTemplate={contextRef.current?.onSaveDocumentBlockTemplate} onOpenTemplateStudio={(id) => contextRef.current?.onOpenTool?.(`template-builder?open=${id}`)} />
                : <OutputSchemaBuilder spec={spec} onChange={update} />}
              {/* Whatever way the fields were defined, Luna designs a finished document for them. */}
              <GeneratedTemplate spec={spec} onChange={update} templates={templateRows} saveTemplate={contextRef.current?.onSaveDocumentBlockTemplate} onOpenTemplateStudio={(id) => contextRef.current?.onOpenTool?.(`template-builder?open=${id}`)} />
            </div>
          ) : null}
          {step === 5 ? <TestStep key={spec.inputs.map((i) => i.id).join(",")} spec={spec} docs={docs} workspaceId={workspaceId} subjectId={subjectId} generation={generation} lastRun={state.lastRun} lastChanges={state.lastChanges} onRun={(run) => dispatch({ type: "run", run })} onChange={update} onUndo={() => dispatch({ type: "undo" })} /> : null}
          <div className="flex items-center justify-between">
            <button type="button" className={ghostBtn} disabled={step === 1} onClick={() => dispatch({ type: "step", step: (step - 1) as Step })}>← Back</button>
            {step < 5 ? <button type="button" className={primaryBtn} disabled={!canNext} onClick={() => dispatch({ type: "step", step: (step + 1) as Step })}>Next: {stepTitles[step + 1][0]} →</button> : <button type="button" className={primaryBtn} onClick={() => dispatch({ type: "wizard", on: false })}>Finish → Overview</button>}
          </div>
        </>
      )}
    </section>
  );
}
