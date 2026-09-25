"use client";

import { useState } from "react";
import { WorkspacesManagerView } from "../../../components/views";
import { WorkspaceBrowser } from "./WorkspaceBrowser";

/**
 * The workspace: one folder tree holding everything — the material you uploaded, everything the
 * agents generated, and the review centre as just another folder. The older repair screens are
 * still reachable for the rare heavy jobs (fixing an extraction by hand, tag colours).
 */
export function WorkspacePage(props) {
  const [classic, setClassic] = useState(false);
  const workspace = props.workspaces?.find((item) => item.id === props.selectedWorkspaceId) || props.workspaces?.[0] || null;
  if (classic) {
    return (
      <div className="grid gap-3">
        <div className="tw-scope flex flex-wrap items-center gap-2">
          <button type="button" className="rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink" onClick={() => setClassic(false)}>← Back to folders</button>
          <p className="m-0 text-xs text-soft-ink">Extraction repair, tag colours and the template repository.</p>
        </div>
        <WorkspacesManagerView {...props} />
      </div>
    );
  }
  if (!workspace) return <WorkspacesManagerView {...props} />;
  return (
    <WorkspaceBrowser
      workspace={workspace}
      templates={props.templates}
      isWorking={props.isWorking}
      onCreateSubject={props.onCreateWorkspaceFolder}
      onRenameSubject={props.onRenameSubject}
      onRemoveSubject={props.onRemoveSubject}
      onCreateFolder={props.onCreateFolder}
      onRenameFolder={props.onRenameFolder}
      onRemoveFolder={props.onRemoveFolder}
      onUpdateDocumentMeta={props.onUpdateDocumentMeta}
      onRenameDocument={props.onRenameDocument}
      onRemoveDocument={props.onRemoveDocument}
      onUpload={props.onUploadTxt}
      onDownloadDocument={props.onDownloadDocument}
      onUpdateGeneratedDocument={props.onUpdateGeneratedDocument}
      onSaveGeneratedQuizDocument={props.onSaveGeneratedQuizDocument}
      onRegenerateResource={props.onRegenerateResource}
      onReviewDocument={props.onReviewDocumentExtraction}
      onReprocessDocument={props.onReprocessDocument}
      onOpenClassicTools={() => setClassic(true)}
      focusDocumentId={props.focusDocumentId}
      onSelectFolder={props.onSelectFolder}
    />
  );
}
