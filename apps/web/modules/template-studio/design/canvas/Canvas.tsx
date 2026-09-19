"use client";

import { useEffect, useRef, useState } from "react";
import type { Element, GroupElement, ID, Layout, Page, FieldDef } from "../../engine/types";
import { findElement, updateElement } from "../../engine/model";
import { ElementView } from "./ElementView";
import { FloatingToolbar, type FloatingToolbarProps } from "./FloatingToolbar";
import { card } from "../../ui";

const MAX_SCALE = 3;

export interface CanvasProps {
  layout: Layout;
  page: Page;
  pageIndex: number;
  pageCount: number;
  fields: FieldDef[];
  selection: ID[];
  sampleMode: boolean;
  sampleValues: Record<string, unknown>;
  dimBackground: boolean;
  onSelect: (ids: ID[]) => void;
  onMove: (ids: ID[], starts: Record<ID, { x: number; y: number }>, dx: number, dy: number, transient: boolean) => void;
  onResize: (id: ID, w: number, h: number, transient: boolean) => void;
  toolbar: Omit<FloatingToolbarProps, "count">;
}

/** The page surface: scale-to-fit, margin guides, background layer, elements, selection handles. */
export function Canvas({ layout, page, pageIndex, pageCount, fields, selection, sampleMode, sampleValues, dimBackground, onSelect, onMove, onResize, toolbar }: CanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(MAX_SCALE);
  const [previewRepeats, setPreviewRepeats] = useState(false);
  const dragRef = useRef<{ kind: "move"; ids: ID[]; startX: number; startY: number; starts: Record<ID, { x: number; y: number }>; moved: boolean } | { kind: "resize"; id: ID; startX: number; startY: number; w: number; h: number } | null>(null);
  const { width, height } = layout.canvas;
  const { margins } = layout;

  useEffect(() => {
    const node = wrapRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => setScale(Math.max(1, Math.min(MAX_SCALE, (entry.contentRect.width - 32) / width))));
    observer.observe(node);
    return () => observer.disconnect();
  }, [width]);

  function onPointerDown(event: React.PointerEvent, element: Element) {
    event.stopPropagation();
    if (element.locked) return;
    const ids = event.shiftKey ? (selection.includes(element.id) ? selection.filter((id) => id !== element.id) : [...selection, element.id]) : selection.includes(element.id) ? selection : [element.id];
    onSelect(ids);
    const starts: Record<ID, { x: number; y: number }> = {};
    for (const id of ids) {
      const found = findElement(page.elements, id);
      if (found.element) starts[id] = { x: found.element.frame.x, y: found.element.frame.y };
    }
    dragRef.current = { kind: "move", ids, startX: event.clientX, startY: event.clientY, starts, moved: false };
  }
  function onResizeStart(event: React.PointerEvent, element: Element) {
    event.stopPropagation();
    dragRef.current = { kind: "resize", id: element.id, startX: event.clientX, startY: event.clientY, w: element.frame.w, h: element.frame.h };
  }
  function onPointerMove(event: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (event.clientX - drag.startX) / scale;
    const dy = (event.clientY - drag.startY) / scale;
    if (drag.kind === "move") {
      if (!drag.moved && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      drag.moved = true;
      onMove(drag.ids, drag.starts, dx, dy, true);
    } else {
      onResize(drag.id, Math.max(4, drag.w + dx), Math.max(0.3, drag.h + dy), true);
    }
  }
  function onPointerUp(event: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (event.clientX - drag.startX) / scale;
    const dy = (event.clientY - drag.startY) / scale;
    if (drag.kind === "move" && drag.moved) onMove(drag.ids, drag.starts, dx, dy, false);
    if (drag.kind === "resize") onResize(drag.id, Math.max(4, drag.w + dx), Math.max(0.3, drag.h + dy), false);
    dragRef.current = null;
  }

  const bg = page.background;
  const bgSrc = bg.type === "image" || bg.type === "pdf" ? (bg.visible === false ? "" : bg.src) : "";
  const bgColor = bg.type === "color" ? bg.value : bg.type === "gradient" ? `linear-gradient(${bg.angle}deg, ${bg.from}, ${bg.to})` : "#fff";
  const selectedGroup = selection.length === 1 ? (findElement(page.elements, selection[0]).element as GroupElement | null) : null;

  return (
    <div ref={wrapRef} className={`${card} relative overflow-auto p-4`} style={{ background: "#e9e9ee", minHeight: 640 }} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
      <div className="mb-2 flex items-center justify-between text-[11px] text-soft-ink">
        <span>Page {pageIndex + 1} of {pageCount} · {width}×{height} mm · {layout.name}</span>
        <span className="flex items-center gap-3">
          <span>Drag to move · corner to resize · shift-click to multi-select · ⌫ deletes · ⌘Z undo</span>
          <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-ink/10 bg-white px-2 py-0.5 font-semibold text-ink"><input type="checkbox" checked={previewRepeats} onChange={(event) => setPreviewRepeats(event.target.checked)} />Show repetitions ×3</label>
        </span>
      </div>
      <div className="pointer-events-none sticky top-2 z-30 mb-2 flex justify-center">
        <FloatingToolbar count={selection.length} {...toolbar} canUngroup={Boolean(selectedGroup && selectedGroup.type === "group")} />
      </div>
      <div
        onPointerDown={() => onSelect([])}
        className="relative mx-auto shadow-[0_2px_16px_rgba(0,0,0,0.15)]"
        style={{ width: width * scale, height: height * scale, background: bgColor }}
      >
        {bgSrc ? <img src={bgSrc} alt="" className="pointer-events-none absolute inset-0 h-full w-full" style={{ opacity: (bg.type === "image" || bg.type === "pdf" ? bg.opacity ?? 1 : 1) * (dimBackground ? 0.5 : 1) }} draggable={false} /> : null}
        <div className="pointer-events-none absolute z-0 border border-dashed border-[var(--accent)]/35" style={{ left: margins.left * scale, top: margins.top * scale, width: (width - margins.left - margins.right) * scale, height: (height - margins.top - margins.bottom) * scale }} />
        {page.elements.map((element) => (
          <ElementView key={element.id} element={element} scale={scale} selectedIds={selection} fields={fields} sampleMode={sampleMode} sampleValues={sampleValues} onPointerDown={onPointerDown} onResizeStart={onResizeStart} previewRepeats={previewRepeats} />
        ))}
      </div>
    </div>
  );
}

export { updateElement };
