"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { accountsApi } from "./api";
import { SHARING_MIGRATION, SetupNotice } from "./SetupNotice";
import { selectionStats, skipReasonOf, summarizeResults, summaryLine } from "./groups";
import { classifyDeliverable, sharedInfoOf } from "./shared";
import { field, ghostBtn, kicker, primaryBtn } from "./ui";
import { useT } from "../../lib/i18n/LocaleProvider.js";

/** What can be shared, and how. Files, folders and topics are shared LIVE (with a permission); the rest as a copy. */
const LIVE_KINDS = ["document", "folder", "subject"];
const KIND_WORD = { document: "file", folder: "folder", subject: "topic", agent: "agent", template: "template", component: "component" };

const PERMISSIONS = [
  ["view", "dialogs.share.canView", "dialogs.share.viewHelp"],
  ["edit", "dialogs.share.canEdit", "dialogs.share.editHelp"]
];

const who = (person) => person.displayName || person.email;
const skipLabel = (entry, t) => (skipReasonOf(entry) === "not_connected" ? t("dialogs.share.notConnected") : entry.error || t("dialogs.share.failed"));

/**
 * "Share…": send something to people you are connected to (and only them; the server checks again).
 *
 *  - a file, a folder (with everything in it, also what is added later), a topic or a study plan: a LIVE share
 *    with a permission. You stay the owner; they see the original under "Shared with me / <your name>".
 *    The "People with access" list lets you change or take away access at any time.
 *  - an agent, a template or a component: they get their own copy (no live sync).
 *  - a teacher or parent can also ASSIGN an activity or a study plan to a connected student, with a due date
 *    (that sends a read-only copy, as before).
 *
 * `item` = { kind, id, name, document?, component? }. (`document` alone is still accepted for older callers.)
 */
