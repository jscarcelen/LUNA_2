"use client";

/**
 * ⚠️  INTERNAL DEVELOPER TOOL — JONATHAN ONLY
 * Never linked from public nav. Never shown to end users.
 * URL: /dev/block-matrix
 *
 * Master matrix for all built-in blocks. Four dimensions:
 *   1. Metadata        — name, family, variant, category (all editable)
 *   2. Views           — which views auto-generate (student / answer key) + fields per view
 *   3. Location        — where on the page (inline, first-page, every-page header/footer)
 *   4. Repetition      — pageScope.mode, repeat.mode, pagination
 *
 * Edits save to localStorage. Export JSON to apply changes to blocks.ts.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { builtInBlocks } from "../../../modules/template-studio/engine/blocks";

export const dynamic = "force-dynamic";

// ─── Constants ────────────────────────────────────────────────────────────────

const UI_CATS      = ["structure", "questions", "worksheets", "games"];
const RAW_CATS     = ["structure", "questions", "kids", "cards", "custom"];
const REPEAT_MODES = ["none", "flow", "page", "grid"];
const LOCATION_OPTS = ["inline-flow", "first-page-only", "every-page-header", "every-page-footer"];
const PAGESCOPE_OPTS = ["page", "first", "last", "every"];

const CAT_STYLE = {
  structure:  { bg: "#f0fdf4", ink: "#166534", border: "#bbf7d0" },
  questions:  { bg: "#dbeafe", ink: "#1d4ed8", border: "#bfdbfe" },
  worksheets: { bg: "#fff7ed", ink: "#9a3412", border: "#fed7aa" },
  games:      { bg: "#fdf4ff", ink: "#7e22ce", border: "#e9d5ff" },
  kids:       { bg: "#fdf4ff", ink: "#7e22ce", border: "#e9d5ff" },
  cards:      { bg: "#f0f9ff", ink: "#0369a1", border: "#bae6fd" },
  custom:     { bg: "#f9fafb", ink: "#374151", border: "#e5e7eb" },
};

const LOC_STYLE = {
  "inline-flow":       { bg: "#f0fdf4", ink: "#166534", icon: "↕ flow"   },
  "first-page-only":   { bg: "#dbeafe", ink: "#1d4ed8", icon: "① first"  },
  "every-page-header": { bg: "#fff7ed", ink: "#9a3412", icon: "⊤ header" },
  "every-page-footer": { bg: "#fef3c7", ink: "#92400e", icon: "⊥ footer" },
};

const WORKSHEET_FAMILIES = new Set([
  "Fill in the blanks", "Match the pairs", "Math practice set", "Cut and paste", "Tracing",
]);

// ─── Derivation helpers ───────────────────────────────────────────────────────

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
  const grp = (block.elements || []).find((e) => e.type === "group");
  return grp?.pageScope?.mode || "page";
}

function defaultRepeatMode(block) {
  const grp = (block.elements || []).find((e) => e.type === "group");
  return grp?.repeat?.mode || "none";
}

function blockFrame(block) {
  const grp = (block.elements || []).find((e) => e.type === "group");
  return grp?.frame || null;
}

function blockViews(block) {
  const hasAnswer = (block.options || []).some((o) => o.key === "answer");
  return hasAnswer ? ["student", "answer-key"] : ["student"];
}

/** Which option toggles are ON in each view */
function optionsForView(block, view) {
  return (block.options || []).map((o) => ({
    key: o.key,
    label: o.label,
    defaultOn: o.default,
    on: view === "answer-key"
      ? true                                         // answer key shows everything
      : o.key === "answer" ? false : o.default,      // student hides answer
  }));
}

// A4 content = 186mm. Letter = 192mm (+6). Slides = 230mm (+44).
function formatFit() {
  return { a4: "ok", letter: "warn", slides: "bad" };
}

// ─── Persistence ──────────────────────────────────────────────────────────────

const STORE_KEY = "luna.blockMatrix.overrides.v2";
function loadOverrides() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); } catch { return {}; }
}
function saveOverrides(data) { localStorage.setItem(STORE_KEY, JSON.stringify(data)); }

// ─── Primitive components ─────────────────────────────────────────────────────

