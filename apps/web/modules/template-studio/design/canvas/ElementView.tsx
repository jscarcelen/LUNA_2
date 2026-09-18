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
}

function textFor(element: Element, fields: FieldDef[], sampleMode: boolean, sampleValues: Record<string, unknown>): string {
  if (element.type !== "text") return "";
  if (element.source.type === "static") return element.source.value;
  const fieldDef = findField(fields, element.source.fieldId);
  const name = fieldDef?.name || "field";
  if (sampleMode) {
    const value = sampleValues[element.source.fieldId];
    if (value !== undefined) return Array.isArray(value) ? value.join("\n") : String(value);
    if (element.placeholder) return element.placeholder;
  }
  return `{${name}}`;
}

/** Draws one element on the canvas. Groups draw their children; layout mode is previewed as a stack. */
export function ElementView({ element, scale, selectedIds, fields, sampleMode, sampleValues, onPointerDown, onResizeStart }: ElementViewProps) {
  const selected = selectedIds.includes(element.id);
  const { x, y, w, h } = element.frame;
  const style = element.style;
  const isGroup = element.type === "group";
  const isField = element.type === "text" && element.source.type === "field";
  const px = (mm: number) => mm * scale;
  const fontPx = (style.fontSize || 11) * scale * 0.3528;
  const textStyle: React.CSSProperties = { fontSize: fontPx, fontWeight: style.fontWeight === "bold" ? 700 : 400, color: style.color || "#1d1d1f", textAlign: style.align || "left", lineHeight: style.lineHeight || 1.35, fontFamily: style.fontFamily === "serif" ? "Georgia, serif" : style.fontFamily === "mono" ? "Menlo, monospace" : "inherit" };

  let body: React.ReactNode = null;
  if (element.type === "text") {
    body = (
      <div className="relative h-full">
        {isField && sampleMode ? <span className="absolute -top-3.5 left-0 rounded bg-[var(--accent-soft)] px-1 text-[8px] font-semibold text-[var(--accent-ink)]">AI · {findField(fields, (element.source as { fieldId: string }).fieldId)?.name || "field"}</span> : null}
        <div className={`whitespace-pre-wrap break-words ${isField && !sampleMode ? "rounded bg-[rgba(0,113,227,0.07)] text-[var(--accent-ink)]" : ""}`} style={textStyle}>{textFor(element, fields, sampleMode, sampleValues)}</div>
      </div>
    );
  } else if (element.type === "image") {
    const src = element.source.type === "static" ? element.source.value : "";
    body = src ? <img src={src} alt="" className="h-full w-full object-contain" draggable={false} /> : <div className="grid h-full w-full place-items-center rounded border border-dashed border-ink/25 text-[10px] text-soft-ink">{element.source.type === "field" ? "AI image" : "image"}</div>;
  } else if (element.type === "rect" || element.type === "ellipse") {
    body = <div className="h-full w-full" style={{ background: style.fill || "transparent", border: style.stroke ? `${Math.max(1, (style.strokeWidth || 0.3) * scale)}px solid ${style.stroke}` : "none", borderRadius: element.type === "ellipse" ? "50%" : px(style.radius || 0), opacity: style.opacity ?? 1 }} />;
  } else if (element.type === "line" || element.type === "arrow") {
    body = <div className="w-full" style={{ borderTop: `${Math.max(1, px(h || 0.5))}px solid ${style.stroke || "#d2d2d7"}` }} />;
  }

  const group = isGroup ? (element as GroupElement) : null;
  const repeatLabel = group?.repeat ? (group.repeat.mode === "page" ? "one per page" : group.repeat.mode === "grid" ? "repeat · grid" : "repeat items") : "static";
  const stackHint = group && group.layout.mode !== "free" ? ` · ${group.layout.mode}` : "";

  return (
    <div
      data-element-id={element.id}
      onPointerDown={(event) => onPointerDown(event, element)}
      className={`absolute select-none ${element.locked ? "cursor-default" : "cursor-move"} ${selected ? "z-20" : "z-10"}`}
      style={{ left: px(x), top: px(y), width: px(w), minHeight: px(Math.max(h, 1)), height: isGroup ? px(h) : undefined, outline: selected ? `2px solid ${isGroup ? GROUP_COLOR : "var(--accent)"}` : isGroup ? `1.5px dashed ${GROUP_COLOR}88` : "1px solid transparent", outlineOffset: 1, borderRadius: 2, background: isGroup ? `${GROUP_COLOR}0a` : undefined }}
    >
      {isGroup ? (
        <>
          <span className="absolute -top-5 left-0 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: GROUP_COLOR }}>↻ {element.name || "Group"} · {repeatLabel}{stackHint}</span>
          {(element as GroupElement).children.map((child) => (
            <ElementView key={child.id} element={child} scale={scale} selectedIds={selectedIds} fields={fields} sampleMode={sampleMode} sampleValues={sampleValues} onPointerDown={onPointerDown} onResizeStart={onResizeStart} />
          ))}
        </>
      ) : body}
      {selected && !element.locked ? <span onPointerDown={(event) => onResizeStart(event, element)} className="absolute -bottom-1.5 -right-1.5 size-3 cursor-nwse-resize rounded-sm border border-white" style={{ background: isGroup ? GROUP_COLOR : "var(--accent)" }} /> : null}
    </div>
  );
}
