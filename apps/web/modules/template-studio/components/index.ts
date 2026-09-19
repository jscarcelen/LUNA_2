import { registerComponent } from "../engine/registry";
import { createGroup, createImage, createShape, createText, defaultStyle } from "../engine/model";

/** Built-in components. Creator/marketplace components register the same way. */
registerComponent({ type: "text", label: "Text", icon: "T", group: "static", addable: true, create: () => createText(), inspector: [] });
registerComponent({ type: "heading", label: "Heading", icon: "H", group: "static", addable: true, create: () => createText({ type: "static", value: "Heading" }, { name: "Heading", style: defaultStyle({ fontSize: 20, fontWeight: "bold" }), frame: { x: 12, y: 12, w: 186, h: 11 } }), inspector: [] });
registerComponent({ type: "image", label: "Image", icon: "▣", group: "static", addable: true, create: () => createImage(), inspector: [] });
registerComponent({ type: "rect", label: "Box", icon: "▭", group: "static", addable: true, create: () => createShape("rect"), inspector: [] });
registerComponent({ type: "ellipse", label: "Circle", icon: "◯", group: "static", addable: false, create: () => createShape("ellipse"), inspector: [] });
registerComponent({ type: "line", label: "Line", icon: "—", group: "static", addable: true, create: () => createShape("line"), inspector: [] });
registerComponent({ type: "arrow", label: "Arrow", icon: "→", group: "static", addable: false, create: () => createShape("arrow"), inspector: [] });
registerComponent({ type: "table", label: "Table", icon: "▦", group: "static", addable: false, create: () => createText({ type: "static", value: "Table (coming soon)" }), inspector: [] });
registerComponent({ type: "field", label: "AI text", icon: "✦", group: "data", addable: true, create: () => createText({ type: "field", fieldId: "" }), inspector: [] });
registerComponent({ type: "field_image", label: "AI image", icon: "✦▣", group: "data", addable: true, create: () => createImage({ type: "field", fieldId: "" }), inspector: [] });
registerComponent({ type: "group", label: "Group", icon: "⧉", group: "layout", addable: true, create: () => createGroup(), inspector: [] });
