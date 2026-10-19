"use client";

import { useCallback, useState } from "react";
import { ReaderView } from "../reader/ReaderView";
import { DocumentReader } from "../reader/DocumentReader";
import { parseResource } from "../resources/resource";
import { defaultLearner } from "../performance/learners";
import { isSharedDocument } from "../accounts/shared";
import { playableOf } from "./model.js";

/**
 * Opening something from a phone screen, without leaving it: a quiz or flashcards open in the activity player (one
 * question at a time on a phone), anything Luna made opens in the reader, and uploaded material opens in the document
 * reader. These are the same readers as on the website. A finished activity is saved like the website's Practice page
 * saves it (an `activity-attempt` document, which every progress screen reads) and sent to the attempts table.
 *
 * Returns `[overlay, open]`: render `overlay`, call `open(document, subjectId)`.
 */
export function useOpener({ workspace = null, profileName = "", onSaveGeneratedQuizDocument, onUpdateGeneratedDocument, onDownloadDocument, onUpdateDocumentContent, onSaved, onClosed }) {
  const [current, setCurrent] = useState(null);
  const documents = (workspace?.subjects || []).flatMap((subject) => subject.documents || []);

  const open = useCallback((document, subjectId = "") => {
    if (!document) return;
    const resource = playableOf(document) || parseResource(document);
    setCurrent(resource ? { kind: "resource", document, resource, subjectId } : { kind: "document", document, subjectId });
  }, []);

  async function saveAttempt(attempt, document, subjectId) {
    const learner = defaultLearner("student", profileName);
    const content = JSON.stringify({ kind: "activity-attempt", attempt, activityDocumentId: document.id, activityId: attempt.activityId, learner }, null, 2);
    // The relational copy (attempt rows, concept state) is best effort, as on the agent run page.
    fetch("/api/attempts/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attempt, learnerId: learner || "anonymous", activityDocumentId: document.id, subjectId: subjectId || null }) }).catch(() => {});
    try {
      await onSaveGeneratedQuizDocument?.({ folderIds: [], tags: ["activity-attempt"], file: { name: `${attempt.activityTitle || "activity"} · attempt.json`, content, preview: `${attempt.score}/${attempt.total}`, sizeBytes: content.length } }, subjectId);
      onSaved?.(attempt);
    } catch { /* the result still shows; the next save retries nothing, as on the website */ }
  }

  const close = () => { setCurrent(null); onClosed?.(); };

  let overlay = null;
  if (current?.kind === "resource") {
    const { document, resource, subjectId } = current;
    overlay = (
      <ReaderView
        resource={resource}
        chat={{ documentId: document.id }}
        highlights={resource.highlights || []}
        onSaveHighlights={onUpdateGeneratedDocument ? (list) => { const content = JSON.stringify({ ...resource, highlights: list }, null, 2); return onUpdateGeneratedDocument(document.id, { file: { name: document.name, content, sizeBytes: content.length } }, subjectId); } : undefined}
        onSubmit={(attempt) => saveAttempt(attempt, document, subjectId)}
        onClose={close}
      />
    );
  } else if (current?.kind === "document") {
    overlay = (
      <DocumentReader
        document={current.document}
        documents={documents}
        workspaceId={workspace?.id || ""}
        onOpenActivity={(documentId) => { const target = documents.find((entry) => entry.id === documentId); if (target) open(target, current.subjectId); }}
        onClose={close}
        onSaveGeneratedQuizDocument={onSaveGeneratedQuizDocument}
        onUpdateGeneratedDocument={onUpdateGeneratedDocument}
        onDownloadDocument={onDownloadDocument}
        onUpdateDocumentContent={isSharedDocument(current.document) ? undefined : onUpdateDocumentContent}
      />
    );
  }
  return [overlay, open];
}
