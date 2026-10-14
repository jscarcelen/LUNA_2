"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const pill = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-4 py-1.5 text-sm font-semibold text-ink transition hover:bg-[var(--surface-soft)]";

/**
 * A visual formula editor, like the equation editor in Word: you see the formula as you type it, type "/" for a fraction,
 * "^" for a power, "_" for a subscript, and the keyboard button opens a palette of symbols. LaTeX is only what it hands back.
 * `initial` is the formula's LaTeX; `onDone(latex)` / `onCancel()`.
 */
export function FormulaEditor({ initial = "", onDone, onCancel }) {
  const fieldRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let gone = false;
    import("mathlive").then(({ MathfieldElement }) => {
      if (gone) return;
      MathfieldElement.fontsDirectory = "/mathlive/fonts";
      MathfieldElement.soundsDirectory = null;
      setReady(true);
    });
    return () => { gone = true; };
  }, []);

  useEffect(() => {
    const field = fieldRef.current;
    if (!ready || !field) return;
    field.value = initial;
    field.smartFence = true;
    field.mathVirtualKeyboardPolicy = "onfocus";
    window.setTimeout(() => { field.focus(); field.executeCommand?.("selectAll"); }, 30);
  }, [ready, initial]);

  const done = () => onDone(String(fieldRef.current?.value || "").trim());

  return createPortal(
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/35 p-4"
      onMouseUp={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") onCancel();
        else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) done();
      }}
    >
      <div role="dialog" aria-label="Formula editor" className="grid w-full max-w-xl gap-3 rounded-[18px] border border-ink/10 bg-white p-5 shadow-[0_24px_60px_rgba(0,0,0,0.25)]">
        <div>
          <p className="m-0 text-base font-bold text-ink">Formula</p>
          <p className="m-0 mt-0.5 text-xs text-soft-ink">Type it like normal text. <b>/</b> makes a fraction, <b>^</b> a power, <b>_</b> a subscript. The keyboard button on the right opens symbols (Σ, √, ∫, Greek letters…).</p>
        </div>
        {ready
          ? <math-field ref={fieldRef} style={{ fontSize: "1.6rem", padding: "10px 12px", borderRadius: 12, border: "1px solid var(--line, #d2d2d7)", background: "#fff", color: "#1d1d1f", width: "100%", minHeight: 64 }} />
          : <p className="m-0 text-sm text-soft-ink">Loading the formula editor…</p>}
        <div className="flex items-center justify-end gap-2">
          <button type="button" className={pill} onClick={onCancel}>Cancel</button>
          <button type="button" className="inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5 py-1.5 text-sm font-semibold text-white" onClick={done}>Done</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
