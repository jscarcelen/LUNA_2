"use client";

import { useMemo, useState } from "react";
import type { Element, FieldDef, GroupElement, ID } from "../engine/types";
import { arrayItemFields, cloneElement, createField, createGroup, findElement, findField, removeElements, updateElement } from "../engine/model";
import { getComponent } from "../engine/registry";
import type { Store } from "../state/useTemplateStore";
import { AddPanel } from "./AddPanel";
import { Canvas } from "./canvas/Canvas";
import { Inspector } from "./inspector/Inspector";
import { LayersPanel } from "./LayersPanel";
import { PagesPanel } from "./PagesPanel";
import { importPages } from "../pdfImport";
import { fieldsInScope } from "./inspector/ContentTab";
import { blockFromElements, instantiateBlock, removeBlockFromLibrary, saveBlockToLibrary, type AccentPreset, type BlockDef } from "../engine/blocks";
import { BlockDialog } from "./BlockDialog";

function parentChainOf(elements: Element[], id: ID): GroupElement[] {
  const chain: GroupElement[] = [];
  const walk = (list: Element[], trail: GroupElement[]): boolean => {
    for (const element of list) {
      if (element.id === id) { chain.push(...trail); return true; }
      if (element.type === "group" && walk(element.children, [...trail, element])) return true;
    }
    return false;
  };
  walk(elements, []);
  return chain;
}

