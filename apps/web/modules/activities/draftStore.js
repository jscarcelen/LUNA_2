/**
 * Where drafts are kept (browser only). Always in localStorage, keyed by account (or "guest") + activity, so
 * nothing is lost offline or before the database step; and, for a logged-in account and a saved quiz, on the
 * server (`/api/activities/drafts`) so the learner can continue on another device. Reading merges both copies
 * (`mergeDrafts`: the newest wins). See `drafts.js` for the shape.
 */
import { draftStorageKey, isDraftEmpty, mergeDrafts, parseDraft } from "./drafts.js";

const API = "/api/activities/drafts";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isServerKey = (key) => UUID.test(String(key || ""));

/** Who is asking, learned from the server once per page: { scope, server } (server = drafts can be stored there). */
let scopePromise = null;
let lastList = null;

function storage() {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}

async function getJson(url) {
  const response = await fetch(url, { credentials: "same-origin" });
  return response.json().catch(() => ({}));
}

/** The server's drafts (all of mine, or one activity's) and who I am. Never throws. */
async function serverDrafts(activityDocumentId = "") {
  try {
    const body = await getJson(activityDocumentId ? `${API}?activityDocumentId=${encodeURIComponent(activityDocumentId)}` : API);
    const scope = body?.account && body.scope ? String(body.scope) : "guest";
    const info = { scope, server: Boolean(body?.account) && !body?.setupNeeded, drafts: Array.isArray(body?.drafts) ? body.drafts : [] };
    if (!activityDocumentId) lastList = info;
    scopePromise = scopePromise || Promise.resolve({ scope: info.scope, server: info.server });
    return info;
  } catch {
    return { scope: "guest", server: false, drafts: [] };
  }
}

export function draftScope() {
  if (!scopePromise) scopePromise = serverDrafts().then(({ scope, server }) => ({ scope, server }));
  return scopePromise;
}

function readLocal(scope, key) {
  const store = storage();
  if (!store) return null;
  try { return parseDraft(store.getItem(draftStorageKey(scope, key))); } catch { return null; }
}

function writeLocal(scope, key, draft) {
  const store = storage();
  if (!store) return false;
  try { store.setItem(draftStorageKey(scope, key), JSON.stringify(draft)); return true; } catch { return false; }
}

function removeLocal(scope, key) {
  try { storage()?.removeItem(draftStorageKey(scope, key)); } catch { /* nothing to remove */ }
}

/** The draft to resume for one activity (`key` = its document id, or the activity id for an unsaved quiz). */
export async function loadDraft(key) {
  if (!key) return { scope: "guest", server: false, draft: null };
  if (isServerKey(key)) {
    const info = await serverDrafts(key);
    const remote = info.drafts.find((row) => row.activityDocumentId === key)?.draft || null;
    let local = readLocal(info.scope, key);
    // A copy that reached the server once and is no longer there was submitted (or dropped) on another device.
    if (info.server && !remote && local?.synced) { removeLocal(info.scope, key); local = null; }
    return { scope: info.scope, server: info.server, draft: mergeDrafts(local, remote) };
  }
  const { scope } = await draftScope();
  return { scope, server: false, draft: readLocal(scope, key) };
}

/**
 * Saves a draft: in this browser, then on the server when it can. `keepalive` lets the request finish while the
 * page is being hidden or closed. Resolves to "server" | "local" | "error".
 */
export async function storeDraft({ scope, server, key, draft, keepalive = false }) {
  if (!key || !draft || isDraftEmpty(draft)) return "error";
  const local = writeLocal(scope, key, draft);
  if (!server || !isServerKey(key)) return local ? "local" : "error";
  try {
    const response = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", keepalive, body: JSON.stringify({ activityDocumentId: key, draft }) });
    if (response.ok) { writeLocal(scope, key, { ...draft, synced: true }); return "server"; }
    return local ? "local" : "error";
  } catch {
    return local ? "local" : "error";
  }
}

/** After submitting (or "start again"): the draft is gone everywhere. */
export async function clearDraft({ scope, server, key }) {
  if (!key) return;
  removeLocal(scope, key);
  if (lastList) lastList = { ...lastList, drafts: lastList.drafts.filter((row) => row.activityDocumentId !== key) };
  if (!server || !isServerKey(key)) return;
  try { await fetch(`${API}?activityDocumentId=${encodeURIComponent(key)}`, { method: "DELETE", credentials: "same-origin", keepalive: true }); } catch { /* the next submit or save replaces it */ }
}

/** Every draft I have (for the Practice list): Map(activity key -> draft), server and browser copies merged. */
export async function loadAllDrafts() {
  const info = await serverDrafts();
  const out = new Map();
  for (const row of info.drafts) { const draft = parseDraft(row.draft); if (draft) out.set(row.activityDocumentId, draft); }
  const store = storage();
  if (store) {
    const prefix = draftStorageKey(info.scope, "");
    const names = [];
    for (let index = 0; index < store.length; index += 1) names.push(store.key(index));
    for (const name of names) {
      if (!name || !name.startsWith(prefix)) continue;
      const key = name.slice(prefix.length);
      const local = readLocal(info.scope, key);
      if (info.server && isServerKey(key) && !out.has(key) && local?.synced) { removeLocal(info.scope, key); continue; }
      const merged = mergeDrafts(local, out.get(key) || null);
      if (merged && !isDraftEmpty(merged)) out.set(key, merged);
    }
  }
  return out;
}
