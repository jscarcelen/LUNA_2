"use client";

import type { Element, Style } from "../../engine/types";
import { field as fieldClass, label } from "../../ui";
import { Segmented } from "./Segmented";

function Color({ value, fallback, onChange, onClear }: { value?: string; fallback: string; onChange: (value: string) => void; onClear?: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={value || fallback} onChange={(event) => onChange(event.target.value)} className="size-9 cursor-pointer rounded-lg border border-ink/15 bg-white p-0.5" />
      {onClear ? <button type="button" className="text-xs text-soft-ink hover:underline" onClick={onClear}>None</button> : <span className="font-mono text-xs text-soft-ink">{value || fallback}</span>}
    </div>
  );
}

export function StyleTab({ element, onChange }: { element: Element; onChange: (updater: (element: Element) => Element) => void }) {
  const set = (patch: Partial<Style>) => onChange((current) => ({ ...current, style: { ...current.style, ...patch } }));
  const style = element.style;
  const textual = element.type === "text";
  const boxy = element.type === "rect" || element.type === "ellipse" || element.type === "group";
  const linear = element.type === "line" || element.type === "arrow";
  return (
    <div className="grid gap-4">
      {textual ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={label}>Size (pt)</label><input type="number" min="5" max="96" className={fieldClass} value={style.fontSize ?? 11} onChange={(event) => set({ fontSize: Number(event.target.value) || 11 })} /></div>
            <div><label className={label}>Weight</label><select className={fieldClass} value={style.fontWeight || "normal"} onChange={(event) => set({ fontWeight: event.target.value as Style["fontWeight"] })}><option value="normal">Regular</option><option value="bold">Bold</option></select></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={label}>Font</label><select className={fieldClass} value={style.fontFamily || "sans"} onChange={(event) => set({ fontFamily: event.target.value as Style["fontFamily"] })}><option value="sans">Sans</option><option value="serif">Serif</option><option value="mono">Mono</option></select></div>
            <div><label className={label}>Colour</label><Color value={style.color} fallback="#1d1d1f" onChange={(value) => set({ color: value })} /></div>
          </div>
          <div><label className={label}>Alignment</label><Segmented value={style.align || "left"} options={[["left", "Left"], ["center", "Centre"], ["right", "Right"]]} onChange={(value) => set({ align: value })} /></div>
          <div><label className={label}>Line height</label><input type="number" step="0.05" min="0.8" max="3" className={fieldClass} value={style.lineHeight ?? 1.35} onChange={(event) => set({ lineHeight: Number(event.target.value) || 1.35 })} /></div>
        </>
      ) : null}
      {boxy ? (
        <div className="grid grid-cols-2 gap-2">
          <div><label className={label}>Fill</label><Color value={style.fill} fallback="#ffffff" onChange={(value) => set({ fill: value })} onClear={() => set({ fill: "" })} /></div>
          <div><label className={label}>Border</label><Color value={style.stroke} fallback="#d2d2d7" onChange={(value) => set({ stroke: value })} onClear={() => set({ stroke: "" })} /></div>
          {element.type !== "ellipse" ? <div><label className={label}>Corner radius (mm)</label><input type="number" min="0" className={fieldClass} value={style.radius ?? 0} onChange={(event) => set({ radius: Number(event.target.value) || 0 })} /></div> : null}
          <div><label className={label}>Border width (mm)</label><input type="number" min="0" step="0.1" className={fieldClass} value={style.strokeWidth ?? 0.3} onChange={(event) => set({ strokeWidth: Number(event.target.value) || 0 })} /></div>
        </div>
      ) : null}
      {linear ? <div><label className={label}>Colour</label><Color value={style.stroke} fallback="#d2d2d7" onChange={(value) => set({ stroke: value })} /></div> : null}
      <div><label className={label}>Opacity</label><input type="range" min="0" max="1" step="0.05" value={style.opacity ?? 1} onChange={(event) => set({ opacity: Number(event.target.value) })} className="w-full" /></div>
    </div>
  );
}
