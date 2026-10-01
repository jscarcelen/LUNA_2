"use client";

import { useEffect, useRef, useState } from "react";

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
 * Force-directed concept graph.
 * Loads D3 7 from CDN on first render; subsequent renders reuse it.
 *
 * Props:
 *   concepts            – array of concept rows { id, name, topic, importance, difficulty }
 *   prerequisites       – array of { concept_id, prerequisite_id }
 *   masteryByConceptId  – { [id]: 0–1 }  (optional)
 *   activities          – array of { id, name, conceptIds[] } (optional)
 *   height              – svg height in px (default 480)
 *   onConceptClick      – (concept) => void (optional)
 */
export function KnowledgeGraph({
  concepts = [],
  prerequisites = [],
  masteryByConceptId = {},
  activities = [],
  height = 480,
  onConceptClick,
}) {
  const svgRef   = useRef(null);
  const simRef   = useRef(null);
  const [d3Ready, setD3Ready] = useState(typeof window !== "undefined" && !!window.d3);
  const [selected, setSelected] = useState(null);
  const [tooltip, setTooltip] = useState(null); // { x, y, concept }

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

  // Build + run the simulation whenever D3 is ready or data changes
  useEffect(() => {
    if (!d3Ready || !svgRef.current || !concepts.length) return;
    const d3 = window.d3;

    // Stop previous simulation
    if (simRef.current) simRef.current.stop();

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = svgRef.current.getBoundingClientRect().width || 700;

    // Assign topic colors
    const topics = [...new Set(concepts.map((c) => c.topic || "Other"))];
    const topicColor = {};
    topics.forEach((t, i) => { topicColor[t] = TOPIC_COLORS[i % TOPIC_COLORS.length]; });

    // Build node/link data
    const nodeById = {};
    const nodes = concepts.map((c) => {
      const n = {
        id:         c.id,
        name:       c.name,
        topic:      c.topic || "Other",
        importance: c.importance ?? 0.5,
        difficulty: c.difficulty ?? 0.5,
        mastery:    masteryByConceptId[c.id],
        concept:    c,
        x:          width / 2 + (Math.random() - 0.5) * 200,
        y:          height / 2 + (Math.random() - 0.5) * 200,
      };
      nodeById[c.id] = n;
      return n;
    });

    const links = prerequisites
      .filter((p) => nodeById[p.concept_id] && nodeById[p.prerequisite_id])
      .map((p) => ({
        source: p.prerequisite_id,
        target: p.concept_id,
        strength: p.strength ?? 1,
      }));

    // Defs: arrowhead marker
    const defs = svg.append("defs");
    defs.append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 22)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#d1d5db");

    const g = svg.append("g");

    // Zoom
    svg.call(
      d3.zoom()
        .scaleExtent([0.3, 3])
        .on("zoom", (event) => g.attr("transform", event.transform))
    );

    // Links
    const link = g.append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "#d1d5db")
      .attr("stroke-width", 1.5)
      .attr("marker-end", "url(#arrow)");

    // Node groups
    const node = g.append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        event.stopPropagation();
        setSelected((prev) => (prev === d.id ? null : d.id));
        onConceptClick?.(d.concept);
      })
      .on("mouseenter", (event, d) => {
        const rect = svgRef.current.getBoundingClientRect();
        setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, concept: d.concept, mastery: d.mastery });
      })
      .on("mouseleave", () => setTooltip(null));

    // Node circles
    node.append("circle")
      .attr("r", (d) => 8 + d.importance * 14)
      .attr("fill", (d) => {
        const m = masteryByConceptId[d.id];
        return m !== undefined ? masteryColor(m) : topicColor[d.topic] || "#9ca3af";
      })
      .attr("fill-opacity", 0.85)
      .attr("stroke", "#fff")
      .attr("stroke-width", 2);

    // Node labels
    node.append("text")
      .text((d) => d.name.length > 18 ? d.name.slice(0, 16) + "…" : d.name)
      .attr("text-anchor", "middle")
      .attr("dy", (d) => 8 + d.importance * 14 + 14)
      .attr("font-size", "10px")
      .attr("font-weight", "600")
      .attr("fill", "#1d1d1f");

    node.append("text")
      .text((d) => d.topic)
      .attr("text-anchor", "middle")
      .attr("dy", (d) => 8 + d.importance * 14 + 25)
      .attr("font-size", "9px")
      .attr("fill", "#6b7280");

    // Drag
    node.call(
      d3.drag()
        .on("start", (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag",  (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on("end",   (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
    );

    // Simulation
    const sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d) => d.id).distance(110).strength(0.6))
      .force("charge", d3.forceManyBody().strength(-220))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide((d) => 16 + d.importance * 14))
      .on("tick", () => {
        link
          .attr("x1", (d) => d.source.x)
          .attr("y1", (d) => d.source.y)
          .attr("x2", (d) => d.target.x)
          .attr("y2", (d) => d.target.y);
        node.attr("transform", (d) => `translate(${d.x},${d.y})`);
      });

    simRef.current = sim;
    svg.on("click", () => setSelected(null));

    return () => { sim.stop(); };
  }, [d3Ready, concepts, prerequisites, masteryByConceptId]);

  // Dim non-selected nodes
  useEffect(() => {
    if (!d3Ready || !svgRef.current) return;
    const d3 = window.d3;
    const svg = d3.select(svgRef.current);
    if (!selected) {
      svg.selectAll("g > g > circle").attr("opacity", 1);
      svg.selectAll("line").attr("opacity", 1);
    } else {
      const linked = new Set([selected]);
      prerequisites.forEach((p) => {
        if (p.concept_id === selected) linked.add(p.prerequisite_id);
        if (p.prerequisite_id === selected) linked.add(p.concept_id);
      });
      svg.selectAll("g > g > circle").attr("opacity", (d) => linked.has(d?.id) ? 1 : 0.15);
      svg.selectAll("line").attr("opacity", (d) => (d?.source?.id && linked.has(d.source.id) && linked.has(d.target.id)) ? 1 : 0.08);
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
        <span className="ml-auto flex items-center gap-1.5">
          <span className="text-soft-ink">Node size = importance · Arrows = prerequisites</span>
        </span>
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
          style={{ left: tooltip.x + 12, top: tooltip.y - 20, maxWidth: 220 }}
        >
          <p className="m-0 text-sm font-semibold text-ink">{tooltip.concept.name}</p>
          <p className="m-0 text-xs text-soft-ink">{tooltip.concept.topic}</p>
          {tooltip.mastery !== undefined && (
            <p className="m-0 mt-1 text-xs font-semibold" style={{ color: masteryColor(tooltip.mastery) }}>
              Mastery: {Math.round(tooltip.mastery * 100)}%
            </p>
          )}
          <p className="m-0 mt-1 text-xs text-soft-ink">
            Importance: {Math.round((tooltip.concept.importance ?? 0.5) * 100)}% ·
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
