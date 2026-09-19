"use client";

import type { Element, FieldDef, GroupElement } from "../../engine/types";
import { findField } from "../../engine/model";
import { field as fieldClass, label } from "../../ui";

export type RepeatChoice = "once" | "item" | "page";

const TYPE_OPTIONS: [FieldDef["type"], string][] = [["text", "Plain text"], ["rich_text", "Rich text"], ["number", "Number"], ["boolean", "Yes / no"], ["formula", "Formula"], ["image", "Image"]];

/**
 * The AI field, in the simplest terms: a name, a type, and whether it repeats. Repeating is
 * implemented by the nearest group; the panel hides that mechanism.
 */
export function AiFieldPanel({ element, parentChain, fields, onRenameField, onRetypeField, onSetRepeat }: {
  element: Element;
  parentChain: GroupElement[];
  fields: FieldDef[];
  onRenameField: (fieldId: string, name: string) => void;
  onRetypeField: (fieldId: string, type: FieldDef["type"]) => void;
  onSetRepeat: (choice: RepeatChoice) => void;
}) {
  if ((element.type !== "text" && element.type !== "image") || element.source.type !== "field") return null;
  const bound = findField(fields, element.source.fieldId);
  const repeatGroup = [...parentChain].reverse().find((group) => group.repeat);
  const choice: RepeatChoice = !repeatGroup ? "once" : repeatGroup.repeat!.mode === "page" ? "page" : "item";
  const list = repeatGroup ? findField(fields, repeatGroup.repeat!.fieldId) : null;
  return (
    <div className="grid gap-3 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent-soft)]/50 p-3">
      <div><label className={label}>Field name</label><input className={fieldClass} value={bound?.name || ""} disabled={!bound} onChange={(event) => bound && onRenameField(bound.id, event.target.value)} placeholder="question_text" /></div>
      {element.type === "text" ? <div><label className={label}>Type</label><select className={fieldClass} value={bound?.type || "text"} disabled={!bound} onChange={(event) => bound && onRetypeField(bound.id, event.target.value as FieldDef["type"])}>{TYPE_OPTIONS.filter(([t]) => t !== "image").map(([t, text]) => <option key={t} value={t}>{text}</option>)}</select></div> : null}
      <div>
        <label className={label}>Repeat</label>
        <div className="grid gap-1">
          {([["once", "Once", "One value for the whole document (a title, a summary)."], ["item", "Repeat per item", "One after another for every item the agent returns."], ["page", "One item per page", "Each item on its own page or slide."]] as [RepeatChoice, string, string][]).map(([value, title, text]) => (
            <label key={value} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-1.5 ${choice === value ? "border-[var(--accent)]/50 bg-white" : "border-transparent hover:bg-white/60"}`}>
              <input type="radio" className="mt-0.5" checked={choice === value} onChange={() => onSetRepeat(value)} />
              <span><span className="block text-xs font-semibold text-ink">{title}</span><span className="block text-[10.5px] text-soft-ink">{text}</span></span>
            </label>
          ))}
        </div>
        {list ? <p className="m-0 mt-1 text-[10.5px] text-soft-ink">Repeats for each element of <strong>{list.name}</strong>{repeatGroup?.name ? ` (group “${repeatGroup.name}”)` : ""}.</p> : null}
      </div>
    </div>
  );
}
