/**
 * Performance views — the dashboard as something the user arranges.
 *
 * The screen used to show everything Luna knows at once, which is overwhelming and makes the
 * important numbers hard to find. Instead there is a curated default view per profile, and the user
 * can hide a panel, reorder the panels, choose how each one reads (a single figure, a history, a
 * breakdown), and keep several views side by side as tabs — "Every day", "Before the exam",
 * "Parent evening". A view is a small JSON document, so it can also be sold in the marketplace and
 * loaded by someone else.
 */

const KEY = "luna.performance.views";
export const VIEW_VERSION = 1;

/** How a panel can read. Not every panel offers every mode; the registry says which. */
export const MODES = [
  { id: "value", label: "Now", blurb: "The figure as it stands." },
  { id: "history", label: "Over time", blurb: "How it moved, week by week." },
  { id: "detail", label: "Broken down", blurb: "Every row behind the number." }
];

export const SIZES = [
  { id: "half", label: "Half width" },
  { id: "full", label: "Full width" }
];

/**
 * The default views: what a good dashboard looks like before anybody touches it. Everything else in
 * the registry is available but hidden, so the screen starts small and grows on request.
 */
const DEFAULTS = {
  student: {
    name: "How I am doing",
    trackBy: "plan",
    panels: ["headline", "coach", "mastery-map", "next-actions", "error-breakdown", "mastery-trend", "plan-progress"]
  },
  parent: {
    name: "How my child is doing",
    trackBy: "plan",
    panels: ["parent-summary", "mastery-map", "coach", "habit", "plan-progress"]
  },
  teacher: {
    name: "How the class is doing",
    trackBy: "plan",
    panels: ["headline", "class-heatmap", "attention", "error-breakdown", "coach", "class-topics"]
  }
};

const uid = () => `view_${Math.random().toString(36).slice(2, 9)}`;

export function defaultView(role = "student") {
  const base = DEFAULTS[role] || DEFAULTS.student;
  return {
    id: `default_${role}`,
    version: VIEW_VERSION,
    name: base.name,
    role,
    trackBy: base.trackBy,
    filters: {},
    panels: base.panels.map((id) => ({ id, visible: true, mode: "value", size: "half" }))
  };
}

/** Views for a profile, the built-in one always first so there is something to fall back to. */
export function readViews(role = "student") {
  const base = defaultView(role);
  if (typeof window === "undefined") return [base];
  try {
    const stored = JSON.parse(window.localStorage.getItem(`${KEY}.${role}`) || "[]");
    const mine = Array.isArray(stored) ? stored.filter((view) => view && view.id && Array.isArray(view.panels)) : [];
    const overridden = mine.find((view) => view.id === base.id);
    return [overridden || base, ...mine.filter((view) => view.id !== base.id)];
  } catch {
    return [base];
  }
}

export function saveViews(role, views = []) {
  if (typeof window === "undefined") return views;
  try { window.localStorage.setItem(`${KEY}.${role}`, JSON.stringify(views)); } catch { /* a private window simply keeps the default */ }
  return views;
}

export function upsertView(role, view) {
  const views = readViews(role).filter((entry) => entry.id !== view.id);
  return saveViews(role, [...views, { ...view, role, version: VIEW_VERSION }].sort((a, b) => (a.id === `default_${role}` ? -1 : b.id === `default_${role}` ? 1 : 0)));
}

export function removeView(role, viewId) {
  if (viewId === `default_${role}`) return readViews(role); // the built-in view cannot be deleted
  return saveViews(role, readViews(role).filter((entry) => entry.id !== viewId));
}

export function duplicateView(view, name) {
  return { ...view, id: uid(), name: name || `${view.name} copy`, panels: view.panels.map((panel) => ({ ...panel })) };
}

/** A view built from scratch: nothing on it but the headline, so the user adds what they want. */
export function blankView(role, name = "New view") {
  return { id: uid(), version: VIEW_VERSION, name, role, trackBy: "plan", filters: {}, panels: [{ id: "headline", visible: true, mode: "value", size: "half" }] };
}

/* ------------------------------------------------------------------ editing */

export function togglePanel(view, panelId) {
  const present = view.panels.some((panel) => panel.id === panelId);
  return {
    ...view,
    panels: present
      ? view.panels.map((panel) => (panel.id === panelId ? { ...panel, visible: !panel.visible } : panel))
      : [...view.panels, { id: panelId, visible: true, mode: "value", size: "half" }]
  };
}

export function movePanel(view, panelId, delta) {
  const panels = [...view.panels];
  const from = panels.findIndex((panel) => panel.id === panelId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= panels.length) return view;
  [panels[from], panels[to]] = [panels[to], panels[from]];
  return { ...view, panels };
}

/** Drag-and-drop reordering: put `panelId` where `beforeId` is. */
export function reorderPanels(view, panelId, beforeId) {
  if (panelId === beforeId) return view;
  const panels = view.panels.filter((panel) => panel.id !== panelId);
  const moved = view.panels.find((panel) => panel.id === panelId);
  if (!moved) return view;
  const at = beforeId ? panels.findIndex((panel) => panel.id === beforeId) : panels.length;
  panels.splice(at < 0 ? panels.length : at, 0, moved);
  return { ...view, panels };
}

export function setPanelMode(view, panelId, mode) {
  return { ...view, panels: view.panels.map((panel) => (panel.id === panelId ? { ...panel, mode } : panel)) };
}

export function setPanelSize(view, panelId, size) {
  return { ...view, panels: view.panels.map((panel) => (panel.id === panelId ? { ...panel, size } : panel)) };
}

/** The panels actually drawn, in order. */
export function visiblePanels(view) {
  return (view?.panels || []).filter((panel) => panel.visible);
}

/* ----------------------------------------------------------- sharing/selling */

/** What goes on the marketplace: the arrangement, never anybody's results. */
export function exportView(view) {
  return {
    kind: "performance-view",
    version: VIEW_VERSION,
    name: view.name,
    role: view.role,
    trackBy: view.trackBy,
    panels: view.panels.map(({ id, visible, mode, size }) => ({ id, visible, mode, size }))
  };
}

export function importView(payload, role) {
  const spec = typeof payload === "string" ? JSON.parse(payload) : payload;
  if (!spec || spec.kind !== "performance-view" || !Array.isArray(spec.panels)) throw new Error("That file is not a performance view.");
  return {
    id: uid(),
    version: VIEW_VERSION,
    name: spec.name || "Imported view",
    role: role || spec.role || "student",
    trackBy: spec.trackBy || "plan",
    filters: {},
    panels: spec.panels.filter((panel) => panel && panel.id).map((panel) => ({ id: panel.id, visible: panel.visible !== false, mode: panel.mode || "value", size: panel.size || "half" }))
  };
}
