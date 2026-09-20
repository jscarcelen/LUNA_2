"use client";

import { useMemo, useState } from "react";
import type { Element, FieldDef, GroupElement, SchemaNode, Template } from "../engine/types";
import { arrayItemFields, createField, fieldsFromAgentFields, findField, flattenFields, simpleOrder } from "../engine/model";
import { isSequenceGroup, sequenceMembers } from "../engine/blocks";
import { ElementView } from "../design/canvas/ElementView";
import { flattenSchema, proposeMapping, schemaFromAgentFields } from "../engine/mapping";
import { card, field as fieldClass, fieldBase, ghostBtn, kicker, label, primaryBtn } from "../ui";

export interface AgentOption { id: string; name: string; fields: { name: string; label?: string; type?: string; repeatScope?: string; description?: string }[] }

function FieldTree({ fields, depth, onRename, onRemove, onAddChild }: { fields: FieldDef[]; depth: number; onRename: (id: string, name: string) => void; onRemove: (id: string) => void; onAddChild: (arrayId: string) => void }) {
  return (
    <div className="grid gap-1">
      {fields.map((item) => (
        <div key={item.id}>
          <div className="flex items-center gap-2 rounded-lg px-2 py-1" style={{ paddingLeft: 8 + depth * 14 }}>
            <span className="rounded bg-[var(--surface-soft)] px-1.5 py-0.5 font-mono text-[10px] text-soft-ink">{item.type}{item.type === "array" ? "[]" : ""}</span>
            <input className={`${fieldBase} flex-1 px-2 py-1 text-xs`} value={item.name} onChange={(event) => onRename(item.id, event.target.value)} />
            {item.type === "array" ? <button type="button" className="text-[11px] font-semibold text-[var(--accent-ink)] hover:underline" onClick={() => onAddChild(item.id)}>＋ item field</button> : null}
            <button type="button" className="text-[11px] text-soft-ink hover:text-[var(--color-danger)]" onClick={() => onRemove(item.id)}>✕</button>
          </div>
          {item.type === "array" ? <FieldTree fields={arrayItemFields(item)} depth={depth + 1} onRename={onRename} onRemove={onRemove} onAddChild={onAddChild} /> : null}
          {item.type === "object" ? <FieldTree fields={item.children || []} depth={depth + 1} onRename={onRename} onRemove={onRemove} onAddChild={onAddChild} /> : null}
        </div>
      ))}
    </div>
  );
}

/**
 * Data mode: the template's own structure (editable, agent-independent) on the left; an optional
 * agent schema on the right with proposed mappings to confirm. A template can be designed and
 * published before any agent exists.
 */
/** Fields an element (and its children) binds, with the binding element's id — in visual order. */
function bindingsOf(element: Element, fields: FieldDef[]): { field: FieldDef; elementId: string; list?: FieldDef }[] {
  const out: { field: FieldDef; elementId: string; list?: FieldDef }[] = [];
  const seen = new Set<string>();
  const walk = (list: Element[], listField?: FieldDef) => {
    for (const item of [...list].sort((a, b) => a.frame.y - b.frame.y || a.frame.x - b.frame.x)) {
      if ((item.type === "text" || item.type === "image") && item.source.type === "field") {
        const field = findField(fields, item.source.fieldId);
        if (field && !seen.has(field.id)) { seen.add(field.id); out.push({ field, elementId: item.id, list: listField }); }
      }
      if (item.type === "group") {
        const repeatList = item.repeat ? findField(fields, item.repeat.fieldId) || undefined : undefined;
        if (repeatList && !seen.has(repeatList.id)) { seen.add(repeatList.id); out.push({ field: repeatList, elementId: item.id, list: listField }); }
        walk(item.children, repeatList || listField);
      }
    }
  };
  walk(element.type === "group" ? element.children : [element], element.type === "group" && element.repeat ? findField(fields, element.repeat.fieldId) || undefined : undefined);
  if (element.type === "group" && element.repeat) { const list = findField(fields, element.repeat.fieldId); if (list && !seen.has(list.id)) out.unshift({ field: list, elementId: element.id }); }
  return out;
}

