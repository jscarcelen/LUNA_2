"use client";

import { useMemo, useState } from "react";
import { accountsApi } from "./api";
import { GROUP_COLOURS, MAX_GROUP_MEMBERS, MAX_GROUP_NAME } from "./groups";
import { GROUPS_MIGRATION, SetupNotice } from "./SetupNotice";
import { dangerBtn, field, ghostBtn, kicker, primaryBtn } from "./ui";

const label = (person) => person.displayName || person.email;

/** A small coloured dot per group a student is in (shown on the student chip). */
export function GroupDots({ groups = [] }) {
  if (!groups.length) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5" aria-hidden="true">
      {groups.slice(0, 4).map((group) => <span key={group.id} className="size-2 rounded-full ring-1 ring-white" style={{ background: group.colour }} title={group.name} />)}
      {groups.length > 4 ? <span className="text-[9px] font-semibold text-soft-ink">+{groups.length - 4}</span> : null}
    </span>
  );
}

export function ColourPicker({ value, onChange }) {
  return (
    <span className="inline-flex items-center gap-1" role="radiogroup" aria-label="Group colour">
      {GROUP_COLOURS.map((colour) => (
        <button key={colour} type="button" role="radio" aria-checked={value === colour} aria-label={`Colour ${colour}`} onClick={() => onChange(colour)} className={`size-5 rounded-full ${value === colour ? "ring-2 ring-ink/50 ring-offset-1" : ""}`} style={{ background: colour }} />
      ))}
    </span>
  );
}

