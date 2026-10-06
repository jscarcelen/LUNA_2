"use client";

import { useMemo, useRef, useState } from "react";
import { ReaderView } from "./ReaderView";
import { focusSections, htmlOfDocument, markdownToBlocks, notesDocumentFor, saveDocumentNotes } from "./documentView";

/** Saves what the server returns for a download ({ fileName, contentBase64, mimeType }). */
function saveFile(file, fallbackName) {
  if (!file?.contentBase64) return false;
  const bytes = Uint8Array.from(atob(file.contentBase64), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType || "application/octet-stream" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.fileName || fallbackName;
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
}

/**
 * An uploaded document (or any document that is text) in the HTML reader: two views — the original,
 * and the one with my highlights and notes, which are kept next to the document — and a Download
 * button with the PDF page-size × view matrix, the HTML and the original file.
 */
export function DocumentReader({ document: original, documents = [], focus = null, scrollTo = null, planId = "", onClose, onSaveGeneratedQuizDocument, onUpdateGeneratedDocument, onDownloadDocument, onUpdateDocumentContent }) {
  // After an edit is saved the reader shows it at once; the workspace catches up when it reloads.
  const [edited, setEdited] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const doc = useMemo(() => (edited ? { ...original, sourceRenderHtml: edited.html, content: edited.markdown } : original), [original, edited]);
  const existing = useMemo(() => notesDocumentFor(documents, original.id), [documents, original.id]);
  // After the first save the notes file exists even though the workspace has not reloaded yet.
  const notesFile = useRef(existing);
  const [message, setMessage] = useState("");
  const fullHtml = useMemo(() => htmlOfDocument(doc), [doc]);
  // A study step shows its part of a long document; the notes still belong to the whole document.
  const focused = useMemo(() => (focus ? focusSections(fullHtml, focus) : { html: fullHtml, focused: false }), [fullHtml, focus]);
  const html = showAll || !focused.focused ? fullHtml : focused.html;
  const resource = useMemo(() => ({
    kind: "resource",
    name: doc.name,
    data: { isBlockOutput: true, blocks: markdownToBlocks(String(doc.content || doc.preview || ""), String(doc.name || "").replace(/\.[^.]+$/, "")) },
    request: {},
    meta: { subjectName: doc.subjectName || "" }
  }), [doc]);

  async function save(list) {
    try {
      const saved = await saveDocumentNotes({ document: doc, existing: notesFile.current, list, onSaveGeneratedQuizDocument, onUpdateGeneratedDocument });
      if (saved?.id && !notesFile.current) notesFile.current = { document: { id: saved.id }, highlights: list };
    } catch (error) {
      setMessage(`Could not save your notes: ${String(error?.message || error)}`);
    }
  }

  return (
    <ReaderView
      title={doc.name}
      chat={{ documentId: doc.id, planId, subjectId: doc.subjectId, readSelf: true }}
      resource={resource}
      html={html}
      focusInfo={focused.focused ? focused : null}
      showingAll={showAll}
      onToggleFocus={() => setShowAll((value) => !value)}
      onEditStart={() => setShowAll(true)}
      onSaveContent={onUpdateDocumentContent && doc.sourceType !== "generated" ? async ({ html: correctedHtml, markdown }) => {
        await onUpdateDocumentContent(doc.id, { correctedHtml, correctedContent: markdown, subjectId: doc.subjectId });
        setEdited({ html: correctedHtml, markdown });
      } : undefined}
      highlights={existing?.highlights || []}
      onSaveHighlights={onUpdateGeneratedDocument || onSaveGeneratedQuizDocument ? save : undefined}
      scrollTo={scrollTo}
      onClose={onClose}
      notice={message}
      onDownloadOriginal={onDownloadDocument ? async () => {
        const file = await onDownloadDocument(doc);
        if (!saveFile(file, doc.name)) setMessage("Nothing to download for this file.");
      } : undefined}
    />
  );
}
