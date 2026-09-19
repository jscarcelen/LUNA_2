"use client";

import { useRef, useState } from "react";
import type { Background, Element, FieldDef, GroupElement, Layout, Page, View } from "../../engine/types";
import { componentLabel } from "../../engine/registry";
import { card, field as fieldClass, fieldBase, ghostBtn, label } from "../../ui";
import { ContentTab } from "./ContentTab";
import { LayoutTab } from "./LayoutTab";
import { RepeatTab } from "./RepeatTab";
import { Segmented } from "./Segmented";
import { StyleTab } from "./StyleTab";
import { VisibilityTab } from "./VisibilityTab";
import { AiFieldPanel, type RepeatChoice } from "./AiFieldPanel";

type Tab = "content" | "layout" | "style" | "visibility" | "repeat";

export interface InspectorProps {
  layout: Layout;
  page: Page;
  views: View[];
  fields: FieldDef[];
  element: Element | null;
  parentChain: GroupElement[];
  selectionCount: number;
  dimBackground: boolean;
  onDimBackground: (on: boolean) => void;
  onChangeElement: (updater: (element: Element) => Element) => void;
  onChangePage: (updater: (page: Page) => Page) => void;
  onChangeLayout: (updater: (layout: Layout) => Layout) => void;
  onBackgroundFile: (file: File) => void;
  onAddField: (field: FieldDef, intoArrayId: string | null) => void;
  onRenameField: (fieldId: string, name: string) => void;
  onRetypeField: (fieldId: string, type: FieldDef["type"]) => void;
  onSetRepeat: (choice: RepeatChoice) => void;
}

function PageInspector({ layout, page, dimBackground, onDimBackground, onChangePage, onChangeLayout, onBackgroundFile }: Pick<InspectorProps, "layout" | "page" | "dimBackground" | "onDimBackground" | "onChangePage" | "onChangeLayout" | "onBackgroundFile">) {
  const fileRef = useRef<HTMLInputElement>(null);
  const bg = page.background;
  const kind = bg.type;
  const setBackground = (background: Background) => onChangePage((current) => ({ ...current, background }));
  return (
    <div className="grid gap-4 p-5">
      <p className="m-0 text-sm font-bold text-ink">Page</p>
      <div>
        <label className={label}>Background</label>
        <Segmented value={kind === "pdf" ? "image" : kind} options={[["none", "None"], ["color", "Colour"], ["gradient", "Gradient"], ["image", "Image / PDF"]]} onChange={(value) => {
          if (value === "none") setBackground({ type: "none" });
          else if (value === "color") setBackground({ type: "color", value: "#f5f5f7" });
          else if (value === "gradient") setBackground({ type: "gradient", from: "#eef2ff", to: "#ffffff", angle: 180 });
          else fileRef.current?.click();
        }} />
        {bg.type === "color" ? <input type="color" className="mt-2 size-9 cursor-pointer rounded-lg border border-ink/15 bg-white p-0.5" value={bg.value} onChange={(event) => setBackground({ type: "color", value: event.target.value })} /> : null}
        {bg.type === "gradient" ? <div className="mt-2 flex items-center gap-2"><input type="color" className="size-9 cursor-pointer rounded-lg border border-ink/15 bg-white p-0.5" value={bg.from} onChange={(event) => setBackground({ ...bg, from: event.target.value })} /><input type="color" className="size-9 cursor-pointer rounded-lg border border-ink/15 bg-white p-0.5" value={bg.to} onChange={(event) => setBackground({ ...bg, to: event.target.value })} /><input type="number" className={`${fieldBase} w-20 px-2 py-1 text-xs`} value={bg.angle} onChange={(event) => setBackground({ ...bg, angle: Number(event.target.value) || 0 })} /></div> : null}
        {bg.type === "image" || bg.type === "pdf" ? (
          <div className="mt-2 grid gap-2">
            <div className="flex items-center gap-2"><img src={bg.src} alt="" className="h-14 w-10 rounded border border-ink/10 object-cover" /><button type="button" className={ghostBtn} onClick={() => fileRef.current?.click()}>Replace</button><button type="button" className={ghostBtn} onClick={() => setBackground({ type: "none" })}>Remove</button></div>
            <label className="flex items-center justify-between text-sm text-ink"><span>🔒 Locked</span><input type="checkbox" checked={bg.locked} onChange={(event) => setBackground({ ...bg, locked: event.target.checked })} /></label>
            <label className="flex items-center justify-between text-sm text-ink"><span>Visible</span><input type="checkbox" checked={bg.visible !== false} onChange={(event) => setBackground({ ...bg, visible: event.target.checked })} /></label>
            <label className="flex items-center justify-between text-sm text-ink"><span>Dim while designing</span><input type="checkbox" checked={dimBackground} onChange={(event) => onDimBackground(event.target.checked)} /></label>
            <div><label className={label}>Opacity in exports</label><input type="range" min="0.1" max="1" step="0.05" value={bg.opacity ?? 1} onChange={(event) => setBackground({ ...bg, opacity: Number(event.target.value) })} className="w-full" /></div>
          </div>
        ) : null}
        <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onBackgroundFile(file); event.target.value = ""; }} />
      </div>
      <div>
        <label className={label}>Page margins (mm)</label>
        <div className="grid grid-cols-4 gap-1.5">
          {(["top", "right", "bottom", "left"] as const).map((key) => (
            <label key={key} className="grid gap-0.5 text-[10px] font-semibold capitalize text-soft-ink">{key}<input type="number" min="0" max="60" className={`${fieldBase} w-full px-2 py-1 text-xs`} value={layout.margins[key]} onChange={(event) => onChangeLayout((current) => ({ ...current, margins: { ...current.margins, [key]: Math.max(0, Number(event.target.value) || 0) } }))} /></label>
          ))}
        </div>
      </div>
      <p className="m-0 text-xs text-soft-ink">Select an element to edit it. Select several (shift-click) and press <strong>Group</strong> to make them repeat.</p>
    </div>
  );
}

