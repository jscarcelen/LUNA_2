"use client";

import { useState } from "react";
import { FolderPicker } from "../../ui/FolderTree";
import { pathOf } from "./folderModel";

const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-[var(--surface-soft)]";
const primaryBtn = "inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed] disabled:opacity-50";

/**
 * "Move to…": the same folder tree as the workspace, with every topic as the top of its branch, so a
 * move works on a phone (no dragging) and across topics. Pick a topic to put it at the topic's top
 * level, or a folder inside one.
 *
 * @param {{ id: string, name: string, parentFolderId: string, isSubject?: boolean }[]} folders  nodes from foldersOf()
 * @param {string[]} disabledIds nodes that cannot be chosen (a folder being moved and what is inside it)
 */
export function MoveDialog({ title, subtitle = "", folders = [], disabledIds = [], initialId = "", onPick, onCancel }) {
  const [picked, setPicked] = useState(initialId);
  const chosen = folders.find((folder) => folder.id === picked);
  return (
    <div className="tw-scope fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onCancel}>
      <div className="grid w-full max-w-md gap-3 rounded-[18px] bg-white p-5 shadow-[0_16px_48px_rgba(0,0,0,0.25)]" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div>
          <p className="m-0 text-base font-bold text-ink">{title}</p>
          {subtitle ? <p className="m-0 mt-0.5 text-xs text-soft-ink">{subtitle}</p> : null}
        </div>
        <FolderPicker folders={folders} selectedId={picked} onSelect={setPicked} hideUnfiled disabledIds={disabledIds} maxHeight={320} />
        <p className="m-0 min-h-4 text-xs text-soft-ink">{chosen ? `Move to: ${pathOf(folders, chosen.id)}` : "Choose a topic or a folder."}</p>
        <div className="flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onCancel}>Cancel</button>
          <button type="button" className={primaryBtn} disabled={!chosen} onClick={() => onPick?.(picked)}>Move here</button>
        </div>
      </div>
    </div>
  );
}
