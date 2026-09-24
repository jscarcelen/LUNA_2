"use client";

import { useState } from "react";
import { WorkspacesManagerView } from "../../../components/views";
import { WorkspaceBrowser } from "./WorkspaceBrowser";

const tabBtn = (on) => `rounded-lg px-3 py-1.5 text-xs font-semibold ${on ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink"}`;

/**
 * The workspace: a file browser over everything in the space (uploaded and generated), with the
 * full manager — subjects, uploads, tags, review — one click away under "Manage".
 */
export function WorkspacePage(props) {
  const [mode, setMode] = useState("browse");
  const subject = props.workspaces?.find((workspace) => workspace.id === props.selectedWorkspaceId)?.subjects?.find((item) => item.id === props.selectedSubjectId) || null;
  return (
    <div className="grid gap-3">
      <div className="tw-scope flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
          <button type="button" className={tabBtn(mode === "browse")} onClick={() => setMode("browse")}>Browse</button>
          <button type="button" className={tabBtn(mode === "manage")} onClick={() => setMode("manage")}>Manage</button>
        </div>
        <p className="m-0 text-xs text-soft-ink">{mode === "browse" ? "Folders, files and everything your agents generated." : "Subjects, uploads, tags, review and templates."}</p>
      </div>
      {mode === "browse" && subject ? (
        <WorkspaceBrowser
          subject={subject}
          isWorking={props.isWorking}
          onCreateFolder={props.onCreateFolder}
          onRenameFolder={props.onRenameFolder}
          onRemoveFolder={props.onRemoveFolder}
          onUpdateDocumentMeta={props.onUpdateDocumentMeta}
          onRemoveDocument={props.onRemoveDocument}
        />
      ) : (
        <WorkspacesManagerView {...props} />
      )}
    </div>
  );
}
