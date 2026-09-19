"use client";

import type { Element, FieldDef, GroupElement } from "../../engine/types";
import { findField } from "../../engine/model";
import { GROUP_COLOR } from "../../ui";

export interface ElementViewProps {
  element: Element;
  scale: number;
  selectedIds: string[];
  fields: FieldDef[];
  sampleMode: boolean;
  sampleValues: Record<string, unknown>;
  onPointerDown: (event: React.PointerEvent, element: Element) => void;
  onResizeStart: (event: React.PointerEvent, element: Element) => void;
  /** 1-based item number for `{{n}}`; set by repeat ghosts. */
  ordinal?: number;
  /** Ghost = a faded preview copy of a repeating group; not interactive. */
  ghost?: boolean;
  /** Draw faded copies of repeating groups (items 2–3). Off by default in Design. */
  previewRepeats?: boolean;
}

function textFor(element: Element, fields: FieldDef[], sampleMode: boolean, sampleValues: Record<string, unknown>, ordinal: number): string {
  if (element.type !== "text") return "";
  if (element.source.type === "static") return element.source.value.replace(/\{\{n\}\}/g, String(ordinal)).replace(/\{\{page\}\}/g, "1").replace(/\{\{pages\}\}/g, "1");
  const fieldDef = findField(fields, element.source.fieldId);
  const name = fieldDef?.name || "field";
  if (sampleMode) {
    const value = sampleValues[element.source.fieldId];
    if (value !== undefined) return Array.isArray(value) ? value.join("\n") : String(value);
    if (element.placeholder) return element.placeholder;
  }
  return element.placeholder || `{${name}}`;
}

const GHOSTS = 2;

/**
 * Draws one element the way exports will: the element's own colours, fills and fonts. Repeating
 * groups additionally preview two faded copies so the repetition rule is visible at a glance.
 */