function Pill({ label, bg, ink, border }) {
  return (
    <span style={{ background: bg, color: ink, border: `1px solid ${border || ink + "33"}`, borderRadius: 999, padding: "2px 9px", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", display: "inline-block" }}>
      {label}
    </span>
  );
}

function Sel({ value, options, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      style={{ border: "1.5px solid #e5e7eb", borderRadius: 6, padding: "3px 6px", fontSize: 11, fontWeight: 600, color: "#1d1d1f", background: "white", cursor: "pointer" }}>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function Txt({ value, onChange, placeholder, width = 130 }) {
  return (
    <input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      style={{ border: "1.5px solid #e5e7eb", borderRadius: 6, padding: "3px 8px", fontSize: 11, width }} />
  );
}

function FitCell({ fits }) {
  const items = [
    { key: "a4",     label: "A4",  ...fits },
    { key: "letter", label: "LT"  },
    { key: "slides", label: "SL"  },
  ];
  const icons = { ok: { em: "✅", tip: "Native — built for this width" }, warn: { em: "⚠️", tip: "Minor: 6mm extra, inner elements at 186mm" }, bad: { em: "🔴", tip: "Major: 44mm surplus, inner elements misaligned" } };
  const fitsArr = [fits.a4, fits.letter, fits.slides];
  const labels  = ["A4", "LT", "SL"];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <div style={{ display: "flex", gap: 3 }}>
        {fitsArr.map((f, i) => (
          <span key={i} title={`${labels[i]}: ${icons[f]?.tip}`} style={{ fontSize: 12 }}>{icons[f]?.em}</span>
        ))}
      </div>
      <div style={{ fontSize: 8, color: "#9ca3af" }}>A4 · LT · SL</div>
    </div>
  );
}

// ─── Expanded detail panel ────────────────────────────────────────────────────

function DetailPanel({ block, override }) {
  const frame = blockFrame(block);
  const views = blockViews(block);
  const fits  = formatFit();
  const grp   = (block.elements || []).find((e) => e.type === "group");

  return (
    <tr>
      <td colSpan={14} style={{ padding: 0, borderBottom: "2px solid #0071e3" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", background: "#f8faff", borderTop: "1px solid #bfdbfe" }}>

          {/* 1 — Views & fields */}
          <div style={{ padding: "16px 18px", borderRight: "1px solid #e5e7eb" }}>
            <SectionTitle>Views &amp; fields per view</SectionTitle>
            {views.map((v) => {
              const opts = optionsForView(block, v);
              return (
                <div key={v} style={{ marginBottom: 14 }}>
                  <div style={{ marginBottom: 6 }}>
                    {v === "student"    && <Pill label="👤 Student view"  bg="#e0f2fe" ink="#0369a1" />}
                    {v === "answer-key" && <Pill label="🔑 Answer key"    bg="#dcfce7" ink="#166534" />}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Options</div>
                  {opts.map((o) => (
                    <div key={o.key} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 12, color: o.on ? "#16a34a" : "#d1d5db", width: 14 }}>{o.on ? "✓" : "–"}</span>
                      <span style={{ fontSize: 11, color: o.on ? "#1d1d1f" : "#9ca3af", textDecoration: o.on ? "none" : "line-through" }}>
                        {o.label}
                        {o.key === "answer" && <span style={{ color: "#f59e0b", marginLeft: 4 }}>← controls answer key</span>}
                      </span>
                    </div>
                  ))}
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 8, marginBottom: 4 }}>Fields exposed</div>
                  {(block.fields || []).map((f) => (
                    <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                      <span style={{ fontSize: 10, color: "#3b82f6" }}>⬡</span>
                      <span style={{ fontSize: 10, fontFamily: "monospace", color: "#374151" }}>{f.name} <span style={{ color: "#9ca3af" }}>· {f.type}</span></span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {/* 2 — Placement / Frame */}
          <div style={{ padding: "16px 18px", borderRight: "1px solid #e5e7eb" }}>
            <SectionTitle>Placement &amp; format fit</SectionTitle>
            {frame ? (
              <>
                <div style={{ fontFamily: "monospace", background: "#f1f5f9", borderRadius: 8, padding: "10px 12px", fontSize: 11, lineHeight: 2, marginBottom: 12 }}>
                  <span style={{ color: "#6b7280" }}>x:</span> <b>{frame.x}</b> mm&nbsp;&nbsp;
                  <span style={{ color: "#6b7280" }}>y:</span> <b>{frame.y}</b> mm<br />
                  <span style={{ color: "#6b7280" }}>w:</span> <b>{frame.w}</b> mm&nbsp;&nbsp;
                  <span style={{ color: "#6b7280" }}>h:</span> <b>{frame.h}</b> mm
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Format compatibility</div>
                {[
                  { label: "A4",          canvasW: 210, contentW: 186, fit: fits.a4    },
                  { label: "Letter",      canvasW: 216, contentW: 192, fit: fits.letter },
                  { label: "Slides 16:9", canvasW: 254, contentW: 230, fit: fits.slides },
                ].map(({ label, canvasW, contentW, fit }) => {
                  const icons = { ok: { em: "✅", desc: "Native match" }, warn: { em: "⚠️", desc: `Inner elements +${contentW - 186}mm overrun` }, bad: { em: "🔴", desc: `Inner elements +${contentW - 186}mm overrun` } };
                  return (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 14 }}>{icons[fit].em}</span>
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 600 }}>{label}</span>
                        <span style={{ fontSize: 10, color: "#6b7280", marginLeft: 6 }}>{canvasW}mm canvas · {contentW}mm content</span>
                        <br />
                        <span style={{ fontSize: 10, color: fit === "ok" ? "#16a34a" : "#dc2626" }}>{icons[fit].desc}</span>
                      </div>
                    </div>
                  );
                })}
              </>
            ) : <span style={{ fontSize: 11, color: "#9ca3af" }}>No frame data</span>}
          </div>

          {/* 3 — Repetition */}
          <div style={{ padding: "16px 18px", borderRight: "1px solid #e5e7eb" }}>
            <SectionTitle>Repetition &amp; page logic</SectionTitle>
            <div style={{ fontSize: 11, display: "flex", flexDirection: "column", gap: 8 }}>
              <PropRow label="pageScope.mode" value={grp?.pageScope?.mode || "page"} />
              <PropRow label="repeat.mode"    value={grp?.repeat?.mode   || "none"} />
              {grp?.repeat?.columns && <PropRow label="repeat.columns" value={grp.repeat.columns} />}
              {grp?.repeat?.fieldId && <PropRow label="repeat.fieldId"  value={grp.repeat.fieldId} mono />}

              {grp?.pagination && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 4 }}>Pagination</div>
                  <div style={{ fontFamily: "monospace", background: "#f1f5f9", borderRadius: 6, padding: "8px 10px", fontSize: 10, lineHeight: 1.9 }}>
                    keepTogether:  {String(grp.pagination.keepTogether  ?? "–")}<br />
                    allowSplit:    {String(grp.pagination.allowSplit    ?? "–")}<br />
                    breakBefore:   {String(grp.pagination.breakBefore   ?? "–")}<br />
                    breakAfter:    {String(grp.pagination.breakAfter    ?? "–")}<br />
                    overflow:      {String(grp.pagination.overflow      ?? "–")}
                  </div>
                </>
              )}

              <div style={{ marginTop: 8, padding: "8px 12px", background: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0", fontSize: 11, color: "#166534" }}>
                {grp?.pageScope?.mode === "every"  && "🔁 Renders on every page (header / footer)"}
                {grp?.pageScope?.mode === "first"  && "① Renders on first page only"}
                {grp?.pageScope?.mode === "last"   && "⊥ Renders on last page only"}
                {grp?.repeat?.mode    === "flow"   && "↕ One element group per data item (flows down)"}
                {grp?.repeat?.mode    === "page"   && "📄 New page per data item"}
                {grp?.repeat?.mode    === "grid"   && `⊞ Grid (${grp.repeat.columns} columns)`}
                {!grp?.repeat?.mode   && grp?.pageScope?.mode === "page" && "— Single instance, placed once in flow"}
              </div>
            </div>
          </div>

          {/* 4 — Description + all fields */}
          <div style={{ padding: "16px 18px" }}>
            <SectionTitle>Description &amp; schema</SectionTitle>
            <p style={{ fontSize: 11, color: "#374151", lineHeight: 1.6, margin: "0 0 14px" }}>{block.description}</p>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
              All fields ({block.fields?.length || 0})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {(block.fields || []).map((f) => (
                <div key={f.id} style={{ fontFamily: "monospace", fontSize: 10, color: "#374151", display: "flex", gap: 6, alignItems: "baseline" }}>
                  <span style={{ color: "#0071e3", minWidth: 70 }}>{f.type}</span>
                  <span>{f.name}</span>
                  {f.required === false && <span style={{ color: "#d1d5db" }}>(opt)</span>}
                  {f.children && <span style={{ color: "#9ca3af" }}>[{f.children.length} child{f.children.length !== 1 ? "ren" : ""}]</span>}
                </div>
              ))}
            </div>
          </div>

        </div>
      </td>
    </tr>
  );
}

function SectionTitle({ children }) {
  return <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7280", marginBottom: 10 }}>{children}</div>;
}
function PropRow({ label, value, mono }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
      <span style={{ fontSize: 10, color: "#6b7280", minWidth: 110 }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 600, fontFamily: mono ? "monospace" : "inherit", color: "#1d1d1f" }}>{String(value)}</span>
    </div>
  );
}

// ─── Block row ────────────────────────────────────────────────────────────────

function BlockRow({ block, override, onUpdate, onDelete, expanded, onToggle }) {
  const uiCat      = override.uiCat      ?? defaultUiCat(block);
  const location   = override.location   ?? defaultLocation(block);
  const pageScope  = override.pageScope  ?? defaultPageScope(block);
  const repeatMode = override.repeatMode ?? defaultRepeatMode(block);
  const name       = override.name       ?? block.name;
  const notes      = override.notes      ?? "";
  const isFixed    = override.isFixed    ?? (block.id === "block-header-exam" || block.id === "block-footer" || block.id === "block-header-minimal");

  const views  = blockViews(block);
  const frame  = blockFrame(block);
  const fits   = formatFit();
  const locSt  = LOC_STYLE[location] || LOC_STYLE["inline-flow"];
  const catSt  = CAT_STYLE[uiCat]    || CAT_STYLE.custom;

  return (
    <>
      <tr
        onClick={onToggle}
        style={{ cursor: "pointer", borderBottom: expanded ? "none" : "1px solid #f0f0f0", verticalAlign: "middle", background: expanded ? "#eef4ff" : "white", transition: "background 0.1s" }}
      >
        {/* Expand */}
        <td style={{ padding: "8px 4px 8px 14px", width: 18, color: "#9ca3af", fontSize: 12, userSelect: "none" }}>
          {expanded ? "▾" : "▸"}
        </td>

        {/* Block identity (click stops propagation so name edit works) */}
        <td style={{ padding: "8px 10px" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>{block.icon || "–"}</span>
            <div>
              <input
                value={name}
                onChange={(e) => onUpdate({ name: e.target.value })}
                style={{ border: "none", fontSize: 12, fontWeight: 700, color: "#1d1d1f", background: "transparent", padding: 0, width: 150, cursor: "text" }}
              />
              <div style={{ fontSize: 10, color: "#6b7280" }}>
                {block.family}
                {block.variant && <span style={{ fontStyle: "italic" }}> · {block.variant}</span>}
              </div>
              <div style={{ fontSize: 9, fontFamily: "monospace", color: "#d1d5db", marginTop: 1 }}>{block.id}</div>
            </div>
          </div>
        </td>

        {/* Views */}
        <td style={{ padding: "8px 10px" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {views.map((v) => (
              v === "student"
                ? <Pill key={v} label="👤 Student"    bg="#e0f2fe" ink="#0369a1" />
                : <Pill key={v} label="🔑 Answer key" bg="#dcfce7" ink="#166534" />
            ))}
          </div>
        </td>

        {/* UI category */}
        <td style={{ padding: "8px 10px" }} onClick={(e) => e.stopPropagation()}>
          <Sel value={uiCat} options={UI_CATS} onChange={(v) => onUpdate({ uiCat: v })} />
        </td>

        {/* Location */}
        <td style={{ padding: "8px 10px" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <Sel value={location} options={LOCATION_OPTS} onChange={(v) => onUpdate({ location: v })} />
            <span style={{ background: locSt.bg, color: locSt.ink, borderRadius: 999, padding: "1px 7px", fontSize: 9, fontWeight: 700, alignSelf: "flex-start" }}>
              {locSt.icon}
            </span>
          </div>
        </td>

        {/* pageScope */}
        <td style={{ padding: "8px 10px" }} onClick={(e) => e.stopPropagation()}>
          <Sel value={pageScope} options={PAGESCOPE_OPTS} onChange={(v) => onUpdate({ pageScope: v })} />
        </td>

        {/* Repeat mode */}
        <td style={{ padding: "8px 10px" }} onClick={(e) => e.stopPropagation()}>
          <Sel value={repeatMode} options={REPEAT_MODES} onChange={(v) => onUpdate({ repeatMode: v })} />
        </td>

        {/* Frame */}
        <td style={{ padding: "8px 10px" }} onClick={(e) => e.stopPropagation()}>
          {frame
            ? <span style={{ fontFamily: "monospace", fontSize: 10, color: "#374151", background: "#f3f4f6", borderRadius: 4, padding: "3px 7px", whiteSpace: "nowrap" }}>{frame.w}×{frame.h}</span>
            : <span style={{ color: "#d1d5db" }}>–</span>}
        </td>

        {/* Format fit */}
        <td style={{ padding: "8px 6px", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
          <FitCell fits={fits} />
        </td>

        {/* Fixed */}
        <td style={{ padding: "8px 10px", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={isFixed} onChange={(e) => onUpdate({ isFixed: e.target.checked })}
            style={{ width: 15, height: 15, cursor: "pointer", accentColor: "#0071e3" }} />
        </td>

        {/* Options */}
        <td style={{ padding: "8px 10px" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            {(block.options || []).map((o) => (
              <span key={o.key} title={o.label}
                style={{ background: o.default ? "#dcfce7" : "#f3f4f6", color: o.default ? "#166534" : "#6b7280", borderRadius: 4, padding: "2px 7px", fontSize: 10, fontWeight: 600 }}>
                {o.key}
              </span>
            ))}
            {!(block.options || []).length && <span style={{ color: "#d1d5db", fontSize: 10 }}>none</span>}
          </div>
        </td>

        {/* Notes */}
        <td style={{ padding: "8px 10px" }} onClick={(e) => e.stopPropagation()}>
          <Txt value={notes} onChange={(v) => onUpdate({ notes: v })} placeholder="Notes…" />
        </td>

        {/* Delete */}
        <td style={{ padding: "8px 10px" }} onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => { if (confirm(`Hide "${name}" from this matrix?\n(Does NOT remove it from blocks.ts)`)) onDelete(); }}
            title="Hide block (soft delete — restore with the banner button)"
            style={{ background: "none", border: "none", color: "#fca5a5", fontSize: 15, cursor: "pointer", padding: "2px 5px", borderRadius: 4, lineHeight: 1 }}>
            🗑
          </button>
        </td>
      </tr>

      {expanded && <DetailPanel block={block} override={override} />}
    </>
  );
}

// ─── Family separator ─────────────────────────────────────────────────────────

function FamilySeparator({ family, count }) {
  return (
    <tr>
      <td colSpan={14} style={{ padding: "10px 14px 4px", background: "#f5f5f7", borderTop: "1px solid #e5e7eb" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>{family}</span>
        <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: 8 }}>{count} variant{count !== 1 ? "s" : ""}</span>
      </td>
    </tr>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BlockMatrixPage() {
  const allBlocks = useMemo(() => builtInBlocks(), []);
  const [overrides, setOverrides] = useState({});
  const [search,     setSearch]     = useState("");
  const [filterCat,  setFilterCat]  = useState("all");
  const [filterView, setFilterView] = useState("all");
  const [sortKey,    setSortKey]    = useState("family");
  const [groupByFam, setGroupByFam] = useState(true);
  const [expanded,   setExpanded]   = useState({});
  const [saved,      setSaved]      = useState(false);
  const saveTimer = useRef(null);

  useEffect(() => { setOverrides(loadOverrides()); }, []);

  const update = useCallback((blockId, patch) => {
    setOverrides((prev) => {
      const next = { ...prev, [blockId]: { ...(prev[blockId] || {}), ...patch } };
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveOverrides(next);
        setSaved(true);
        setTimeout(() => setSaved(false), 1800);
      }, 500);
      return next;
    });
  }, []);

  const deleteBlock   = useCallback((id) => update(id, { deleted: true }), [update]);
  const toggleExpand  = useCallback((id) => setExpanded((p) => ({ ...p, [id]: !p[id] })), []);
  const expandAll     = () => setExpanded(Object.fromEntries(visibleBlocks.map((b) => [b.id, true])));
  const collapseAll   = () => setExpanded({});

  const visibleBlocks = useMemo(() => {
    let out = allBlocks.filter((b) => !(overrides[b.id]?.deleted));
    if (filterCat !== "all")          out = out.filter((b) => (overrides[b.id]?.uiCat ?? defaultUiCat(b)) === filterCat);
    if (filterView === "has-answer")  out = out.filter((b) => blockViews(b).includes("answer-key"));
    if (filterView === "no-answer")   out = out.filter((b) => !blockViews(b).includes("answer-key"));
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((b) =>
        b.id.includes(q) ||
        (overrides[b.id]?.name || b.name).toLowerCase().includes(q) ||
        (b.family || "").toLowerCase().includes(q) ||
        (b.variant || "").toLowerCase().includes(q)
      );
    }
    if (!groupByFam) {
      return [...out].sort((a, b2) => {
        if (sortKey === "family")   return (a.family || a.name).localeCompare(b2.family || b2.name);
        if (sortKey === "id")       return a.id.localeCompare(b2.id);
        if (sortKey === "category") return (a.category || "").localeCompare(b2.category || "");
        if (sortKey === "location") return defaultLocation(a).localeCompare(defaultLocation(b2));
        return 0;
      });
    }
    // Group by family — maintain family order from builtInBlocks
    return out; // rendered grouped below
  }, [allBlocks, overrides, filterCat, filterView, search, sortKey, groupByFam]);

  // Build family groups for grouped rendering
  const familyGroups = useMemo(() => {
    if (!groupByFam) return null;
    const map = new Map();
    for (const block of visibleBlocks) {
      const key = block.family || block.name;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(block);
    }
    return [...map.entries()].map(([family, blocks]) => ({ family, blocks }));
  }, [groupByFam, visibleBlocks]);

  // Stats
  const totalAll     = allBlocks.length;
  const withAnswer   = allBlocks.filter((b) => blockViews(b).includes("answer-key")).length;
  const firstOnly    = allBlocks.filter((b) => defaultLocation(b) === "first-page-only").length;
  const everyPage    = allBlocks.filter((b) => defaultLocation(b).startsWith("every-page")).length;
  const deletedCount = Object.values(overrides).filter((o) => o.deleted).length;

  function exportJSON() {
    const blob = new Blob([JSON.stringify(overrides, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "block-matrix-overrides.json"; a.click();
  }
  function resetAll() {
    if (!confirm("Reset ALL overrides? Cannot be undone.")) return;
    setOverrides({}); saveOverrides({});
  }
  function restoreDeleted() {
    const next = { ...overrides };
    Object.keys(next).forEach((k) => { delete next[k].deleted; });
    setOverrides(next); saveOverrides(next);
  }

  const TH = ({ children, w, title }) => (
    <th title={title} style={{ textAlign: "left", padding: "9px 10px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7280", whiteSpace: "nowrap", borderBottom: "2px solid #e5e7eb", background: "#f9fafb", width: w }}>
      {children}
    </th>
  );

  const renderRows = () => {
    if (!groupByFam) {
      return visibleBlocks.map((block) => (
        <BlockRow key={block.id} block={block} override={overrides[block.id] || {}}
          onUpdate={(p) => update(block.id, p)} onDelete={() => deleteBlock(block.id)}
          expanded={!!expanded[block.id]} onToggle={() => toggleExpand(block.id)} />
      ));
    }
    return (familyGroups || []).flatMap(({ family, blocks }) => [
      <FamilySeparator key={`sep-${family}`} family={family} count={blocks.length} />,
      ...blocks.map((block) => (
        <BlockRow key={block.id} block={block} override={overrides[block.id] || {}}
          onUpdate={(p) => update(block.id, p)} onDelete={() => deleteBlock(block.id)}
          expanded={!!expanded[block.id]} onToggle={() => toggleExpand(block.id)} />
      )),
    ]);
  };

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: "#f5f5f7", minHeight: "100vh", padding: "20px 28px" }}>

      {/* ── Dev disclaimer ─────────────────────────────────────────── */}
      <div style={{ background: "#1c1c1e", color: "#fbbf24", borderRadius: 14, padding: "12px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 22 }}>⚠️</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>INTERNAL DEVELOPER TOOL — Jonathan only</div>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>
            Not linked from public nav. Edits save to <code style={{ background: "#374151", padding: "1px 5px", borderRadius: 3 }}>localStorage</code>.
            Changes here do <strong>not</strong> auto-apply to <code style={{ background: "#374151", padding: "1px 5px", borderRadius: 3 }}>blocks.ts</code> — click Export JSON, then apply manually.
          </div>
        </div>
        {saved && <span style={{ background: "#16a34a", color: "white", borderRadius: 8, padding: "5px 14px", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>✓ Saved</span>}
        <button onClick={exportJSON} style={{ background: "#374151", color: "white", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 12, cursor: "pointer", fontWeight: 600, flexShrink: 0 }}>Export JSON ↓</button>
        {deletedCount > 0 && (
          <button onClick={restoreDeleted} style={{ background: "#374151", color: "#fca5a5", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>
            Restore {deletedCount} hidden
          </button>
        )}
        <button onClick={resetAll} style={{ background: "#7f1d1d", color: "#fca5a5", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>Reset all</button>
      </div>

      {/* ── Stats cards ────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 20 }}>
        {[
          { label: "Total blocks",       value: totalAll,     color: "#0071e3", sub: "in blocks.ts"               },
          { label: "→ Answer key view",  value: withAnswer,   color: "#16a34a", sub: "auto-generate answer key"   },
          { label: "First page only",    value: firstOnly,    color: "#1d4ed8", sub: "headers etc."               },
          { label: "Every page",         value: everyPage,    color: "#9a3412", sub: "header / footer repeat"     },
          { label: "Hidden",             value: deletedCount, color: "#dc2626", sub: "restore via banner"         },
        ].map(({ label, value, color, sub }) => (
          <div key={label} style={{ background: "white", borderRadius: 14, padding: "16px 18px", boxShadow: "0 1px 6px rgba(0,0,0,0.07)" }}>
            <div style={{ fontSize: 30, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#1d1d1f", marginTop: 4 }}>{label}</div>
            <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ── Location inconsistency alert ───────────────────────────── */}
      <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 14, padding: "14px 20px", marginBottom: 20, display: "flex", gap: 14, alignItems: "flex-start" }}>
        <span style={{ fontSize: 22, flexShrink: 0 }}>🔴</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#92400e" }}>Layout coordinate inconsistency — all blocks hardcoded to A4 (186mm content)</div>
          <div style={{ fontSize: 11, color: "#78350f", marginTop: 5, lineHeight: 1.7 }}>
            All blocks use <code>PAGE.width = 186</code> for inner element positions. <code>assembleTemplate</code> correctly sets the outer group
            frame to <code>contentW</code>, but child elements inside each group keep their A4 coordinates.<br />
            <strong>Letter</strong> (contentW = 192mm): 6mm surplus — minor misalignment.&nbsp;
            <strong>Slides 16:9</strong> (contentW = 230mm): 44mm surplus — major misalignment.&nbsp;
            <strong>Fix</strong>: scale inner element x-positions &amp; widths proportionally in <code>assembleTemplate</code> when <code>canvasW ≠ 210</code>.
          </div>
        </div>
      </div>

      {/* ── Main card ──────────────────────────────────────────────── */}
      <div style={{ background: "white", borderRadius: 18, boxShadow: "0 2px 16px rgba(0,0,0,0.09)", padding: 28 }}>

        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: "0 0 2px", fontSize: 22, fontWeight: 800, color: "#1d1d1f" }}>Block Component Matrix</h1>
            <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
              {visibleBlocks.length} of {totalAll} blocks · <code style={{ fontSize: 11 }}>engine/blocks.ts</code>
            </p>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search blocks…"
              style={{ border: "1.5px solid #e5e7eb", borderRadius: 8, padding: "6px 12px", fontSize: 12, width: 180 }} />
            <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}
              style={{ border: "1.5px solid #e5e7eb", borderRadius: 8, padding: "6px 10px", fontSize: 12 }}>
              <option value="all">All UI categories</option>
              {UI_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filterView} onChange={(e) => setFilterView(e.target.value)}
              style={{ border: "1.5px solid #e5e7eb", borderRadius: 8, padding: "6px 10px", fontSize: 12 }}>
              <option value="all">All views</option>
              <option value="has-answer">Has answer key</option>
              <option value="no-answer">Student only</option>
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#374151", cursor: "pointer" }}>
              <input type="checkbox" checked={groupByFam} onChange={(e) => setGroupByFam(e.target.checked)} style={{ accentColor: "#0071e3" }} />
              Group by family
            </label>
            {!groupByFam && (
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}
                style={{ border: "1.5px solid #e5e7eb", borderRadius: 8, padding: "6px 10px", fontSize: 12 }}>
                <option value="family">Sort: family</option>
                <option value="category">Sort: category</option>
                <option value="location">Sort: location</option>
                <option value="id">Sort: id</option>
              </select>
            )}
            <button onClick={expandAll}  style={{ border: "1.5px solid #e5e7eb", borderRadius: 8, padding: "6px 12px", fontSize: 12, background: "white", cursor: "pointer" }}>Expand all ▾</button>
            <button onClick={collapseAll} style={{ border: "1.5px solid #e5e7eb", borderRadius: 8, padding: "6px 12px", fontSize: 12, background: "white", cursor: "pointer" }}>Collapse ▸</button>
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <TH w={20} />
                <TH w={210}>Block</TH>
                <TH w={170} title="Views auto-generated when this block is used">Views generated</TH>
                <TH w={115} title="Position in AddPanel accordion">UI category ✎</TH>
                <TH w={165} title="Where on the page this block lives">Location ✎</TH>
                <TH w={95}  title="pageScope.mode on root group">Page scope ✎</TH>
                <TH w={95}  title="repeat.mode on root group">Repeat ✎</TH>
                <TH w={85}  title="Outer group frame w×h in mm">Frame (mm)</TH>
                <TH w={80}  title="Format compatibility: A4 / Letter / Slides">Fmt fit</TH>
                <TH w={55}  title="Always included in wizard — no checkbox in Step 2">Fixed ✎</TH>
                <TH w={180} title="Options (green=default ON, grey=default OFF)">Options</TH>
                <TH>Notes ✎</TH>
                <TH w={30} />
              </tr>
            </thead>
            <tbody>
              {renderRows()}
            </tbody>
          </table>
          {visibleBlocks.length === 0 && (
            <p style={{ textAlign: "center", color: "#9ca3af", padding: "48px 0", fontSize: 13 }}>No blocks match your filters.</p>
          )}
        </div>

        {/* Legend */}
        <div style={{ marginTop: 28, padding: "16px 20px", background: "#f8f9fa", borderRadius: 14, fontSize: 11, color: "#6b7280", lineHeight: 1.9 }}>
          <strong style={{ color: "#374151", display: "block", marginBottom: 6, fontSize: 12 }}>Column guide</strong>
          <b>Views generated</b> — 👤 Student view: always. 🔑 Answer key: auto-generated only when the block has an <code>answer</code> option.<br />
          <b>UI category</b> — where the block appears in the AddPanel 4-category accordion.<br />
          <b>Location</b> — ↕ inline-flow = normal block stack; ① first-page-only = only on page 1; ⊤/⊥ every-page = header/footer repeating on all pages.<br />
          <b>Page scope</b> — <code>pageScope.mode</code> on the root group: <code>every</code> = repeats on every page; <code>first</code> = first page only; <code>page</code> = placed once.<br />
          <b>Repeat</b> — <code>repeat.mode</code>: none / flow (one group per data item) / page (new page per item) / grid (columns).<br />
          <b>Fmt fit</b> — ✅ native (A4, 186mm) · ⚠️ minor mismatch (Letter +6mm) · 🔴 major mismatch (Slides +44mm). Click row to see details.<br />
          <b>Fixed</b> — checked → block is mandatory in wizard Step 2 (no checkbox shown).<br />
          <b>Options</b> — green = default ON · grey = default OFF. The <code>answer</code> option is what triggers answer-key generation.<br />
          Click any row to expand the full breakdown: views &amp; fields, placement, repetition, schema.
        </div>
      </div>
    </div>
  );
}
