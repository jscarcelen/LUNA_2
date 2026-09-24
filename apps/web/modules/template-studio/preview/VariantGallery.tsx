"use client";

import type { Element, GroupElement, Template } from "../engine/types";
import { simpleOrder } from "../engine/model";
import { isSequenceGroup, sequenceMembers } from "../engine/blocks";
import { ElementView } from "../design/canvas/ElementView";
import { componentName } from "../design/ComponentPreview";
import { card, kicker } from "../ui";

export interface VariantSet { id: string; name: string; designs: { id: string; name: string; typeValue: string; element: GroupElement }[] }

/** Every component that is a set of interchangeable designs, with the designs it can become. */
export function variantSets(template: Template): VariantSet[] {
  const sets: VariantSet[] = [];
  for (const layout of template.layouts) {
    for (const page of layout.pages) {
      for (const component of simpleOrder(page.elements, layout)) {
        if (!isSequenceGroup(component)) continue;
        const designs = sequenceMembers(component as GroupElement).map((member) => ({
          id: member.child.id,
          name: member.block ? (member.block.variant ? `${member.block.family} · ${member.block.variant}` : member.block.name) : member.child.name || member.typeValue,
          typeValue: member.typeValue,
          element: member.child
        }));
        if (designs.length) sets.push({ id: component.id, name: componentName(component), designs });
      }
    }
  }
  return sets;
}

/**
 * A component can be a set of designs — a question that is multiple choice, true/false or open.
 * Which one each item uses is the agent's call, so the preview shows every possibility side by
 * side with sample content, instead of leaving the reader guessing from the one that happened to
 * come out of the sample data.
 */
export function VariantGallery({ sets, fields, sampleValues, onShowAll, itemsShown }: { sets: VariantSet[]; fields: Template["fields"]; sampleValues: Record<string, unknown>; onShowAll?: (count: number) => void; itemsShown: number }) {
  if (!sets.length) return null;
  const most = Math.max(...sets.map((set) => set.designs.length));
  return (
    <section className={`${card} p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className={kicker}>Interchangeable designs</p>
          <p className="m-0 mt-1 text-xs text-soft-ink">The agent decides which design each item uses. Any of these can appear, in any order.</p>
        </div>
        {onShowAll && itemsShown < most ? <button type="button" className="text-xs font-semibold text-[var(--accent-ink)] hover:underline" onClick={() => onShowAll(most)}>Show {most} items so every design appears</button> : null}
      </div>
      <div className="mt-3 grid gap-4">
        {sets.map((set) => (
          <div key={set.id}>
            <p className="m-0 text-sm font-bold text-ink">{set.name} <span className="font-normal text-soft-ink">· any one of {set.designs.length}</span></p>
            <div className="mt-2 flex gap-3 overflow-x-auto pb-1">
              {set.designs.map((design, index) => {
                const scale = Math.min(1.1, 230 / Math.max(40, design.element.frame.w));
                return (
                  <figure key={design.id} className="m-0 shrink-0">
                    <div className="relative overflow-hidden rounded-xl border border-ink/12 bg-white" style={{ width: design.element.frame.w * scale + 8, height: design.element.frame.h * scale + 8 }}>
                      <ElementView
                        element={{ ...design.element, frame: { ...design.element.frame, x: 4 / scale, y: 4 / scale } } as Element}
                        scale={scale}
                        selectedIds={[]}
                        fields={fields}
                        sampleMode
                        sampleValues={sampleValues}
                        ordinal={index + 1}
                        onPointerDown={() => undefined}
                        onResizeStart={() => undefined}
                      />
                    </div>
                    <figcaption className="mt-1 max-w-[240px] truncate text-[11px] font-semibold text-ink">{design.name}<span className="ml-1 font-normal text-soft-ink">Type = {design.typeValue}</span></figcaption>
                  </figure>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