export function ShareDialog({ account, item: itemProp, document: legacyDocument, onClose, onDone }) {
  const item = useMemo(() => itemProp || (legacyDocument ? { kind: "document", id: legacyDocument.id, name: legacyDocument.name, document: legacyDocument } : null), [itemProp, legacyDocument]);
  const t = useT();
  const live = LIVE_KINDS.includes(item?.kind);
  const word = t(`dialogs.share.kind.${KIND_WORD[item?.kind] || "item"}`);

  const [connections, setConnections] = useState(null);
  const [setup, setSetup] = useState(null);
  // `item.initial` ({ mode, groupIds, recipientIds }) opens the dialog already set up, e.g. "Send practice to this class" from Home.
  const [picked, setPicked] = useState(() => itemProp?.initial?.recipientIds || []);
  const [mode, setMode] = useState(() => itemProp?.initial?.mode || "share");
  const [permission, setPermission] = useState("view");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [access, setAccess] = useState(null);
  // Groups of students (teacher / parent): choosing a group selects all its currently connected members.
  const [groups, setGroups] = useState([]);
  const [groupIds, setGroupIds] = useState(() => itemProp?.initial?.groupIds || []);
  const [outcome, setOutcome] = useState(null);

  useEffect(() => {
    if (account.role !== "teacher" && account.role !== "parent") return undefined;
    let alive = true;
    accountsApi.groups().then((result) => { if (alive && result.ok) setGroups(result.data.groups || []); });
    return () => { alive = false; };
  }, [account.role]);

  useEffect(() => {
    let alive = true;
    accountsApi.connections().then((result) => {
      if (!alive) return;
      if (result.setupNeeded) setSetup({ migration: result.migration || "", title: t("dialogs.setup.title") });
      else if (!result.ok) setError(result.error);
      else setConnections(result.data.connections);
    });
    return () => { alive = false; };
  }, []);

  const loadAccess = useCallback(async () => {
    if (!live || !item?.id) return;
    const result = await accountsApi.grantsOn(item.kind, item.id);
    if (result.ok) setAccess(result.data.grants || []);
    else if (result.status !== 404) setAccess([]);
  }, [item?.kind, item?.id, live]);
  useEffect(() => { loadAccess(); }, [loadAccess]);

  const document = item?.document || null;
  const notMine = Boolean(sharedInfoOf(document));
  const deliverable = item?.kind === "document" && document ? classifyDeliverable(document, "share", t) : { ok: !notMine };
  const canAssignRole = account.role === "teacher" || account.role === "parent";
  const assignable = item?.kind === "document" && document && canAssignRole && classifyDeliverable(document, "assign").ok;

  const rows = useMemo(() => (connections?.accepted || []).filter((row) => row.other.id && (mode !== "assign" || (row.other.role === "student" && row.kind !== "peer"))), [connections, mode]);
  const people = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => !needle || `${row.other.displayName} ${row.other.email}`.toLowerCase().includes(needle));
  }, [rows, query]);
  const accessByPerson = useMemo(() => new Map((access || []).map((entry) => [entry.grantee.id, entry])), [access]);

  const toggle = (id) => setPicked((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  const eligible = picked.filter((id) => rows.some((row) => row.other.id === id));
  const toggleGroup = (id) => setGroupIds((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  const groupMap = useMemo(() => new Map(groups.map((group) => [group.id, { name: group.name, memberIds: group.memberIds }])), [groups]);
  // "Group A (12) + 2 individuals": a person in several chosen groups (or also ticked by hand) counts once.
  const stats = useMemo(() => selectionStats({ groupIds, individualIds: eligible, groups: groupMap }, t), [groupIds, eligible, groupMap]);
  const nameById = useMemo(() => new Map((connections?.accepted || []).map((row) => [row.other.id, who(row.other)])), [connections]);

  const handle = (result) => {
    if (result.setupNeeded) { setSetup({ migration: result.migration || SHARING_MIGRATION, title: t("dialogs.share.dbStep") }); return false; }
    if (!result.ok) { setError(result.error); return false; }
    return true;
  };

  async function send() {
    setBusy(true);
    setError("");
    setSuccess("");
    setOutcome(null);
    let result;
    if (mode === "assign") result = await accountsApi.send({ mode: "assign", documentId: item.id, recipientIds: eligible, groupIds, dueDate, note });
    else if (live) result = await accountsApi.shareLive({ kind: item.kind, itemId: item.id, recipientIds: eligible, groupIds, permission });
    else result = await accountsApi.shareCopy({ kind: item.kind, id: item.id, component: item.component, recipientIds: eligible, groupIds });
    setBusy(false);
    if (!handle(result)) return;
    const results = result.data.results || [];
    const summary = result.data.summary || summarizeResults(results);
    const what = mode === "assign" ? "assigned" : live ? (permission === "edit" ? "sharedEdit" : "sharedView") : "copy";
    // Per person: delivered, or skipped (not connected any more / already has it / failed).
    const message = t(`dialogs.share.done.${what}`, { name: item.name, summary: summaryLine(summary, t) });
    onDone?.(message);
    const skipped = results.filter((entry) => !entry.ok || entry.alreadyHadIt);
    if (skipped.length || summary.deferred || groupIds.length) {
      setOutcome({ summary, skipped });
      setSuccess(message);
      setPicked([]);
      setGroupIds([]);
      if (live && mode === "share") await loadAccess();
    } else if (live && mode === "share") {
      setSuccess(message);
      setPicked([]);
      await loadAccess();
    } else onClose?.();
  }

  async function changeAccess(entry, next) {
    setError("");
    const result = next === "remove" ? await accountsApi.revokeGrant(entry.id) : await accountsApi.changePermission(entry.id, next);
    if (handle(result)) { setSuccess(t(next === "remove" ? "dialogs.share.noAccess" : next === "edit" ? "dialogs.share.nowEdit" : "dialogs.share.nowView", { name: who(entry.grantee) })); await loadAccess(); }
  }

  if (!item) return null;
  const heading = mode === "assign" ? t("dialogs.share.assign") : t("dialogs.share.shareWith"); 
  const noOne = connections && !rows.length;

  return (
    <div className="tw-scope fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={t("common.share")} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-[0_24px_64px_rgba(0,0,0,0.25)]" onClick={(event) => event.stopPropagation()}>
        <p className={kicker}>{heading} · {word}</p>
        <h3 className="m-0 mt-1 truncate text-base font-bold text-ink">{item.name}</h3>

        {setup ? <div className="mt-3"><SetupNotice compact migration={setup.migration || SHARING_MIGRATION} title={setup.title} /></div> : !deliverable.ok ? (
          <p className="m-0 mt-3 text-sm text-soft-ink">{notMine ? t("dialogs.share.notMine") : deliverable.error}</p>
        ) : (
          <div className="mt-3 grid gap-3">
            {assignable ? (
              <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t("dialogs.share.howToSend")}>
                {[["share", t("dialogs.share.tabShare")], ["assign", t("dialogs.share.tabAssign")]].map(([value, label]) => (
                  <button key={value} type="button" role="tab" aria-selected={mode === value} onClick={() => { setMode(value); setPicked([]); }} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${mode === value ? "border-transparent bg-ink text-white" : "border-ink/15 bg-white text-soft-ink"}`}>{label}</button>
                ))}
              </div>
            ) : null}

            {groups.length ? (
              <div>
                <p className={`${kicker} mb-1.5`}>{t("dialogs.share.groups")}</p>
                <ul className="m-0 grid max-h-40 list-none gap-1 overflow-y-auto p-0">
                  {groups.map((group) => (
                    <li key={group.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-ink/10 px-3 py-2 text-sm">
                        <input type="checkbox" checked={groupIds.includes(group.id)} onChange={() => toggleGroup(group.id)} disabled={!group.memberCount} />
                        <span className="size-2 shrink-0 rounded-full" style={{ background: group.colour }} />
                        <span className="min-w-0 flex-1 truncate font-semibold text-ink">{group.name}</span>
                        <span className="text-[11px] text-soft-ink">{t.plural("dialogs.share.studentCount", group.memberCount)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="m-0 mt-1 text-[11px] text-soft-ink">{t("dialogs.share.groupHint")}</p>
              </div>
            ) : null}

            <div>
              <p className={`${kicker} mb-1.5`}>{groups.length ? (mode === "assign" ? t("dialogs.share.andStudents") : t("dialogs.share.andPeople")) : mode === "assign" ? t("dialogs.share.yourStudents") : t("dialogs.share.connectedPeople")}</p>
              {connections === null ? <p className="m-0 text-sm text-soft-ink">{t("common.loading")}</p> : rows.length ? (
                <>
                  {rows.length > 6 ? <input className={`${field} mb-1.5 w-full`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("dialogs.share.searchNetwork")} aria-label={t("dialogs.share.searchNetwork")} /> : null}
                  <ul className="m-0 grid max-h-52 list-none gap-1 overflow-y-auto p-0">
                    {people.map((row) => {
                      const has = accessByPerson.get(row.other.id);
                      return (
                        <li key={row.other.id}>
                          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-ink/10 px-3 py-2 text-sm">
                            <input type="checkbox" checked={picked.includes(row.other.id)} onChange={() => toggle(row.other.id)} />
                            <span className="min-w-0 flex-1 truncate font-semibold text-ink">{who(row.other)}</span>
                            {has && mode === "share" ? <span className="text-[11px] text-[var(--accent-ink)]">{has.permission === "edit" ? t("dialogs.share.canEditLower") : t("dialogs.share.canViewLower")}</span> : null}
                            <span className="text-[11px] text-soft-ink">{["student", "teacher", "parent"].includes(row.other.role) ? t(`shell.role.${row.other.role}`) : ""}</span>
                          </label>
                        </li>
                      );
                    })}
                    {!people.length ? <li className="px-1 py-2 text-sm text-soft-ink">{t("dialogs.share.nobody", { query })}</li> : null}
                  </ul>
                </>
              ) : <p className="m-0 text-sm text-soft-ink">{noOne && mode === "assign" ? t("dialogs.share.noStudents") : t("dialogs.share.noOne")} {t("dialogs.share.addIn")} <strong>{t("dialogs.share.connections")}</strong>{t("dialogs.share.acceptFirst")}</p>}
            </div>

            {mode === "share" && live ? (
              <fieldset className="m-0 grid gap-1.5 border-0 p-0">
                <legend className={`${kicker} mb-1.5 p-0`}>{t("dialogs.share.whatCan")}</legend>
                {PERMISSIONS.map(([value, label, help]) => (
                  <label key={value} className={`flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-sm ${permission === value ? "border-[var(--accent)] bg-[rgba(0,113,227,0.05)]" : "border-ink/10"}`}>
                    <input type="radio" name="luna-share-permission" className="mt-1" checked={permission === value} onChange={() => setPermission(value)} />
                    <span><span className="block font-semibold text-ink">{t(label)}</span><span className="block text-[11px] text-soft-ink">{t(help)}</span></span>
                  </label>
                ))}
              </fieldset>
            ) : null}

            {mode === "assign" ? (
              <label className="grid gap-1 text-xs font-semibold text-soft-ink">
                {t("dialogs.share.dueOptional")}
                <input className={field} type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                <span className="text-[11px] font-normal text-soft-ink">{t("dialogs.share.dueHelp", { name: account.displayName })}</span>
              </label>
            ) : null}
            {mode === "assign" ? (
              <label className="grid gap-1 text-xs font-semibold text-soft-ink">
                {t("dialogs.share.messageOptional")}
                <input className={field} value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder={t("dialogs.share.messagePlaceholder")} />
              </label>
            ) : null}

            <p className="m-0 text-[11px] text-soft-ink">
              {mode === "assign"
                ? t("dialogs.share.infoAssign", { name: account.displayName })
                : live
                  ? t("dialogs.share.infoLive", { name: account.displayName, extra: item.kind === "folder" || item.kind === "subject" ? t("dialogs.share.infoFolder") : item.document?.tags?.includes("study-plan") ? t("dialogs.share.infoPlan") : "" })
                  : t("dialogs.share.infoCopy", { word })}
            </p>

            {stats.people ? <p className="m-0 text-xs font-semibold text-ink" role="status">{stats.line ? `${stats.line} · ` : ""}{t.plural("dialogs.share.total", stats.people)}</p> : null}
            {success ? <p className="m-0 text-xs text-[var(--accent-ink)]" role="status">{success}</p> : null}
            {outcome?.skipped?.length ? (
              <ul className="m-0 grid max-h-32 list-none gap-0.5 overflow-y-auto p-0 text-[11px] text-soft-ink">
                {outcome.skipped.slice(0, 30).map((entry) => <li key={entry.recipientId}>{nameById.get(entry.recipientId) || t("dialogs.bell.someone")}: {entry.alreadyHadIt ? t("dialogs.share.alreadyHas") : entry.deferred ? t("dialogs.share.notProcessed") : skipLabel(entry, t)}</li>)}
              </ul>
            ) : null}
            {error ? <p className="m-0 text-xs text-[var(--color-danger)]" role="alert">{error}</p> : null}

            {live && access?.length ? (
              <div>
                <p className={`${kicker} mb-1.5`}>{t("dialogs.share.peopleWithAccess")}</p>
                <ul className="m-0 grid list-none gap-1 p-0">
                  {access.map((entry) => (
                    <li key={entry.id} className="flex items-center gap-2 rounded-xl border border-ink/10 px-3 py-1.5 text-sm">
                      <span className="min-w-0 flex-1 truncate font-semibold text-ink">{who(entry.grantee)}</span>
                      <select className={`${field} py-1 text-xs`} value={entry.permission} aria-label={t("dialogs.share.whatCanPerson", { name: who(entry.grantee) })} onChange={(event) => changeAccess(entry, event.target.value)}>
                        <option value="view">{t("dialogs.share.canView")}</option>
                        <option value="edit">{t("dialogs.share.canEdit")}</option>
                      </select>
                      <button type="button" className={ghostBtn} onClick={() => changeAccess(entry, "remove")}>{t("common.remove")}</button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onClose}>{success ? t("common.done") : t("common.cancel")}</button>
          {deliverable.ok && !setup ? <button type="button" className={primaryBtn} disabled={busy || !stats.people} onClick={send}>{busy ? t("dialogs.notice.sending") : mode === "assign" ? t("dialogs.share.assign") : live ? t("common.share") : t("dialogs.share.sendCopy")}</button> : null}
        </div>
      </div>
    </div>
  );
}
