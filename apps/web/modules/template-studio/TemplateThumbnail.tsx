"use client";

import type { Element, Template } from "./engine/types";

const GROUP = "#6d4de6";

export function templateFolderOf(row: any): string {
  const folder = String(row?.folderId || row?.meta?.folderId || "");
  // Legacy builder used opaque ids ("tpl-folder-…"); only human-named folders count.
  return folder && !folder.startsWith("tpl-folder-") ? folder : "";
}

/** Lightweight first-page preview drawn from the model (no server round trip). */
export function TemplateThumbnail({ template, width = 160 }: { template: any; width?: number }) {
  const doc: Template | null = template?.templateV3 || null;
  const layout = doc?.layouts?.[0];
  const page = layout?.pages?.[0];
  const w = layout?.canvas.width || 210;
  const h = layout?.canvas.height || 297;
  const height = Math.round((width * h) / w);
  const scale = width / w;
  const bg = page?.background;
  const src = bg && (bg.type === "image" || bg.type === "pdf") ? bg.src : "";
  const draw = (elements: Element[], ox: number, oy: number) => elements.map((element) => {
    const x = (ox + element.frame.x) * scale;
    const y = (oy + element.frame.y) * scale;
    const ew = element.frame.w * scale;
    const eh = Math.max(1.5, element.frame.h * scale);
    if (element.type === "group") return <g key={element.id}><rect x={x} y={y} width={ew} height={eh} fill={`${GROUP}14`} stroke={GROUP} strokeWidth="0.6" strokeDasharray="2 1.5" />{draw(element.children, ox + element.frame.x, oy + element.frame.y)}</g>;
    if (element.type === "text") { const isField = element.source.type === "field"; const fs = Math.max(2, (element.style.fontSize || 11) * scale * 0.35); const text = element.source.type === "static" ? element.source.value.split("\n")[0].slice(0, 40) : ""; return isField ? <rect key={element.id} x={x} y={y} width={ew} height={Math.min(eh, fs * 1.4)} rx="1" fill="rgba(0,113,227,0.35)" /> : <text key={element.id} x={x} y={y + fs} fontSize={fs} fontWeight={element.style.fontWeight === "bold" ? 700 : 400} fill={element.style.color || "#1d1d1f"} fontFamily="sans-serif">{text}</text>; }
    if (element.type === "line" || element.type === "arrow") return <line key={element.id} x1={x} y1={y} x2={x + ew} y2={y} stroke={element.style.stroke || "#d2d2d7"} strokeWidth="0.8" />;
    if (element.type === "rect" || element.type === "ellipse") return element.type === "ellipse" ? <ellipse key={element.id} cx={x + ew / 2} cy={y + eh / 2} rx={ew / 2} ry={eh / 2} fill={element.style.fill || "none"} stroke={element.style.stroke || "none"} strokeWidth="0.6" /> : <rect key={element.id} x={x} y={y} width={ew} height={eh} rx={(element.style.radius || 0) * scale} fill={element.style.fill || "none"} stroke={element.style.stroke || "none"} strokeWidth="0.6" />;
    return <rect key={element.id} x={x} y={y} width={ew} height={eh} fill="rgba(0,0,0,0.08)" />;
  });
  return (
    <div className="shrink-0 overflow-hidden rounded-lg border border-ink/10 bg-white" style={{ width, height, minHeight: height, maxHeight: height, backgroundImage: src ? `url(${src})` : "none", backgroundSize: "100% 100%" }}>
      {doc && page ? <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>{draw(page.elements, 0, 0)}</svg> : <div className="grid h-full place-items-center text-[10px] text-soft-ink">{template?.docModel ? "v2" : "legacy"}</div>}
    </div>
  );
}
