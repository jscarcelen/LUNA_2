"use client";

/**
 * ⚠️  INTERNAL DEVELOPER TOOL — NOT VISIBLE TO END USERS
 * This page is for Jonathan / LUNA engineering only.
 * It will never be linked from the public navigation.
 * URL: /dev/block-matrix
 */

import { useMemo, useState } from "react";
import { builtInBlocks } from "../../modules/template-studio/engine/blocks";

// Re-export runtime so it's a Node route (not Edge)
export const dynamic = "force-dynamic";

const CATEGORY_COLORS = {
  structure:  { bg: "#f0fdf4", ink: "#166534", badge: "#bbf7d0" },
  questions:  { bg: "#dbeafe", ink: "#1d4ed8", badge: "#bfdbfe" },
  kids:       { bg: "#fdf4ff", ink: "#7e22ce", badge: "#e9d5ff" },
  cards:      { bg: "#fef9c3", ink: "#854d0e", badge: "#fde68a" },
};

const WORKSHEET_FAMILIES = new Set(["Fill in the blanks", "Match the pairs", "Math practice set", "Cut and paste", "Tracing"]);

function uiCategory(block) {
  if (block.category === "structure") return "structure";
  if (block.category === "questions" || (block.category === "kids" && block.family === "Question card")) return "questions";
  if (WORKSHEET_FAMILIES.has(block.family || "")) return "worksheets";
  return "games";
}

function Badge({ label, bg, ink }) {
  return (
    <span style={{ background: bg, color: ink, border: `1px solid ${ink}30` }}
      className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold">
      {label}
    </span>
  );
}

