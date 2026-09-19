"use client";

import { useState } from "react";
import type { AgentSpec, InputDef, SpecChange } from "../engine/types";
import { LANGUAGES, QUICK_ACTIONS, collectionFields, primaryCollection } from "../engine/model";
import { applyPatches, applyQuickAction } from "../engine/improve";
import { runConfigFromSpec } from "../engine/migrate";
import { compileAgent } from "../engine/compile";
import { slug } from "../../template-studio/engine/model";
import { GenerationProgress } from "../../ai-tools/tools/agent-builder/GenerationProgress";
import type { LastRun } from "../state/useAgentStore";
import { card, field, fieldBase, ghostBtn, label, primaryBtn, kicker } from "../ui";

interface Doc { id: string; name: string }
interface Generation { generate: (config: unknown) => Promise<any>; cancel: () => void; isGenerating: boolean; steps: any; tokenChars: number; tokenTail: string; elapsedMs: number; error: string }

function InputControl({ input, value, onChange }: { input: InputDef; value: unknown; onChange: (value: unknown) => void }) {
  if (input.type === "number") return <input type="number" min={input.min} max={input.max} className={field} value={String(value ?? "")} onChange={(event) => onChange(Number(event.target.value))} />;
  if (input.type === "language") return <select className={field} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}>{LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}</select>;
  if (input.type === "choice") return <div className="flex flex-wrap gap-1.5">{(input.options || []).map((o) => <button key={o} type="button" onClick={() => onChange(o)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${value === o ? "border-[var(--accent)]/40 bg-[var(--accent-soft)] text-ink" : "border-ink/10 text-ink"}`}>{o}</button>)}</div>;
  if (input.type === "multi_choice") { const list = Array.isArray(value) ? (value as string[]) : []; return <div className="flex flex-wrap gap-1.5">{(input.options || []).map((o) => { const on = list.includes(o); return <button key={o} type="button" onClick={() => onChange(on ? list.filter((x) => x !== o) : [...list, o])} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${on ? "border-[var(--accent)]/40 bg-[var(--accent-soft)] text-ink" : "border-ink/10 text-ink"}`}>{on ? "✓ " : ""}{o}</button>; })}</div>; }
  if (input.type === "toggle") return <div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface-soft)] p-1">{["yes", "no"].map((o) => <button key={o} type="button" onClick={() => onChange(o)} className={`rounded-lg px-2 py-1.5 text-xs font-semibold capitalize ${value === o ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink"}`}>{o}</button>)}</div>;
  return <input className={field} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} placeholder={input.description || ""} />;
}

export function defaultInputValues(spec: AgentSpec): Record<string, unknown> {
  return Object.fromEntries(spec.inputs.map((input) => [input.id, input.default ?? (input.type === "multi_choice" ? [] : input.type === "number" ? 10 : "")]));
}

export function TestStep({ spec, docs, workspaceId, subjectId, generation, lastRun, lastChanges, onRun, onChange, onUndo }: { spec: AgentSpec; docs: Doc[]; workspaceId: string; subjectId: string; generation: Generation; lastRun: LastRun | null; lastChanges: SpecChange[]; onRun: (run: LastRun) => void; onChange: (updater: (spec: AgentSpec) => AgentSpec, changes: SpecChange[]) => void; onUndo: () => void }) {
  const [values, setValues] = useState<Record<string, unknown>>(() => defaultInputValues(spec));
  const [materialIds, setMaterialIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState("");
  const [improving, setImproving] = useState(false);
  const [note, setNote] = useState("");
  const materialSlots = spec.contextSlots.filter((s) => s.kind === "user_material");
  const fields = collectionFields(primaryCollection(spec));
  const missingRequired = spec.inputs.filter((i) => i.required && (values[i.id] === "" || values[i.id] === undefined || (Array.isArray(values[i.id]) && !(values[i.id] as unknown[]).length)));
  const missingMaterial = materialSlots.some((s) => s.required) && !materialIds.length;

  async function runTest() {
    const config = runConfigFromSpec(spec, {
      questionAnswers: spec.inputs.map((input) => ({ question: input.name, answer: values[input.id] })),
      inputValues: values,
      scope: { workspaceId, subjectId, documentIds: [...materialIds, ...spec.contextSlots.flatMap((s) => (s.kind === "agent_knowledge" ? s.documentIds || [] : []))], styleDocumentIds: [] }
    });
    try {
      const data = await generation.generate(config);
      onRun({ inputValues: values, output: { items: data.items || [] }, checks: data.checks || [], model: data.model });
    } catch { /* hook shows the error */ }
  }
  function quick(actionId: string) {
    const { spec: next, changes } = applyQuickAction(spec, actionId);
    onChange(() => next, changes);
    setNote("Rule added. Run the test again to see the effect.");
  }
  async function improve() {
    if (!feedback.trim()) return;
    setImproving(true);
    setNote("");
    try {
      const response = await fetch("/api/ai-tools/agent-builder/improve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spec, feedback, lastRun: lastRun ? { inputs: lastRun.inputValues, itemCount: lastRun.output?.items?.length || 0, output: lastRun.output?.items?.slice(0, 3), checks: lastRun.checks } : null }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not improve the agent");
      const { spec: next, changes } = applyPatches(spec, payload.patches || []);
      onChange(() => next, changes);
      setNote(changes.length ? `Updated the agent (${changes.length} change${changes.length === 1 ? "" : "s"}). Run the test again.` : "No change was needed for that feedback.");
      setFeedback("");
    } catch (error) {
      setNote(String((error as Error).message || error));
    } finally {
      setImproving(false);
    }
  }

  const items = lastRun?.output?.items || [];
  return (
    <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="grid gap-3">
        <section className={`${card} p-5`}>
          <p className={kicker}>Test as a user would</p>
          <div className="mt-3 grid gap-3">
            {spec.inputs.map((input) => <div key={input.id}><label className={label}>{input.name}{input.required ? "" : " (optional)"}</label><InputControl input={input} value={values[input.id]} onChange={(v) => setValues((c) => ({ ...c, [input.id]: v }))} />{input.description ? <p className="m-0 mt-1 text-[11px] text-soft-ink">{input.description}</p> : null}</div>)}
            {!spec.inputs.length ? <p className="m-0 text-sm text-soft-ink">No customizations yet (step 2).</p> : null}
            {materialSlots.map((slot) => <div key={slot.id}><label className={label}>{slot.name}{slot.required ? "" : " (optional)"}</label><div className="grid max-h-40 gap-1 overflow-auto">{docs.map((doc) => { const on = materialIds.includes(doc.id); return <label key={doc.id} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs ${on ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]" : "border-ink/10"}`}><input type="checkbox" checked={on} onChange={() => setMaterialIds((c) => (on ? c.filter((id) => id !== doc.id) : slot.multiple ? [...c, doc.id] : [doc.id]))} />{doc.name}</label>; })}{!docs.length ? <p className="m-0 text-xs text-soft-ink">Upload documents to the subject to test with material.</p> : null}</div><p className="m-0 mt-1 text-[11px] text-soft-ink">{slot.description}</p></div>)}
          </div>
          <button type="button" className={`${primaryBtn} mt-4 w-full`} disabled={generation.isGenerating || missingRequired.length > 0 || missingMaterial} onClick={runTest}>{generation.isGenerating ? "Generating…" : "Generate test →"}</button>
          {missingRequired.length ? <p className="m-0 mt-1 text-[11px] text-soft-ink">Fill in: {missingRequired.map((i) => i.name).join(", ")}</p> : missingMaterial ? <p className="m-0 mt-1 text-[11px] text-soft-ink">This agent requires material.</p> : null}
        </section>
        <section className={`${card} p-5`}>
          <p className={kicker}>Improve output</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{QUICK_ACTIONS.map((a) => <button key={a.id} type="button" className={`${ghostBtn} px-3 py-1 text-xs`} onClick={() => quick(a.id)}>{a.label}</button>)}</div>
          <textarea className={`${field} mt-3 min-h-16`} value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="What would you like to change? e.g. The words are too easy — make them intermediate." />
          <button type="button" className={`${primaryBtn} mt-2`} disabled={improving || !feedback.trim()} onClick={improve}>{improving ? "Thinking…" : "Improve →"}</button>
          {note ? <p className="m-0 mt-2 text-xs text-[var(--accent-ink)]">{note}</p> : null}
          {lastChanges.length ? <div className="mt-3 rounded-xl bg-[var(--surface-soft)] p-3 text-xs"><p className="m-0 mb-1 font-semibold text-ink">What changed</p>{lastChanges.map((c, i) => <p key={i} className="m-0 text-ink"><span className="text-soft-ink">{c.path}:</span> <s className="text-soft-ink">{c.before.slice(0, 80)}</s> → {c.after.slice(0, 120)}</p>)}<button type="button" className="mt-1 text-[11px] font-semibold text-[var(--accent-ink)] hover:underline" onClick={onUndo}>Undo</button></div> : null}
          <p className="m-0 mt-2 text-[11px] text-soft-ink">Feedback changes the agent itself, so every future run improves — not just this sample.</p>
        </section>
      </div>
      <div className="grid gap-3">
        {generation.isGenerating || generation.error ? <GenerationProgress steps={generation.steps} tokenChars={generation.tokenChars} tokenTail={generation.tokenTail} elapsedMs={generation.elapsedMs} isGenerating={generation.isGenerating} error={generation.error} onCancel={generation.cancel} /> : null}
        {lastRun ? (
          <section className={`${card} p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-2"><p className={kicker}>Agent check</p><span className="text-[11px] text-soft-ink">{lastRun.model}</span></div>
            <ul className="m-0 mt-2 grid list-none gap-1 p-0 sm:grid-cols-2">{lastRun.checks.map((c) => <li key={c.rule} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${c.ok ? "bg-[rgba(52,199,184,0.12)] text-ink" : "bg-[rgba(215,0,21,0.08)] text-[var(--color-danger)]"}`}><span>{c.ok ? "✓" : "✗"}</span>{c.message}</li>)}</ul>
          </section>
        ) : null}
        <section className={`${card} p-5`}>
          <div className="flex items-center justify-between"><p className={kicker}>Output</p>{items.length ? <span className="text-xs text-soft-ink">{items.length} items</span> : null}</div>
          {!items.length ? <p className="m-0 mt-2 text-sm text-soft-ink">Run a test to see what the agent produces. The result is structured content — pick a template later to make it look the way you want.</p> : (
            <div className="mt-3 grid gap-2">{(items as Record<string, unknown>[]).slice(0, 30).map((item, index) => <div key={index} className="rounded-xl border border-ink/10 p-3"><span className="mb-1 inline-block rounded-full bg-[var(--accent-soft)] px-2 text-[10px] font-bold text-[var(--accent-ink)]">{index + 1}</span>{fields.map((f) => { const v = item[slug(f.name)]; return <p key={f.id} className="m-0 text-sm text-ink"><span className="text-xs text-soft-ink">{f.name}: </span>{Array.isArray(v) ? v.join(" · ") : String(v ?? "—")}</p>; })}</div>)}</div>
          )}
        </section>
        {lastRun && items.length ? <button type="button" className={`${ghostBtn} justify-self-start`} onClick={() => onChange((s) => ({ ...s, examples: [...s.examples, { id: `ex_${Date.now().toString(36)}`, source: "generated", inputs: lastRun.inputValues, output: { items: items.slice(0, 3) as any }, note: "Approved test output" }] }), [{ path: "examples", before: `${spec.examples.length}`, after: `${spec.examples.length + 1}` }])}>★ Use this as an example of good output</button> : null}
        <details className={`${card} p-4`}><summary className="cursor-pointer text-xs font-semibold text-soft-ink">Advanced — what Luna sends to the model</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-[var(--surface-soft)] p-3 font-mono text-[11px] text-ink">{compileAgent(spec, { values }).system}\n\n{compileAgent(spec, { values }).user}</pre></details>
      </div>
    </div>
  );
}