/** A searchable checkbox list of students. */
export function MemberPicker({ students, selectedIds, onChange, max = MAX_GROUP_MEMBERS }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return students.filter((student) => !needle || `${student.displayName} ${student.email}`.toLowerCase().includes(needle));
  }, [students, query]);
  const toggle = (id) => onChange(selectedIds.includes(id) ? selectedIds.filter((entry) => entry !== id) : selectedIds.length >= max ? selectedIds : [...selectedIds, id]);
  return (
    <div className="grid gap-1.5">
      {students.length > 6 ? <input className={`${field} w-full`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search students" aria-label="Search students" /> : null}
      <ul className="m-0 grid max-h-48 list-none gap-0.5 overflow-y-auto p-0">
        {shown.map((student) => (
          <li key={student.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-[var(--surface-soft)]">
              <input type="checkbox" checked={selectedIds.includes(student.id)} onChange={() => toggle(student.id)} />
              <span className="min-w-0 flex-1 truncate text-ink">{label(student)}</span>
            </label>
          </li>
        ))}
        {!shown.length ? <li className="px-2 py-1 text-xs text-soft-ink">{students.length ? `Nobody matches “${query}”.` : "No connected students yet."}</li> : null}
      </ul>
      <p className="m-0 text-[11px] text-soft-ink">{selectedIds.length} selected · a group holds up to {max} students</p>
    </div>
  );
}

/**
 * The Groups bar above the student chips: "All students" and a chip per group (selecting one switches the view to
 * that group), "+ New group", and, for the selected group, rename / colour / members / delete. Deleting a group never
 * deletes a student.
 */
export function GroupsBar({ groups, students, groupId, onSelectGroup, onChanged, setup, noun }) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", colour: GROUP_COLOURS[0], memberIds: [] });
  const [editing, setEditing] = useState(null); // { name, colour, memberIds } for the selected group
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = groups.find((group) => group.id === groupId) || null;

  async function run(call, after) {
    setBusy(true);
    setError("");
    const result = await call();
    setBusy(false);
    if (!result.ok) { setError(result.error); return false; }
    onChanged?.(result.data);
    after?.(result.data);
    return true;
  }

  if (setup) {
    return (
      <div className="grid gap-2">
        <p className={kicker}>Groups</p>
        <SetupNotice compact migration={setup.migration || GROUPS_MIGRATION} title="Groups need one database step" />
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Groups">
        <span className={`${kicker} mr-1`}>Groups</span>
        <button type="button" role="tab" aria-selected={!groupId} onClick={() => onSelectGroup("")} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${!groupId ? "border-transparent bg-ink text-white" : "border-ink/15 bg-white text-soft-ink hover:bg-[var(--surface-soft)]"}`}>
          All {noun}s <span className="opacity-70">{students.length}</span>
        </button>
        {groups.map((group) => (
          <button key={group.id} type="button" role="tab" aria-selected={group.id === groupId} onClick={() => onSelectGroup(group.id)} className={`inline-flex max-w-[14rem] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${group.id === groupId ? "border-transparent bg-ink text-white" : "border-ink/15 bg-white text-soft-ink hover:bg-[var(--surface-soft)]"}`}>
            <span className="size-2 shrink-0 rounded-full" style={{ background: group.colour }} />
            <span className="truncate">{group.name}</span>
            <span className="opacity-70">{group.memberCount}</span>
          </button>
        ))}
        <button type="button" className={ghostBtn} onClick={() => { setCreating((value) => !value); setError(""); }}>{creating ? "Cancel" : "＋ New group"}</button>
      </div>

      {creating ? (
        <div className="grid gap-2 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent-soft)]/30 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input className={`${field} min-w-[12rem] flex-1`} value={draft.name} maxLength={MAX_GROUP_NAME} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Group name, e.g. Class 3B" aria-label="Group name" />
            <ColourPicker value={draft.colour} onChange={(colour) => setDraft({ ...draft, colour })} />
          </div>
          <p className="m-0 text-[11px] font-semibold text-soft-ink">Who is in it (you can change this later; a student can be in several groups)</p>
          <MemberPicker students={students} selectedIds={draft.memberIds} onChange={(memberIds) => setDraft({ ...draft, memberIds })} />
          <div className="flex justify-end">
            <button type="button" className={primaryBtn} disabled={busy || !draft.name.trim()} onClick={() => run(() => accountsApi.createGroup(draft), (data) => { setCreating(false); setDraft({ name: "", colour: GROUP_COLOURS[0], memberIds: [] }); if (data.group?.id) onSelectGroup(data.group.id); })}>{busy ? "Creating…" : "Create group"}</button>
          </div>
        </div>
      ) : null}

      {selected ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-soft-ink">
          <span>{selected.memberCount} {selected.memberCount === 1 ? noun : `${noun}s`} in this group</span>
          <button type="button" className={ghostBtn} onClick={() => setEditing(editing ? null : { name: selected.name, colour: selected.colour, memberIds: selected.memberIds })}>{editing ? "Close" : "Edit group…"}</button>
          {confirmDelete ? (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              Delete “{selected.name}”? The {noun}s are not deleted or disconnected.
              <button type="button" className={dangerBtn} disabled={busy} onClick={() => run(() => accountsApi.deleteGroup(selected.id), () => { setConfirmDelete(false); setEditing(null); onSelectGroup(""); })}>Delete group</button>
              <button type="button" className={ghostBtn} onClick={() => setConfirmDelete(false)}>Keep</button>
            </span>
          ) : <button type="button" className={ghostBtn} onClick={() => setConfirmDelete(true)}>Delete group</button>}
        </div>
      ) : null}

      {selected && editing ? (
        <div className="grid gap-2 rounded-2xl border border-ink/10 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input className={`${field} min-w-[12rem] flex-1`} value={editing.name} maxLength={MAX_GROUP_NAME} onChange={(event) => setEditing({ ...editing, name: event.target.value })} aria-label="Rename group" />
            <ColourPicker value={editing.colour} onChange={(colour) => setEditing({ ...editing, colour })} />
          </div>
          <MemberPicker students={students} selectedIds={editing.memberIds} onChange={(memberIds) => setEditing({ ...editing, memberIds })} />
          <div className="flex justify-end">
            <button type="button" className={primaryBtn} disabled={busy || !editing.name.trim()} onClick={async () => {
              setBusy(true);
              setError("");
              const renamed = await accountsApi.updateGroup(selected.id, { name: editing.name, colour: editing.colour });
              if (!renamed.ok) { setBusy(false); setError(renamed.error); return; }
              const add = editing.memberIds.filter((id) => !selected.memberIds.includes(id));
              const remove = selected.memberIds.filter((id) => !editing.memberIds.includes(id));
              let last = renamed;
              if (add.length) last = await accountsApi.addGroupMembers(selected.id, add);
              if (last.ok && remove.length) last = await accountsApi.removeGroupMembers(selected.id, remove);
              setBusy(false);
              if (!last.ok) { setError(last.error); return; }
              onChanged?.(last.data);
              setEditing(null);
            }}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </div>
      ) : null}

      {error ? <p className="m-0 text-xs text-[var(--color-danger)]" role="alert">{error}</p> : null}
    </div>
  );
}

/**
 * The per-student "Groups…" multi-select: tick the groups this student belongs to. A student can be in several.
 */
export function StudentGroupsMenu({ student, groups, memberOf, onChanged, noun }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(memberOf);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!groups.length) return null;
  return (
    <span className="relative inline-block">
      <button type="button" className={ghostBtn} aria-expanded={open} onClick={() => { setPicked(memberOf); setOpen((value) => !value); setError(""); }}>Groups…{memberOf.length ? ` (${memberOf.length})` : ""}</button>
      {open ? (
        <div role="dialog" aria-label={`Groups of ${label(student)}`} className="absolute left-0 top-full z-20 mt-1 grid w-64 gap-1.5 rounded-2xl border border-ink/10 bg-white p-3 shadow-[0_12px_40px_rgba(0,0,0,0.16)]">
          <p className="m-0 text-[11px] font-semibold text-soft-ink">Groups of {label(student)}</p>
          {groups.map((group) => (
            <label key={group.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-0.5 text-sm hover:bg-[var(--surface-soft)]">
              <input type="checkbox" checked={picked.includes(group.id)} onChange={() => setPicked((current) => (current.includes(group.id) ? current.filter((id) => id !== group.id) : [...current, group.id]))} />
              <span className="size-2 shrink-0 rounded-full" style={{ background: group.colour }} />
              <span className="min-w-0 flex-1 truncate">{group.name}</span>
            </label>
          ))}
          {error ? <p className="m-0 text-xs text-[var(--color-danger)]" role="alert">{error}</p> : null}
          <div className="flex justify-end gap-1.5">
            <button type="button" className={ghostBtn} onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className={primaryBtn} disabled={busy} onClick={async () => {
              setBusy(true);
              const result = await accountsApi.setMemberGroups(student.id, picked);
              setBusy(false);
              if (!result.ok) { setError(result.error); return; }
              onChanged?.(result.data);
              setOpen(false);
            }}>{busy ? "Saving…" : "Save"}</button>
          </div>
          <p className="m-0 text-[10px] text-soft-ink">A {noun} can be in several groups.</p>
        </div>
      ) : null}
    </span>
  );
}
