"use client";

import { useEffect, useRef, useState } from "react";
import { KINDS, areaLabelOf, areaKeyOf } from "../../lib/feedbackCore.js";
import { getFeedbackContext } from "./feedbackContext.js";
import { FEEDBACK_EVENT } from "./feedbackEvents.js";
import { describeElement, imageToDataUrl, captureScreen, pickElement } from "./capture.js";
import { useT } from "../../lib/i18n/LocaleProvider.js";

/**
 * Beta feedback: a small button on every screen. Select text first and it is quoted; "Point at something" lets the
 * tester tap the part of the screen they mean; a screenshot can be attached, pasted or captured. Everything lands in
 * the owner's board (/feedback-admin). TEMPORARY — see modules/feedback/README.md for how to remove it.
 */
const ink = "text-[var(--ink,#1d1d1f)]";
const chip = "inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold";

export function FeedbackWidget({ page = "", title = "", role = "", account = null, standalone = false, launcher = true }) {
  const t = useT();
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

  // With `launcher={false}` the button is the merged "Ask Luna" menu, which opens this panel through an event.
  useEffect(() => {
    const show = () => { selectionRef.current = ""; setOpen(true); };
    window.addEventListener(FEEDBACK_EVENT, show);
    return () => window.removeEventListener(FEEDBACK_EVENT, show);
  }, []);

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
      setState({ status: "idle", error: error?.name === "NotAllowedError" ? "" : t("misc.fb.captureFail"), id: "" });
    }
    setHidden(false);
  }
  async function attach(file) {
    if (!file || !String(file.type).startsWith("image/")) return;
    try { setScreenshot(await imageToDataUrl(file)); setState({ status: "idle", error: "", id: "" }); } catch { setState({ status: "idle", error: t("misc.fb.readFail"), id: "" }); }
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
      if (!response.ok) throw new Error(data.error || t("misc.fb.sendFail"));
      setState({ status: "sent", error: "", id: data.id || "" });
      setMessage(""); setQuote(""); setTarget(null); setScreenshot("");
    } catch (error) {
      setState({ status: "idle", error: error.message || t("misc.fb.sendFail"), id: "" });
    }
  }

  const where = title || areaLabelOf(areaKeyOf(page));

  return (
    <div className="tw-scope">
      {launcher ? <button
        type="button"
        onPointerDown={remember}
        onClick={toggle}
        aria-expanded={open}
        aria-label={t("misc.sendFeedback")}
        className={`fixed ${standalone ? "bottom-4 right-4" : "bottom-[104px] right-3 min-[761px]:bottom-4 min-[761px]:right-4"} z-[55] rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-bold shadow-[0_6px_20px_rgba(0,0,0,0.16)] transition active:scale-95 ${ink} ${hidden ? "hidden" : ""}`}
      >
        <span aria-hidden>✎</span> {t("misc.fb.launcher")}
      </button> : null}

      {open && !hidden ? (
        <div className={`fixed inset-x-2 ${standalone ? "bottom-16" : "bottom-[104px] min-[761px]:bottom-16"} z-[56] max-h-[78dvh] overflow-y-auto rounded-3xl border border-black/10 bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.28)] min-[761px]:inset-x-auto min-[761px]:right-4 min-[761px]:w-[400px]`} role="dialog" aria-label={t("misc.sendFeedback")}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className={`m-0 text-base font-bold ${ink}`}>{t("misc.fb.title")}</p>
              <p className="m-0 mt-0.5 text-xs text-[var(--soft-ink,#6e6e73)]">{t("misc.fb.youAreOn")} <strong>{where}</strong>. {t("misc.fb.beta")}</p>
            </div>
            <button type="button" className="grid size-8 shrink-0 place-items-center rounded-full border border-black/10 bg-white text-sm" aria-label={t("common.close")} onClick={() => setOpen(false)}>✕</button>
          </div>

          {state.status === "sent" ? (
            <div className="mt-4 grid gap-3">
              <p className={`m-0 text-sm ${ink}`}>{t("misc.fb.thanks")}</p>
              <div className="flex gap-2">
                <button type="button" className="rounded-full bg-[var(--accent,#0071e3)] px-4 py-2 text-sm font-semibold text-white" onClick={() => setState({ status: "idle", error: "", id: "" })}>{t("misc.fb.another")}</button>
                <button type="button" className="rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-semibold" onClick={() => setOpen(false)}>{t("common.close")}</button>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("misc.fb.whatKind")}>
                {KINDS.map((entry) => (
                  <button key={entry.id} type="button" role="radio" aria-checked={kind === entry.id} title={t(`misc.fb.kind.${entry.id}.hint`)} onClick={() => setKind(entry.id)} className={`${chip} ${kind === entry.id ? "!border-[var(--accent,#0071e3)] !bg-[var(--accent,#0071e3)] text-white" : ink}`}>{t(`misc.fb.kind.${entry.id}.label`)}</button>
                ))}
              </div>
              <p className="m-0 mt-1 text-[11px] text-[var(--soft-ink,#6e6e73)]">{t(`misc.fb.kind.${kind}.hint`)}</p>

              <textarea
                className="mt-2 w-full resize-y rounded-2xl border border-black/12 bg-white p-3 text-sm"
                rows={4}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onPaste={(event) => { const file = [...(event.clipboardData?.files || [])].find((entry) => entry.type.startsWith("image/")); if (file) { event.preventDefault(); attach(file); } }}
                placeholder={t(`misc.fb.ph.${["prompt", "ui", "problem"].includes(kind) ? kind : "idea"}`)}
                aria-label={t("misc.fb.yourFeedback")}
              />

              {quote ? (
                <div className="mt-2 flex items-start gap-2 rounded-2xl bg-[var(--surface-soft,#f5f5f7)] p-2.5 text-xs">
                  <span className="min-w-0 flex-1"><strong>{t("misc.fb.aboutText")}</strong> “{quote.length > 160 ? `${quote.slice(0, 160)}…` : quote}”</span>
                  <button type="button" className="shrink-0 text-[var(--soft-ink,#6e6e73)]" aria-label={t("misc.fb.removeQuote")} onClick={() => setQuote("")}>✕</button>
                </div>
              ) : null}
              {target ? (
                <div className="mt-2 flex items-start gap-2 rounded-2xl bg-[var(--surface-soft,#f5f5f7)] p-2.5 text-xs">
                  <span className="min-w-0 flex-1"><strong>{t("misc.fb.aboutPart")}</strong> {target.text ? `“${target.text.slice(0, 90)}”` : target.tag}{target.section ? ` (${t("misc.fb.inSection", { section: target.section })})` : ""}</span>
                  <button type="button" className="shrink-0 text-[var(--soft-ink,#6e6e73)]" aria-label={t("misc.fb.removePart")} onClick={() => setTarget(null)}>✕</button>
                </div>
              ) : null}
              {screenshot ? (
                <div className="mt-2 flex items-center gap-2 rounded-2xl bg-[var(--surface-soft,#f5f5f7)] p-2">
                  <img src={screenshot} alt={t("misc.fb.yourShot")} className="h-16 w-24 rounded-lg border border-black/10 object-cover object-top" />
                  <span className="min-w-0 flex-1 text-xs">{t("misc.fb.shotAttached")}</span>
                  <button type="button" className="shrink-0 px-1 text-xs text-[var(--soft-ink,#6e6e73)]" onClick={() => setScreenshot("")}>{t("common.remove")}</button>
                </div>
              ) : null}

              <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" className={`${chip} ${ink}`} onClick={point}>{t("misc.fb.point")}</button>
                <button type="button" className={`${chip} ${ink}`} onClick={() => fileRef.current?.click()}>{t("misc.fb.attach")}</button>
                {typeof navigator !== "undefined" && navigator.mediaDevices?.getDisplayMedia ? <button type="button" className={`${chip} ${ink}`} onClick={grabScreen}>{t("misc.fb.capture")}</button> : null}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => { attach(event.target.files?.[0]); event.target.value = ""; }} />
              </div>
              <p className="m-0 mt-1.5 text-[11px] text-[var(--soft-ink,#6e6e73)]">{t("misc.fb.tip")}</p>

              {state.error ? <p className="m-0 mt-2 text-xs text-[#d70015]" role="alert">{state.error}</p> : null}
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" className="rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-semibold" onClick={() => setOpen(false)}>{t("common.cancel")}</button>
                <button type="button" disabled={!canSend} className="rounded-full bg-[var(--accent,#0071e3)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-40" onClick={send}>{state.status === "sending" ? t("misc.fb.sending") : t("common.send")}</button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
