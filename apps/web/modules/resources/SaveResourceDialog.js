"use client";

import { useState } from "react";
import { FolderPicker } from "../ui/FolderTree";

const input = "w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-[var(--accent)]";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-[var(--surface-soft)]";
const primaryBtn = "inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed] disabled:opacity-50";

/** Name, folder, tags and difficulty before a generated resource is saved. */
export function SaveResourceDialog({ defaultName, folders = [], defaultFolderId = "", summary = "", busy = false, hideUnfiled = false, plans = [], canActivity = false, onCancel, onSave, onCreateFolder }) {
  const [name, setName] = useState(defaultName || "");
  const [folderId, setFolderId] = useState(defaultFolderId);
  const [tags, setTags] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [favourite, setFavourite] = useState(false);
  const [openAfter, setOpenAfter] = useState(true);
  const [addActivity, setAddActivity] = useState(canActivity);
  const [addPlan, setAddPlan] = useState(false);
  const [planId, setPlanId] = useState(plans[0]?.id || "");
  const [dueDate, setDueDate] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const [creating, setCreating] = useState(false);
  async function create() {
    const name = newFolder.trim();
    if (!name || !onCreateFolder) return;
    setCreating(true);
    try {
      const created = await onCreateFolder(name, folderId && folderId !== "" ? folderId : "");
      if (created?.id) setFolderId(created.id);
      setNewFolder("");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="tw-scope fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-[0_24px_64px_rgba(0,0,0,0.25)]" onClick={(event) => event.stopPropagation()}>
        <h4 className="m-0 text-lg font-bold text-ink">Save this resource</h4>
        <p className="m-0 mt-1 text-xs text-soft-ink">{summary || "It goes to your resources, where you can do it on Luna, export it in any format, or regenerate it later."}</p>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-xs font-semibold text-soft-ink">Name<input autoFocus className={input} value={name} onChange={(event) => setName(event.target.value)} placeholder="Biology quiz · chapter 3" /></label>
          <div className="grid gap-1 text-xs font-semibold text-soft-ink">
            <span>Where to file it <span className="font-normal">· {hideUnfiled ? "pick a subject or a folder inside it" : "where it is filed in this space"}</span></span>
            <FolderPicker folders={folders} selectedId={folderId} onSelect={setFolderId} hideUnfiled={hideUnfiled} />
            {onCreateFolder ? (
              <div className="flex items-center gap-2">
                <input
                  className={`${input} py-1 text-xs`}
                  value={newFolder}
                  placeholder={folderId ? "…or a new folder inside the selected one" : "…or type a new folder name"}
                  onChange={(event) => setNewFolder(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); create(); } }}
                />
                <button type="button" className="shrink-0 rounded-full border border-ink/15 px-3 py-1 text-xs font-semibold text-ink disabled:opacity-40" disabled={creating || !newFolder.trim()} onClick={create}>{creating ? "…" : "Create"}</button>
              </div>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-soft-ink">Difficulty
              <select className={input} value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
                <option value="">Not set</option>
                {["easy", "medium", "hard"].map((level) => <option key={level} value={level}>{level}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-soft-ink">Tags<input className={input} value={tags} onChange={(event) => setTags(event.target.value)} placeholder="exam, unit 2" /></label>
          </div>
          {canActivity || plans.length ? (
            <div className="grid gap-2 rounded-xl border border-ink/10 p-3">
              <p className="m-0 text-xs font-semibold text-soft-ink">Also add it to</p>
              {canActivity ? <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={addActivity} onChange={(event) => setAddActivity(event.target.checked)} />Activities — to do on Luna, with results tracked</label> : null}
              {plans.length ? (
                <div className="grid gap-1.5">
                  <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={addPlan} onChange={(event) => setAddPlan(event.target.checked)} />A study plan</label>
                  {addPlan ? (
                    <select className={input} value={planId} onChange={(event) => setPlanId(event.target.value)}>
                      {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                    </select>
                  ) : null}
                </div>
              ) : null}
              {(addActivity && canActivity) || addPlan ? (
                <label className="grid gap-1 text-xs font-semibold text-soft-ink">Due date <span className="font-normal">· optional</span>
                  <input type="date" className={input} value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                </label>
              ) : null}
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={favourite} onChange={(event) => setFavourite(event.target.checked)} />Mark as favourite</label>
          <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={openAfter} onChange={(event) => setOpenAfter(event.target.checked)} />Open it after saving</label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onCancel}>Cancel</button>
          <button type="button" className={primaryBtn} disabled={busy || !name.trim()} onClick={() => onSave({ name: name.trim(), folderId, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), difficulty, favourite, openAfter, addActivity: canActivity && addActivity, planId: addPlan ? planId : "", dueDate: ((canActivity && addActivity) || addPlan) ? dueDate : "" })}>{busy ? "Saving…" : "Save resource"}</button>
        </div>
      </div>
    </div>
  );
}
