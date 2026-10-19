"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MAX_BATCH_BYTES, formatBytes } from "../workspace/uploadPlan";
import { isPhotoFile, photoToJpeg } from "../activities/photoUpload";
import { useT } from "../../lib/i18n/LocaleProvider.js";
import { ensureSubjectStructure, subjectStructure } from "../plans/folders";
import { quickMakePage } from "../ai-tools/ui/CreatePage";
import { primaryClass, secondaryClass } from "./ui.js";

/** What the upload pipeline reads (the same list as the website's upload button). */
export const ACCEPT = ".txt,.md,.csv,.json,.pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/*";
const READABLE = /\.(txt|md|csv|json|pdf|docx?|pptx?|png|jpe?g|webp|gif|bmp|tiff?|heic|heif)$/i;

/** Is this a file the upload pipeline can read? */
export function isReadable(file) {
  return READABLE.test(String(file?.name || "")) || String(file?.type || "").startsWith("image/");
}

/**
 * Every photo is redrawn as a JPEG of at most 2000 px (activities/photoUpload.js, as the photo quiz maker does): an iPhone
 * photo is often HEIC, which the text reader cannot read, and too large for one upload. Other files go as they are
 * (and are refused with a clear reason if too large).
 */
async function preparePhoto(file, index) {
  if (!isPhotoFile(file)) return file;
  return photoToJpeg(file, index);
}

const photoName = (t) => `${t("mobile.add.photoName", { date: new Date().toLocaleString(t.locale === "es" ? "es-ES" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}.jpg`;

/**
 * "Add material" as a sheet from the bottom of the screen: take a photo, choose photos, choose a file, or type/paste
 * text; then each file's real upload state (waiting, uploading and reading, added, or why it failed, with Try again),
 * and once added, the next steps the app really has: make a quiz, flashcards or a summary from it, or a study plan.
 * Uploads go to the subject's "Uploaded material" folder, like the website's upload.
 */
