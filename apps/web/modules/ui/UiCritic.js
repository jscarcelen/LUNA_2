"use client";

import { useCallback, useEffect, useState } from "react";
import { auditUI } from "./critique";

const WIDTHS = [
  { id: 390, label: "iPhone" },
  { id: 834, label: "iPad" },
  { id: 1280, label: "Desktop" }
];

const TONE = { 3: "#ff3b30", 2: "#b25e00", 1: "#6e6e73" };

/**
 * The interface critic, on screen.
 *
 * It watches the page and, after anything changes, re-reads it looking for the faults a careful eye
 * would catch — text out of its box, controls on top of each other, a row that pushes the page
 * sideways, a target too small to tap, text too pale to read. A badge appears only when it finds
 * something, so a clean screen stays clean; opening it lists every fault and outlines the element
 * on the page. It also reports what the same screen looks like at phone and tablet width, because
 * most of these faults only appear when the window gets narrow.
 */
export function UiCritic({ enabled = true }) {
  const [report, setReport] = useState(null);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  const run = useCallback(() => {
    if (typeof document === "undefined") return;
    setReport(auditUI());
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    let timer = 0;
    const schedule = () => { window.clearTimeout(timer); timer = window.setTimeout(run, 400); };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
    window.addEventListener("resize", schedule);
    const shortcut = (event) => { if (event.altKey && event.shiftKey && event.code === "KeyU") { setHidden(false); setOpen((value) => !value); run(); } };
    window.addEventListener("keydown", shortcut);
    return () => { observer.disconnect(); window.removeEventListener("resize", schedule); window.removeEventListener("keydown", shortcut); window.clearTimeout(timer); };
  }, [enabled, run]);

  const issues = report?.issues || [];
  if (!enabled || hidden || !issues.length) return null;

  const outline = (issue, on) => {
    const node = [...document.querySelectorAll("*")].find((element) => matches(element, issue));
    if (!node) return;
    node.style.outline = on ? "2px solid #ff3b30" : "";
    node.style.outlineOffset = on ? "2px" : "";
    if (on) node.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  return (
    <div className="ui-critic tw-scope">
      {open ? (
        <div className="ui-critic-panel">
          <div className="flex items-center justify-between gap-2 border-b border-ink/10 px-3 py-2">
            <p className="m-0 text-xs font-bold text-ink">Interface check · {issues.length} to fix</p>
            <span className="flex gap-1">
              <button type="button" className="rounded-full border border-ink/15 px-2 py-0.5 text-[11px] font-semibold" onClick={run}>Re-check</button>
              <button type="button" className="rounded-full border border-ink/15 px-2 py-0.5 text-[11px] font-semibold" onClick={() => setOpen(false)}>–</button>
              <button type="button" className="rounded-full border border-ink/15 px-2 py-0.5 text-[11px] font-semibold" onClick={() => setHidden(true)}>✕</button>
            </span>
          </div>
          <div className="grid max-h-[46vh] gap-1.5 overflow-y-auto p-2">
            {issues.slice(0, 40).map((issue, index) => (
              <button
                key={`${issue.kind}-${index}`}
                type="button"
                className="grid gap-0.5 rounded-lg border border-ink/10 p-2 text-left hover:bg-[var(--surface-soft)]"
                onMouseEnter={() => outline(issue, true)}
                onMouseLeave={() => outline(issue, false)}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: TONE[issue.severity] }}>{issue.kind.replace(/-/g, " ")}</span>
                <span className="text-[11px] leading-snug text-ink">{issue.message}</span>
                <span className="truncate text-[10px] text-soft-ink">{issue.selector}</span>
              </button>
            ))}
          </div>
          <p className="m-0 border-t border-ink/10 px-3 py-1.5 text-[10px] text-soft-ink">
            {report.checked} elements at {report.width}px. Check {WIDTHS.map((entry) => entry.label).join(" · ")} by resizing the window — ⌥⇧U toggles this panel.
          </p>
        </div>
      ) : null}
      <button type="button" className="ui-critic-badge" onClick={() => setOpen(true)} title="Interface issues found on this screen">
        ◎ {issues.length} UI {issues.length === 1 ? "issue" : "issues"}
      </button>
    </div>
  );
}

/** Re-finds the element an issue came from, by the path the audit recorded. */
function matches(element, issue) {
  const parts = [];
  let current = element;
  while (current && current.nodeType === 1 && parts.length < 4) {
    const tag = current.tagName.toLowerCase();
    const cls = String(current.className || "").split(" ").filter(Boolean)[0];
    parts.unshift(cls ? `${tag}.${cls}` : tag);
    current = current.parentElement;
  }
  return parts.join(" > ") === issue.selector && (element.textContent || "").includes(issue.target.slice(0, 12));
}