export function Inspector(props: InspectorProps) {
  const { element, parentChain, selectionCount, fields, views, page, layout, onChangeElement, onAddField, onRenameField, onRetypeField, onSetRepeat } = props;
  const [tab, setTab] = useState<Tab>("content");
  if (!element) {
    if (selectionCount > 1) return <div className={`${card} min-h-[640px] p-5`}><p className="m-0 text-sm font-bold text-ink">{selectionCount} elements selected</p><p className="m-0 mt-2 text-xs text-soft-ink">Use the toolbar above the page: Group, Align, Duplicate, Delete.</p></div>;
    return <div className={`${card} min-h-[640px]`}><PageInspector {...props} /></div>;
  }
  const isGroup = element.type === "group";
  const tabs: [Tab, string][] = isGroup
    ? [["repeat", "Repeat"], ["layout", "Layout"], ["style", "Style"], ["visibility", "Visibility"]]
    : [["content", "Content"], ["layout", "Layout"], ["style", "Style"], ["visibility", "Visibility"]];
  const active = tabs.some(([key]) => key === tab) ? tab : tabs[0][0];
  return (
    <div className={`${card} min-h-[640px]`}>
      <div className="border-b border-ink/8 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="m-0 text-sm font-bold text-ink">{isGroup ? element.name || "Group" : componentLabel(element.type)}</p>
          {isGroup ? null : <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${(element.type === "text" || element.type === "image") && element.source.type === "field" ? "bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "bg-[var(--surface-soft)] text-soft-ink"}`}>{(element.type === "text" || element.type === "image") && element.source.type === "field" ? "✦ AI field" : "Fixed"}</span>}
        </div>
        {isGroup ? <input className={`${fieldClass} mt-2`} value={element.name || ""} onChange={(event) => onChangeElement((current) => ({ ...current, name: event.target.value }))} placeholder="Group name" /> : null}
        {parentChain.length ? <p className="m-0 mt-2 text-xs text-soft-ink">Inside {parentChain.map((group) => `“${group.name || "Group"}”`).join(" › ")}</p> : null}
        <div className="mt-3 flex gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
          {tabs.map(([key, text]) => <button key={key} type="button" onClick={() => setTab(key)} className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${active === key ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink hover:text-ink"}`}>{text}</button>)}
        </div>
      </div>
      <div className="p-4">
        {active === "content" ? (
          <div className="grid gap-4">
            {(element.type === "text" || element.type === "image") && element.source.type === "field" ? <AiFieldPanel element={element} parentChain={parentChain} fields={fields} onRenameField={onRenameField} onRetypeField={onRetypeField} onSetRepeat={onSetRepeat} /> : null}
            <ContentTab element={element} parentChain={parentChain} fields={fields} onChange={onChangeElement} onAddField={onAddField} />
          </div>
        ) : null}
        {active === "layout" ? <LayoutTab element={element} pages={layout.pages} onChange={onChangeElement} /> : null}
        {active === "style" ? <StyleTab element={element} onChange={onChangeElement} /> : null}
        {active === "visibility" ? <VisibilityTab element={element} views={views} onChange={onChangeElement} /> : null}
        {active === "repeat" ? <RepeatTab element={element} parentChain={parentChain} fields={fields} onChange={onChangeElement} onAddField={onAddField} /> : null}
      </div>
      <p className="hidden">{page.id}</p>
    </div>
  );
}
