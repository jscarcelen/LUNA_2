import type { Element, ID } from "./types";

/**
 * Component registry: each element type declares how it is created, labelled and edited so new
 * components (QR code, chart, creator components…) can be added without touching the editor.
 * Canvas rendering and inspector panels are looked up by `type`.
 */
export interface InspectorField {
  key: string;
  label: string;
  kind: "text" | "textarea" | "number" | "select" | "color" | "toggle";
  options?: { value: string; label: string }[];
  section: "content" | "style" | "layout";
}

export interface ComponentDef {
  type: string;
  label: string;
  icon: string;
  group: "static" | "layout" | "data";
  create: () => Element;
  inspector: InspectorField[];
  /** Whether users can drop this from the Add panel (groups are created from selections). */
  addable: boolean;
}

const components = new Map<string, ComponentDef>();

export function registerComponent(def: ComponentDef): void {
  components.set(def.type, def);
}
export function getComponent(type: string): ComponentDef | undefined {
  return components.get(type);
}
export function listComponents(): ComponentDef[] {
  return [...components.values()];
}
export function componentLabel(type: string, fallback = type): string {
  return components.get(type)?.label || fallback;
}
export type { ID };
