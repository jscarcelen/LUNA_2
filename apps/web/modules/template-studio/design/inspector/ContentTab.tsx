"use client";

import { useState } from "react";
import type { Element, FieldDef, GroupElement, TextElement } from "../../engine/types";
import { arrayItemFields, createField, findField } from "../../engine/model";
import { field as fieldClass, ghostBtn, label, primaryBtn } from "../../ui";
import { Segmented } from "./Segmented";

export interface ContentTabProps {
  element: Element;
  parentChain: GroupElement[];
  fields: FieldDef[];
  onChange: (updater: (element: Element) => Element) => void;
  onAddField: (field: FieldDef, intoArrayId: string | null) => void;
}

/** Fields the element can bind to: the nearest repeating group's item fields, else root fields. */
export function fieldsInScope(parentChain: GroupElement[], fields: FieldDef[]): { scope: FieldDef[]; arrayId: string | null } {
  for (let index = parentChain.length - 1; index >= 0; index -= 1) {
    const group = parentChain[index];
    if (group.repeat) {
      const array = findField(fields, group.repeat.fieldId);
      if (array) return { scope: arrayItemFields(array).filter((item) => item.type !== "array" && item.type !== "object").concat(arrayItemFields(array).filter((item) => item.type === "text" && false)), arrayId: array.id };
    }
  }
  return { scope: fields.filter((item) => item.type !== "array" && item.type !== "object"), arrayId: null };
}

export function ContentTab({ element, parentChain, fields, onChange, onAddField }: ContentTabProps) {
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftType, setDraftType] = useState<FieldDef["type"]>("text");
  if (element.type !== "text" && element.type !== "image") {
    return <p className="m-0 text-sm text-soft-ink">{element.type === "group" ? "A group has no content of its own — its children do. Use Layout and Repeat." : "This element has no editable content."}</p>;
  }
  const { scope, arrayId } = fieldsInScope(parentChain, fields);
  const sourceType = element.source.type;
  const setSource = (source: TextElement["source"]) => onChange((current) => ({ ...current, source } as Element));

  function commitNew() {
    const name = draftName.trim();
    if (!name) return;
    const created = createField(name, element.type === "image" ? "image" : draftType);
    onAddField(created, arrayId);
    setSource({ type: "field", fieldId: created.id });
    setCreating(false);
    setDraftName("");
  }

  return (
    <div className="grid gap-4">
      <div>
        <label className={label}>Content source</label>
        <Segmented value={sourceType} options={[["static", element.type === "image" ? "Fixed image" : "Fixed text"], ["field", "AI field"]]} onChange={(value) => setSource(value === "static" ? { type: "static", value: sourceType === "static" ? element.source.value : "" } : { type: "field", fieldId: scope[0]?.id || "" })} />
      </div>
      {sourceType === "static" ? (
        element.type === "text"
          ? <div><label className={label}>Text</label><textarea className={`${fieldClass} min-h-24 resize-y`} value={element.source.type === "static" ? element.source.value : ""} onChange={(event) => setSource({ type: "static", value: event.target.value })} /></div>
          : <div><label className={label}>Image URL</label><input className={fieldClass} value={element.source.type === "static" ? element.source.value : ""} onChange={(event) => setSource({ type: "static", value: event.target.value })} placeholder="https://…/logo.png" /></div>
      ) : (
        <div>
          <label className={label}>Field {arrayId ? "(inside the repeating group)" : ""}</label>
          {!creating ? (
            <>
              <select className={fieldClass} value={element.source.type === "field" ? element.source.fieldId : ""} onChange={(event) => (event.target.value === "__new" ? setCreating(true) : setSource({ type: "field", fieldId: event.target.value }))}>
                <option value="">Choose a field…</option>
                {scope.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.type}</option>)}
                <option value="__new">＋ New field…</option>
              </select>
              <p className="m-0 mt-1.5 text-xs text-soft-ink">{arrayId ? "Fields of each repeated item." : "Fields filled once per document."} Renaming a field never breaks this link.</p>
            </>
          ) : (
            <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)] p-3">
              <label className={label}>New field name</label>
              <input autoFocus className={fieldClass} value={draftName} onChange={(event) => setDraftName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && commitNew()} placeholder="e.g. Hint" />
              {element.type === "text" ? (
                <>
                  <label className={`${label} mt-2`}>Type</label>
                  <Segmented value={draftType} options={[["text", "Text"], ["rich_text", "Rich text"], ["number", "Number"]]} onChange={setDraftType} />
                </>
              ) : null}
              <div className="mt-2 flex gap-2"><button type="button" className={primaryBtn} onClick={commitNew} disabled={!draftName.trim()}>Create</button><button type="button" className={ghostBtn} onClick={() => setCreating(false)}>Cancel</button></div>
            </div>
          )}
        </div>
      )}
      {element.type === "text" && sourceType === "field" ? (
        <>
          <div><label className={label}>Format</label><Segmented value={element.format} options={[["plain", "Plain text"], ["rich", "Rich (Markdown + LaTeX)"]]} onChange={(value) => onChange((current) => ({ ...current, format: value } as Element))} /></div>
          <div><label className={label}>Sample text while designing</label><input className={fieldClass} value={element.placeholder || ""} onChange={(event) => onChange((current) => ({ ...current, placeholder: event.target.value } as Element))} placeholder="What is the capital of France?" /></div>
        </>
      ) : null}
    </div>
  );
}
