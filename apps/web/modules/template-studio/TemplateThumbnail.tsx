"use client";

import type { Template } from "./engine/types";
import { useMemo } from "react";
import { compatibleAgents } from "./engine/mapping";
import { migrateToV3, normalizeTemplate } from "./engine/migrate";
import { layoutDocument } from "./engine/layout";
import { buildSampleData } from "./engine/sample";

/** Names of agents whose output fills this saved template (structure match ≥ 60% on every field). */
export function compatibleAgentNames(row: any, agents: { id: string; name: string; fields: any[] }[]): string[] {
  try {
    const template = migrateToV3(row);
    return compatibleAgents(template.fields, null, agents).map((agent) => agent.name);
  } catch {
    return [];
  }
}

export function templateFolderOf(row: any): string {
  const folder = String(row?.folderId || row?.meta?.folderId || "");
  // Legacy builder used opaque ids ("tpl-folder-…"); only human-named folders count.
  return folder && !folder.startsWith("tpl-folder-") ? folder : "";
}

/**
 * First page of the template, laid out with sample data — what the export will look like.
 * Prefers a paged (A4-like) layout; falls back to slides. Pure SVG, no server round trip.
 */
export function TemplateThumbnail({ template, width = 160 }: { template: any; width?: number }) {
  const rendered = useMemo(() => {
    try {
      const doc: Template = normalizeTemplate(migrateToV3(template));
      const layout = doc.layouts.find((item) => item.class === "paged") || doc.layouts[0];
      if (!layout) return null;
      const data = buildSampleData(doc, 4);
      const result = layoutDocument(doc, data, { layoutId: layout.id, viewId: layout.views[0]?.id || null });
      const page = result.pages[0];
      return page ? { page, w: layout.canvas.width, h: layout.canvas.height, pages: result.pages.length } : null;
    } catch {
      return null;
    }
  }, [template]);
  const w = rendered?.w || 210;
  const h = rendered?.h || 297;
  const height = Math.round((width * h) / w);
  const scale = width / w;
  const page = rendered?.page;
  const bgSrc = page?.background?.src || "";
  const bgColor = page?.background?.color || "#fff";
  const mmToPt = 2.835; // font sizes are in pt; 1 mm = 2.835 pt → px at this scale
  return (
    <div className="relative shrink-0 overflow-hidden rounded-lg border border-ink/10 bg-white" style={{ width, height, minHeight: height, maxHeight: height, background: bgColor }}>
      {bgSrc ? <img src={bgSrc} alt="" className="absolute inset-0 h-full w-full" style={{ opacity: page?.background?.opacity ?? 1 }} /> : null}
      {page ? (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="absolute inset-0">
          {page.items.map((item, index) => {
            const x = item.x * scale;
            const y = item.y * scale;
            const iw = item.w * scale;
            const ih = item.h * scale;
            if (item.type === "rect") return <rect key={`${item.elementId}-${index}`} x={x} y={y} width={iw} height={ih} rx={(item.style.radius || 0) * scale} fill={item.style.fill || "none"} stroke={item.style.stroke || "none"} strokeWidth={Math.max(0.4, (item.style.strokeWidth || 0.3) * scale)} opacity={item.style.opacity ?? 1} />;
            if (item.type === "line") return <line key={`${item.elementId}-${index}`} x1={x} y1={y} x2={x + iw} y2={y} stroke={item.style.stroke || "#d2d2d7"} strokeWidth={Math.max(0.4, ih)} />;
            if (item.type === "image") return item.src ? <image key={`${item.elementId}-${index}`} href={item.src} x={x} y={y} width={iw} height={ih} preserveAspectRatio="xMidYMid meet" /> : <rect key={`${item.elementId}-${index}`} x={x} y={y} width={iw} height={ih} fill="rgba(0,0,0,0.06)" />;
            const fs = (item.style.fontSize || 11) * scale / mmToPt;
            const lineH = fs * (item.style.lineHeight || 1.35);
            const anchor = item.style.align === "center" ? "middle" : item.style.align === "right" ? "end" : "start";
            const tx = item.style.align === "center" ? x + iw / 2 : item.style.align === "right" ? x + iw : x;
            return (
              <text key={`${item.elementId}-${index}`} fontSize={fs} fontWeight={item.style.fontWeight === "bold" ? 700 : 400} fill={item.style.color || "#1d1d1f"} fontFamily={item.style.fontFamily === "serif" ? "Georgia, serif" : item.style.fontFamily === "mono" ? "Menlo, monospace" : "-apple-system, Helvetica, Arial, sans-serif"} textAnchor={anchor}>
                {item.lines.slice(0, 40).map((line, lineIndex) => <tspan key={lineIndex} x={tx} y={y + fs * 0.95 + lineIndex * lineH}>{line}</tspan>)}
              </text>
            );
          })}
        </svg>
      ) : <div className="grid h-full place-items-center text-[10px] text-soft-ink">preview unavailable</div>}
      {rendered && rendered.pages > 1 ? <span className="absolute bottom-1 right-1 rounded bg-black/55 px-1 text-[9px] font-semibold text-white">{rendered.pages} pages</span> : null}
    </div>
  );
}
