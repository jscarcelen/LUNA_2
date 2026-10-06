"use client";

import { useEffect, useRef, useState } from "react";
import { KINDS, areaLabelOf, areaKeyOf } from "../../lib/feedbackCore.js";
import { getFeedbackContext } from "./feedbackContext.js";
import { describeElement, imageToDataUrl, captureScreen, pickElement } from "./capture.js";

/**
 * Beta feedback: a small button on every screen. Select text first and it is quoted; "Point at something" lets the
 * tester tap the part of the screen they mean; a screenshot can be attached, pasted or captured. Everything lands in
 * the owner's board (/feedback-admin). TEMPORARY — see modules/feedback/README.md for how to remove it.
 */
const ink = "text-[var(--ink,#1d1d1f)]";
const chip = "inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold";

export function FeedbackWidget({ page = "", title = "", role = "", account = null, standalone = false }) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false); // while picking or capturing, the panel steps out of the way
  const [kind, setKind] = useState("idea");
  const [message, setMessage] = useState("");
  const [quote, setQuote] = useState("");
  const [target, setTarget] = useState(null);
  const [screenshot, setScreenshot] = useState("");
  const [state, setState] = useState({ status: "idle", error: "", id: "" });
  const fileRef = useRef(null);
  const selectionRef = useRef("");

  // The selection is gone by the time the button is clicked, so it is read when the pointer goes down on the button.
  function remember() {
    try { selectionRef.current = String(window.getSelection?.()?.toString() || "").trim().slice(0, 1500); } catch { selectionRef.current = ""; }
  }
  function toggle() {
    if (!open && selectionRef.current) setQuote(selectionRef.current);
    selectionRef.current = "";
    setOpen((value) => !value);
  }

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function point() {
    setHidden(true);
    const picked = await pickElement();
    setHidden(false);
    if (picked) setTarget(describeElement(picked));
  }
  async function grabScreen() {
    setHidden(true);
    try {
      const url = await captureScreen();
      if (url) setScreenshot(url);
    } catch (error) {
      setState({ status: "idle", error: error?.name === "NotAllowedError" ? "" : "This browser could not capture the screen. Attach a screenshot instead.", id: "" });
    }
    setHidden(false);
  }
  async function attach(file) {
    if (!file || !String(file.type).startsWith("image/")) return;
    try { setScreenshot(await imageToDataUrl(file)); setState({ status: "idle", error: "", id: "" }); } catch { setState({ status: "idle", error: "That picture could not be read.", id: "" }); }
  }

  const canSend = (message.trim().length >= 3 || screenshot || quote) && state.status !== "sending";

  async function send() {
    setState({ status: "sending", error: "", id: "" });
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind, message, quote, target, screenshot, page, role,
          author: account?.displayName || "",
          location: window.location.pathname,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          context: getFeedbackContext()
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not send.");
      setState({ status: "sent", error: "", id: data.id || "" });
      setMessage(""); setQuote(""); setTarget(null); setScreenshot("");
    } catch (error) {
      setState({ status: "idle", error: error.message || "Could not send.", id: "" });
    }
  }

  const where = title || areaLabelOf(areaKeyOf(page));

  return (
    <div className="tw-scope">
      <button
        type="button"
        onPointerDown={remember}
        onClick={toggle}
        aria-expanded={open}
        aria-label="Send feedback"
        className={`fixed ${standalone ? "bottom-4 right-4" : "bottom-[104px] right-3 min-[761px]:bottom-4 min-[761px]:right-4"} z-[55] rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-bold shadow-[0_6px_20px_rgba(0,0,0,0.16)] transition active:scale-95 ${ink} ${hidden ? "hidden" : ""}`}
      >
        <span aria-hidden>✎</span> Feedback
      </button>

      {open && !hidden ? (
        <div className={`fixed inset-x-2 ${standalone ? "bottom-16" : "bottom-[104px] min-[761px]:bottom-16"} z-[56] max-h-[78dvh] overflow-y-auto rounded-3xl border border-black/10 bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.28)] min-[761px]:inset-x-auto min-[761px]:right-4 min-[761px]:w-[400px]`} role="dialog" aria-label="Send feedback">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className={`m-0 text-base font-bold ${ink}`}>Help us improve Luna</p>
              <p className="m-0 mt-0.5 text-xs text-[var(--soft-ink,#6e6e73)]">You are on <strong>{where}</strong>. Beta feedback tool — it will go away later.</p>
            </div>
            <button type="button" className="grid size-8 shrink-0 place-items-center rounded-full border border-black/10 bg-white text-sm" aria-label="Close" onClick={() => setOpen(false)}>✕</button>
          </div>

          {state.status === "sent" ? (
            <div className="mt-4 grid gap-3">
              <p className={`m-0 text-sm ${ink}`}>Thank you — it reached us. Every note is read.</p>
              <div className="flex gap-2">
                <button type="button" className="rounded-full bg-[var(--accent,#0071e3)] px-4 py-2 text-sm font-semibold text-white" onClick={() => setState({ status: "idle", error: "", id: "" })}>Send another</button>
                <button type="button" className="rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-semibold" onClick={() => setOpen(false)}>Close</button>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="What kind of feedback">
                {KINDS.map((entry) => (
                  <button key={entry.id} type="button" role="radio" aria-checked={kind === entry.id} title={entry.hint} onClick={() => setKind(entry.id)} className={`${chip} ${kind === entry.id ? "!border-[var(--accent,#0071e3)] !bg-[var(--accent,#0071e3)] text-white" : ink}`}>{entry.label}</button>
                ))}
              </div>
              <p className="m-0 mt-1 text-[11px] text-[var(--soft-ink,#6e6e73)]">{KINDS.find((entry) => entry.id === kind)?.hint}</p>

              <textarea
                className="mt-2 w-full resize-y rounded-2xl border border-black/12 bg-white p-3 text-sm"
                rows={4}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onPaste={(event) => { const file = [...(event.clipboardData?.files || [])].find((entry) => entry.type.startsWith("image/")); if (file) { event.preventDefault(); attach(file); } }}
                placeholder={kind === "prompt" ? "What did the result get wrong, and what should it have done?" : kind === "ui" ? "What is hard to see, find or tap?" : kind === "problem" ? "What did you do, and what happened instead?" : "What would make Luna better for you?"}
                aria-label="Your feedback"
              />

              {quote ? (
                <div className="mt-2 flex items-start gap-2 rounded-2xl bg-[var(--surface-soft,#f5f5f7)] p-2.5 text-xs">
                  <span className="min-w-0 flex-1"><strong>About this text:</strong> “{quote.length > 160 ? `${quote.slice(0, 160)}…` : quote}”</span>
                  <button type="button" className="shrink-0 text-[var(--soft-ink,#6e6e73)]" aria-label="Remove the quoted text" onClick={() => setQuote("")}>✕</button>
                </div>
              ) : null}
              {target ? (
                <div className="mt-2 flex items-start gap-2 rounded-2xl bg-[var(--surface-soft,#f5f5f7)] p-2.5 text-xs">
                  <span className="min-w-0 flex-1"><strong>About this part of the screen:</strong> {target.text ? `“${target.text.slice(0, 90)}”` : target.tag}{target.section ? ` (in ${target.section})` : ""}</span>
                  <button type="button" className="shrink-0 text-[var(--soft-ink,#6e6e73)]" aria-label="Remove the picked part" onClick={() => setTarget(null)}>✕</button>
                </div>
              ) : null}
              {screenshot ? (
                <div className="mt-2 flex items-center gap-2 rounded-2xl bg-[var(--surface-soft,#f5f5f7)] p-2">
                  <img src={screenshot} alt="Your screenshot" className="h-16 w-24 rounded-lg border border-black/10 object-cover object-top" />
                  <span className="min-w-0 flex-1 text-xs">Screenshot attached</span>
                  <button type="button" className="shrink-0 px-1 text-xs text-[var(--soft-ink,#6e6e73)]" onClick={() => setScreenshot("")}>Remove</button>
                </div>
              ) : null}

              <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" className={`${chip} ${ink}`} onClick={point}>◎ Point at something</button>
                <button type="button" className={`${chip} ${ink}`} onClick={() => fileRef.current?.click()}>▣ Attach screenshot</button>
                {typeof navigator !== "undefined" && navigator.mediaDevices?.getDisplayMedia ? <button type="button" className={`${chip} ${ink}`} onClick={grabScreen}>⛶ Capture this screen</button> : null}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => { attach(event.target.files?.[0]); event.target.value = ""; }} />
              </div>
              <p className="m-0 mt-1.5 text-[11px] text-[var(--soft-ink,#6e6e73)]">Tip: select any text on the page first, then press Feedback — it is quoted for you.</p>

              {state.error ? <p className="m-0 mt-2 text-xs text-[#d70015]" role="alert">{state.error}</p> : null}
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" className="rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-semibold" onClick={() => setOpen(false)}>Cancel</button>
                <button type="button" disabled={!canSend} className="rounded-full bg-[var(--accent,#0071e3)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-40" onClick={send}>{state.status === "sending" ? "Sending…" : "Send"}</button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
