"use client";

import { useMemo, useRef, useState } from "react";
import { ReaderView } from "./ReaderView";
import { focusSections, htmlOfDocument, markdownToBlocks, notesDocumentFor, saveDocumentNotes } from "./documentView";
import { saveFile } from "./downloadOriginal";
import { TopicMap } from "./TopicMap";
import { collectCoverageRefs } from "./coverageMap.js";

/**
 * An uploaded document (or any document that is text) in the HTML reader: two views — the original,
 * and the one with my highlights and notes, which are kept next to the document — and a Download
 * button with the PDF page-size × view matrix, the HTML and the original file.
 */
export function DocumentReader({ document: original, documents = [], focus = null, scrollTo = null, planId = "", workspaceId = "", onClose, onSaveGeneratedQuizDocument, onUpdateGeneratedDocument, onDownloadDocument, onUpdateDocumentContent, onOpenActivity }) {
  // After an edit is saved the reader shows it at once; the workspace catches up when it reloads.
  const [edited, setEdited] = useState(null);
  const [showAll, setShowAll] = useState(false);
  // A topic or concept picked in the topic map: the reader scrolls to its page (or heading).
  const [jump, setJump] = useState(null);
  const doc = useMemo(() => (edited ? { ...original, sourceRenderHtml: edited.html, content: edited.markdown } : original), [original, edited]);
  const existing = useMemo(() => notesDocumentFor(documents, original.id), [documents, original.id]);
  // After the first save the notes file exists even though the workspace has not reloaded yet.
  const notesFile = useRef(existing);
  const [message, setMessage] = useState("");
  // Which activities and summaries of the workspace were made from this document, for the Coverage view.
  const coverageRefs = useMemo(() => (original.sourceType === "generated" ? [] : collectCoverageRefs(original.id, documents)), [original.id, original.sourceType, documents]);
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
      scrollTo={jump || scrollTo}
      coverage={coverageRefs.length ? { refs: coverageRefs, onOpen: onOpenActivity } : null}
      extra={doc.sourceType !== "generated" && workspaceId ? <TopicMap documentId={doc.id} workspaceId={workspaceId} html={html} onJump={(target) => { setShowAll(true); setJump({ ...target, at: Date.now() }); }} /> : null}
      onClose={onClose}
      notice={message}
      onDownloadOriginal={onDownloadDocument ? async () => {
        const file = await onDownloadDocument(doc);
        if (!saveFile(file, doc.name)) setMessage("Nothing to download for this file.");
      } : undefined}
    />
  );
}
