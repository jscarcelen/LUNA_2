"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { accountsApi } from "./api";
import { formatClassCode } from "./classCodeText";
import { ColourPicker, MemberPicker } from "./GroupsBar";
import { GROUP_COLOURS, MAX_GROUP_NAME, MAX_SUBGROUP_NAME, classesWithSubgroups } from "./groups";
import { GROUPS_MIGRATION, SUBGROUPS_MIGRATION, SetupNotice } from "./SetupNotice";
import { card, dangerBtn, field, ghostBtn, kicker, primaryBtn } from "./ui";
import { useT } from "../../lib/i18n/LocaleProvider.js";
import { askConfirm } from "../ui/dialogs.js";

const nameOf = (person) => person.displayName || person.email || "";
const initials = (person) => nameOf(person).split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("") || "?";
const bigBtn = "inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0077ed] active:scale-[0.98]";

function CopyButton({ text }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }
  return <button type="button" className={ghostBtn} onClick={copy}>{copied ? t("people.code.copied") : t("people.code.copy")}</button>;
}

/** A centred box over the page (Escape or a click outside closes it). */
function Sheet({ label, onClose, children }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="tw-scope fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={label} className={`${card} grid max-h-[88vh] w-full max-w-md gap-3 overflow-y-auto p-5`} onClick={(event) => event.stopPropagation()}>
        <h3 className="m-0 text-lg font-bold tracking-tight text-ink">{label}</h3>
        {children}
      </div>
    </div>
  );
}

function Avatars({ people }) {
  const t = useT();
  if (!people.length) return <p className="m-0 text-sm text-soft-ink">{t("classes.noStudents")}</p>;
  return (
    <div className="flex items-center">
      {people.slice(0, 7).map((person, index) => (
        <span key={person.id} title={nameOf(person)} className="-ml-1.5 grid size-9 place-items-center rounded-full bg-[var(--accent-soft)] text-xs font-bold text-[var(--accent-ink)] ring-2 ring-white first:ml-0" style={{ zIndex: 10 - index }}>{initials(person)}</span>
      ))}
      {people.length > 7 ? <span className="-ml-1.5 grid size-9 place-items-center rounded-full bg-[var(--surface-soft)] text-xs font-semibold text-soft-ink ring-2 ring-white">+{people.length - 7}</span> : null}
    </div>
  );
}