function componentName(element: Element): string {
  if (element.name) return element.name;
  if (element.type === "text") return element.source.type === "static" ? element.source.value.slice(0, 32) || "Text" : "AI text";
  return element.type === "image" ? "Image" : element.type;
}

export function DataMode({ template, agents, sampleValues = {}, onChangeTemplate }: { template: Template; agents: AgentOption[]; sampleValues?: Record<string, unknown>; onChangeTemplate: (updater: (template: Template) => Template) => void }) {
  const [agentId, setAgentId] = useState<string>("");
  const [selectedComponent, setSelectedComponent] = useState<string>("");
  const [hovered, setHovered] = useState<string>("");
  const [showAll, setShowAll] = useState(false);
  const layout0 = template.layouts[0];
  const components = layout0 ? simpleOrder(layout0.pages[0]?.elements || [], layout0) : [];
  const activeComponent = components.find((item) => item.id === selectedComponent) || components[0] || null;
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<FieldDef["type"]>("text");
  const agent = agents.find((item) => item.id === agentId) || null;
  const schema: SchemaNode[] = useMemo(() => (agent ? schemaFromAgentFields(agent.fields) : []), [agent]);
  const proposals = useMemo(() => (agent ? proposeMapping(template.fields, schema) : []), [agent, schema, template.fields]);
  const flat = flattenFields(template.fields);
  const used = new Set<string>();
  for (const layout of template.layouts) for (const page of layout.pages) {
    const walk = (elements: typeof page.elements) => elements.forEach((element) => { if (element.type === "text" && element.source.type === "field") used.add(element.source.fieldId); if (element.type === "group") { if (element.repeat) used.add(element.repeat.fieldId); walk(element.children); } });
    walk(page.elements);
  }

  const rename = (id: string, name: string) => onChangeTemplate((current) => ({ ...current, fields: mapFields(current.fields, (item) => (item.id === id ? { ...item, name } : item)) }));
  const remove = (id: string) => onChangeTemplate((current) => ({ ...current, fields: filterFields(current.fields, id) }));
  const addChild = (arrayId: string) => onChangeTemplate((current) => ({ ...current, fields: mapFields(current.fields, (item) => {
    if (item.id !== arrayId) return item;
    const itemDef = item.children?.[0];
    const child = createField("New field", "text");
    if (!itemDef) return { ...item, children: [createField("item", "object", { children: [child] })] };
    if (itemDef.type === "object") return { ...item, children: [{ ...itemDef, children: [...(itemDef.children || []), child] }] };
    return { ...item, children: [createField("item", "object", { children: [itemDef, child] })] };
  }) }));
  const addRoot = () => {
    if (!newName.trim()) return;
    const created = newType === "array" ? createField(newName.trim(), "array", { children: [createField("item", "object", { children: [] })] }) : createField(newName.trim(), newType);
    onChangeTemplate((current) => ({ ...current, fields: [...current.fields, created] }));
    setNewName("");
  };
  const importAgentFields = () => {
    if (!agent) return;
    onChangeTemplate((current) => ({ ...current, fields: [...current.fields, ...fieldsFromAgentFields(agent.fields).filter((item) => !current.fields.some((existing) => existing.name.toLowerCase() === item.name.toLowerCase()))] }));
  };

  return (
    <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section className={`${card} p-5`}>
        <p className={kicker}>Template structure · by component</p>
        <p className="m-0 mt-1 text-xs text-soft-ink">Each component and the fields it fills. Hover a field to see where it appears. Any agent that produces this structure can use the template.</p>
        <div className="mt-3 grid gap-2">
          {components.map((component, index) => {
            const isSet = isSequenceGroup(component);
            const open = activeComponent?.id === component.id;
            const bindings = bindingsOf(component, template.fields);
            const members = isSet ? sequenceMembers(component as GroupElement) : [];
            const list = component.type === "group" && component.repeat ? findField(template.fields, component.repeat.fieldId) : null;
            const fieldRow = (b: { field: FieldDef; elementId: string; list?: FieldDef }, depth: number) => (
              <div key={`${b.elementId}-${b.field.id}`} onMouseEnter={() => setHovered(b.elementId)} onMouseLeave={() => setHovered("")} className={`flex items-center gap-2 rounded-lg px-2 py-1 transition ${hovered === b.elementId ? "bg-[var(--accent-soft)]" : ""}`} style={{ paddingLeft: 8 + depth * 14 }}>
                <span className="rounded bg-[var(--surface-soft)] px-1.5 py-0.5 font-mono text-[10px] text-soft-ink">{b.field.type === "array" ? "list" : b.field.type}</span>
                <input className={`${fieldBase} flex-1 px-2 py-1 text-xs`} value={b.field.name} onChange={(event) => rename(b.field.id, event.target.value)} />
                {b.field.type === "array" ? <span className="text-[10px] text-soft-ink">repeats</span> : null}
              </div>
            );
            return (
              <div key={component.id} className={`rounded-2xl border transition ${open ? "border-[var(--accent)]/40" : "border-ink/10"}`}>
                <button type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-left" onClick={() => setSelectedComponent(component.id)}>
                  <span className="grid size-7 place-items-center rounded-lg bg-[var(--surface-soft)] text-xs font-bold text-ink">{isSet ? "⇅" : list ? "↻" : index + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink">{componentName(component)}</span>
                    <span className="block text-[11px] text-soft-ink">{isSet ? `${members.length} designs · agent order · list “${list?.name}”` : list ? `repeats for each of “${list.name}”` : component.pageScope.mode === "every" ? "every page" : "once"} · {bindings.filter((b) => b.field.type !== "array").length} fields</span>
                  </span>
                  <span className="text-xs text-soft-ink">{open ? "▾" : "▸"}</span>
                </button>
                {open ? (
                  <div className="grid gap-1 px-2 pb-2">
                    {isSet ? members.map((member) => {
                      const memberBindings = bindingsOf(member.child, template.fields);
                      return (
                        <div key={member.child.id} className="rounded-xl bg-[var(--surface-soft)]/60 p-1.5">
                          <p className="m-0 flex items-center gap-2 px-2 py-1 text-[11px] font-semibold text-ink">{member.block ? (member.block.variant ? `${member.block.family} · ${member.block.variant}` : member.block.name) : member.child.name}<span className="rounded bg-white px-1 font-mono text-[9px] text-soft-ink">Type = {member.typeValue}</span></p>
                          {memberBindings.map((b) => fieldRow(b, 0))}
                        </div>
                      );
                    }) : bindings.filter((b) => b.elementId !== component.id).map((b) => fieldRow(b, b.list && list && b.list.id !== list.id ? 1 : 0))}
                    {!bindings.length ? <p className="m-0 px-2 py-1 text-xs text-soft-ink">Fixed content — no AI fields.</p> : null}
                  </div>
                ) : null}
              </div>
            );
          })}
          {!components.length ? <p className="m-0 rounded-xl bg-[var(--surface-soft)] p-3 text-sm text-soft-ink">No components yet — add blocks in Design.</p> : null}
        </div>
        <details className="mt-3" open={showAll} onToggle={(event) => setShowAll((event.target as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer text-xs font-semibold text-soft-ink">All fields (full structure, add / remove)</summary>
          <div className="mt-2">
            {template.fields.length ? <FieldTree fields={template.fields} depth={0} onRename={rename} onRemove={remove} onAddChild={addChild} /> : <p className="m-0 rounded-xl bg-[var(--surface-soft)] p-3 text-sm text-soft-ink">No fields yet. Add one below, or place an AI field on the page.</p>}
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-ink/10 p-3">
            <div className="min-w-40 flex-1"><label className={label}>New field</label><input className={fieldClass} value={newName} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addRoot()} placeholder="e.g. Student name" /></div>
            <div><label className={label}>Type</label><select className={fieldClass} value={newType} onChange={(event) => setNewType(event.target.value as FieldDef["type"])}><option value="text">Text</option><option value="rich_text">Rich text</option><option value="number">Number</option><option value="boolean">Yes / no</option><option value="image">Image</option><option value="array">List of items</option></select></div>
            <button type="button" className={primaryBtn} onClick={addRoot} disabled={!newName.trim()}>Add</button>
          </div>
          <p className="m-0 mt-3 text-xs text-soft-ink">{flat.filter((entry) => used.has(entry.field.id)).length} of {flat.length} fields are used on the page.</p>
        </details>
      </section>

      <div className="grid gap-3">
      <section className={`${card} p-5`}>
        <p className={kicker}>Component preview</p>
        {activeComponent ? (
          <div className="mt-3 overflow-auto rounded-xl border border-ink/10 bg-[#f0f0f3] p-3">
            <div className="relative mx-auto bg-white shadow-[0_1px_4px_rgba(0,0,0,0.12)]" style={{ width: activeComponent.frame.w * 3 + 24, minHeight: activeComponent.frame.h * 3 + 24 }}>
              <ElementView element={{ ...activeComponent, frame: { ...activeComponent.frame, x: 4, y: 4 } } as Element} scale={3} selectedIds={hovered ? [hovered] : []} fields={template.fields} sampleMode sampleValues={sampleValues} onPointerDown={() => undefined} onResizeStart={() => undefined} />
              {activeComponent.type === "group" && (activeComponent as GroupElement).children.some((child) => child.type === "group" && child.condition) ? <div style={{ height: activeComponent.frame.h * 3 * 2 }} /> : null}
            </div>
          </div>
        ) : <p className="m-0 mt-2 text-xs text-soft-ink">Select a component on the left.</p>}
        <p className="m-0 mt-2 text-[11px] text-soft-ink">Sample data shown. The highlighted element is the field under your cursor.</p>
      </section>
      <section className={`${card} p-5`}>
        <p className={kicker}>Agent output (optional)</p>
        <select className={`${fieldClass} mt-2`} value={agentId} onChange={(event) => setAgentId(event.target.value)}>
          <option value="">No agent — design freely</option>
          {agents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        {agent ? (
          <>
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="m-0 text-xs text-soft-ink">Luna proposes how this agent's output fills your fields. Confirm at run time in the agent's Configure output step.</p>
              {!template.fields.length ? <button type="button" className={ghostBtn} onClick={importAgentFields}>Use this agent's fields</button> : null}
            </div>
            <table className="mt-3 w-full border-collapse text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-soft-ink"><th className="py-1.5 font-semibold">Template field</th><th className="py-1.5 font-semibold">Agent output</th><th className="py-1.5 text-right font-semibold">Match</th></tr></thead>
              <tbody className="divide-y divide-ink/6">
                {flat.map((entry) => {
                  const proposal = proposals.find((item) => item.fieldId === entry.field.id);
                  return (
                    <tr key={entry.field.id}>
                      <td className="py-2 text-ink">{entry.parents.length ? <span className="text-soft-ink">{entry.parents.filter((p) => p.type === "array").map((p) => `${p.name} › `).join("")}</span> : null}{entry.field.name}</td>
                      <td className="py-2 font-mono text-xs">{proposal ? <span className="rounded-md bg-[var(--accent-soft)] px-1.5 py-0.5 text-[var(--accent-ink)]">{proposal.path}</span> : <span className="text-[var(--color-warn)]">not provided</span>}</td>
                      <td className="py-2 text-right text-xs text-soft-ink">{proposal ? `${Math.round(proposal.score * 100)}%` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="m-0 mt-2 text-[11px] text-soft-ink">Agent schema: {flattenSchema(schema).filter((node) => node.type !== "object").map((node) => node.path).join(", ")}</p>
          </>
        ) : <p className="m-0 mt-3 text-xs text-soft-ink">Pick an agent to check compatibility, or leave empty and publish the template on its own.</p>}
      </section>
      </div>
    </div>
  );
}

function mapFields(fields: FieldDef[], fn: (field: FieldDef) => FieldDef): FieldDef[] {
  return fields.map((item) => { const next = fn(item); return next.children ? { ...next, children: mapFields(next.children, fn) } : next; });
}
function filterFields(fields: FieldDef[], id: string): FieldDef[] {
  return fields.filter((item) => item.id !== id).map((item) => (item.children ? { ...item, children: filterFields(item.children, id) } : item));
}
