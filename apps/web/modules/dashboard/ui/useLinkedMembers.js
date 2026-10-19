"use client";

import { useEffect, useState } from "react";
import { accountsApi } from "../../accounts/api";

const MAX_PAGES = 3; // 30 students per card: Home is a glance, the full list lives in My students

/** Reads the connected students (teacher / parent <-> student links only). `{ students: null while loading, setupNeeded, error }`. */
export function useConnectedStudents(enabled) {
  const [state, setState] = useState({ students: null, setupNeeded: false, error: "" });
  useEffect(() => {
    if (!enabled) { setState({ students: [], setupNeeded: false, error: "" }); return undefined; }
    let live = true;
    accountsApi.connections().then((result) => {
      if (!live) return;
      if (result.setupNeeded) { setState({ students: [], setupNeeded: true, error: "" }); return; }
      if (!result.ok) { setState({ students: [], setupNeeded: false, error: result.error }); return; }
      const list = (result.data.connections.accepted || []).filter((row) => row.kind === "teacher_student" || row.kind === "parent_student").map((row) => row.other).filter((other) => other.role === "student" && other.id);
      setState({ students: list, setupNeeded: false, error: "" });
    });
    return () => { live = false; };
  }, [enabled]);
  return state;
}

/** The teacher's groups (empty when groups are not set up yet). `null` while loading. */
export function useGroups(enabled) {
  const [groups, setGroups] = useState(null);
  useEffect(() => {
    if (!enabled) { setGroups([]); return undefined; }
    let live = true;
    accountsApi.groups().then((result) => { if (live) setGroups(result.ok ? result.data.groups || [] : []); });
    return () => { live = false; };
  }, [enabled]);
  return groups;
}

/**
 * The redacted workspace trees of a group's (or a set of students') members, a page at a time.
 * `spec` is `{ groupId }` or `{ studentIds }`; `key` changes when it should reload.
 */
export function useClassMembers(spec, key) {
  const [state, setState] = useState({ members: [], loading: true, error: "" });
  useEffect(() => {
    let live = true;
    (async () => {
      setState({ members: [], loading: true, error: "" });
      let offset = 0;
      let members = [];
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const result = await accountsApi.groupMembers({ ...spec, offset, limit: 10 });
        if (!live) return;
        if (!result.ok) { setState({ members, loading: false, error: result.error }); return; }
        members = [...members, ...(result.data.members || [])];
        if (!result.data.hasMore) break;
        offset = result.data.nextOffset;
      }
      if (live) setState({ members, loading: false, error: "" });
    })();
    return () => { live = false; };
  }, [key]);
  return state;
}
