"use client";

import type { Element, FieldDef, GroupElement, Layout, Page } from "../engine/types";
import { findField, isPinned, simpleOrder } from "../engine/model";
import { isSequenceGroup, sequenceMembers } from "../engine/blocks";
import { GROUP_COLOR, card, kicker } from "../ui";

export interface SimpleDesignProps {
  layout: Layout;
  page: Page;
  fields: FieldDef[];
  selection: string[];
  onSelect: (ids: string[]) => void;
  onReorder: (orderedIds: string[]) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onSetRepeat: (id: string, mode: "none" | "flow" | "page" | "grid") => void;
  onChangeElement: (id: string, updater: (element: Element) => Element) => void;
  onAgentOrder: (id: string, on: boolean) => void;
  onExtractFromSet: (setId: string, childId: string) => void;
  onAddToSet: (setId: string) => void;
  onAdvanced: () => void;
  /** Agent Studio composer mode: hides formatting controls. */
  composer?: boolean;
}

function elementName(element: Element): string {
  if (element.name) return element.name;
  if (element.type === "text") return element.source.type === "static" ? element.source.value.slice(0, 40) || "Text" : "AI text";
  if (element.type === "image") return element.source.type === "field" ? "AI image" : "Image";
  return element.type === "group" ? "Group" : element.type;
}

function repeatSummary(element: Element, fields: FieldDef[]): { label: string; tone: "once" | "repeat" | "page" } {
  if (element.type !== "group" || !element.repeat) {
    const scope = element.type === "group" ? element.pageScope?.mode : null;
    return { label: scope === "every" ? "Every page" : scope === "first" ? "First page" : "Once", tone: "once" };
  }
  const list = findField(fields, element.repeat.fieldId)?.name || "items";
  if (element.repeat.mode === "page") return { label: `One per page / slide`, tone: "page" };
  if (element.repeat.mode === "grid") return { label: `Grid`, tone: "repeat" };
  return { label: `Repeats for each item`, tone: "repeat" };
}

function fieldsOf(element: Element): string[] {
  const out: string[] = [];
  const walk = (list: Element[]) => list.forEach((item) => {
    if ((item.type === "text" || item.type === "image") && item.source.type === "field") out.push(item.id);
    if (item.type === "group") walk(item.children);
  });
  walk(element.type === "group" ? element.children : [element]);
  return out;
}

function nestedRepeats(element: Element, fields: FieldDef[]): string[] {
  const out: string[] = [];
  const walk = (list: Element[]) => {
    const variants = list.filter((item): item is GroupElement => item.type === "group" && Boolean(item.condition?.fieldId));
    if (variants.length) out.push(`${variants.length} design variants by ${findField(fields, variants[0].condition!.fieldId)?.name || "field"}`);
    list.forEach((item) => { if (item.type === "group") { if (item.repeat) out.push(`↳ ${item.name || "Group"}: repeats for each ${findField(fields, item.repeat.fieldId)?.name || "item"}`); walk(item.children); } });
  };
  if (element.type === "group") walk(element.children);
  return out;
}

