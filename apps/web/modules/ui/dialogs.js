"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "../../lib/i18n/LocaleProvider.js";

/*
 * LUNA's own confirm / text / notice boxes, in place of the browser's window.confirm, prompt and alert
 * (those show "luna2-share-web.vercel.app says" with an OK button that does not say what it does).
 *
 *   if (!(await askConfirm({ title, message, confirmLabel: t("common.delete"), danger: true }))) return;
 *   const name = await askText({ title, defaultValue, validate: (value) => (value.trim() ? "" : "Type a name") });
 *   await showNotice({ title, message });
 *
 * One <DialogHost /> (app/layout.js) shows them one at a time. Where focus and the text caret were is put back
 * when the box closes, so a box opened from inside an editor (insert a link, a table…) types where you were.
 * Without a host on the page (a test, a page outside the root layout) they fall back to the browser's boxes.
 */

let host = null;
let counter = 0;
const waiting = [];

function open(kind, options) {
  const settings = typeof options === "string" ? { message: options } : { ...(options || {}) };
  return new Promise((resolve) => {
    if (!host) {
      if (typeof window === "undefined") { resolve(kind === "confirm" ? false : kind === "text" ? null : undefined); return; }
      const text = [settings.title, settings.message].filter(Boolean).join("\n\n");
      if (kind === "confirm") resolve(window.confirm(text));
      else if (kind === "text") resolve(window.prompt(text, settings.defaultValue ?? ""));
      else { window.alert(text); resolve(undefined); }
      return;
    }
    waiting.push({ id: ++counter, kind, settings, resolve });
    host();
  });
}

/** Ask yes / no. Resolves true only when the person presses the confirm button. */
export function askConfirm(options) { return open("confirm", options); }
/** Ask for a line of text. Resolves the typed text, or null on Cancel. `validate(value)` returns a reason to refuse, or "". */
export function askText(options) { return open("text", options); }
/** Tell something that needs an OK (an error, a result). Resolves when it is closed. */
export function showNotice(options) { return open("notice", options); }

const ghostBtn = "inline-flex min-h-10 items-center justify-center rounded-full border border-ink/15 bg-white px-5 py-2 text-sm font-semibold text-ink transition hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
const primaryBtn = "inline-flex min-h-10 items-center justify-center rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
const dangerBtn = "inline-flex min-h-10 items-center justify-center rounded-full bg-[var(--color-danger)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#b80012] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-danger)]";

function rememberFocus() {
  if (typeof document === "undefined") return () => {};
  const element = document.activeElement;
  const selection = window.getSelection?.();
  const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  return () => {
    try {
      if (element && element !== document.body && document.contains(element)) element.focus?.({ preventScroll: true });
      if (range && element?.isContentEditable) { selection.removeAllRanges(); selection.addRange(range); }
    } catch { /* the page changed underneath; nothing to put back */ }
  };
}

/** Mount once, inside LocaleProvider (app/layout.js). */
export function DialogHost() {
  const [current, setCurrent] = useState(null);
  const restoreRef = useRef(null);
  useEffect(() => {
    const next = () => setCurrent((shown) => {
      if (shown || !waiting.length) return shown;
      restoreRef.current = rememberFocus();
      return waiting.shift();
    });
    host = next;
    next();
    return () => { if (host === next) host = null; };
  }, []);

  function close(value) {
    const restore = restoreRef.current;
    restoreRef.current = null;
    setCurrent(null);
    restore?.();
    current.resolve(value);
    window.setTimeout(() => host?.(), 0);
  }

  if (!current) return null;
  return <DialogBox key={current.id} entry={current} onClose={close} />;
}

function DialogBox({ entry, onClose }) {
  const { kind, settings } = entry;
  const t = useT();
  const [value, setValue] = useState(String(settings.defaultValue ?? ""));
  const [problem, setProblem] = useState("");
  const confirmRef = useRef(null);
  const cancelRef = useRef(null);
  const inputRef = useRef(null);
  const danger = Boolean(settings.danger);
  const cancelValue = kind === "confirm" ? false : kind === "text" ? null : undefined;

  useEffect(() => {
    // A destructive question starts on Cancel, so a stray Enter never deletes anything.
    const target = kind === "text" ? inputRef.current : danger ? cancelRef.current : confirmRef.current;
    target?.focus();
    if (kind === "text") inputRef.current?.select();
    const onKey = (event) => { if (event.key === "Escape") { event.preventDefault(); onClose(cancelValue); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function accept() {
    if (kind === "confirm") return onClose(true);
    if (kind === "notice") return onClose(undefined);
    const reason = settings.validate ? settings.validate(value) : "";
    if (reason) { setProblem(reason); inputRef.current?.focus(); return; }
    onClose(value);
  }

  // A long message on its own reads better as a short question plus the detail: its first sentence becomes the title.
  const split = !settings.title && String(settings.message || "").length > 70 ? /^(.+?[?.!])\s+(\S[\s\S]*)$/.exec(settings.message) : null;
  const title = split ? split[1] : settings.title || "";
  const message = split ? split[2] : settings.message || "";
  const confirmLabel = settings.confirmLabel || (kind === "confirm" ? t("common.confirm") : t("common.ok"));
  return (
    <div className="tw-scope fixed inset-0 z-[1000] grid place-items-end bg-black/30 p-3 sm:place-items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(cancelValue); }}>
      <form
        role={kind === "text" ? "dialog" : "alertdialog"}
        aria-modal="true"
        aria-labelledby="luna-dialog-title"
        aria-describedby={message && title ? "luna-dialog-message" : undefined}
        className="grid w-full max-w-[420px] gap-4 rounded-[18px] bg-white p-5 shadow-[0_16px_48px_rgba(0,0,0,0.25)] [padding-bottom:max(1.25rem,env(safe-area-inset-bottom))] sm:pb-5"
        onSubmit={(event) => { event.preventDefault(); accept(); }}
      >
        <div className="flex items-start gap-3">
          {danger ? <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-[rgba(215,0,21,0.1)] text-base text-[var(--color-danger)]">🗑</span> : null}
          <div className="grid min-w-0 gap-1">
            <p id="luna-dialog-title" className="m-0 text-[17px] font-bold leading-snug text-ink [overflow-wrap:anywhere]">{title || message}</p>
            {title && message ? <p id="luna-dialog-message" className="m-0 whitespace-pre-line text-sm leading-relaxed text-soft-ink [overflow-wrap:anywhere]">{message}</p> : null}
          </div>
        </div>
        {kind === "text" ? (
          <div className="grid gap-1">
            <input
              ref={inputRef}
              value={value}
              placeholder={settings.placeholder || ""}
              aria-label={settings.label || title || message}
              aria-invalid={problem ? "true" : undefined}
              onChange={(event) => { setValue(event.target.value); if (problem) setProblem(""); }}
              className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2.5 text-base text-ink outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(0,113,227,0.15)]"
            />
            {problem ? <p role="alert" className="m-0 text-xs font-semibold text-[var(--color-danger)]">{problem}</p> : null}
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          {kind !== "notice" ? <button ref={cancelRef} type="button" className={`${ghostBtn} flex-1 sm:flex-none`} onClick={() => onClose(cancelValue)}>{settings.cancelLabel || t("common.cancel")}</button> : null}
          <button ref={confirmRef} type="submit" className={`${danger ? dangerBtn : primaryBtn} flex-1 sm:flex-none`}>{confirmLabel}</button>
        </div>
      </form>
    </div>
  );
}