/** One class: who is in it, its join code, the groups inside it, and the everyday buttons. */
function ClassCard({ entry, code, codesReady, studentsById, busy, onCode, onEditClass, onNewGroup, onEditGroup, onOpenPage }) {
  const t = useT();
  const people = entry.memberIds.map((id) => studentsById.get(id)).filter(Boolean);
  const page = (suffix) => onOpenPage?.(`students?group=${entry.id}${suffix}`);
  return (
    <article className={`${card} flex flex-col overflow-hidden`} aria-label={entry.name}>
      <div className="h-2 shrink-0" style={{ background: entry.colour || GROUP_COLOURS[0] }} />
      <div className="grid flex-1 content-start gap-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="m-0 truncate text-xl font-bold tracking-tight text-ink">{entry.name}</h3>
            <p className="m-0 mt-0.5 text-sm text-soft-ink">{t.plural("classes.count", people.length)}</p>
          </div>
          <button type="button" className={ghostBtn} onClick={() => onEditClass(entry)}>{t("classes.edit")}</button>
        </div>
        <Avatars people={people} />

        <div className="rounded-2xl bg-[var(--surface-soft)] p-3">
          <p className={kicker}>{t("classes.code")}</p>
          {code ? (
            <>
              <p className="m-0 mt-1 font-mono text-3xl font-bold tracking-[0.2em] text-ink" style={{ opacity: code.enabled ? 1 : 0.4 }} aria-label={t("people.code.aria", { code: code.code.split("").join(" ") })}>{formatClassCode(code.code)}</p>
              <p className="m-0 mt-1 text-[11px] text-soft-ink">{code.enabled ? t("people.code.joinOn") : t("people.code.joinOff")}{code.schoolConsent ? ` · ${t("people.code.consent")}` : ""}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <CopyButton text={code.code} />
                <button type="button" className={ghostBtn} disabled={busy} onClick={() => onCode("toggle", entry, code)}>{code.enabled ? t("people.code.turnOff") : t("people.code.turnOn")}</button>
                <button type="button" className={ghostBtn} disabled={busy} onClick={() => onCode("regenerate", entry, code)}>{t("people.code.new")}</button>
              </div>
            </>
          ) : codesReady ? (
            <button type="button" className={`${ghostBtn} mt-2`} disabled={busy} onClick={() => onCode("add", entry)}>{t("classes.giveCode")}</button>
          ) : <p className="m-0 mt-1 text-xs text-soft-ink">{t("classes.codesOff")}</p>}
        </div>

        <div>
          <p className={kicker}>{t("classes.groups")}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {entry.subgroups.map((group) => (
              <button key={group.id} type="button" onClick={() => onEditGroup(entry, group)} className="inline-flex max-w-[12rem] items-center gap-1.5 rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-[var(--surface-soft)]">
                <span className="size-2 shrink-0 rounded-full" style={{ background: group.colour }} />
                <span className="truncate">{group.shortName}</span>
                <span className="text-soft-ink">{group.memberCount}</span>
              </button>
            ))}
            <button type="button" className="inline-flex items-center rounded-full border border-dashed border-[var(--accent)]/50 px-3 py-1.5 text-xs font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-soft)] disabled:opacity-50" disabled={!people.length} title={people.length ? undefined : t("classes.groupsNeedStudents")} onClick={() => onNewGroup(entry)}>{t("classes.newGroup")}</button>
          </div>
          {!entry.subgroups.length ? <p className="m-0 mt-1.5 text-[11px] text-soft-ink">{people.length ? t("classes.groupsHint") : t("classes.groupsNeedStudents")}</p> : null}
        </div>
      </div>
      <div className="grid gap-2 border-t border-ink/8 p-5 pt-4">
        <button type="button" className={bigBtn} onClick={() => page("&tab=access")}><span aria-hidden>👀</span>{t("classes.see")}</button>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={ghostBtn} onClick={() => onEditClass(entry)}>{t("classes.students")}</button>
          <button type="button" className={ghostBtn} onClick={() => page("&tab=messages")}>{t("classes.message")}</button>
          <button type="button" className={ghostBtn} onClick={() => page("")}>{t("classes.open")}</button>
        </div>
      </div>
    </article>
  );
}

/**
 * The teacher's classes as a gallery of cards (People & connections): add a class (with a join code), add or remove
 * students, make smaller groups inside a class, and go straight to "What this class can see" to let them open material.
 * A class is a top-level group; a group inside it is a group with `parentId` (lib/groupsRepository.js).
 */
