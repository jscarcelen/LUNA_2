"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AREAS, KINDS, STATUSES, areaLabelOf, buildBrief, countByArea, shortId, titleOf } from "../../lib/feedbackCore.js";

/**
 * The owner's board: every piece of feedback as a card, filterable by status / area / kind, with the screenshot, the quoted
 * text and the part of the screen the tester pointed at. Select cards -> "Copy for Claude" builds the hand-off message
 * (what, where, which files, which prompts) and marks them "Sent to Claude". TEMPORARY — see modules/feedback/README.md.
 */
const KEY_STORAGE = "luna.feedback.adminKey";
const btn = "rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-semibold transition hover:bg-[#f5f5f7] disabled:opacity-40";
const primary = "rounded-full bg-[#0071e3] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0062c4] disabled:opacity-40";
const KIND_COLOUR = { idea: "#0071e3", problem: "#d70015", ui: "#8a4fd6", prompt: "#b25e00" };

export function FeedbackBoard() {
  const [key, setKey] = useState("");
  const [draftKey, setDraftKey] = useState("");
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("new");
  const [area, setArea] = useState("");
  const [kind, setKind] = useState("");
  const [picked, setPicked] = useState(() => new Set());
  const [brief, setBrief] = useState("");
  const [notice, setNotice] = useState("");

  const call = useCallback(async (path, options = {}, withKey = key) => {
    const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", "x-feedback-key": withKey, ...(options.headers || {}) } });
    return response;
  }, [key]);

  const load = useCallback(async (withKey = key) => {
    const response = await call("/api/feedback/admin", {}, withKey);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setItems(null);
      setError(data.error || "Could not load.");
      if (response.status === 401) { try { sessionStorage.removeItem(KEY_STORAGE); } catch { /* none */ } setKey(""); }
      return false;
    }
    setError(""); setItems(data.items || []);
    return true;
  }, [call, key]);

  useEffect(() => {
    try { const saved = sessionStorage.getItem(KEY_STORAGE); if (saved) setKey(saved); } catch { /* none */ }
  }, []);
  useEffect(() => { if (key) load(key); }, [key]);

  function unlock(event) {
    event.preventDefault();
    const value = draftKey.trim();
    if (!value) return;
    try { sessionStorage.setItem(KEY_STORAGE, value); } catch { /* none */ }
    setKey(value);
  }

  const counts = useMemo(() => Object.fromEntries(STATUSES.map((entry) => [entry.id, (items || []).filter((item) => item.status === entry.id).length])), [items]);
  const inStatus = useMemo(() => (items || []).filter((item) => status === "all" || item.status === status), [items, status]);
  const areas = useMemo(() => countByArea(inStatus), [inStatus]);
  const visible = useMemo(() => inStatus.filter((item) => (!area || item.area === area) && (!kind || item.kind === kind)), [inStatus, area, kind]);

  const toggle = (id) => setPicked((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const chosen = useMemo(() => (items || []).filter((item) => picked.has(item.id)), [items, picked]);

  async function patch(ids, body, message) {
    const response = await call("/api/feedback/admin", { method: "PATCH", body: JSON.stringify({ ids, ...body }) });
    if (!response.ok) { setNotice("Could not update that."); return false; }
    await load();
    if (message) setNotice(message);
    return true;
  }

  async function copyForClaude() {
    const text = buildBrief(chosen, { origin: window.location.origin });
    setBrief(text);
    try { await navigator.clipboard.writeText(text); setNotice(`Copied ${chosen.length} item${chosen.length === 1 ? "" : "s"}. Paste it into Claude Code${chosen.some((item) => item.has_screenshot) ? " and drag the screenshots in (Save screenshots)" : ""}.`); } catch { setNotice("Could not copy automatically — select the text below and copy it."); }
    const fresh = chosen.filter((item) => item.status === "new").map((item) => item.id);
    if (fresh.length) await patch(fresh, { status: "queued" });
  }

  async function saveScreenshots() {
    let saved = 0;
    for (const item of chosen.filter((entry) => entry.has_screenshot)) {
      const response = await call(`/api/feedback/admin?image=${item.id}`);
      if (!response.ok) continue;
      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `feedback-${shortId(item.id)}.${blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg"}`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 4000);
      saved += 1;
    }
    setNotice(saved ? `Saved ${saved} screenshot${saved === 1 ? "" : "s"} (named feedback-<id>, as the brief says).` : "None of the selected items has a screenshot.");
  }

  async function remove() {
    if (!window.confirm(`Delete ${chosen.length} feedback item${chosen.length === 1 ? "" : "s"} for good?`)) return;
    const response = await call("/api/feedback/admin", { method: "DELETE", body: JSON.stringify({ ids: chosen.map((item) => item.id) }) });
    if (response.ok) { setPicked(new Set()); await load(); setNotice("Deleted."); }
  }

  if (!key) {
    return (
      <main style={{ maxWidth: 420, margin: "14vh auto", padding: 16, fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>LUNA feedback</h1>
        <p style={{ color: "#6e6e73" }}>Owner board. Enter the feedback key (LUNA_FEEDBACK_ADMIN_KEY).</p>
        <form onSubmit={unlock} style={{ display: "grid", gap: 10 }}>
          <input type="password" autoComplete="off" value={draftKey} onChange={(event) => setDraftKey(event.target.value)} placeholder="Feedback key" style={{ padding: 12, borderRadius: 12, border: "1px solid #d2d2d7", fontSize: 16 }} />
          <button type="submit" className={primary}>Open the board</button>
        </form>
        {error ? <p role="alert" style={{ color: "#d70015" }}>{error}</p> : null}
      </main>
    );
  }

  return (
    <main className="tw-scope" style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 16px 120px", fontFamily: "system-ui", color: "#1d1d1f" }}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-2xl font-bold">LUNA feedback</h1>
          <p className="m-0 mt-1 text-sm text-[#6e6e73]">{(items || []).length} piece{(items || []).length === 1 ? "" : "s"} in total · {counts.new || 0} new</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={btn} onClick={() => load()}>Refresh</button>
          <button type="button" className={btn} onClick={() => { try { sessionStorage.removeItem(KEY_STORAGE); } catch { /* none */ } setKey(""); setItems(null); }}>Lock</button>
        </div>
      </header>

      {error ? <p role="alert" className="mt-3 rounded-2xl bg-[#fff1f0] p-3 text-sm text-[#d70015]">{error}</p> : null}
      {notice ? <p role="status" className="mt-3 rounded-2xl bg-[#e8f2ff] p-3 text-sm text-[#0058b0]">{notice}</p> : null}

      <nav className="mt-4 flex flex-wrap gap-2" aria-label="Status">
        {[...STATUSES, { id: "all", label: "All" }].map((entry) => (
          <button key={entry.id} type="button" onClick={() => { setStatus(entry.id); setArea(""); }} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${status === entry.id ? "bg-[#1d1d1f] text-white" : "border border-black/15 bg-white"}`}>
            {entry.label} <span className="opacity-60">{entry.id === "all" ? (items || []).length : counts[entry.id] || 0}</span>
          </button>
        ))}
      </nav>

      <section className="mt-3 flex flex-wrap items-center gap-2" aria-label="Where in the app">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6e6e73]">Where</span>
        <button type="button" onClick={() => setArea("")} className={`rounded-full px-3 py-1 text-xs font-semibold ${!area ? "bg-[#0071e3] text-white" : "border border-black/15 bg-white"}`}>Everywhere {inStatus.length}</button>
        {areas.map((entry) => (
          <button key={entry.key} type="button" onClick={() => setArea(area === entry.key ? "" : entry.key)} className={`rounded-full px-3 py-1 text-xs font-semibold ${area === entry.key ? "bg-[#0071e3] text-white" : "border border-black/15 bg-white"}`}>{entry.label} {entry.count}</button>
        ))}
        <span className="ml-2 text-[11px] font-semibold uppercase tracking-wider text-[#6e6e73]">Kind</span>
        {KINDS.map((entry) => (
          <button key={entry.id} type="button" onClick={() => setKind(kind === entry.id ? "" : entry.id)} className={`rounded-full px-3 py-1 text-xs font-semibold ${kind === entry.id ? "text-white" : "border border-black/15 bg-white"}`} style={kind === entry.id ? { background: KIND_COLOUR[entry.id] } : undefined}>{entry.label}</button>
        ))}
      </section>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <button type="button" className={btn} onClick={() => setPicked(new Set(visible.map((item) => item.id)))} disabled={!visible.length}>Select the {visible.length} shown</button>
        {picked.size ? <button type="button" className={btn} onClick={() => setPicked(new Set())}>Clear selection</button> : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items === null && !error ? <p className="text-sm text-[#6e6e73]">Loading…</p> : null}
        {items && !visible.length ? <p className="col-span-full rounded-2xl border border-black/10 bg-white p-6 text-center text-sm text-[#6e6e73]">Nothing here{status === "new" ? " — no new feedback" : ""}.</p> : null}
        {visible.map((item) => <Card key={item.id} item={item} selected={picked.has(item.id)} onToggle={() => toggle(item.id)} call={call} onStatus={(value) => patch([item.id], { status: value })} onNote={(note) => patch([item.id], { note })} />)}
      </div>

      {brief ? (
        <section className="mt-6">
          <h2 className="m-0 text-sm font-bold">The message for Claude</h2>
          <textarea readOnly value={brief} rows={14} className="mt-2 w-full rounded-2xl border border-black/12 bg-white p-3 font-mono text-xs" onFocus={(event) => event.target.select()} />
        </section>
      ) : null}

      {picked.size ? (
        <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-[860px] flex-wrap items-center justify-between gap-2 rounded-3xl border border-black/10 bg-white p-3 shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
          <strong className="px-2 text-sm">{picked.size} selected</strong>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primary} onClick={copyForClaude}>Copy for Claude</button>
            <button type="button" className={btn} onClick={saveScreenshots}>Save screenshots</button>
            <button type="button" className={btn} onClick={() => patch(chosen.map((item) => item.id), { status: "done" }, "Marked done.")}>Mark done</button>
            <button type="button" className={btn} onClick={() => patch(chosen.map((item) => item.id), { status: "dismissed" }, "Dismissed.")}>Dismiss</button>
            <button type="button" className={`${btn} !text-[#d70015]`} onClick={remove}>Delete</button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Card({ item, selected, onToggle, call, onStatus, onNote }) {
  const [image, setImage] = useState("");
  const [note, setNote] = useState(item.admin_note || "");
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    if (!item.has_screenshot) return undefined;
    let url = "";
    let alive = true;
    (async () => {
      const response = await call(`/api/feedback/admin?image=${item.id}`);
      if (!response.ok || !alive) return;
      url = URL.createObjectURL(await response.blob());
      if (alive) setImage(url);
    })();
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [item.id, item.has_screenshot]);
  const kind = KINDS.find((entry) => entry.id === item.kind);
  const files = AREAS[item.area]?.files || [];
  return (
    <article className={`grid content-start gap-2 rounded-3xl border bg-white p-4 ${selected ? "border-[#0071e3] shadow-[0_0_0_3px_rgba(0,113,227,0.18)]" : "border-black/10"}`}>
      <div className="flex items-start gap-2">
        <input type="checkbox" className="mt-1 size-4 accent-[#0071e3]" checked={selected} onChange={onToggle} aria-label={`Select feedback ${shortId(item.id)}`} />
        <div className="min-w-0 flex-1">
          <p className="m-0 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
            <span className="rounded-full px-2 py-0.5 text-white" style={{ background: KIND_COLOUR[item.kind] || "#6e6e73" }}>{kind?.label || item.kind}</span>
            <span className="rounded-full bg-[#f5f5f7] px-2 py-0.5">{areaLabelOf(item.area)}</span>
            {item.role ? <span className="text-[#6e6e73]">{item.role}</span> : null}
            <span className="text-[#6e6e73]">{new Date(item.created_at).toLocaleString()}</span>
          </p>
          <h3 className="m-0 mt-1 text-sm font-bold leading-snug">{titleOf(item)}</h3>
        </div>
      </div>
      {item.message && item.message.length > titleOf(item).length ? <p className="m-0 whitespace-pre-wrap text-sm text-[#3a3a3c]">{item.message}</p> : null}
      {item.quote ? <p className="m-0 rounded-xl bg-[#f5f5f7] p-2 text-xs"><strong>Selected text:</strong> “{item.quote}”</p> : null}
      {item.target ? <p className="m-0 rounded-xl bg-[#f5f5f7] p-2 text-xs"><strong>Pointed at:</strong> {item.target.text ? `“${item.target.text}”` : item.target.tag}{item.target.section ? ` · in “${item.target.section}”` : ""}<br /><code className="break-all text-[10px] text-[#6e6e73]">{item.target.selector}</code></p> : null}
      {item.context?.agent ? <p className="m-0 text-xs text-[#6e6e73]">Agent: <strong>{item.context.agent.name || item.context.agent.id}</strong>{item.context.run ? ` · ${item.context.run}` : ""}</p> : null}
      {item.has_screenshot ? (image ? (
        <img src={image} alt="Screenshot from the tester" className={`w-full cursor-zoom-in rounded-xl border border-black/10 object-cover object-top ${zoom ? "" : "max-h-48"}`} onClick={() => setZoom(!zoom)} />
      ) : <p className="m-0 text-xs text-[#6e6e73]">Loading screenshot…</p>) : null}
      <p className="m-0 text-[11px] text-[#6e6e73]">{item.viewport ? `Screen ${item.viewport}` : ""}{item.signed_in ? " · signed in" : " · demo"}{files[0] ? ` · ${files[0].replace("apps/web/", "")}` : ""} · #{shortId(item.id)}</p>
      <div className="flex flex-wrap items-center gap-2">
        <select className="rounded-full border border-black/15 bg-white px-3 py-1 text-xs font-semibold" value={item.status} onChange={(event) => onStatus(event.target.value)} aria-label="Status">
          {STATUSES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
        </select>
        <input className="min-w-0 flex-1 rounded-full border border-black/12 px-3 py-1 text-xs" value={note} placeholder="My note (goes in the brief)" onChange={(event) => setNote(event.target.value)} onBlur={() => { if (note !== (item.admin_note || "")) onNote(note); }} />
      </div>
    </article>
  );
}
