"use client";

import { useEffect, useRef, useState } from "react";
import { buildConceptForest } from "./conceptTree.js";

const TOPIC_COLORS = [
  "#0071e3", "#2f9e5b", "#b25e00", "#8e44ad",
  "#d7003a", "#0aa2c0", "#c47d17", "#5856d6",
];

function masteryColor(mastery) {
  if (mastery === undefined || mastery === null) return "#e5e7eb";
  if (mastery < 0.4) return "#ff3b30";
  if (mastery < 0.7) return "#ff9500";
  return "#34c759";
}

/**
 * Hierarchical concept tree rendered with d3.tree().
 *
 * Prerequisites define the tree edges: prerequisite → concept (parent → child).
 * The root is the concept that has no prerequisites (appears in no concept_id column).
 * Disconnected nodes (if any) are attached to the root as fallback.
 *
 * Props:
 *   concepts            – array of concept rows { id, name, topic, importance, difficulty }
 *   prerequisites       – array of { concept_id, prerequisite_id }
 *   masteryByConceptId  – { [id]: 0–1 }  (optional)
 *   activities          – array of { id, name, conceptIds[] } (optional)
 *   height              – svg height in px (default 520)
 *   onConceptClick      – (concept) => void (optional)
 */
export function KnowledgeGraph({
  concepts = [],
  prerequisites = [],
  masteryByConceptId = {},
  activities = [],
  height = 520,
  onConceptClick,
}) {
  const svgRef  = useRef(null);
  const [d3Ready, setD3Ready] = useState(typeof window !== "undefined" && !!window.d3);
  const [selected, setSelected] = useState(null);
  const [tooltip, setTooltip] = useState(null);

  // Load D3 from CDN once
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.d3) { setD3Ready(true); return; }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js";
    script.onload  = () => setD3Ready(true);
    script.onerror = () => console.warn("[KnowledgeGraph] Failed to load D3");
    document.head.appendChild(script);
  }, []);

  // Draw tree whenever D3 is ready or data changes
  useEffect(() => {
    if (!d3Ready || !svgRef.current || !concepts.length) return;
    const d3 = window.d3;

    const svg   = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = svgRef.current.getBoundingClientRect().width || 800;
    const PAD   = { top: 40, right: 60, bottom: 40, left: 60 };

    // ── topic colour map ────────────────────────────────────────────────────────
    const topics = [...new Set(concepts.map((c) => c.topic || "Other"))];
    const topicColor = {};
    topics.forEach((t, i) => { topicColor[t] = TOPIC_COLORS[i % TOPIC_COLORS.length]; });

    // ── build tree data structure ───────────────────────────────────────────────
    // Same forest the student-model list uses: edge prerequisite_id → concept_id is parent → child.
    // Several roots (one per document) hang under a synthetic subject node so no branch is flattened.
    const { roots, childrenById } = buildConceptForest(concepts, prerequisites);

    function makeNode(concept) {
      return { id: concept.id, concept, children: (childrenById.get(concept.id) || []).map(makeNode) };
    }

    const treeData = roots.length === 1
      ? makeNode(roots[0])
      : {
          id: "__subject__",
          concept: { id: "__subject__", name: "Subject", topic: "", importance: 0.6, difficulty: 0.5 },
          children: roots.map(makeNode),
        };

    // ── d3 hierarchy + tree layout ──────────────────────────────────────────────
    const root = d3.hierarchy(treeData, (d) => d.children);

    const nodeCount = root.descendants().length;
    // Give each leaf enough horizontal space so labels don't collide
    const nodeRadius = (d) => 7 + (d.data.concept.importance ?? 0.5) * 13;
    const leafSep    = 90;
    const leafCount  = root.leaves().length || 1;
    const treeWidth  = Math.max(width - PAD.left - PAD.right, leafCount * leafSep);
    const treeHeight = height - PAD.top - PAD.bottom;

    d3.tree()
      .size([treeWidth, treeHeight])
      .separation((a, b) => a.parent === b.parent ? 1.2 : 1.8)(root);

    // ── SVG scaffold ────────────────────────────────────────────────────────────
    const defs = svg.append("defs");
    // Arrow marker
    defs.append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -4 8 8")
      .attr("refX", 8)
      .attr("refY", 0)
      .attr("markerWidth", 5)
      .attr("markerHeight", 5)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-4L8,0L0,4")
      .attr("fill", "#9ca3af");

    const g = svg.append("g")
      .attr("transform", `translate(${PAD.left},${PAD.top})`);

    // Zoom & pan
    svg.call(
      d3.zoom()
        .scaleExtent([0.25, 3])
        .on("zoom", (event) => g.attr("transform", event.transform))
    );

    // ── edges (curved bezier, parent → child) ──────────────────────────────────
    const linkPath = d3.linkVertical()
      .x((d) => d.x)
      .y((d) => d.y);

    const linkSel = g.append("g")
      .attr("class", "links")
      .selectAll("path")
      .data(root.links())
      .join("path")
      .attr("fill", "none")
      .attr("stroke", "#d1d5db")
      .attr("stroke-width", 1.5)
      .attr("marker-end", "url(#arrow)")
      .attr("d", linkPath);

    // ── nodes ───────────────────────────────────────────────────────────────────
    const nodeSel = g.append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(root.descendants())
      .join("g")
      .attr("transform", (d) => `translate(${d.x},${d.y})`)
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        event.stopPropagation();
        setSelected((prev) => prev === d.data.id ? null : d.data.id);
        onConceptClick?.(d.data.concept);
      })
      .on("mouseenter", (event, d) => {
        const rect = svgRef.current.getBoundingClientRect();
        setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, concept: d.data.concept, mastery: masteryByConceptId[d.data.id] });
      })
      .on("mouseleave", () => setTooltip(null));

    // Node circles
    nodeSel.append("circle")
      .attr("r", (d) => nodeRadius(d))
      .attr("fill", (d) => {
        const m = masteryByConceptId[d.data.id];
        return m !== undefined ? masteryColor(m) : (topicColor[d.data.concept.topic] || "#9ca3af");
      })
      .attr("fill-opacity", 0.9)
      .attr("stroke", "#fff")
      .attr("stroke-width", 2);

    // Name label (below circle)
    nodeSel.append("text")
      .text((d) => {
        const n = d.data.concept.name || "";
        return n.length > 20 ? n.slice(0, 18) + "…" : n;
      })
      .attr("text-anchor", "middle")
      .attr("dy", (d) => nodeRadius(d) + 13)
      .attr("font-size", "10px")
      .attr("font-weight", "600")
      .attr("fill", "#1d1d1f");

    // Topic label (below name)
    nodeSel.append("text")
      .text((d) => {
        const t = d.data.concept.topic || "";
        return t.length > 24 ? t.slice(0, 22) + "…" : t;
      })
      .attr("text-anchor", "middle")
      .attr("dy", (d) => nodeRadius(d) + 24)
      .attr("font-size", "9px")
      .attr("fill", "#6b7280");

    // Drag (freeform, doesn't restructure the tree)
    nodeSel.call(
      d3.drag()
        .on("drag", function (event, d) {
          d.x = event.x;
          d.y = event.y;
          d3.select(this).attr("transform", `translate(${d.x},${d.y})`);
          linkSel.attr("d", (l) => linkPath({ source: l.source, target: l.target }));
        })
    );

    svg.on("click", () => setSelected(null));

    // ── highlighting on selection (update via class, no re-render) ──────────────
    // (handled by the second useEffect below)

  }, [d3Ready, concepts, prerequisites, masteryByConceptId]);

  // Dim non-selected nodes when a node is clicked
  useEffect(() => {
    if (!d3Ready || !svgRef.current) return;
    const d3 = window.d3;
    const svg = d3.select(svgRef.current);
    if (!selected) {
      svg.selectAll(".nodes circle").attr("opacity", 1);
      svg.selectAll(".nodes text").attr("opacity", 1);
      svg.selectAll(".links path").attr("opacity", 1);
    } else {
      // Collect the concept's ancestors + descendants via prerequisite edges
      const linked = new Set([selected]);
      const addChain = (id, dir) => {
        prerequisites.forEach((p) => {
          if (dir === "up"   && p.concept_id === id     && !linked.has(p.prerequisite_id)) { linked.add(p.prerequisite_id); addChain(p.prerequisite_id, "up"); }
          if (dir === "down" && p.prerequisite_id === id && !linked.has(p.concept_id))    { linked.add(p.concept_id);    addChain(p.concept_id,    "down"); }
        });
      };
      addChain(selected, "up");
      addChain(selected, "down");

      svg.selectAll(".nodes circle").attr("opacity", (d) => linked.has(d?.data?.id) ? 1 : 0.12);
      svg.selectAll(".nodes text").attr("opacity", (d) => linked.has(d?.data?.id) ? 1 : 0.12);
      svg.selectAll(".links path").attr("opacity", (d) => linked.has(d?.source?.data?.id) && linked.has(d?.target?.data?.id) ? 1 : 0.06);
    }
  }, [selected, d3Ready, prerequisites]);

  if (!concepts.length) {
    return (
      <div className="tw-scope flex items-center justify-center rounded-2xl bg-[var(--surface-soft)] py-12">
        <p className="m-0 text-sm text-soft-ink">No concepts extracted yet. Upload reference material to build the concept map.</p>
      </div>
    );
  }

  return (
    <div className="tw-scope relative select-none">
      {/* Legend */}
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-soft-ink">
        <span className="font-semibold text-ink">Mastery:</span>
        {[["Not practiced", "#e5e7eb"], ["< 40%", "#ff3b30"], ["40–70%", "#ff9500"], ["> 70%", "#34c759"]].map(([label, color]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: color }} />
            {label}
          </span>
        ))}
        <span className="ml-auto text-soft-ink">Node size = importance · Click to highlight chain</span>
      </div>

      <svg
        ref={svgRef}
        width="100%"
        height={height}
        className="rounded-2xl bg-[var(--surface-soft)]"
      />

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 rounded-xl border border-ink/8 bg-white p-3 shadow-lg"
          style={{ left: tooltip.x + 14, top: tooltip.y - 20, maxWidth: 240 }}
        >
          <p className="m-0 text-sm font-semibold text-ink">{tooltip.concept.name}</p>
          <p className="m-0 text-xs text-soft-ink">{tooltip.concept.topic}</p>
          {tooltip.mastery !== undefined && (
            <p className="m-0 mt-1 text-xs font-semibold" style={{ color: masteryColor(tooltip.mastery) }}>
              Mastery: {Math.round(tooltip.mastery * 100)}%
            </p>
          )}
          <p className="m-0 mt-1 text-xs text-soft-ink">
            Importance: {Math.round((tooltip.concept.importance ?? 0.5) * 100)}% ·{" "}
            Difficulty: {Math.round((tooltip.concept.difficulty ?? 0.5) * 100)}%
          </p>
          {tooltip.concept.description && (
            <p className="m-0 mt-1 text-xs text-soft-ink line-clamp-2">{tooltip.concept.description}</p>
          )}
        </div>
      )}

      {!d3Ready && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-[var(--surface-soft)]">
          <p className="m-0 text-sm text-soft-ink">Loading graph…</p>
        </div>
      )}
    </div>
  );
}