export function ClassesGallery({ onOpenPage, onChanged }) {
  const t = useT();
  const [data, setData] = useState(null); // { groups, students }
  const [codes, setCodes] = useState(new Map());
  const [codesReady, setCodesReady] = useState(true);
  const [setup, setSetup] = useState(false);
  const [dialog, setDialog] = useState(null); // { kind: "newClass" | "class" | "newGroup" | "group", entry?, group?, draft }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsSubgroupStep, setNeedsSubgroupStep] = useState(false);

  const applyCodes = useCallback((result) => {
    if (result.setupNeeded) { setCodesReady(false); return; }
    if (result.ok) setCodes(new Map((result.data.classes || []).map((item) => [item.id, item])));
  }, []);

  const load = useCallback(async () => {
    const [groups, classes] = await Promise.all([accountsApi.groups(), accountsApi.classes()]);
    if (groups.setupNeeded) { setSetup(true); return; }
    if (!groups.ok) { setError(groups.error); setData({ groups: [], students: [] }); return; }
    setData({ groups: groups.data.groups || [], students: groups.data.students || [] });
    applyCodes(classes);
  }, [applyCodes]);
  useEffect(() => { load(); }, [load]);

  const classes = useMemo(() => classesWithSubgroups(data?.groups || []), [data]);
  const studentsById = useMemo(() => new Map((data?.students || []).map((student) => [student.id, student])), [data]);
  const unplaced = useMemo(() => {
    const placed = new Set(classes.flatMap((entry) => entry.memberIds));
    return (data?.students || []).filter((student) => !placed.has(student.id));
  }, [classes, data]);

  const close = useCallback(() => { setDialog(null); setError(""); setNeedsSubgroupStep(false); }, []);

  /** Runs the calls in order, stops at the first failure, reloads, and closes the box when all went well. */
  async function run(...calls) {
    setBusy(true);
    setError("");
    for (const call of calls) {
      const result = await call();
      if (result?.setupNeeded && String(result.migration || "").includes("202610210002")) { setBusy(false); setNeedsSubgroupStep(true); return; }
      if (result && !result.ok) { setBusy(false); setError(result.error); return; }
    }
    await load();
    setBusy(false);
    setDialog(null);
    onChanged?.();
  }

  async function onCode(action, entry, code) {
    if (action === "regenerate" && !(await askConfirm({ message: t("people.code.confirmNew"), confirmLabel: t("people.code.new") }))) return;
    if (action === "add" && !(await askConfirm({ message: t("classes.dlg.codeQuestion", { name: entry.name }), confirmLabel: t("classes.giveCode") }))) return;
    setBusy(true);
    setError("");
    const result = action === "add" ? await accountsApi.addClassCode(entry.id, false) : action === "regenerate" ? await accountsApi.regenerateClassCode(entry.id) : await accountsApi.setClassEnabled(entry.id, !code.enabled);
    setBusy(false);
    if (!result.ok && !result.setupNeeded) { setError(result.error); return; }
    applyCodes(result);
  }

  if (setup) return <SetupNotice compact migration={GROUPS_MIGRATION} title={t("people.gb.dbStep")} />;

  const draft = dialog?.draft || {};
  const setDraft = (patch) => setDialog((current) => ({ ...current, draft: { ...current.draft, ...patch } }));
  const classMembers = dialog?.entry ? dialog.entry.memberIds.map((id) => studentsById.get(id)).filter(Boolean) : [];

  return (
    <section className="grid gap-4" aria-labelledby="classes-gallery-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <h2 id="classes-gallery-title" className="m-0 text-[28px] font-bold tracking-tight text-ink">{t("classes.title")}</h2>
          <p className="m-0 mt-1 text-sm text-soft-ink">{t("classes.intro")}</p>
        </div>
        <button type="button" className={primaryBtn} onClick={() => setDialog({ kind: "newClass", draft: { name: "", consent: false } })}>{t("classes.add")}</button>
      </div>
      {error && !dialog ? <p className="m-0 text-xs text-[var(--color-danger)]" role="alert">{error}</p> : null}

      {data === null ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label={t("classes.loading")}>{[0, 1, 2].map((index) => <div key={index} className="h-80 animate-pulse rounded-[18px] bg-ink/5" />)}</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {classes.map((entry) => (
            <ClassCard
              key={entry.id}
              entry={entry}
              code={codes.get(entry.id)}
              codesReady={codesReady}
              studentsById={studentsById}
              busy={busy}
              onCode={onCode}
              onOpenPage={onOpenPage}
              onEditClass={(item) => setDialog({ kind: "class", entry: item, draft: { name: item.name, colour: item.colour || GROUP_COLOURS[0], memberIds: item.memberIds } })}
              onNewGroup={(item) => setDialog({ kind: "newGroup", entry: item, draft: { name: "", colour: GROUP_COLOURS[(item.subgroups.length + 1) % GROUP_COLOURS.length], memberIds: [] } })}
              onEditGroup={(item, group) => setDialog({ kind: "group", entry: item, group, draft: { name: group.shortName, colour: group.colour || GROUP_COLOURS[0], memberIds: group.memberIds } })}
            />
          ))}
          <button type="button" onClick={() => setDialog({ kind: "newClass", draft: { name: "", consent: false } })} className="grid min-h-56 place-items-center content-center gap-2 rounded-[18px] border-2 border-dashed border-ink/15 bg-white/60 p-6 text-center transition hover:border-[var(--accent)]/50 hover:bg-white">
            <span aria-hidden className="grid size-12 place-items-center rounded-full bg-[var(--accent-soft)] text-2xl text-[var(--accent)]">＋</span>
            <span className="text-base font-bold text-ink">{t("classes.addTile")}</span>
            <span className="text-xs text-soft-ink">{classes.length ? t("classes.addTileHint") : t("classes.noneYetHint")}</span>
          </button>
        </div>
      )}

      {unplaced.length ? (
        <div className={`${card} p-5`}>
          <p className={kicker}>{t("classes.notInClass")} · {unplaced.length}</p>
          <p className="m-0 mt-1 text-sm text-soft-ink">{t("classes.notInClassHint")}</p>
          <ul className="m-0 mt-2 flex list-none flex-wrap gap-1.5 p-0">
            {unplaced.map((student) => <li key={student.id} className="rounded-full bg-[var(--surface-soft)] px-3 py-1 text-xs font-semibold text-ink">{nameOf(student)}</li>)}
          </ul>
        </div>
      ) : null}

      {dialog?.kind === "newClass" ? (
        <Sheet label={t("classes.dlg.newClass")} onClose={close}>
          <form className="grid gap-3" onSubmit={(event) => {
            event.preventDefault();
            if (!draft.name.trim() || busy) return;
            run(() => (codesReady ? accountsApi.createClass({ name: draft.name, schoolConsent: draft.consent }) : accountsApi.createGroup({ name: draft.name })));
          }}>
            <label className="grid gap-1 text-xs font-semibold text-soft-ink">{t("classes.dlg.className")}
              <input className={`${field} w-full`} autoFocus value={draft.name} maxLength={MAX_GROUP_NAME} onChange={(event) => setDraft({ name: event.target.value })} placeholder={t("classes.dlg.classNamePh")} />
            </label>
            {codesReady ? (
              <label className="flex items-start gap-2 text-xs leading-5 text-ink">
                <input type="checkbox" className="mt-1" checked={draft.consent} onChange={(event) => setDraft({ consent: event.target.checked })} />
                <span>{t("people.code.consentStatement")}. <span className="text-soft-ink">{t("people.code.consentHint")}</span></span>
              </label>
            ) : null}
            {error ? <p className="m-0 text-xs text-[var(--color-danger)]" role="alert">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <button type="button" className={ghostBtn} onClick={close}>{t("common.cancel")}</button>
              <button type="submit" className={primaryBtn} disabled={busy || !draft.name.trim()}>{busy ? t("classes.dlg.creating") : t("classes.dlg.create")}</button>
            </div>
          </form>
        </Sheet>
      ) : null}

      {dialog?.kind === "class" ? (
        <Sheet label={t("classes.dlg.settings")} onClose={close}>
          <label className="grid gap-1 text-xs font-semibold text-soft-ink">{t("classes.dlg.className")}
            <input className={`${field} w-full`} value={draft.name} maxLength={MAX_GROUP_NAME} onChange={(event) => setDraft({ name: event.target.value })} />
          </label>
          <div className="flex items-center gap-2 text-xs font-semibold text-soft-ink">{t("classes.dlg.colour")} <ColourPicker value={draft.colour} onChange={(colour) => setDraft({ colour })} /></div>
          <div className="grid gap-1">
            <p className="m-0 text-xs font-semibold text-soft-ink">{t("classes.dlg.studentsOf", { name: dialog.entry.name })}</p>
            {data?.students.length ? <MemberPicker students={data.students} selectedIds={draft.memberIds} onChange={(memberIds) => setDraft({ memberIds })} /> : <p className="m-0 text-sm text-soft-ink">{t("classes.dlg.noConnected")}</p>}
            <p className="m-0 text-[11px] text-soft-ink">{t("classes.dlg.studentsHint")}</p>
          </div>
          {error ? <p className="m-0 text-xs text-[var(--color-danger)]" role="alert">{error}</p> : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" className={dangerBtn} disabled={busy} onClick={async () => {
              if (await askConfirm({ message: t("classes.dlg.confirmDeleteClass", { name: dialog.entry.name }), confirmLabel: t("classes.dlg.deleteClass"), danger: true })) run(() => accountsApi.deleteGroup(dialog.entry.id));
            }}>{t("classes.dlg.deleteClass")}</button>
            <span className="flex gap-2">
              <button type="button" className={ghostBtn} onClick={close}>{t("common.cancel")}</button>
              <button type="button" className={primaryBtn} disabled={busy || !draft.name.trim()} onClick={() => {
                const { entry } = dialog;
                const add = draft.memberIds.filter((id) => !entry.memberIds.includes(id));
                const remove = entry.memberIds.filter((id) => !draft.memberIds.includes(id));
                run(
                  () => (draft.name !== entry.name || draft.colour !== entry.colour ? accountsApi.updateGroup(entry.id, { name: draft.name, colour: draft.colour }) : null),
                  () => (add.length ? accountsApi.addGroupMembers(entry.id, add) : null),
                  () => (remove.length ? accountsApi.removeGroupMembers(entry.id, remove) : null)
                );
              }}>{busy ? t("classes.dlg.saving") : t("common.save")}</button>
            </span>
          </div>
        </Sheet>
      ) : null}

      {dialog?.kind === "newGroup" || dialog?.kind === "group" ? (
        <Sheet label={dialog.kind === "group" ? t("classes.dlg.editGroup", { name: dialog.group.shortName }) : t("classes.dlg.newGroup", { name: dialog.entry.name })} onClose={close}>
          <label className="grid gap-1 text-xs font-semibold text-soft-ink">{t("classes.dlg.groupName")}
            <input className={`${field} w-full`} autoFocus value={draft.name} maxLength={MAX_SUBGROUP_NAME} onChange={(event) => setDraft({ name: event.target.value })} placeholder={t("classes.dlg.groupNamePh")} />
          </label>
          <div className="flex items-center gap-2 text-xs font-semibold text-soft-ink">{t("classes.dlg.colour")} <ColourPicker value={draft.colour} onChange={(colour) => setDraft({ colour })} /></div>
          <div className="grid gap-1">
            <p className="m-0 text-xs font-semibold text-soft-ink">{t("classes.dlg.whoInGroup")}</p>
            <MemberPicker students={classMembers} selectedIds={draft.memberIds} onChange={(memberIds) => setDraft({ memberIds })} />
          </div>
          {dialog.kind === "group" ? <button type="button" className={`${ghostBtn} justify-self-start`} onClick={() => { close(); onOpenPage?.(`students?group=${dialog.group.id}&tab=access`); }}>{t("classes.dlg.groupSee")}</button> : null}
          {needsSubgroupStep ? <SetupNotice compact migration={SUBGROUPS_MIGRATION} title={t("classes.dlg.subgroupsDb")} /> : null}
          {error ? <p className="m-0 text-xs text-[var(--color-danger)]" role="alert">{error}</p> : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {dialog.kind === "group" ? (
              <button type="button" className={dangerBtn} disabled={busy} onClick={async () => {
                if (await askConfirm({ message: t("classes.dlg.confirmDeleteGroup", { name: dialog.group.shortName }), confirmLabel: t("classes.dlg.deleteGroup"), danger: true })) run(() => accountsApi.deleteGroup(dialog.group.id));
              }}>{t("classes.dlg.deleteGroup")}</button>
            ) : <span />}
            <span className="flex gap-2">
              <button type="button" className={ghostBtn} onClick={close}>{t("common.cancel")}</button>
              <button type="button" className={primaryBtn} disabled={busy || !draft.name.trim()} onClick={() => {
                if (dialog.kind === "newGroup") { run(() => accountsApi.createGroup({ name: draft.name, colour: draft.colour, memberIds: draft.memberIds, parentId: dialog.entry.id })); return; }
                const { group } = dialog;
                const add = draft.memberIds.filter((id) => !group.memberIds.includes(id));
                const remove = group.memberIds.filter((id) => !draft.memberIds.includes(id));
                run(
                  () => (draft.name !== group.shortName || draft.colour !== group.colour ? accountsApi.updateGroup(group.id, { name: draft.name, colour: draft.colour }) : null),
                  () => (add.length ? accountsApi.addGroupMembers(group.id, add) : null),
                  () => (remove.length ? accountsApi.removeGroupMembers(group.id, remove) : null)
                );
              }}>{busy ? t("classes.dlg.saving") : dialog.kind === "newGroup" ? t("classes.dlg.createGroup") : t("common.save")}</button>
            </span>
          </div>
        </Sheet>
      ) : null}
    </section>
  );
}
