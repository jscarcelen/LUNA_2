"use client";

import { useMemo, useRef, useState } from "react";
import { ReaderView } from "./ReaderView";
import { htmlOfDocument, markdownToBlocks, notesDocumentFor, saveDocumentNotes } from "./documentView";

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
export function DocumentReader({ document: doc, documents = [], onClose, onSaveGeneratedQuizDocument, onUpdateGeneratedDocument, onDownloadDocument }) {
  const existing = useMemo(() => notesDocumentFor(documents, doc.id), [documents, doc.id]);
  // After the first save the notes file exists even though the workspace has not reloaded yet.
  const notesFile = useRef(existing);
  const [message, setMessage] = useState("");
  const html = useMemo(() => htmlOfDocument(doc), [doc]);
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
      resource={resource}
      html={html}
      highlights={existing?.highlights || []}
      onSaveHighlights={onUpdateGeneratedDocument || onSaveGeneratedQuizDocument ? save : undefined}
      onClose={onClose}
      notice={message}
      onDownloadOriginal={onDownloadDocument ? async () => {
        const file = await onDownloadDocument(doc);
        if (!saveFile(file, doc.name)) setMessage("Nothing to download for this file.");
      } : undefined}
    />
  );
}
