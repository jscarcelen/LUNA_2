"use client";

/**
 * ⚠️  INTERNAL DEVELOPER TOOL — NOT VISIBLE TO END USERS
 * This page is for Jonathan / LUNA engineering only.
 * It will NEVER be linked from the public navigation.
 * URL: /dev/block-matrix
 *
 * Here you can view, annotate and reclassify all built-in blocks.
 * Edits are saved to localStorage under "luna.blockMatrix.overrides.v1"
 * and are picked up at build time when we next bake them into blocks.ts.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { builtInBlocks } from "../../modules/template-studio/engine/blocks";

export const dynamic = "force-dynamic";

// ─── Constants ────────────────────────────────────────────────────────────────

const UI_CATEGORIES = ["structure", "questions", "worksheets", "games"];
const RAW_CATEGORIES = ["structure", "questions", "kids", "cards", "custom"];
const REPEAT_MODES   = ["none", "flow", "page", "grid"];
const LOCATION_OPTS  = ["every-page-footer", "every-page-header", "first-page-only", "inline-flow"];
const PAGESCOPE_OPTS = ["page", "first", "last", "every"];

const WORKSHEET_FAMILIES = new Set(["Fill in the blanks", "Match the pairs", "Math practice set", "Cut and paste", "Tracing"]);

function defaultUiCat(block) {
  if (block.category === "structure") return "structure";
  if (block.category === "questions" || (block.category === "kids" && block.family === "Question card")) return "questions";
  if (WORKSHEET_FAMILIES.has(block.family || "")) return "worksheets";
  return "games";
}

function defaultLocation(block) {
  if (block.id === "block-footer") return "every-page-footer";
  if (block.id === "block-header-exam" || block.id === "block-header-minimal") return "first-page-only";
  return "inline-flow";
}

function defaultPageScope(block) {
  // Inspect the block's element groups for pageScope
  const grp = (block.elements || []).find((e) => e.type === "group");
  return grp?.pageScope?.mode || "page";
}

// ─── Persistence ──────────────────────────────────────────────────────────────

const STORE_KEY = "luna.blockMatrix.overrides.v1";

function loadOverrides() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); } catch { return {}; }
}

function saveOverrides(data) {
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
}

// ─── Components ───────────────────────────────────────────────────────────────

function Badge({ label, color }) {
  const COLORS = {
    structure:  ["#f0fdf4", "#166534"],
    questions:  ["#dbeafe", "#1d4ed8"],
    worksheets: ["#fff7ed", "#9a3412"],
    games:      ["#fdf4ff", "#7e22ce"],
    default:    ["#f3f4f6", "#374151"],
  };
  const [bg, ink] = COLORS[color] || COLORS.default;
  return <span style={{ background: bg, color: ink, border: `1px solid ${ink}22`, borderRadius: 999, padding: "1px 8px", fontSize: 10, fontWeight: 700 }}>{label}</span>;
}

function EditableSelect({ value, options, onChange, color }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ border: "1.5px solid #e5e7eb", borderRadius: 6, padding: "3px 6px", fontSize: 11, fontWeight: 600, color: "#1d1d1f", background: "white", cursor: "pointer" }}
    >
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function EditableText({ value, onChange, placeholder }) {
  return (
    <input
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ border: "1.5px solid #e5e7eb", borderRadius: 6, padding: "3px 8px", fontSize: 11, width: "100%", minWidth: 80 }}
    />
  );
}

function BlockRow({ block, override, onUpdate }) {
  const merged = { ...block, ...override };

  const uiCat    = override.uiCat    ?? defaultUiCat(block);
  const location = override.location ?? defaultLocation(block);
  const pageScope= override.pageScope?? defaultPageScope(block);
  const notes    = override.notes    ?? "";
  const isFixed  = override.isFixed  ?? (block.id === "block-header-exam" || block.id === "block-footer" || block.id === "block-header-minimal");
  const repeatMode = override.repeatMode ?? (block.elements?.find((e) => e.type === "group")?.repeat?.mode || "none");

  return (
    <tr style={{ borderBottom: "1px solid #f0f0f0", verticalAlign: "middle" }}>
      {/* ID */}
      <td style={{ padding: "8px 10px", fontFamily: "monospace", fontSize: 10, color: "#6b7280", whiteSpace: "nowrap" }}>{block.id}</td>

      {/* Icon + Name */}
      <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
        <span style={{ fontSize: 16, marginRight: 6 }}>{block.icon || "–"}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#1d1d1f" }}>{block.variant || block.name}</span>
        <div style={{ fontSize: 10, color: "#6b7280" }}>{block.family}</div>
      </td>

      {/* UI Category (editable) */}
      <td style={{ padding: "8px 10px" }}>
        <EditableSelect value={uiCat} options={UI_CATEGORIES} onChange={(v) => onUpdate({ uiCat: v })} />
      </td>

      {/* Raw Category (editable) */}
      <td style={{ padding: "8px 10px" }}>
        <EditableSelect value={merged.category || "structure"} options={RAW_CATEGORIES} onChange={(v) => onUpdate({ category: v })} />
      </td>

      {/* Location (editable) */}
      <td style={{ padding: "8px 10px" }}>
        <EditableSelect value={location} options={LOCATION_OPTS} onChange={(v) => onUpdate({ location: v })} />
      </td>

      {/* PageScope (editable) */}
      <td style={{ padding: "8px 10px" }}>
        <EditableSelect value={pageScope} options={PAGESCOPE_OPTS} onChange={(v) => onUpdate({ pageScope: v })} />
      </td>

      {/* Repeat mode (editable) */}
      <td style={{ padding: "8px 10px" }}>
        <EditableSelect value={repeatMode} options={REPEAT_MODES} onChange={(v) => onUpdate({ repeatMode: v })} />
      </td>

      {/* Fixed in wizard? */}
      <td style={{ padding: "8px 10px", textAlign: "center" }}>
        <input type="checkbox" checked={isFixed} onChange={(e) => onUpdate({ isFixed: e.target.checked })}
          style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#0071e3" }} />
      </td>

      {/* Options */}
      <td style={{ padding: "8px 10px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
          {(block.options || []).map((o) => (
            <span key={o.key}
              style={{ background: o.default ? "#dcfce7" : "#f3f4f6", color: o.default ? "#166534" : "#6b7280", borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 600 }}>
              {o.key}
            </span>
          ))}
          {(block.options || []).length === 0 && <span style={{ color: "#d1d5db", fontSize: 10 }}>–</span>}
        </div>
      </td>

      {/* Fields */}
      <td style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, color: "#374151" }}>
        {(block.fields || []).length}
      </td>

      {/* Notes */}
      <td style={{ padding: "8px 10px", minWidth: 180 }}>
        <EditableText value={notes} onChange={(v) => onUpdate({ notes: v })} placeholder="Engineering notes…" />
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BlockMatrixPage() {
  const blocks = useMemo(() => builtInBlocks(), []);
  const [overrides, setOverrides] = useState({});
  const [search, setSearch]   = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [sortKey, setSortKey] = useState("family");
  const [saved, setSaved] = useState(false);
  const saveTimer = useRef(null);

  useEffect(() => { setOverrides(loadOverrides()); }, []);

  const update = useCallback((blockId, patch) => {
    setOverrides((prev) => {
      const next = { ...prev, [blockId]: { ...(prev[blockId] || {}), ...patch } };
      // Debounced auto-save
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => { saveOverrides(next); setSaved(true); setTimeout(() => setSaved(false), 1500); }, 600);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    let out = blocks;
    if (filterCat !== "all") out = out.filter((b) => b.category === filterCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((b) => b.id.includes(q) || (b.name||"").toLowerCase().includes(q) || (b.family||"").toLowerCase().includes(q) || (b.variant||"").toLowerCase().includes(q));
    }
    return [...out].sort((a, b2) => {
      if (sortKey === "family") return (a.family||a.name).localeCompare(b2.family||b2.name);
      if (sortKey === "id") return a.id.localeCompare(b2.id);
      return (a.category||"").localeCompare(b2.category||"");
    });
  }, [blocks, filterCat, search, sortKey]);

  function exportJSON() {
    const blob = new Blob([JSON.stringify(overrides, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "block-matrix-overrides.json"; a.click();
  }

  function resetAll() {
    if (!confirm("Reset all overrides?")) return;
    setOverrides({}); saveOverrides({});
  }

  const TH = ({ children, w }) => (
    <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#6b7280", whiteSpace: "nowrap", borderBottom: "2px solid #e5e7eb", width: w }}>
      {children}
    </th>
  );

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: "#f5f5f7", minHeight: "100vh", padding: "20px 24px" }}>

      {/* Dev banner */}
      <div style={{ background: "#1c1c1e", color: "#fbbf24", borderRadius: 12, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 20 }}>⚠️</span>
        <div style={{ flex: 1 }}>
          <strong style={{ fontSize: 13 }}>INTERNAL DEVELOPER TOOL</strong>
          <span style={{ fontSize: 12, marginLeft: 10, opacity: 0.7 }}>Jonathan only · never linked from public nav · changes saved to localStorage</span>
        </div>
        {saved && <span style={{ background: "#16a34a", color: "white", borderRadius: 8, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>Saved ✓</span>}
        <button onClick={exportJSON} style={{ background: "#374151", color: "white", border: "none", borderRadius: 8, padding: "5px 14px", fontSize: 12, cursor: "pointer" }}>Export JSON ↓</button>
        <button onClick={resetAll} style={{ background: "#7f1d1d", color: "#fca5a5", border: "none", borderRadius: 8, padding: "5px 14px", fontSize: 12, cursor: "pointer" }}>Reset all</button>
      </div>

      <div style={{ background: "white", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: "0 0 2px", fontSize: 22, fontWeight: 700, color: "#1d1d1f" }}>Block Component Matrix</h1>
            <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>{blocks.length} built-in blocks · <code style={{ fontSize: 11 }}>modules/template-studio/engine/blocks.ts</code> · edits auto-save</p>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
              style={{ border: "1.5px solid #e5e7eb", borderRadius: 8, padding: "5px 12px", fontSize: 12, width: 200 }} />
            <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}
              style={{ border: "1.5px solid #e5e7eb", borderRadius: 8, padding: "5px 10px", fontSize: 12 }}>
              <option value="all">All</option>
              {RAW_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}
              style={{ border: "1.5px solid #e5e7eb", borderRadius: 8, padding: "5px 10px", fontSize: 12 }}>
              <option value="family">Sort: family</option>
              <option value="category">Sort: category</option>
              <option value="id">Sort: id</option>
            </select>
            <span style={{ fontSize: 12, color: "#9ca3af", alignSelf: "center" }}>{filtered.length} shown</span>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <TH w={160}>ID</TH>
                <TH w={160}>Name / family</TH>
                <TH w={110}>UI category ✎</TH>
                <TH w={100}>Raw category ✎</TH>
                <TH w={140}>Location ✎</TH>
                <TH w={90}>Page scope ✎</TH>
                <TH w={90}>Repeat mode ✎</TH>
                <TH w={55}>Fixed in wizard ✎</TH>
                <TH w={140}>Options</TH>
                <TH w={40}>Fields</TH>
                <TH>Notes ✎</TH>
              </tr>
            </thead>
            <tbody>
              {filtered.map((block, i) => (
                <BlockRow
                  key={block.id}
                  block={block}
                  override={overrides[block.id] || {}}
                  onUpdate={(patch) => update(block.id, patch)}
                />
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p style={{ textAlign: "center", color: "#9ca3af", padding: "40px 0", fontSize: 13 }}>No blocks match.</p>}
        </div>

        {/* Legend */}
        <div style={{ marginTop: 20, padding: "14px 18px", background: "#f8f9fa", borderRadius: 12, fontSize: 11, color: "#6b7280", lineHeight: 1.7 }}>
          <strong style={{ color: "#374151", display: "block", marginBottom: 4 }}>Legend · how to use</strong>
          <b>UI category</b> = how the block appears in the AddPanel 4-category accordion in the template editor.<br />
          <b>Raw category</b> = internal category field in blocks.ts (drives render logic).<br />
          <b>Location</b> = where on the page the block lives: inline-flow (normal), every-page-footer, every-page-header, first-page-only.<br />
          <b>Page scope</b> = the pageScope mode on the group element: "every" repeats on all pages (header/footer), "page" = per current page.<br />
          <b>Repeat mode</b> = how the block's main group repeats: flow (one instance per field item), page (new page per item), grid (side by side).<br />
          <b>Fixed in wizard</b> = checked → block is always included in a quiz/game template (no checkbox in Step 2).<br />
          <b>Options (green)</b> = default ON · <b>grey</b> = default OFF.<br />
          Changes auto-save to localStorage. Click <em>Export JSON</em> to copy into blocks.ts annotations.
        </div>
      </div>
    </div>
  );
}