export default function BlockMatrixPage() {
  const blocks = useMemo(() => builtInBlocks(), []);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [sortKey, setSortKey] = useState("family");

  const filtered = useMemo(() => {
    let out = blocks;
    if (filterCat !== "all") out = out.filter((b) => b.category === filterCat || uiCategory(b) === filterCat);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((b) =>
        b.id.includes(q) || (b.name || "").toLowerCase().includes(q) ||
        (b.family || "").toLowerCase().includes(q) || (b.variant || "").toLowerCase().includes(q) ||
        (b.description || "").toLowerCase().includes(q)
      );
    }
    return [...out].sort((a, b) => {
      if (sortKey === "family") return (a.family || a.name).localeCompare(b.family || b.name);
      if (sortKey === "category") return (a.category || "").localeCompare(b.category || "");
      if (sortKey === "id") return a.id.localeCompare(b.id);
      return 0;
    });
  }, [blocks, filterCat, search, sortKey]);

  const categories = useMemo(() => {
    const cats = new Set(blocks.map((b) => b.category || "–"));
    return ["all", ...cats];
  }, [blocks]);

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: "#f5f5f7", minHeight: "100vh", padding: "24px" }}>
      {/* Dev banner */}
      <div style={{ background: "#1c1c1e", color: "#fbbf24", borderRadius: 12, padding: "10px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 18 }}>⚠️</span>
        <div>
          <strong style={{ fontSize: 13 }}>INTERNAL DEVELOPER TOOL</strong>
          <span style={{ fontSize: 12, marginLeft: 8, opacity: 0.7 }}>Not shown to teachers or students — for engineering use only.</span>
        </div>
      </div>

      <div style={{ background: "white", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", padding: 24 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 700, color: "#1d1d1f" }}>Block Component Matrix</h1>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "#6b7280" }}>
          {blocks.length} built-in blocks · source of truth: <code style={{ fontSize: 11 }}>modules/template-studio/engine/blocks.ts</code>
        </p>

        {/* Filters */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search id, name, family, description…"
            style={{ border: "1.5px solid #e5e7eb", borderRadius: 8, padding: "6px 12px", fontSize: 13, width: 280, outline: "none" }}
          />
          <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}
            style={{ border: "1.5px solid #e5e7eb", borderRadius: 8, padding: "6px 10px", fontSize: 13 }}>
            {categories.map((c) => <option key={c} value={c}>{c === "all" ? "All categories" : c}</option>)}
          </select>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}
            style={{ border: "1.5px solid #e5e7eb", borderRadius: 8, padding: "6px 10px", fontSize: 13 }}>
            <option value="family">Sort by family</option>
            <option value="category">Sort by category</option>
            <option value="id">Sort by ID</option>
          </select>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#6b7280" }}>{filtered.length} matching</span>
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 2px", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "#6b7280", textTransform: "uppercase", fontSize: 10, letterSpacing: "0.1em" }}>
                {["ID", "Icon", "Family", "Variant / Name", "Category (raw)", "UI Category", "Description", "Options", "Fields", "Built-in", "Repetition hint"].map((col) => (
                  <th key={col} style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600, borderBottom: "1.5px solid #f0f0f0", whiteSpace: "nowrap" }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((block, i) => {
                const colors = CATEGORY_COLORS[block.category] || { bg: "#f8f9fa", ink: "#374151", badge: "#e5e7eb" };
                const uiCat = uiCategory(block);
                return (
                  <tr key={block.id} style={{ background: i % 2 === 0 ? "white" : "#fafafa" }}>
                    <td style={{ padding: "8px 10px", fontFamily: "monospace", fontSize: 11, color: "#374151", whiteSpace: "nowrap" }}>{block.id}</td>
                    <td style={{ padding: "8px 10px", fontSize: 18, textAlign: "center" }}>{block.icon || "–"}</td>
                    <td style={{ padding: "8px 10px", fontWeight: 600, color: colors.ink, whiteSpace: "nowrap" }}>{block.family || "–"}</td>
                    <td style={{ padding: "8px 10px", color: "#1d1d1f" }}>{block.variant || block.name}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <Badge label={block.category || "–"} bg={colors.bg} ink={colors.ink} />
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <Badge label={uiCat} bg={CATEGORY_COLORS[uiCat]?.bg || "#f0f0f0"} ink={CATEGORY_COLORS[uiCat]?.ink || "#374151"} />
                    </td>
                    <td style={{ padding: "8px 10px", color: "#6b7280", maxWidth: 280 }}>{block.description || "–"}</td>
                    <td style={{ padding: "8px 10px" }}>
                      {(block.options || []).length > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                          {(block.options || []).map((o) => (
                            <span key={o.key} style={{ background: o.default ? "#dcfce7" : "#f3f4f6", color: o.default ? "#166534" : "#6b7280", borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 600 }}
                              title={`default: ${o.default}`}>
                              {o.key}
                            </span>
                          ))}
                        </div>
                      ) : <span style={{ color: "#d1d5db" }}>–</span>}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center", color: "#374151" }}>
                      {(block.fields || []).length}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center" }}>
                      {block.builtIn ? <span style={{ color: "#16a34a", fontWeight: 700 }}>✓</span> : <span style={{ color: "#d1d5db" }}>–</span>}
                    </td>
                    <td style={{ padding: "8px 10px", color: "#6b7280", fontSize: 11, maxWidth: 200 }}>
                      {block.category === "structure" ? "Fixed — header/footer on every page" :
                       block.family === "Flashcard" ? "Repeat once per card (page/grid)" :
                       block.category === "questions" ? "Repeat once per question" :
                       "Repeat as agent decides"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p style={{ textAlign: "center", color: "#9ca3af", padding: "32px 0", fontSize: 13 }}>No blocks match this filter.</p>
          )}
        </div>

        {/* Legend */}
        <div style={{ marginTop: 24, padding: "16px 20px", background: "#f8f9fa", borderRadius: 12, fontSize: 12, color: "#6b7280" }}>
          <strong style={{ display: "block", marginBottom: 8, color: "#374151" }}>Legend</strong>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            <span><b>Options (green)</b> = default ON · <b>grey</b> = default OFF</span>
            <span><b>UI Category</b> = how it appears in AddPanel (template editor)</span>
            <span><b>Raw category</b> = block's internal category field (blocks.ts)</span>
            <span><b>Fields</b> = number of AI data fields this block declares</span>
          </div>
          <p style={{ marginTop: 8, marginBottom: 0 }}>
            To add a block variant, edit <code>apps/web/modules/template-studio/engine/blocks.ts</code> and add the new build function,
            then add it to the DESIGN_VARIANTS map in <code>TemplateWizard.tsx</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
