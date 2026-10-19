"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "../../lib/i18n/LocaleProvider.js";
import { runStep } from "../plans/execute";
import { MAX_PHOTOS, photoToJpeg } from "./photoUpload.js";

const primaryBtn = "inline-flex min-h-[52px] items-center justify-center rounded-full bg-[var(--accent)] px-5 text-base font-semibold text-white transition duration-[180ms] hover:bg-[#0077ed] disabled:opacity-50";
const tileBtn = "flex min-h-[64px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-ink/12 bg-white px-3 text-base font-semibold text-ink transition duration-[180ms] hover:bg-[var(--surface-soft)] active:scale-[0.99]";
const COUNTS = [5, 10, 15];
const DIFFICULTIES = [["Easy", "practice.photo.diff.easy"], ["Medium", "practice.photo.diff.medium"], ["Hard", "practice.photo.diff.hard"], ["Mixed", "practice.photo.diff.mixed"]];

/**
 * "Make a quiz from your notes" — the phone-first way to make a quiz: take a photo of each page (or pick them from the
 * library), choose how many questions and how hard, and Luna does the rest. Each photo is shrunk to a ~2000 px JPEG in
 * the browser (iPhone HEIC included), uploaded through the normal upload pipeline (OCR, with the vision model for
 * handwriting), and the built-in Quiz Generator writes the quiz from those uploads (`runStep`, the same path a study plan
 * uses). The quiz is saved in the topic and opened straight away (`onDone(documentId)`).
 */