export function DesignMode({ store, sampleValues, onPublishBlock }: { store: Store; sampleValues: Record<string, unknown>; onPublishBlock?: (block: BlockDef) => void }) {
  const { state, layout, view, page, selected, select, updatePage, updateLayout, update, updateElements, deleteElements } = store;
  const [dimBackground, setDimBackground] = useState(false);
  const [libraryVersion, setLibraryVersion] = useState(0);
  const [blockDialog, setBlockDialog] = useState<{ elements: Element[] } | null>(null);
  const template = state.template!;
  const elements = page?.elements || [];
  const parentChain = useMemo(() => (selected.element ? parentChainOf(elements, selected.element.id) : []), [elements, selected.element]);
  if (!layout || !page) return null;
  const pg = page;
  const pages = view?.pages || layout.pages;
  const pageIndex = pages.findIndex((item) => item.id === pg.id);
  const { margins, canvas } = layout;
  const contentWidth = canvas.width - margins.left - margins.right;

  /* ---------- fields */
  function addField(field: FieldDef, intoArrayId: string | null) {
    update((current) => {
      if (!intoArrayId) return { ...current, fields: [...current.fields, field] };
      const insert = (fields: FieldDef[]): FieldDef[] => fields.map((item) => {
        if (item.id === intoArrayId && item.type === "array") {
          const itemDef = item.children?.[0];
          if (!itemDef) return { ...item, children: [{ ...createField("item", "object"), children: [field] }] };
          if (itemDef.type === "object") return { ...item, children: [{ ...itemDef, children: [...(itemDef.children || []), field] }] };
          return { ...item, children: [{ ...createField("item", "object"), children: [itemDef, field] }] };
        }
        return item.children ? { ...item, children: insert(item.children) } : item;
      });
      return { ...current, fields: insert(current.fields) };
    });
  }

  /* ---------- add */
  function addElement(type: string) {
    const def = getComponent(type);
    if (!def) return;
    const target = selected.element?.type === "group" ? (selected.element as GroupElement) : (parentChain[parentChain.length - 1] || null);
    const element = def.create();
    const lastBottom = Math.max(margins.top, ...pg.elements.map((item) => item.frame.y + item.frame.h));
    if (target) element.frame = { ...element.frame, x: 3, y: Math.max(2, (target.children.reduce((max, child) => Math.max(max, child.frame.y + child.frame.h), 0) || 0) + 2), w: Math.max(20, target.frame.w - 6) };
    else element.frame = { ...element.frame, x: margins.left, y: Math.min(lastBottom + 4, canvas.height - margins.bottom - 12), w: type === "image" ? Math.min(50, contentWidth) : contentWidth };
    if (type === "field" && element.type === "text") {
      const { scope } = fieldsInScope(target ? [...parentChain, target] : parentChain, template.fields);
      const unused = scope.find((item) => !usesField(pg.elements, item.id)) || scope[0];
      element.source = { type: "field", fieldId: unused?.id || "" };
      if (!unused) {
        const created = createField("New field", "text");
        addField(created, target?.repeat ? findField(template.fields, target.repeat.fieldId)?.id || null : null);
        element.source = { type: "field", fieldId: created.id };
      }
    }
    if (type === "group") {
      element.frame = { ...element.frame, w: contentWidth, h: 40 };
      (element as GroupElement).repeat = arrayField() ? { fieldId: arrayField()!.id, mode: "flow" } : null;
    }
    if (target) updateElements(target.id, (group) => ({ ...(group as GroupElement), children: [...(group as GroupElement).children, element] } as Element));
    else updatePage((current) => ({ ...current, elements: [...current.elements, element] }));
    select([element.id]);
  }
  /* ---------- blocks (pre-made objects) */
  function addBlock(block: BlockDef, options: { accent: AccentPreset; toggles: Record<string, boolean> }) {
    const { fields, elements: created } = instantiateBlock(block, template.fields, options);
    const lastBottom = Math.max(margins.top, ...pg.elements.map((item) => item.frame.y + item.frame.h));
    const placed = created.map((element, index) => ({ ...element, frame: { ...element.frame, x: margins.left, y: Math.min(lastBottom + 4 + index * 4, canvas.height - margins.bottom - 12), w: contentWidth } }));
    update((current) => ({
      ...current,
      fields,
      layouts: current.layouts.map((item) => (item.id === layout!.id ? { ...item, pages: item.pages.map((p) => (p.id === pg.id ? { ...p, elements: [...p.elements, ...placed] } : p)) } : item))
    }));
    select(placed.map((element) => element.id));
  }
  function saveSelectionAsBlock() {
    const picked = state.selection.map((id) => findElement(pg.elements, id).element).filter((element): element is Element => Boolean(element));
    if (!picked.length) return;
    setBlockDialog({ elements: picked });
  }
  function confirmSaveBlock(meta: { name: string; description: string }) {
    if (!blockDialog) return;
    const minX = Math.min(...blockDialog.elements.map((item) => item.frame.x));
    const minY = Math.min(...blockDialog.elements.map((item) => item.frame.y));
    const normalised = blockDialog.elements.map((item) => ({ ...item, frame: { ...item.frame, x: item.frame.x - minX, y: item.frame.y - minY } }));
    saveBlockToLibrary(blockFromElements(normalised, template.fields, meta));
    setLibraryVersion((v) => v + 1);
    setBlockDialog(null);
  }
  function removeBlock(block: BlockDef) {
    removeBlockFromLibrary(block.id);
    setLibraryVersion((v) => v + 1);
  }

  function arrayField(): FieldDef | null {
    return template.fields.find((item) => item.type === "array") || null;
  }
  function usesField(elements: Element[], fieldId: string): boolean {
    let used = false;
    const walk = (list: Element[]) => list.forEach((element) => { if (element.type === "text" && element.source.type === "field" && element.source.fieldId === fieldId) used = true; if (element.type === "group") walk(element.children); });
    walk(elements);
    return used;
  }

  /* ---------- group / ungroup */
  function groupSelection() {
    const ids = state.selection;
    const picked = pg.elements.filter((element) => ids.includes(element.id));
    if (!picked.length) return;
    const minX = Math.min(...picked.map((item) => item.frame.x));
    const minY = Math.min(...picked.map((item) => item.frame.y));
    const maxX = Math.max(...picked.map((item) => item.frame.x + item.frame.w));
    const maxY = Math.max(...picked.map((item) => item.frame.y + item.frame.h));
    const items = arrayField();
    const group = createGroup({
      name: "Group",
      frame: { x: minX - 2, y: minY - 2, w: maxX - minX + 4, h: maxY - minY + 4 },
      layout: { mode: "free", gap: 3 },
      repeat: items ? { fieldId: items.id, mode: "flow" } : null,
      children: picked.map((item) => ({ ...item, frame: { ...item.frame, x: item.frame.x - minX + 2, y: item.frame.y - minY + 2 } }))
    });
    // Fields already bound to root scalars stay valid; bound per-item fields resolve from the repeat scope.
    updatePage((current) => ({ ...current, elements: [...removeElements(current.elements, ids), group] }));
    select([group.id]);
  }
  function ungroup() {
    const group = selected.element;
    if (!group || group.type !== "group") return;
    const children = group.children.map((child) => ({ ...child, frame: { ...child.frame, x: child.frame.x + group.frame.x, y: child.frame.y + group.frame.y } }));
    updatePage((current) => ({ ...current, elements: [...current.elements.filter((element) => element.id !== group.id), ...children] }));
    select(children.map((child) => child.id));
  }

  /* ---------- align / duplicate / delete */
  function align(how: string) {
    const ids = state.selection;
    if (!ids.length) return;
    const first = findElement(pg.elements, ids[0]);
    const parent = first.parent;
    const box = parent ? { left: 0, top: 0, right: parent.frame.w, bottom: parent.frame.h } : { left: margins.left, top: margins.top, right: canvas.width - margins.right, bottom: canvas.height - margins.bottom };
    const siblings = parent ? parent.children : pg.elements;
    const picked = siblings.filter((element) => ids.includes(element.id));
    const bounds = picked.length > 1 ? { left: Math.min(...picked.map((i) => i.frame.x)), top: Math.min(...picked.map((i) => i.frame.y)), right: Math.max(...picked.map((i) => i.frame.x + i.frame.w)), bottom: Math.max(...picked.map((i) => i.frame.y + i.frame.h)) } : box;
    updatePage((current) => {
      let elements = current.elements;
      for (const item of picked) {
        elements = updateElement(elements, item.id, (element) => {
          const { w, h } = element.frame;
          const frame = { ...element.frame };
          if (how === "left") frame.x = bounds.left;
          if (how === "right") frame.x = bounds.right - w;
          if (how === "hcenter") frame.x = (bounds.left + bounds.right) / 2 - w / 2;
          if (how === "top") frame.y = bounds.top;
          if (how === "bottom") frame.y = bounds.bottom - h;
          if (how === "vcenter") frame.y = (bounds.top + bounds.bottom) / 2 - h / 2;
          if (how === "fitWidth") { frame.x = box.left; frame.w = box.right - box.left; }
          return { ...element, frame };
        });
      }
      return { ...current, elements };
    });
  }
  function duplicate() {
    if (!selected.element) return;
    const copy = cloneElement(selected.element);
    copy.frame = { ...copy.frame, x: copy.frame.x + 4, y: copy.frame.y + 4 };
    if (selected.parent) updateElements(selected.parent.id, (group) => ({ ...(group as GroupElement), children: [...(group as GroupElement).children, copy] } as Element));
    else updatePage((current) => ({ ...current, elements: [...current.elements, copy] }));
    select([copy.id]);
  }
  async function backgroundFile(file: File) {
    const [first] = await importPages(file);
    if (!first) return;
    updatePage((current) => ({ ...current, background: { type: file.type === "application/pdf" ? "pdf" : "image", src: first.src, sourcePage: 1, locked: true, visible: true, opacity: 1 } }));
  }
  function moveSelection(ids: ID[], starts: Record<ID, { x: number; y: number }>, dx: number, dy: number, transient: boolean) {
    updatePage((current) => {
      let elements = current.elements;
      for (const id of ids) {
        const start = starts[id];
        if (!start) continue;
        elements = updateElement(elements, id, (element) => ({ ...element, frame: { ...element.frame, x: Math.round((start.x + dx) * 2) / 2, y: Math.round((start.y + dy) * 2) / 2 } }));
      }
      return { ...current, elements };
    }, transient);
  }

  const addHint = selected.element?.type === "group" ? `Added inside “${selected.element.name || "Group"}”.` : parentChain.length ? `Added inside “${parentChain[parentChain.length - 1].name || "Group"}”.` : "Added inside the page margins.";

  return (
    <div className="grid items-start gap-3 lg:grid-cols-[200px_minmax(0,1fr)_320px]">
      <aside className="grid gap-3">
        <AddPanel onAdd={addElement} onAddBlock={addBlock} onPublishBlock={onPublishBlock} onRemoveBlock={removeBlock} hint={addHint} libraryVersion={libraryVersion} />
        <PagesPanel layout={layout} pages={pages} activeId={pg.id} onSelect={(id) => store.dispatch({ type: "setPage", id })} onAdd={store.addPage} onRemove={(id) => { updateLayout((current) => ({ ...current, pages: current.pages.filter((item) => item.id !== id) })); store.dispatch({ type: "setPage", id: pages.find((item) => item.id !== id)!.id }); }} />
        <LayersPanel page={pg} selection={state.selection} onSelect={(id, additive) => select(additive ? [...new Set([...state.selection, id])] : [id])} onToggleLock={(id) => updateElements(id, (element) => ({ ...element, locked: !element.locked }))} />
      </aside>
      <Canvas
        layout={layout}
        page={pg}
        pageIndex={pageIndex}
        pageCount={pages.length}
        fields={template.fields}
        selection={state.selection}
        sampleMode={state.sampleMode}
        sampleValues={sampleValues}
        dimBackground={dimBackground}
        onSelect={select}
        onMove={moveSelection}
        onResize={(id, w, h, transient) => updateElements(id, (element) => ({ ...element, frame: { ...element.frame, w: Math.round(w * 2) / 2, h: Math.round(h * 2) / 2 } }), transient)}
        toolbar={{ canUngroup: selected.element?.type === "group", onGroup: groupSelection, onUngroup: ungroup, onAlign: align, onDuplicate: duplicate, onDelete: () => deleteElements(state.selection), onSaveBlock: saveSelectionAsBlock }}
      />
      <Inspector
        layout={layout}
        page={pg}
        views={layout.views}
        fields={template.fields}
        element={selected.element}
        parentChain={parentChain}
        selectionCount={state.selection.length}
        dimBackground={dimBackground}
        onDimBackground={setDimBackground}
        onChangeElement={(updater) => selected.element && updateElements(selected.element.id, updater)}
        onChangePage={updatePage}
        onChangeLayout={updateLayout}
        onBackgroundFile={backgroundFile}
        onAddField={addField}
      />
      {blockDialog ? <BlockDialog onClose={() => setBlockDialog(null)} onSave={confirmSaveBlock} /> : null}
    </div>
  );
}

export { arrayItemFields };
