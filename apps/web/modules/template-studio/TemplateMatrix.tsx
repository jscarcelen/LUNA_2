"use client";

import { useMemo, useState } from "react";
import { ACCENT_PRESETS, builtInBlocks, findBlock } from "./engine/blocks";
import { defaultToggles } from "./engine/outputTemplate";
import { VisualizeModal } from "./TemplateWizard";
import { KIND_LABEL, matrixFamilies, templateComponents, templateKind, type TemplateKind } from "./matrix";
import { ghostBtn } from "./ui";

interface Row { id: string; name: string }

/**
 * Templates as columns, components as rows (grouped by what they are): every cell says, with its
 * colour, which format of the component the template uses. "View" shows the component itself.
 */
export function TemplateMatrix({ templates }: { templates: Row[] }) {
  const families = useMemo(() => matrixFamilies(), []);
  const columns = useMemo(() => templates.map((row) => { const components = templateComponents(row); return { row, components, kind: templateKind(components) as TemplateKind }; }), [templates]);
  const [viewing, setViewing] = useState<{ blockId: string; accentId: string } | null>(null);
  const allBlocks = useMemo(() => builtInBlocks(), []);

  if (!columns.length) return <p className="m-0 mt-3 text-sm text-soft-ink">No templates to compare yet.</p>;

  const groups = families.reduce<{ label: string; items: typeof families }[]>((list, entry) => {
    const last = list[list.length - 1];
    if (last && last.label === entry.group) last.items.push(entry); else list.push({ label: entry.group, items: [entry] });
    return list;
  }, []);
  const viewingBlock = viewing ? findBlock(viewing.blockId) : null;
  const th = "border-b border-ink/10 bg-white px-3 py-2 text-left align-bottom text-xs font-semibold text-ink";

  return (
    <div className="mt-3 overflow-auto rounded-2xl border border-ink/10" style={{ maxHeight: "70vh" }}>
      <table className="min-w-full border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th colSpan={2} className={`${th} sticky left-0 top-0 z-20 min-w-[220px]`}>Templates →</th>
            {columns.map(({ row }) => <th key={row.id} className={`${th} sticky top-0 z-10 min-w-[170px]`}><span className="block truncate text-sm">{row.name}</span></th>)}
          </tr>
          <tr>
            <th colSpan={2} className="sticky left-0 z-20 border-b border-ink/10 bg-[var(--surface-soft)] px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-soft-ink">Category</th>
            {columns.map(({ row, kind }) => <th key={row.id} className="border-b border-ink/10 bg-[var(--surface-soft)] px-3 py-1.5 text-left text-xs font-semibold text-ink">{KIND_LABEL[kind].icon} {KIND_LABEL[kind].label}</th>)}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => group.items.map((entry, index) => (
            <tr key={entry.key}>
              {index === 0 ? (
                <th rowSpan={group.items.length} scope="rowgroup" className="sticky left-0 z-10 w-24 border-b border-r border-ink/10 bg-[var(--surface-soft)] px-3 py-2 text-left align-top text-[11px] font-semibold uppercase tracking-[0.08em] text-soft-ink">{group.label}</th>
              ) : null}
              <th scope="row" className="sticky left-24 z-10 border-b border-ink/10 bg-white px-3 py-2 text-left text-xs font-semibold text-ink">{entry.family}</th>
              {columns.map(({ row, components }) => {
                const used = components[entry.key];
                const block = used ? findBlock(used.blockId) : null;
                const accent = used ? ACCENT_PRESETS.find((preset) => preset.id === used.accentId) || ACCENT_PRESETS[0] : null;
                return (
                  <td key={row.id} className="border-b border-ink/5 px-2 py-1.5 align-middle">
                    {used && block && accent ? (
                      <div className="flex items-center gap-2 rounded-xl px-2 py-1.5" style={{ background: accent.tint, boxShadow: `inset 3px 0 0 ${accent.main}` }}>
                        <span className="size-3 shrink-0 rounded-full" style={{ background: accent.main }} />
                        <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-ink">{block.variant || block.name}</span><span className="block text-[10px] text-soft-ink">{accent.label}</span></span>
                        <button type="button" className={`${ghostBtn} !px-2 !py-0.5 !text-[11px]`} onClick={() => setViewing(used)}>View</button>
                      </div>
                    ) : <span className="block px-2 text-soft-ink/50">—</span>}
                  </td>
                );
              })}
            </tr>
          )))}
        </tbody>
      </table>
      {viewing && viewingBlock ? <VisualizeModal block={viewingBlock} accentId={viewing.accentId} toggles={defaultToggles(viewingBlock)} allBlocks={allBlocks} onClose={() => setViewing(null)} /> : null}
    </div>
  );
}