export function ElementView(props: ElementViewProps) {
  const { element, scale, selectedIds, fields, sampleMode, sampleValues, onPointerDown, onResizeStart, ordinal = 1, ghost = false, previewRepeats = false } = props;
  const selected = !ghost && selectedIds.includes(element.id);
  const { x, y, w, h } = element.frame;
  const style = element.style;
  const isGroup = element.type === "group";
  const isField = (element.type === "text" || element.type === "image") && element.source.type === "field";
  const px = (mm: number) => mm * scale;
  const fontPx = (style.fontSize || 11) * scale * 0.3528;
  const textStyle: React.CSSProperties = { fontSize: fontPx, fontWeight: style.fontWeight === "bold" ? 700 : 400, color: style.color || "#1d1d1f", textAlign: style.align || "left", lineHeight: style.lineHeight || 1.35, fontFamily: style.fontFamily === "serif" ? "Georgia, serif" : style.fontFamily === "mono" ? "Menlo, monospace" : "inherit" };

  let body: React.ReactNode = null;
  if (element.type === "text") {
    const text = textFor(element, fields, sampleMode, sampleValues, ordinal);
    body = (
      <div className="relative h-full">
        <div className={`whitespace-pre-wrap break-words ${isField && !sampleMode ? "opacity-90" : ""}`} style={{ ...textStyle, ...(isField && !sampleMode ? { fontStyle: element.placeholder ? "normal" : "italic" } : {}) }}>{text}</div>
      </div>
    );
  } else if (element.type === "image") {
    const src = element.source.type === "static" ? element.source.value : "";
    body = src ? <img src={src} alt="" className="h-full w-full object-contain" draggable={false} /> : <div className="grid h-full w-full place-items-center rounded border border-dashed text-[10px]" style={{ borderColor: isField ? "rgba(0,113,227,0.5)" : "rgba(0,0,0,0.25)", color: isField ? "var(--accent-ink)" : "#6e6e73", background: isField ? "rgba(0,113,227,0.04)" : "transparent" }}>{isField ? "✦ AI image" : "image"}</div>;
  } else if (element.type === "rect" || element.type === "ellipse") {
    body = <div className="h-full w-full" style={{ background: style.fill || "transparent", border: style.stroke ? `${Math.max(1, (style.strokeWidth || 0.3) * scale)}px solid ${style.stroke}` : "none", borderRadius: element.type === "ellipse" ? "50%" : px(style.radius || 0), opacity: style.opacity ?? 1 }} />;
  } else if (element.type === "line" || element.type === "arrow") {
    body = <div className="w-full" style={{ borderTop: `${Math.max(1, px(h || 0.5))}px solid ${style.stroke || "#d2d2d7"}` }} />;
  }

  const group = isGroup ? (element as GroupElement) : null;
  const repeat = group?.repeat || null;
  const repeatText = repeat ? (repeat.mode === "page" ? "one item per page" : repeat.mode === "grid" ? `repeats · ${repeat.columns || 2} columns` : "repeats for each item") : "";
  const groupBox: React.CSSProperties = group
    ? { background: style.fill || "transparent", border: style.stroke ? `${Math.max(1, (style.strokeWidth || 0.3) * scale)}px solid ${style.stroke}` : "none", borderRadius: px(style.radius || 0) }
    : {};
  // Calm by default: only the selected element is emphasised; repeating groups keep a faint dashed edge.
  const outline = ghost ? "none" : selected ? `2px solid ${isGroup ? GROUP_COLOR : "var(--accent)"}` : repeat ? "1px dashed rgba(0,0,0,0.22)" : "1px solid transparent";
  const hoverClass = ghost ? "" : isField ? "hover:[outline:1px_dashed_rgba(0,113,227,0.55)]" : isGroup ? "hover:[outline:1px_dashed_rgba(109,77,230,0.6)]" : "hover:[outline:1px_dashed_rgba(0,0,0,0.25)]";

  // "One of" variants share a spot; on the canvas they are shown stacked so each can be edited.
  const variantOffsets = new Map<string, number>();
  let variantCursor = 0;
  if (group) for (const child of group.children) {
    if (child.type === "group" && child.condition?.fieldId) { variantOffsets.set(child.id, variantCursor); variantCursor += child.frame.h + 3; }
  }
  const stackedHeight = group ? Math.max(h, ...group.children.map((child) => (variantOffsets.get(child.id) ?? 0) + child.frame.y + child.frame.h)) : h;
  const renderChildren = (n: number, asGhost: boolean) => (group ? group.children.map((child) => {
    const offset = variantOffsets.get(child.id);
    const shifted = offset ? ({ ...child, frame: { ...child.frame, y: child.frame.y + offset } } as Element) : child;
    return (
      <span key={child.id}>
        {offset !== undefined && !asGhost && (selected || selectedIds.includes(child.id)) ? <span className="absolute z-30 rounded-md bg-white px-1 text-[8px] font-semibold text-[var(--accent-ink)] ring-1 ring-[var(--accent)]/40" style={{ left: px(child.frame.x) + 2, top: px(child.frame.y + offset) - 7 }}>when {findField(fields, (child as GroupElement).condition!.fieldId)?.name || "field"} = {(child as GroupElement).condition!.equals || "…"}</span> : null}
        <ElementView {...props} element={shifted} ordinal={n} ghost={asGhost} />
      </span>
    );
  }) : null);

  // Ghost copies: where the 2nd and 3rd items would land (flow → below, grid → next columns).
  const ghosts: React.ReactNode[] = [];
  if (group && repeat && !ghost && previewRepeats && repeat.mode !== "page") {
    const gap = group.layout.gap || 0;
    for (let k = 1; k <= GHOSTS; k += 1) {
      const columns = repeat.mode === "grid" ? Math.max(1, repeat.columns || 2) : 1;
      const col = k % columns;
      const row = Math.floor(k / columns);
      const left = px(x + col * (w + gap));
      const top = px(y + row * (h + gap));
      ghosts.push(
        <div key={`ghost-${k}`} className="pointer-events-none absolute z-[5] opacity-35" style={{ left, top, width: px(w), height: px(h), ...groupBox, outline: `1px dashed ${GROUP_COLOR}66`, outlineOffset: 1 }}>
          {renderChildren(k + 1, true)}
        </div>
      );
    }
  }
  const pageStack = group && repeat && repeat.mode === "page" && !ghost && previewRepeats;

  return (
    <>
      {ghosts}
      {pageStack ? [1, 2].map((k) => <div key={`stack-${k}`} className="pointer-events-none absolute z-[4] rounded-sm border border-dashed" style={{ left: px(x) + k * 6, top: px(y) + k * 6, width: px(w), height: px(h), borderColor: `${GROUP_COLOR}66`, background: "rgba(255,255,255,0.7)" }} />) : null}
      <div
        data-element-id={ghost ? undefined : element.id}
        onPointerDown={ghost ? undefined : (event) => onPointerDown(event, element)}
        className={`absolute select-none ${ghost ? "" : element.locked ? "cursor-default" : "cursor-move"} ${selected ? "z-20" : "z-10"} ${selected ? "" : hoverClass}`}
        style={{ left: px(x), top: px(y), width: px(w), minHeight: px(Math.max(h, 1)), height: isGroup ? px(stackedHeight) : undefined, outline, outlineOffset: 1, ...groupBox }}
      >
        {group ? (
          <>
            {!ghost && selected ? <span className="absolute -top-4 left-0 whitespace-nowrap rounded-md px-1.5 py-[1px] text-[9px] font-bold text-white" style={{ background: repeat ? GROUP_COLOR : "#8e8e93" }}>{repeat ? "↻ " : ""}{element.name || "Group"}{repeat ? ` · ${repeatText}` : ""}</span> : null}
            {!ghost && !selected && repeat ? <span className="absolute -top-2 right-0 grid size-4 place-items-center rounded-full bg-white text-[9px] font-bold shadow-[0_1px_2px_rgba(0,0,0,0.15)]" style={{ color: GROUP_COLOR }} title={repeatText}>↻</span> : null}
            {renderChildren(ordinal, ghost)}
          </>
        ) : body}
        {selected && !element.locked ? <span onPointerDown={(event) => onResizeStart(event, element)} className="absolute -bottom-1.5 -right-1.5 size-3 cursor-nwse-resize rounded-sm border border-white" style={{ background: isGroup ? GROUP_COLOR : "var(--accent)" }} /> : null}
      </div>
    </>
  );
}