export function AddMaterialSheet({ subjects = [], defaultSubjectId = "", onClose, onUpload, onCreateSubject, onCreateFolder, onOpenPage, onOpenDocument }) {
  const t = useT();
  const [subjectId, setSubjectId] = useState(() => (subjects.some((subject) => subject.id === defaultSubjectId) ? defaultSubjectId : subjects[0]?.id || ""));
  const [step, setStep] = useState("choose"); // choose | text | upload
  const [text, setText] = useState("");
  const [textName, setTextName] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [creating, setCreating] = useState(false);
  const [problem, setProblem] = useState("");
  const [items, setItems] = useState([]); // { key, file, status: waiting|uploading|done|failed, reason, documentId, review }
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);
  const cameraRef = useRef(null);
  const photosRef = useRef(null);
  const filesRef = useRef(null);
  const subject = subjects.find((entry) => entry.id === subjectId) || null;

  useEffect(() => {
    if (!subjectId && subjects[0]) setSubjectId(subjects[0].id);
  }, [subjects.length]);
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape" && !running) onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running]);

  async function createSubject() {
    const name = String(newSubject || "").trim();
    if (!name) return;
    setCreating(true); setProblem("");
    try {
      const created = await onCreateSubject?.(name);
      if (created?.id) { setSubjectId(created.id); setNewSubject(""); } else setProblem(t("mobile.add.subjectFailed"));
    } finally { setCreating(false); }
  }

  function picked(event, { camera = false } = {}) {
    const files = [...(event.target.files || [])].map((file) => (camera && /^image\.|^image$/i.test(file.name) ? new File([file], photoName(t), { type: file.type }) : file));
    event.target.value = "";
    if (files.length) begin(files);
  }

  function addText() {
    const body = String(text || "").trim();
    if (!body) return;
    const name = `${String(textName || "").trim().replace(/[\\/:*?"<>|]+/g, " ") || t("mobile.add.myNotes")}.txt`;
    begin([new File([body], name, { type: "text/plain" })]);
  }

  function begin(files) {
    const next = files.map((file, position) => ({ key: `${Date.now()}-${position}`, file, status: "waiting", reason: "", documentId: "", review: false }));
    setItems(next);
    setStep("upload");
    run(next);
  }

  async function run(list) {
    if (!subject) return;
    setRunning(true);
    stopRef.current = false;
    let folderIds = [];
    try {
      const existing = subjectStructure(subject.folders || []).uploadedId;
      const uploadedId = existing || (await ensureSubjectStructure({ folders: (subject.folders || []).map((folder) => ({ ...folder })), subjectId: subject.id, onCreateFolder })).uploadedId;
      if (uploadedId) folderIds = [uploadedId];
    } catch { /* filing is a convenience: the file then lands at the top of the subject */ }
    const update = (key, patch) => setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
    for (const item of list) {
      if (item.status === "done") continue;
      if (stopRef.current) { update(item.key, { status: "failed", reason: t("mobile.add.stopped") }); continue; }
      if (!isReadable(item.file)) { update(item.key, { status: "failed", reason: t("mobile.add.unreadable") }); continue; }
      update(item.key, { status: "uploading", reason: "" });
      try {
        let file;
        try { file = await preparePhoto(item.file, list.indexOf(item)); } catch { update(item.key, { status: "failed", reason: t("mobile.add.badPhoto") }); continue; }
        if (file.size > MAX_BATCH_BYTES) { update(item.key, { status: "failed", reason: t("mobile.add.tooLarge", { size: formatBytes(file.size), limit: formatBytes(MAX_BATCH_BYTES) }) }); continue; }
        const data = await onUpload?.([file], { subjectId: subject.id, folderIds });
        if (!data) { update(item.key, { status: "failed", reason: t("mobile.add.failed") }); continue; }
        const uploaded = (data.uploadedDocuments || [])[0] || null;
        const report = (data.uploadReport || [])[0] || null;
        update(item.key, { status: "done", documentId: uploaded?.id || "", review: Boolean(report?.requiresReview) });
      } catch (error) {
        update(item.key, { status: "failed", reason: String(error?.message || "") || t("mobile.add.failed") });
      }
    }
    setRunning(false);
  }

  const done = items.filter((item) => item.status === "done");
  const failed = items.filter((item) => item.status === "failed");
  const doneIds = done.map((item) => item.documentId).filter(Boolean);
  const finished = step === "upload" && !running;

  // A portal into <body>, so the sheet sits above the bottom tabs whatever stacking context the page is in.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="tw-scope fixed inset-0 z-[70] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={t("mobile.add")}>
      <button type="button" className="absolute inset-0 cursor-default bg-black/30" aria-label={t("mobile.close")} onClick={() => { if (!running) onClose?.(); }} />
      <div className="relative max-h-[92dvh] overflow-y-auto rounded-t-[22px] bg-white px-4 pt-2 shadow-[0_-8px_32px_rgba(0,0,0,0.18)]" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-ink/15" aria-hidden />
        <div className="mx-auto grid w-full max-w-xl gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="m-0 text-[20px] font-bold tracking-tight text-ink">{step === "text" ? t("mobile.add.text") : step === "upload" ? (finished ? (done.length ? t("mobile.add.added") : t("mobile.add.nothing")) : t("mobile.add.adding")) : t("mobile.add")}</h2>
            <button type="button" className="min-h-[40px] shrink-0 rounded-full px-3 text-[15px] font-semibold text-[var(--accent)] disabled:text-soft-ink" disabled={running} onClick={onClose}>{finished ? t("mobile.done") : t("mobile.cancel")}</button>
          </div>

          {step === "choose" ? (
            <>
              {subjects.length ? (
                <label className="grid gap-1.5">
                  <span className="text-[13px] font-semibold text-soft-ink">{t("mobile.add.subject")}</span>
                  <select className="min-h-[48px] w-full rounded-2xl border border-ink/15 bg-white px-4 text-[16px] text-ink" value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
                    {subjects.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                  </select>
                </label>
              ) : (
                <div className="grid gap-2 rounded-2xl bg-[var(--surface-soft)] p-4">
                  <p className="m-0 text-[15px] text-ink">{t("mobile.add.nameSubject")}</p>
                  <div className="flex gap-2">
                    <input className="min-h-[48px] min-w-0 flex-1 rounded-2xl border border-ink/15 bg-white px-4 text-[16px] text-ink" value={newSubject} onChange={(event) => setNewSubject(event.target.value)} placeholder={t("mobile.add.subjectExample")} enterKeyHint="done" onKeyDown={(event) => { if (event.key === "Enter") createSubject(); }} />
                    <button type="button" className={primaryClass} disabled={!newSubject.trim() || creating} onClick={createSubject}>{creating ? "…" : t("mobile.add.create")}</button>
                  </div>
                  {problem ? <p className="m-0 text-sm text-[var(--color-danger)]" role="alert">{problem}</p> : null}
                </div>
              )}
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(event) => picked(event, { camera: true })} />
              <input ref={photosRef} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={picked} />
              <input ref={filesRef} type="file" accept={ACCEPT} multiple className="sr-only" tabIndex={-1} aria-hidden onChange={picked} />
              <div className="divide-y divide-ink/8 overflow-hidden rounded-[18px] border border-ink/8">
                {[
                  [t("mobile.add.camera"), t("mobile.add.cameraHint"), () => cameraRef.current?.click(), <><path key="a" d="M4 8.5A2 2 0 0 1 6 6.5h1.6l1.4-2h6l1.4 2H18a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><circle key="b" cx="12" cy="12.5" r="3.3" /></>],
                  [t("mobile.add.photos"), t("mobile.add.photosHint"), () => photosRef.current?.click(), <><rect key="a" x="4" y="5" width="16" height="14" rx="2" /><path key="b" d="m4 16 4.5-4.5 3.5 3.5 2.5-2.5L20 17.5" /><circle key="c" cx="15.5" cy="9.5" r="1.4" /></>],
                  [t("mobile.add.file"), t("mobile.add.fileHint"), () => filesRef.current?.click(), <><path key="a" d="M6 3.5h8l4 4v13H6z" /><path key="b" d="M14 3.5v4h4" /></>],
                  [t("mobile.add.text"), t("mobile.add.textHint"), () => setStep("text"), <><path key="a" d="M5 6h14M5 10h14M5 14h9M5 18h6" /></>]
                ].map(([label, hint, action, glyph]) => (
                  <button key={label} type="button" disabled={!subject} className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-[var(--surface-soft)] disabled:opacity-40" onClick={action}>
                    <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)]"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--accent)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{glyph}</svg></span>
                    <span className="min-w-0 flex-1"><span className="block text-[16px] font-semibold text-ink">{label}</span><span className="block truncate text-[13px] text-soft-ink">{hint}</span></span>
                  </button>
                ))}
              </div>
              <p className="m-0 text-[12px] text-soft-ink">{t("mobile.add.limit", { limit: formatBytes(MAX_BATCH_BYTES) })}</p>
            </>
          ) : null}

          {step === "text" ? (
            <div className="grid gap-3">
              <input className="min-h-[48px] w-full rounded-2xl border border-ink/15 bg-white px-4 text-[16px] text-ink" value={textName} onChange={(event) => setTextName(event.target.value)} placeholder={t("mobile.add.titlePlaceholder")} aria-label={t("mobile.add.title")} />
              <textarea className="min-h-[180px] w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-[16px] text-ink" value={text} onChange={(event) => setText(event.target.value)} placeholder={t("mobile.add.notesPlaceholder")} aria-label={t("mobile.add.notes")} />
              <div className="flex gap-2">
                <button type="button" className={`${secondaryClass} flex-1`} onClick={() => setStep("choose")}>{t("mobile.back")}</button>
                <button type="button" className={`${primaryClass} flex-1`} disabled={!text.trim()} onClick={addText}>{t("mobile.add.toLibrary")}</button>
              </div>
            </div>
          ) : null}

          {step === "upload" ? (
            <div className="grid gap-3">
              <ul className="m-0 grid list-none gap-2 p-0" aria-live="polite">
                {items.map((item) => (
                  <li key={item.key} className="flex items-start gap-3 rounded-2xl border border-ink/8 p-3">
                    <span aria-hidden className="mt-0.5 grid size-7 shrink-0 place-items-center">
                      {item.status === "uploading" ? <span className="inline-block size-5 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
                        : item.status === "done" ? <span className="grid size-6 place-items-center rounded-full bg-[#34c759] text-[13px] font-bold text-white">✓</span>
                          : item.status === "failed" ? <span className="grid size-6 place-items-center rounded-full bg-[rgba(255,59,48,0.14)] text-[13px] font-bold text-[#b30031]">!</span>
                            : <span className="size-5 rounded-full border-2 border-ink/15" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="m-0 truncate text-[15px] font-semibold text-ink">{item.file.name}</p>
                      <p className={`m-0 text-[13px] ${item.status === "failed" ? "text-[#b30031]" : "text-soft-ink"}`}>
                        {item.status === "waiting" ? t("mobile.add.waiting", { size: formatBytes(item.file.size) }) : item.status === "uploading" ? t("mobile.add.uploading") : item.status === "done" ? (item.review ? t("mobile.add.review") : t("mobile.add.read")) : item.reason}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              {running ? <button type="button" className={`${secondaryClass} justify-self-center`} onClick={() => { stopRef.current = true; }}>{t("mobile.add.stop")}</button> : null}
              {finished && failed.length ? <button type="button" className={secondaryClass} onClick={() => run(items)}>{t("mobile.add.retry", { count: failed.length })}</button> : null}
              {finished && doneIds.length ? (
                <div className="grid gap-2">
                  <p className="m-0 text-[15px] font-semibold text-ink">{t("mobile.add.make")}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" className={primaryClass} onClick={() => onOpenPage?.(quickMakePage("quiz-generator", doneIds))}>{t("mobile.makeQuiz")}</button>
                    <button type="button" className={secondaryClass} onClick={() => onOpenPage?.(quickMakePage("concept-flashcards", doneIds))}>{t("mobile.type.flashcards")}</button>
                    <button type="button" className={secondaryClass} onClick={() => onOpenPage?.(quickMakePage("document-summarizer", doneIds))}>{t("mobile.add.summary")}</button>
                    <button type="button" className={secondaryClass} onClick={() => onOpenPage?.(`plans?generate=1&docs=${doneIds.map(encodeURIComponent).join(",")}`)}>{t("mobile.add.plan")}</button>
                  </div>
                  {doneIds.length === 1 ? <button type="button" className="min-h-[44px] text-[15px] font-semibold text-[var(--accent)]" onClick={() => onOpenDocument?.(doneIds[0], subjectId)}>{t("mobile.add.openIt")}</button> : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  , document.body);
}
