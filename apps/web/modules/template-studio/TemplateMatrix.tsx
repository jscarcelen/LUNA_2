"use client";

import { useMemo, useState } from "react";
import { ACCENT_PRESETS, builtInBlocks, findBlock, instantiateBlock } from "./engine/blocks";
import { defaultToggles } from "./engine/outputTemplate";
import { ElementView } from "./design/canvas/ElementView";
import { VisualizeModal } from "./TemplateWizard";
import { KIND_LABEL, matrixFamilies, templateComponents, templateKind, type TemplateKind } from "./matrix";
import type { Element } from "./engine/types";

interface Row { id: string; name: string }

/** Scale for the inline cell preview (block natural width ≈ 186mm → ~112px at 0.6 scale). */
const CELL_SCALE = 0.6;

/**
 * Renders a single block at a fixed scale with its assigned accent colour.
 * Memoised so the same blockId+accentId pair is only instantiated once per render.
 */
function BlockCellPreview({ blockId, accentId, onClick }: { blockId: string; accentId: string; onClick: () => void }) {
  const block = useMemo(() => findBlock(blockId), [blockId]);
  const accent = useMemo(() => ACCENT_PRESETS.find((p) => p.id === accentId) || ACCENT_PRESETS[0], [accentId]);
  const { elements, fields } = useMemo(() => {
    if (!block) return { elements: [] as Element[], fields: [] };
    const toggles = defaultToggles(block);
    return instantiateBlock(block, [], { accent, toggles });
  }, [block, accent]);

  const el = elements[0] as Element | undefined;

  if (!el || !block) return <span className="block px-2 text-[10px] text-soft-ink/40">—</span>;

  const previewW = el.frame.w * CELL_SCALE + 8;
  const previewH = el.frame.h * CELL_SCALE + 8;

  return (
    <button
      type="button"
      title={`${block.variant || block.name} · ${accent.label} — click to view full size`}
      onClick={onClick}
      className="group block w-full text-left transition-opacity hover:opacity-80"
    >
      {/* Canvas preview */}
      <div
        className="overflow-hidden rounded-lg bg-[#f0f0f4]"
        style={{ width: previewW, height: previewH, padding: 2 }}
      >
        <div className="relative bg-white shadow-[0_1px_3px_rgba(0,0,0,0.10)]" style={{ width: previewW - 4, height: previewH - 4, overflow: "hidden" }}>
          <ElementView
            element={{ ...el, frame: { ...el.frame, x: 4 / CELL_SCALE, y: 4 / CELL_SCALE } } as Element}
            scale={CELL_SCALE}
            selectedIds={[]}
            fields={fields}
            sampleMode
            sampleValues={{}}
            onPointerDown={() => undefined}
            onResizeStart={() => undefined}
          />
        </div>
      </div>
      {/* Label strip */}
      <div className="mt-1 flex items-center gap-1 px-0.5">
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: accent.main }} />
        <span className="truncate text-[10px] font-semibold text-ink">{block.variant || block.name}</span>
        <span className="ml-auto shrink-0 text-[9px] text-soft-ink opacity-0 group-hover:opacity-100">⤢</span>
      </div>
    </button>
  );
}

/**
 * Templates as columns, components as rows (grouped by category): every cell shows the actual
 * rendered block in the format and accent colour the template assigns it. Click any cell to open
 * the full-size VisualizeModal.
 *
 * Toggle between this and the gallery in SourceChooser via the Gallery / List / Matrix tab strip.
 */
export function TemplateMatrix({ templates }: { templates: Row[] }) {
  const families = useMemo(() => matrixFamilies(), []);
  const columns = useMemo(
    () => templates.map((row) => { const components = templateComponents(row); return { row, components, kind: templateKind(components) as TemplateKind }; }),
    [templates]
  );
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
    <div
      className="mt-3 max-w-full overflow-auto overscroll-contain rounded-2xl border border-ink/10"
      style={{ maxHeight: "72dvh", WebkitOverflowScrolling: "touch" }}
    >
      <table className="tw-table min-w-full border-separate border-spacing-0 text-xs">
        <thead>
          {/* Template name row */}
          <tr>
            <th colSpan={2} className={`${th} sticky left-0 top-0 z-20 min-w-[96px] md:min-w-[220px]`}>
              Templates →
            </th>
            {columns.map(({ row }) => (
              <th key={row.id} className={`${th} sticky top-0 z-10 min-w-[140px] md:min-w-[180px]`}>
                <span className="block truncate text-sm">{row.name}</span>
              </th>
            ))}
          </tr>
          {/* Kind row */}
          <tr>
            <th
              colSpan={2}
              className="sticky left-0 z-20 border-b border-ink/10 bg-[var(--surface-soft)] px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-soft-ink md:px-3 md:text-[11px]"
            >
              Category
            </th>
            {columns.map(({ row, kind }) => (
              <th
                key={row.id}
                className="border-b border-ink/10 bg-[var(--surface-soft)] px-2 py-1.5 text-left text-[11px] font-semibold text-ink md:px-3 md:text-xs"
              >
                {KIND_LABEL[kind].icon} {KIND_LABEL[kind].label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) =>
            group.items.map((entry, index) => (
              <tr key={entry.key}>
                {/* Group label (rotated on mobile, horizontal on md+) */}
                {index === 0 ? (
                  <th
                    rowSpan={group.items.length}
                    scope="rowgroup"
                    className="sticky left-0 z-10 w-7 border-b border-r border-ink/10 bg-[var(--surface-soft)] px-1 py-2 text-center align-middle text-[10px] font-semibold uppercase tracking-[0.08em] text-soft-ink md:w-24 md:px-3 md:text-left md:align-top md:text-[11px]"
                  >
                    <span className="inline-block rotate-180 whitespace-nowrap [writing-mode:vertical-rl] md:rotate-0 md:whitespace-normal md:[writing-mode:horizontal-tb]">
                      {group.label}
                    </span>
                  </th>
                ) : null}
                {/* Family name */}
                <th
                  scope="row"
                  className="sticky left-7 z-10 min-w-[84px] border-b border-ink/10 bg-white px-2 py-2 text-left text-[11px] font-semibold leading-tight text-ink md:left-24 md:min-w-[130px] md:px-3 md:text-xs"
                >
                  {entry.family}
                </th>
                {/* Cell: inline block preview */}
                {columns.map(({ row, components }) => {
                  const used = components[entry.key];
                  return (
                    <td
                      key={row.id}
                      className="border-b border-ink/5 px-2 py-2 align-top md:px-3 md:py-2.5"
                    >
                      {used ? (
                        <BlockCellPreview
                          blockId={used.blockId}
                          accentId={used.accentId}
                          onClick={() => setViewing(used)}
                        />
                      ) : (
                        <span className="block px-1 text-[10px] text-soft-ink/30">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>

      {viewing && viewingBlock ? (
        <VisualizeModal
          block={viewingBlock}
          accentId={viewing.accentId}
          toggles={defaultToggles(viewingBlock)}
          allBlocks={allBlocks}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </div>
  );
}
