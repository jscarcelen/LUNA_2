"use client";

import { useState } from "react";
import { WorkspacesManagerView } from "../../../components/views";
import { WorkspaceBrowser } from "./WorkspaceBrowser";

const tabBtn = (on) => `rounded-lg px-3 py-1.5 text-xs font-semibold ${on ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink"}`;

/**
 * The workspace: one folder tree holding everything — the material you uploaded and everything the
 * agents generated — with every action on the item itself. "Advanced" keeps the older screens
 * (uploads with quality review, topic-tag colours, template repository) for the rarer jobs.
 */
export function WorkspacePage(props) {
  const [mode, setMode] = useState("browse");
  const workspace = props.workspaces?.find((item) => item.id === props.selectedWorkspaceId) || props.workspaces?.[0] || null;
  return (
    <div className="grid gap-3">
      <div className="tw-scope flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
          <button type="button" className={tabBtn(mode === "browse")} onClick={() => setMode("browse")}>Folders</button>
          <button type="button" className={tabBtn(mode === "manage")} onClick={() => setMode("manage")}>Advanced</button>
        </div>
        <p className="m-0 text-xs text-soft-ink">{mode === "browse" ? "Folders and subfolders: material, generated resources, everything in one place." : "Extraction review, tag colours and the template repository."}</p>
      </div>
      {mode === "browse" && workspace ? (
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
          onSelectFolder={props.onSelectFolder}
        />
      ) : (
        <WorkspacesManagerView {...props} />
      )}
    </div>
  );
}