/** Role badge color: headers green, footers grey, repeating content blue. */
function roleColor(repeat: ReturnType<typeof repeatSummary>, isHeader: boolean, isFooter: boolean) {
  if (isHeader) return { bg: "#f0fdf4", text: "#166534", border: "#bbf7d0" };
  if (isFooter) return { bg: "#f8f9fa", text: "#6b7280", border: "#e5e7eb" };
  if (repeat.tone === "repeat") return { bg: GROUP_COLOR + "18", text: GROUP_COLOR, border: GROUP_COLOR + "44" };
  if (repeat.tone === "page") return { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" };
  return { bg: "var(--surface-soft)", text: "#6b7280", border: "transparent" };
}

/**
 * Simplified block list — visual, position-is-obvious, no placement dropdown.
 *
 * Headers and footers are labelled as such; content blocks show whether they repeat.
 * The layout is three columns: number badge | name + repeat control | move / delete.
 */
export function SimpleDesign({ layout, page, fields, selection, onSelect, onReorder, onDuplicate, onDelete, onSetRepeat, onChangeElement: _onChangeElement, onAgentOrder: _onAgentOrder, onExtractFromSet, onAddToSet, onAdvanced: _onAdvanced, composer = false }: SimpleDesignProps) {
  const ordered = simpleOrder(page.elements, layout);
  const ids = ordered.map((e) => e.id);
  const move = (id: string, dir: -1 | 1) => {
    const i = ids.indexOf(id);
    const t = i + dir;
    if (i < 0 || t < 0 || t >= ids.length) return;
    const next = [...ids];
    [next[i], next[t]] = [next[t], next[i]];
    onReorder(next);
  };

  return (
    <div className={`${card} p-4`} style={{ minHeight: 540 }}>
      <div className="mb-3">
        <p className={kicker}>{composer ? "Output blocks · in this order" : "Template blocks · top to bottom"}</p>
        <p className="m-0 mt-0.5 text-xs text-soft-ink">
          {composer
            ? "Select the blocks the agent should fill. Headers and footers appear on every page; content blocks repeat once per generated item."
            : "Each block is one section of the document. Headers and footers are fixed; content blocks can repeat for each AI-generated item."}
        </p>
      </div>

      <div className="grid gap-2">
        {ordered.map((element, index) => {
          const selected = selection.includes(element.id);
          const repeat = repeatSummary(element, fields);
          const fieldIds = fieldsOf(element);
          const nested = nestedRepeats(element, fields);
          const isGroup = element.type === "group";
          const isSet = isSequenceGroup(element);
          const setMembers = isSet ? sequenceMembers(element as GroupElement) : [];
          const elementId = element.id;
          const pinned = isPinned(element, layout);
          const name = elementName(element).toLowerCase();
          const isHeader = name.includes("header") || (isGroup && (element as GroupElement).pageScope?.mode === "first");
          const isFooter = name.includes("footer") || pinned;
          const colors = roleColor(repeat, isHeader, isFooter);
          const badgeIcon = isHeader ? "▔" : isFooter ? "▁" : repeat.tone === "once" ? String(index + 1) : "↻";

          return (
            <div
              key={element.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect([element.id])}
              onKeyDown={(e) => e.key === "Enter" && onSelect([element.id])}
              className={`grid cursor-pointer grid-cols-[2.5rem_1fr_auto] items-start gap-3 rounded-2xl border p-3 transition ${selected ? "border-[var(--accent)] bg-[var(--accent-soft)]/20 ring-2 ring-[var(--accent-soft)]" : "border-ink/10 hover:border-ink/20 hover:bg-[var(--surface-soft)]/60"}`}
            >
              {/* Badge */}
              <span
                className="mt-0.5 grid size-9 place-items-center rounded-xl text-sm font-bold"
                style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
              >
                {badgeIcon}
              </span>

              {/* Content */}
              <div className="min-w-0">
                {/* Name row */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-bold text-ink">{elementName(element)}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
                    title={
                      isHeader ? "Appears once at the top of the first page." :
                      isFooter ? "Pinned to the bottom of every page." :
                      repeat.tone === "page" ? "One item per page or slide — ideal for presentations." :
                      repeat.tone === "repeat" ? "Repeats once for every item the agent generates." :
                      "Appears once in the whole document."
                    }
                  >
                    {isHeader ? "Header" : isFooter ? "Footer" : repeat.label}
                  </span>
                </div>

                {/* AI fields */}
                {fieldIds.length > 0 && !isSet ? (
                  <p className="m-0 mt-1.5 flex flex-wrap gap-1">
                    {fieldIds.slice(0, 10).map((id) => { const f = findField(fields, id); return f ? <span key={id} className="rounded-md bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent-ink)]">✦ {f.name}</span> : null; })}
                  </p>
                ) : !fieldIds.length && !isSet ? (
                  <p className="m-0 mt-1 text-[11px] text-soft-ink">Fixed content</p>
                ) : null}

                {/* Agent-ordered set members */}
                {isSet ? (
                  <div className="mt-2 rounded-xl border border-dashed p-2" style={{ borderColor: `${GROUP_COLOR}55`, background: `${GROUP_COLOR}0a` }} onClick={(e) => e.stopPropagation()}>
                    <p className="m-0 mb-1.5 text-[10.5px] font-semibold text-soft-ink">Designs — agent picks which to use and where:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {setMembers.map((m) => (
                        <span key={m.child.id} className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white py-0.5 pl-2.5 pr-1 text-[11px] font-semibold text-ink">
                          {m.block ? (m.block.variant ? `${m.block.family} · ${m.block.variant}` : m.block.name) : m.child.name}
                          <button type="button" title="Remove from set" className="grid size-4 place-items-center rounded-full text-soft-ink hover:text-[var(--color-danger)]" onClick={() => onExtractFromSet(elementId, m.child.id)}>✕</button>
                        </span>
                      ))}
                      <button type="button" className="rounded-full border border-dashed border-[var(--accent)]/40 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-soft)]" onClick={() => onAddToSet(elementId)}>＋ Design</button>
                    </div>
                  </div>
                ) : null}

                {/* Nested repeat info */}
                {!isSet ? nested.map((line) => <p key={line} className="m-0 mt-0.5 text-[10.5px] text-soft-ink">{line}</p>) : null}

                {/* Repeat mode — only for non-header, non-footer groups */}
                {isGroup && !isSet && !isHeader && !isFooter ? (
                  <div className="mt-2 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                    {([
                      ["none", "Once", "Appears a single time in the document."],
                      ["flow", "Repeat per item", "One copy per AI-generated item — questions, flashcards, etc."],
                      ["page", "One per page / slide", "Each item on its own page — for presentations or card decks."],
                      ["grid", "Grid", "Items arranged side-by-side in a grid."]
                    ] as const).map(([mode, text, tip]) => {
                      const current = (element as GroupElement).repeat?.mode || "none";
                      return (
                        <button key={mode} type="button" title={tip} onClick={() => onSetRepeat(elementId, mode)}
                          className={`rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold transition ${current === mode ? "border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "border-ink/10 text-soft-ink hover:text-ink"}`}
                        >{text}</button>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              {/* Move / delete */}
              <div className="flex flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
                <span className="flex gap-1">
                  <button type="button" className="rounded-md border border-ink/15 px-2 py-0.5 text-xs disabled:opacity-25" disabled={index === 0} onClick={() => move(element.id, -1)} title="Move up">▲</button>
                  <button type="button" className="rounded-md border border-ink/15 px-2 py-0.5 text-xs disabled:opacity-25" disabled={index === ordered.length - 1} onClick={() => move(element.id, 1)} title="Move down">▼</button>
                </span>
                <span className="flex gap-2 text-[11px]">
                  <button type="button" className="text-soft-ink hover:text-ink" onClick={() => onDuplicate(element.id)}>Dup</button>
                  <button type="button" className="text-soft-ink hover:text-[var(--color-danger)]" onClick={() => onDelete(element.id)}>Delete</button>
                </span>
              </div>
            </div>
          );
        })}

        {!ordered.length ? (
          <p className="m-0 rounded-2xl border border-dashed border-ink/15 p-8 text-center text-sm text-soft-ink">
            Add a header, questions, or a footer from the panel on the left.
          </p>
        ) : null}
      </div>
    </div>
  );
}
