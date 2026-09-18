import { useCallback, useMemo, useReducer } from "react";
import type { Element, ID, Layout, Page, Template, View } from "../engine/types";
import { createLayout, createPage, createView, findElement, removeElements, updateElement } from "../engine/model";

export type Mode = "design" | "data" | "preview" | "export";

export interface StudioState {
  template: Template | null;
  savedId: string;
  history: Template[];
  future: Template[];
  layoutId: ID;
  viewId: ID;
  pageId: ID;
  selection: ID[];
  mode: Mode;
  sampleMode: boolean;
  dirty: boolean;
}

type Action =
  | { type: "open"; template: Template; savedId: string }
  | { type: "close" }
  | { type: "update"; updater: (template: Template) => Template; transient?: boolean }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "select"; ids: ID[] }
  | { type: "setLayout"; id: ID }
  | { type: "setView"; id: ID }
  | { type: "setPage"; id: ID }
  | { type: "setMode"; mode: Mode }
  | { type: "setSample"; on: boolean }
  | { type: "saved"; id: string };

const initial: StudioState = { template: null, savedId: "", history: [], future: [], layoutId: "", viewId: "", pageId: "", selection: [], mode: "design", sampleMode: false, dirty: false };

function reducer(state: StudioState, action: Action): StudioState {
  switch (action.type) {
    case "open": {
      const layout = action.template.layouts[0];
      return { ...initial, template: action.template, savedId: action.savedId, layoutId: layout.id, viewId: layout.views[0].id, pageId: layout.pages[0].id, dirty: !action.savedId };
    }
    case "close":
      return initial;
    case "update": {
      if (!state.template) return state;
      const next = { ...action.updater(state.template), updatedAt: new Date().toISOString() };
      // Transient updates (drag frames) don't create history entries.
      const history = action.transient ? state.history : [...state.history.slice(-49), state.template];
      const layout = next.layouts.find((item) => item.id === state.layoutId) || next.layouts[0];
      const view = layout.views.find((item) => item.id === state.viewId) || layout.views[0];
      const page = layout.pages.find((item) => item.id === state.pageId) || layout.pages[0];
      return { ...state, template: next, history, future: action.transient ? state.future : [], dirty: true, layoutId: layout.id, viewId: view.id, pageId: page.id };
    }
    case "undo": {
      const previous = state.history[state.history.length - 1];
      if (!previous || !state.template) return state;
      return { ...state, template: previous, history: state.history.slice(0, -1), future: [state.template, ...state.future], dirty: true };
    }
    case "redo": {
      const next = state.future[0];
      if (!next || !state.template) return state;
      return { ...state, template: next, future: state.future.slice(1), history: [...state.history, state.template], dirty: true };
    }
    case "select":
      return { ...state, selection: action.ids };
    case "setLayout": {
      const layout = state.template?.layouts.find((item) => item.id === action.id);
      if (!layout) return state;
      return { ...state, layoutId: layout.id, viewId: layout.views[0].id, pageId: layout.pages[0].id, selection: [] };
    }
    case "setView":
      return { ...state, viewId: action.id };
    case "setPage":
      return { ...state, pageId: action.id, selection: [] };
    case "setMode":
      return { ...state, mode: action.mode, selection: action.mode === "design" ? state.selection : [] };
    case "setSample":
      return { ...state, sampleMode: action.on };
    case "saved":
      return { ...state, savedId: action.id, dirty: false };
    default:
      return state;
  }
}

export function useTemplateStore() {
  const [state, dispatch] = useReducer(reducer, initial);
  const layout = useMemo<Layout | null>(() => state.template?.layouts.find((item) => item.id === state.layoutId) || null, [state.template, state.layoutId]);
  const view = useMemo<View | null>(() => layout?.views.find((item) => item.id === state.viewId) || null, [layout, state.viewId]);
  const page = useMemo<Page | null>(() => (view?.pages || layout?.pages || []).find((item) => item.id === state.pageId) || null, [layout, view, state.pageId]);

  const update = useCallback((updater: (template: Template) => Template, transient = false) => dispatch({ type: "update", updater, transient }), []);
  const updateLayout = useCallback((updater: (layout: Layout) => Layout, transient = false) => update((template) => ({ ...template, layouts: template.layouts.map((item) => (item.id === state.layoutId ? updater(item) : item)) }), transient), [update, state.layoutId]);
  const updatePage = useCallback((updater: (page: Page) => Page, transient = false) => updateLayout((current) => ({ ...current, pages: current.pages.map((item) => (item.id === state.pageId ? updater(item) : item)) }), transient), [updateLayout, state.pageId]);
  const updateElements = useCallback((id: ID, updater: (element: Element) => Element, transient = false) => updatePage((current) => ({ ...current, elements: updateElement(current.elements, id, updater) }), transient), [updatePage]);
  const deleteElements = useCallback((ids: ID[]) => {
    updatePage((current) => ({ ...current, elements: removeElements(current.elements, ids) }));
    dispatch({ type: "select", ids: [] });
  }, [updatePage]);

  const selected = useMemo(() => (page && state.selection.length === 1 ? findElement(page.elements, state.selection[0]) : { element: null, parent: null }), [page, state.selection]);

  return {
    state,
    layout,
    view,
    page,
    selected,
    dispatch,
    update,
    updateLayout,
    updatePage,
    updateElements,
    deleteElements,
    open: (template: Template, savedId = "") => dispatch({ type: "open", template, savedId }),
    close: () => dispatch({ type: "close" }),
    select: (ids: ID[]) => dispatch({ type: "select", ids }),
    addLayout: (name: string, preset: string) => {
      const created = createLayout(name, preset);
      update((template) => ({ ...template, layouts: [...template.layouts, created] }));
      dispatch({ type: "setLayout", id: created.id });
    },
    addView: (name: string) => {
      const created = createView(name);
      updateLayout((current) => ({ ...current, views: [...current.views, created] }));
      dispatch({ type: "setView", id: created.id });
    },
    addPage: () => {
      const created = createPage();
      updateLayout((current) => ({ ...current, pages: [...current.pages, created] }));
      dispatch({ type: "setPage", id: created.id });
    }
  };
}

export type Store = ReturnType<typeof useTemplateStore>;
