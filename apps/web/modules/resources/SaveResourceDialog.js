"use client";

import { useState } from "react";
import { FolderPicker } from "../ui/FolderTree";
import { useT } from "../../lib/i18n/LocaleProvider.js";

const input = "w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-[var(--accent)]";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-[var(--surface-soft)]";
const primaryBtn = "inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed] disabled:opacity-50";

/** Name, folder, tags and difficulty before a generated resource is saved. */
export function SaveResourceDialog({ defaultName, folders = [], defaultFolderId = "", summary = "", busy = false, hideUnfiled = false, plans = [], canActivity = false, onCancel, onSave, onCreateFolder }) {
  const t = useT();
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
        <h4 className="m-0 text-lg font-bold text-ink">{t("courses.sr.title")}</h4>
        <p className="m-0 mt-1 text-xs text-soft-ink">{summary || t("courses.sr.summary")}</p>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-xs font-semibold text-soft-ink">{t("courses.sr.name")}<input autoFocus className={input} value={name} onChange={(event) => setName(event.target.value)} placeholder={t("courses.sr.namePh")} /></label>
          <div className="grid gap-1 text-xs font-semibold text-soft-ink">
            <span>{t("courses.sr.where")} <span className="font-normal">· {hideUnfiled ? t("courses.sr.pickSubject") : t("courses.sr.filedHere")}</span></span>
            <FolderPicker folders={folders} selectedId={folderId} onSelect={setFolderId} hideUnfiled={hideUnfiled} />
            {onCreateFolder ? (
              <div className="flex items-center gap-2">
                <input
                  className={`${input} py-1 text-xs`}
                  value={newFolder}
                  placeholder={folderId ? t("courses.sr.newInside") : t("courses.sr.newName")}
                  onChange={(event) => setNewFolder(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); create(); } }}
                />
                <button type="button" className="shrink-0 rounded-full border border-ink/15 px-3 py-1 text-xs font-semibold text-ink disabled:opacity-40" disabled={creating || !newFolder.trim()} onClick={create}>{creating ? "…" : t("common.create")}</button>
              </div>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-soft-ink">{t("courses.sr.difficulty")}
              <select className={input} value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
                <option value="">{t("courses.sr.notSet")}</option>
                {["easy", "medium", "hard"].map((level) => <option key={level} value={level}>{t(`courses.diff.${level}`)}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-soft-ink">{t("courses.wb.tags")}<input className={input} value={tags} onChange={(event) => setTags(event.target.value)} placeholder={t("courses.sr.tagsPh")} /></label>
          </div>
          {canActivity || plans.length ? (
            <div className="grid gap-2 rounded-xl border border-ink/10 p-3">
              <p className="m-0 text-xs font-semibold text-soft-ink">{t("courses.sr.alsoAdd")}</p>
              {canActivity ? <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={addActivity} onChange={(event) => setAddActivity(event.target.checked)} />{t("courses.sr.activities")}</label> : null}
              {plans.length ? (
                <div className="grid gap-1.5">
                  <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={addPlan} onChange={(event) => setAddPlan(event.target.checked)} />{t("courses.sr.aPlan")}</label>
                  {addPlan ? (
                    <select className={input} value={planId} onChange={(event) => setPlanId(event.target.value)}>
                      {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                    </select>
                  ) : null}
                </div>
              ) : null}
              {(addActivity && canActivity) || addPlan ? (
                <label className="grid gap-1 text-xs font-semibold text-soft-ink">{t("courses.sr.due")} <span className="font-normal">· {t("courses.sr.optional")}</span>
                  <input type="date" className={input} value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                </label>
              ) : null}
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={favourite} onChange={(event) => setFavourite(event.target.checked)} />{t("courses.sr.fav")}</label>
          <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={openAfter} onChange={(event) => setOpenAfter(event.target.checked)} />{t("courses.sr.openAfter")}</label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onCancel}>{t("common.cancel")}</button>
          <button type="button" className={primaryBtn} disabled={busy || !name.trim()} onClick={() => onSave({ name: name.trim(), folderId, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), difficulty, favourite, openAfter, addActivity: canActivity && addActivity, planId: addPlan ? planId : "", dueDate: ((canActivity && addActivity) || addPlan) ? dueDate : "" })}>{busy ? t("courses.rs.saving") : t("courses.sr.save")}</button>
        </div>
      </div>
    </div>
  );
}