export function PhotoQuizMaker({ workspaceId, subjectId, subjectName = "", onUploadTxt, onSaveGeneratedQuizDocument, onDone, onClose, onMoreOptions }) {
  const t = useT();
  const [photos, setPhotos] = useState([]); // { id, file, url }
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState("Medium");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const camera = useRef(null);
  const library = useRef(null);
  const urls = useRef([]);
  useEffect(() => () => { urls.current.forEach((url) => URL.revokeObjectURL(url)); }, []);

  async function add(event) {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if (!files.length) return;
    setError("");
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) { setError(t("practice.photo.max", { max: MAX_PHOTOS })); return; }
    const picked = files.slice(0, room);
    const ready = [];
    for (const [offset, file] of picked.entries()) {
      setBusy(t("practice.photo.preparing", { n: offset + 1, total: picked.length }));
      try {
        const jpeg = await photoToJpeg(file, photos.length + offset);
        const url = URL.createObjectURL(jpeg);
        urls.current.push(url);
        ready.push({ id: `${Date.now()}_${offset}`, file: jpeg, url });
      } catch {
        setError(t("practice.photo.unreadable", { n: photos.length + offset + 1 }));
      }
    }
    if (files.length > room) setError(t("practice.photo.max", { max: MAX_PHOTOS }));
    setPhotos((list) => [...list, ...ready]);
    setBusy("");
  }

  function remove(id) {
    setPhotos((list) => list.filter((photo) => photo.id !== id));
  }

  async function make() {
    if (!photos.length || busy) return;
    if (!workspaceId || !subjectId || !onUploadTxt || !onSaveGeneratedQuizDocument) { setError(t("practice.photo.noSubject")); return; }
    setError("");
    try {
      // One photo per request: each stays far below the platform's request size limit.
      const documentIds = [];
      let readable = 0;
      for (const [index, photo] of photos.entries()) {
        setBusy(t("practice.photo.uploading", { n: index + 1, total: photos.length }));
        const data = await onUploadTxt([photo.file], { subjectId, folderIds: [] });
        for (const document of data?.uploadedDocuments || []) if (document?.id) documentIds.push(document.id);
        // The extraction report says what was read off the photo (OCR, or the vision model for handwriting).
        for (const report of data?.uploadReport || []) if (String(report?.markdown || report?.sourcePreview || "").trim().length >= 20) readable += 1;
      }
      if (!documentIds.length || !readable) { setError(t("practice.photo.noText")); setBusy(""); return; }
      setBusy(t("practice.photo.writing"));
      const title = t("practice.photo.defaultTitle", { date: new Date().toLocaleDateString(t.locale === "es" ? "es-ES" : undefined, { day: "numeric", month: "short" }) });
      const made = await runStep({
        step: { title, generate: "quiz", concepts: [] },
        sourceDocumentIds: documentIds,
        workspaceId,
        subjectId,
        subjectName,
        options: { count, difficulty, types: ["Multiple choice", "Short answer"] },
        onSaveGeneratedQuizDocument,
        folderIds: []
      });
      setBusy("");
      if (!made?.documentId) throw new Error(t("practice.photo.notSaved"));
      onDone?.(made.documentId);
    } catch (problem) {
      setBusy("");
      setError(t("practice.photo.failed", { error: String(problem?.message || problem) }));
    }
  }

  return (
    <div className="tw-scope fixed inset-0 z-[70] flex flex-col bg-[var(--bg)]" role="dialog" aria-modal="true" aria-label={t("practice.photo.title")}>
      <header className="flex items-center gap-3 border-b border-ink/10 bg-white px-4 py-3">
        <button type="button" className="inline-flex min-h-[40px] items-center rounded-full border border-ink/15 bg-white px-3 text-sm font-semibold text-ink" onClick={onClose} disabled={Boolean(busy) && busy === t("practice.photo.writing")}>← {t("common.cancel")}</button>
        <p className="m-0 min-w-0 flex-1 truncate text-base font-bold text-ink">{t("practice.photo.title")}</p>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-5" style={{ paddingBottom: "calc(112px + env(safe-area-inset-bottom))" }}>
        <div className="mx-auto grid max-w-xl gap-5">
          <p className="m-0 text-sm text-soft-ink">{t("practice.photo.hint")}</p>

          <div className="flex gap-2">
            <label className={tileBtn}>
              <span aria-hidden>📷</span>{t("practice.photo.take")}
              <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" disabled={Boolean(busy)} onChange={add} />
            </label>
            <label className={tileBtn}>
              <span aria-hidden>🖼</span>{t("practice.photo.library")}
              <input ref={library} type="file" accept="image/*" multiple className="sr-only" disabled={Boolean(busy)} onChange={add} />
            </label>
          </div>

          {photos.length ? (
            <div>
              <p className="m-0 mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-soft-ink">{t.plural("practice.photo.count", photos.length)}</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {photos.map((photo, index) => (
                  <div key={photo.id} className="relative aspect-[3/4] overflow-hidden rounded-xl border border-ink/10 bg-white animate-step motion-reduce:animate-none">
                    <img src={photo.url} alt="" className="h-full w-full object-cover" />
                    <span className="absolute left-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-white text-xs font-bold text-ink shadow">{index + 1}</span>
                    <button type="button" className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-full bg-white text-sm font-bold text-ink shadow" aria-label={t("practice.photo.remove", { n: index + 1 })} disabled={Boolean(busy)} onClick={() => remove(photo.id)}>×</button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-soft-ink">{t("practice.photo.questions")}</legend>
            <div className="flex gap-2" role="radiogroup">
              {COUNTS.map((value) => <button key={value} type="button" role="radio" aria-checked={count === value} disabled={Boolean(busy)} onClick={() => setCount(value)} className={`min-h-[48px] flex-1 rounded-full border text-base font-semibold transition duration-[180ms] ${count === value ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "border-ink/12 bg-white text-ink"}`}>{value}</button>)}
            </div>
          </fieldset>
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-soft-ink">{t("practice.photo.difficulty")}</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup">
              {DIFFICULTIES.map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={difficulty === value} disabled={Boolean(busy)} onClick={() => setDifficulty(value)} className={`min-h-[48px] rounded-full border text-base font-semibold transition duration-[180ms] ${difficulty === value ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "border-ink/12 bg-white text-ink"}`}>{t(label)}</button>)}
            </div>
          </fieldset>

          {error ? <p className="m-0 rounded-xl bg-[rgba(255,59,48,0.08)] px-3 py-2 text-sm text-[var(--color-danger)]" role="alert">{error}</p> : null}
          {onMoreOptions ? <button type="button" className="justify-self-start text-sm font-semibold text-[var(--accent-ink)] underline" disabled={Boolean(busy)} onClick={onMoreOptions}>{t("practice.photo.moreOptions")}</button> : null}
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 border-t border-ink/10 bg-white px-4 pt-3" style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
        <div className="mx-auto grid max-w-xl gap-2">
          {busy ? <p className="m-0 flex items-center justify-center gap-2 text-sm text-soft-ink" role="status" aria-live="polite"><span className="inline-block size-3.5 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" aria-hidden />{busy}</p> : null}
          <button type="button" className={`${primaryBtn} w-full`} disabled={!photos.length || Boolean(busy)} onClick={make}>{t("practice.photo.make")}</button>
        </div>
      </div>
    </div>
  );
}
