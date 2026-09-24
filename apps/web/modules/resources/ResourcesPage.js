"use client";

import { useEffect, useMemo, useState } from "react";
import { ActivityPlayer } from "../activities/ActivityPlayer";
import { TemplateThumbnail } from "../template-studio/TemplateThumbnail";
import { RESOURCE_TAG, isFavourite, parseResource, resourceDifficulty, resourceStats, resourceTags } from "./resource";
import { SKILLS } from "../activities/engine/activity";
import { ResourceExports } from "./ResourceExports";
import { addLearner, defaultLearner, readLearners } from "../performance/learners";
import { PhoneCollapse } from "../ui/PhoneCollapse";

const card = "rounded-[18px] border border-ink/8 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";
const primaryBtn = "inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed] disabled:opacity-50";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-[var(--surface-soft)]";
const chip = "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold";
const field = "rounded-xl border border-ink/12 bg-white px-3 py-1.5 text-xs text-ink";

function ResourceThumb({ template }) {
  if (template) return <TemplateThumbnail template={template} width={150} />;
  return <div className="grid h-[212px] w-[150px] shrink-0 place-items-center rounded-lg border border-dashed border-ink/20 bg-[var(--surface-soft)] text-[11px] text-soft-ink">Interactive only</div>;
}

/**
 * Resources — every generated document: filter and organise them, do them on Luna, download any
 * view/format of their template, regenerate or re-template them, move them between folders.
 */
export function ResourcesPage({ role = "student", profileName = "", workspaces = [], selectedWorkspaceId, selectedSubjectId, templates = [], onSaveGeneratedQuizDocument, onUpdateGeneratedDocument, onUpdateDocumentMeta, onRemoveDocument, onCreateFolder, onOpenResource }) {
  const subject = workspaces.find((w) => w.id === selectedWorkspaceId)?.subjects?.find((s) => s.id === selectedSubjectId) || null;
  const documents = subject?.documents || [];
  const folders = subject?.folders || [];
  const [view, setView] = useState("gallery");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({ agent: "", template: "", source: "", folder: "", tag: "", favourite: false });
  const [openId, setOpenId] = useState("");
  const [playing, setPlaying] = useState(null);
  const [tab, setTab] = useState("do");
  const [status, setStatus] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const [creating, setCreating] = useState(false);
  const [learner, setLearner] = useState("");
  const [learners, setLearners] = useState([]);
  useEffect(() => { setLearners(readLearners()); setLearner(defaultLearner(role, profileName)); }, [role, profileName]);

  const rows = useMemo(() => documents.map((document) => ({ document, resource: parseResource(document) })).filter((row) => row.resource), [documents]);
  const templateById = useMemo(() => Object.fromEntries(templates.map((template) => [template.id, template])), [templates]);
  const agents = [...new Set(rows.map((row) => row.resource.meta.agentName).filter(Boolean))];
  const usedTemplates = [...new Set(rows.map((row) => row.resource.meta.templateName).filter(Boolean))];
  const sources = [...new Set(rows.flatMap((row) => row.resource.meta.sourceNames || []))];
  const allTags = [...new Set(rows.flatMap((row) => resourceTags(row.document)))];

  const visible = rows.filter(({ document, resource }) => {
    const term = query.trim().toLowerCase();
    if (term && !`${resource.name} ${resource.meta.agentName} ${resource.meta.templateName} ${(resource.meta.sourceNames || []).join(" ")} ${resourceTags(document).join(" ")}`.toLowerCase().includes(term)) return false;
    if (filters.agent && resource.meta.agentName !== filters.agent) return false;
    if (filters.template && resource.meta.templateName !== filters.template) return false;
    if (filters.source && !(resource.meta.sourceNames || []).includes(filters.source)) return false;
    if (filters.folder && !(document.folderIds || []).includes(filters.folder)) return false;
    if (filters.tag && !resourceTags(document).includes(filters.tag)) return false;
    if (filters.favourite && !isFavourite(document)) return false;
    return true;
  }).sort((a, b) => String(b.resource.createdAt).localeCompare(String(a.resource.createdAt)));

  const open = rows.find((row) => row.document.id === openId) || null;
  const openStats = open ? resourceStats(open.document.id, open.resource.activity?.id, documents) : null;

  async function persistResource(row, nextResource) {
    if (!onUpdateGeneratedDocument) return;
    const content = JSON.stringify(nextResource, null, 2);
    try {
      await onUpdateGeneratedDocument(row.document.id, { file: { name: row.document.name, content, sizeBytes: content.length } });
      setStatus("Classification saved.");
    } catch (error) {
      setStatus(String(error.message || error));
    }
  }
  function classify(row, questionId, patch) {
    const activity = row.resource.activity;
    if (!activity) return;
    const next = { ...row.resource, activity: { ...activity, questions: activity.questions.map((question) => (question.id === questionId ? { ...question, ...patch } : question)) } };
    persistResource(row, next);
  }
  function bulkClassify(row, patch) {
    const activity = row.resource.activity;
    if (!activity) return;
    persistResource(row, { ...row.resource, activity: { ...activity, questions: activity.questions.map((question) => ({ ...question, ...patch })) } });
  }

  async function createFolder(parentFolderId = "") {
    const name = newFolder.trim();
    if (!onCreateFolder || !name) return;
    setCreating(true);
    try {
      await onCreateFolder(name, parentFolderId);
      setNewFolder("");
      setStatus(`Folder “${name}” created.`);
    } catch (error) {
      setStatus(String(error.message || error));
    } finally {
      setCreating(false);
    }
  }

  async function setTags(row, next) {
    if (!onUpdateDocumentMeta) return;
    await onUpdateDocumentMeta(row.document.id, { folderIds: row.document.folderIds || [], tags: next });
  }
  const toggleFavourite = (row) => setTags(row, isFavourite(row.document) ? (row.document.tags || []).filter((t) => t !== "favourite") : [...(row.document.tags || []), "favourite"]);
  const moveTo = (row, folderId) => onUpdateDocumentMeta?.(row.document.id, { folderIds: folderId ? [folderId] : [], tags: row.document.tags || [] });
  async function saveAttempt(attempt, documentId) {
    if (!onSaveGeneratedQuizDocument) return;
    const content = JSON.stringify({ kind: "activity-attempt", attempt, activityDocumentId: documentId, activityId: attempt.activityId, learner: learner || profileName || "" }, null, 2);
    try { await onSaveGeneratedQuizDocument({ folderIds: [], tags: ["activity-attempt"], file: { name: `${attempt.activityTitle} · attempt.json`, content, preview: `${attempt.score}/${attempt.total}`, sizeBytes: content.length } }); } catch { /* keep local */ }
  }

  if (!subject) return <section className="tw-scope"><p className={`${card} p-5 text-sm text-soft-ink`}>Select a workspace and subject to see its resources.</p></section>;

  return (
    <section className="tw-scope grid gap-4">
      <div className={`${card} grid gap-3 p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={kicker}>Resources · {subject.name}</p>
            <h3 className="m-0 mt-1 text-xl font-bold text-ink">{rows.length} generated resource{rows.length === 1 ? "" : "s"}</h3>
            <p className="m-0 mt-1 text-sm text-soft-ink">Everything your agents produced: do it on Luna, download any view of its template, regenerate it, or file it away.</p>
          </div>
          <div className="flex gap-1 rounded-xl bg-[var(--surface-soft)] p-1">{[["gallery", "Gallery"], ["list", "List"]].map(([value, text]) => <button key={value} type="button" onClick={() => setView(value)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${view === value ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink"}`}>{text}</button>)}</div>
        </div>
        <PhoneCollapse label="Search & filters" activeCount={(query ? 1 : 0) + Object.values(filters).filter(Boolean).length}>
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${field} min-w-52 flex-1`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, agent, template, material, tag…" />
          <select className={field} value={filters.agent} onChange={(event) => setFilters({ ...filters, agent: event.target.value })}><option value="">Any agent</option>{agents.map((a) => <option key={a} value={a}>{a}</option>)}</select>
          <select className={field} value={filters.template} onChange={(event) => setFilters({ ...filters, template: event.target.value })}><option value="">Any template</option>{usedTemplates.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          <select className={field} value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value })}><option value="">Any material</option>{sources.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          <select className={field} value={filters.folder} onChange={(event) => setFilters({ ...filters, folder: event.target.value })}><option value="">All folders</option>{folders.map((f) => <option key={f.id} value={f.id}>📁 {f.name}</option>)}</select>
          {allTags.length ? <select className={field} value={filters.tag} onChange={(event) => setFilters({ ...filters, tag: event.target.value })}><option value="">Any tag</option>{allTags.map((t) => <option key={t} value={t}>{t}</option>)}</select> : null}
          <button type="button" onClick={() => setFilters({ ...filters, favourite: !filters.favourite })} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filters.favourite ? "bg-[#ffe9a8] text-[#8a5a00]" : "border border-ink/15 text-soft-ink"}`}>★ Favourites</button>
          {query || Object.values(filters).some(Boolean) ? <button type="button" className={ghostBtn} onClick={() => { setQuery(""); setFilters({ agent: "", template: "", source: "", folder: "", tag: "", favourite: false }); }}>Clear</button> : null}
        </div>
        </PhoneCollapse>
        <div className="flex flex-wrap items-center gap-2">
          {onCreateFolder ? (
            <>
              <input className={`${field} w-44`} value={newFolder} onChange={(event) => setNewFolder(event.target.value)} onKeyDown={(event) => event.key === "Enter" && createFolder()} placeholder="New folder name" />
              <button type="button" className={ghostBtn} disabled={creating || !newFolder.trim()} onClick={() => createFolder()}>{creating ? "Creating…" : "＋ Folder"}</button>
              {filters.folder ? <button type="button" className={ghostBtn} disabled={creating || !newFolder.trim()} onClick={() => createFolder(filters.folder)} title="Create it inside the folder you are filtering by">＋ Subfolder of “{folders.find((f) => f.id === filters.folder)?.name}”</button> : null}
            </>
          ) : null}
          {role !== "student" ? (
            <label className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold text-soft-ink">Doing activities as
              <select className={field} value={learner} onChange={(event) => setLearner(event.target.value)}>
                <option value="">Unassigned</option>
                {learners.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
              <button type="button" className={ghostBtn} onClick={() => { const name = window.prompt(role === "teacher" ? "Student name" : "Child's name"); if (name) { setLearners(addLearner(name)); setLearner(name.trim()); } }}>＋</button>
            </label>
          ) : null}
        </div>
      </div>

      {status ? <p className="m-0 px-1 text-xs text-[var(--accent-ink)]">{status}</p> : null}

      {view === "gallery" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((row) => {
            const stats = resourceStats(row.document.id, row.resource.activity?.id, documents);
            const template = templateById[row.resource.meta.templateId];
            return (
              <article key={row.document.id} className={`${card} flex flex-col gap-2 p-4`}>
                <div className="flex justify-center"><ResourceThumb template={template} /></div>
                <div className="flex items-start justify-between gap-2">
                  <h4 className="m-0 truncate text-sm font-bold text-ink">{row.resource.name}</h4>
                  <button type="button" title="Favourite" onClick={() => toggleFavourite(row)} className={`text-sm ${isFavourite(row.document) ? "text-[#f5a623]" : "text-ink/25 hover:text-[#f5a623]"}`}>★</button>
                </div>
                <p className="m-0 text-[11px] text-soft-ink">{new Date(row.resource.createdAt).toLocaleDateString()}{row.resource.meta.agentName ? ` · ✦ ${row.resource.meta.agentName}` : ""}{row.resource.meta.templateName ? ` · ${row.resource.meta.templateName}` : ""}</p>
                <div className="flex flex-wrap gap-1">
                  {row.resource.meta.questionCount ? <span className={`${chip} bg-[var(--accent-soft)] text-[var(--accent-ink)]`}>{row.resource.meta.questionCount} questions</span> : null}
                  {resourceDifficulty(row.document) ? <span className={`${chip} bg-[var(--surface-soft)] text-soft-ink`}>{resourceDifficulty(row.document)}</span> : null}
                  {stats.times ? <span className={`${chip} bg-[var(--surface-soft)] text-soft-ink`}>done {stats.times}×</span> : null}
                  {stats.errors ? <span className={`${chip} bg-[rgba(255,59,48,0.1)] text-[var(--color-danger)]`}>{stats.errors} errors</span> : null}
                  {resourceTags(row.document).map((tag) => <span key={tag} className={`${chip} border border-ink/10 text-soft-ink`}>{tag}</span>)}
                </div>
                <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                  <button type="button" className={`${primaryBtn} flex-1 py-1.5 text-xs`} onClick={() => { setOpenId(row.document.id); setTab(row.resource.activity?.questions.length ? "do" : "export"); }}>Open</button>
                  <button type="button" className={ghostBtn} onClick={() => onOpenResource?.(row.document.id)}>Regenerate</button>
                </div>
              </article>
            );
          })}
          {!visible.length ? <p className={`${card} col-span-full p-6 text-center text-sm text-soft-ink`}>No resources match. Generate one from AI Tools → run an agent → Save.</p> : null}
        </div>
      ) : (
        <section className={`${card} p-4`}>
          <div className="grid gap-1">
            {visible.map((row) => {
              const stats = resourceStats(row.document.id, row.resource.activity?.id, documents);
              return (
                <div key={row.document.id} className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 transition hover:bg-[var(--surface-soft)]">
                  <button type="button" onClick={() => toggleFavourite(row)} className={`text-sm ${isFavourite(row.document) ? "text-[#f5a623]" : "text-ink/25"}`}>★</button>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setOpenId(row.document.id); setTab(row.resource.activity?.questions.length ? "do" : "export"); }}>
                    <p className="m-0 truncate text-sm font-semibold text-ink">{row.resource.name}</p>
                    <p className="m-0 text-[11px] text-soft-ink">{new Date(row.resource.createdAt).toLocaleDateString()}{row.resource.meta.agentName ? ` · ${row.resource.meta.agentName}` : ""}{row.resource.meta.templateName ? ` · ${row.resource.meta.templateName}` : ""}{stats.times ? ` · done ${stats.times}× · ${stats.errors} errors` : ""}</p>
                  </button>
                  <select className={field} value={(row.document.folderIds || [])[0] || ""} onChange={(event) => moveTo(row, event.target.value)}>
                    <option value="">Unfiled</option>
                    {folders.map((folder) => <option key={folder.id} value={folder.id}>📁 {folder.name}</option>)}
                  </select>
                  <button type="button" className={ghostBtn} onClick={() => onOpenResource?.(row.document.id)}>Regenerate</button>
                  <button type="button" className={`${ghostBtn} text-[var(--color-danger)]`} onClick={() => { if (window.confirm(`Delete "${row.resource.name}"?`)) onRemoveDocument?.(row.document.id); }}>Delete</button>
                </div>
              );
            })}
            {!visible.length ? <p className="m-0 p-4 text-sm text-soft-ink">No resources match.</p> : null}
          </div>
        </section>
      )}

      {open ? (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-[var(--bg)]/95 p-4 sm:p-8">
          <div className="mx-auto grid max-w-4xl gap-3">
            <header className={`${card} flex flex-wrap items-start justify-between gap-3 p-5`}>
              <div className="min-w-0">
                <h3 className="m-0 truncate text-2xl font-bold tracking-tight text-ink">{open.resource.name}</h3>
                <p className="m-0 mt-1 text-sm text-soft-ink">{new Date(open.resource.createdAt).toLocaleString()}{open.resource.meta.agentName ? ` · ✦ ${open.resource.meta.agentName}` : ""}{open.resource.meta.templateName ? ` · ${open.resource.meta.templateName}` : ""}{(open.resource.meta.sourceNames || []).length ? ` · from ${open.resource.meta.sourceNames.join(", ")}` : ""}</p>
                {openStats?.times ? <p className="m-0 mt-1 text-xs text-soft-ink">Done {openStats.times}× · best {Math.round(openStats.best * 100)}% · {openStats.errors} mistakes recorded</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={ghostBtn} onClick={() => onOpenResource?.(open.document.id)}>Regenerate / edit</button>
                <button type="button" className={`${ghostBtn} text-[var(--color-danger)]`} onClick={() => { if (window.confirm(`Delete "${open.resource.name}"?`)) { onRemoveDocument?.(open.document.id); setOpenId(""); } }}>Delete</button>
                <button type="button" className={ghostBtn} onClick={() => setOpenId("")}>Close</button>
              </div>
            </header>
            <div className="flex gap-1 self-start rounded-xl bg-[var(--surface-soft)] p-1">
              {[["do", "Do it on Luna"], ["questions", "Questions & sources"], ["export", "Downloads"], ["results", "Results"]].map(([value, text]) => <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === value ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink"}`}>{text}</button>)}
            </div>
            {tab === "do" ? (
              open.resource.activity?.questions.length
                ? <section className={`${card} p-5`}><p className="m-0 text-sm text-soft-ink">{open.resource.activity.questions.length} questions. Answers are checked and every attempt is recorded.</p><button type="button" className={`${primaryBtn} mt-3`} onClick={() => setPlaying(open)}>{openStats?.times ? "Do it again" : "Start"}</button></section>
                : <section className={`${card} p-5`}><p className="m-0 text-sm text-soft-ink">This resource has nothing to answer — it is a reading document. Use Downloads.</p></section>
            ) : null}
            {tab === "questions" ? (
              <section className={`${card} p-5`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><p className={kicker}>What each question tests</p><p className="m-0 mt-1 text-xs text-soft-ink">Classify the questions so mistakes can be measured by skill and difficulty. Where the answer comes from is shown underneath.</p></div>
                  {open.resource.activity?.questions.length ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <select className={field} value="" onChange={(event) => event.target.value && bulkClassify(open, { skill: event.target.value })}><option value="">Set all skills…</option>{SKILLS.map((skill) => <option key={skill} value={skill}>{skill}</option>)}</select>
                      <select className={field} value="" onChange={(event) => event.target.value && bulkClassify(open, { difficulty: event.target.value })}><option value="">Set all difficulty…</option>{["easy", "medium", "hard"].map((level) => <option key={level} value={level}>{level}</option>)}</select>
                    </div>
                  ) : null}
                </div>
                <div className="mt-3 grid gap-2">
                  {(open.resource.activity?.questions || []).map((question, index) => (
                    <div key={question.id} className="rounded-xl border border-ink/10 p-3">
                      <p className="m-0 text-sm font-semibold text-ink"><span className="mr-2 text-soft-ink">{index + 1}.</span>{question.prompt}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <select className={field} value={question.skill || ""} onChange={(event) => classify(open, question.id, { skill: event.target.value })}>
                          <option value="">What does it test…</option>
                          {[...new Set([...SKILLS, ...(question.skill ? [question.skill] : [])])].map((skill) => <option key={skill} value={skill}>{skill}</option>)}
                        </select>
                        <select className={field} value={question.difficulty || ""} onChange={(event) => classify(open, question.id, { difficulty: event.target.value })}>
                          <option value="">Difficulty…</option>
                          {["easy", "medium", "hard"].map((level) => <option key={level} value={level}>{level}</option>)}
                        </select>
                        <input className={`${field} w-40`} defaultValue={question.topic || ""} placeholder="Topic" onBlur={(event) => event.target.value !== (question.topic || "") && classify(open, question.id, { topic: event.target.value })} />
                        <button type="button" className="rounded-full border border-ink/15 px-2.5 py-1 text-[11px] font-semibold text-soft-ink hover:text-ink" onClick={() => { const skill = window.prompt("Custom category", question.skill || ""); if (skill !== null) classify(open, question.id, { skill: skill.trim() }); }}>Custom…</button>
                      </div>
                      {question.source?.extract ? <p className="m-0 mt-2 rounded-lg bg-[var(--surface-soft)] px-2.5 py-1.5 text-[11px] text-soft-ink">📖 {question.source.documentName ? <strong className="text-ink">{question.source.documentName}</strong> : "Material"}{question.source.locator ? ` · ${question.source.locator}` : ""}: “{question.source.extract}”</p> : <p className="m-0 mt-2 text-[11px] text-soft-ink">No source passage matched this question.</p>}
                    </div>
                  ))}
                  {!open.resource.activity?.questions.length ? <p className="m-0 text-sm text-soft-ink">This resource has no questions.</p> : null}
                </div>
              </section>
            ) : null}
            {tab === "export" ? <section className={`${card} p-5`}><p className={kicker}>Every view of its template</p><div className="mt-3"><ResourceExports resource={open.resource} template={templateById[open.resource.meta.templateId]} onStatus={setStatus} /></div></section> : null}
            {tab === "results" ? (
              <section className={`${card} p-5`}>
                {!openStats?.attempts.length ? <p className="m-0 text-sm text-soft-ink">Not done yet.</p> : openStats.attempts.map((attempt, index) => (
                  <div key={index} className="mb-2 rounded-xl border border-ink/10 p-3">
                    <p className="m-0 flex items-center justify-between text-sm"><span className="text-soft-ink">{new Date(attempt.at).toLocaleString()}</span><span className="font-bold text-ink">{attempt.score} / {attempt.total}</span></p>
                    {(attempt.results || []).filter((result) => result.correct === false).map((result) => <p key={result.id} className="m-0 mt-1 text-xs text-ink">✗ {result.prompt} <span className="text-soft-ink">→ {result.expected}</span></p>)}
                  </div>
                ))}
              </section>
            ) : null}
          </div>
        </div>
      ) : null}

      {playing ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[var(--bg)]/95 p-4 sm:p-8">
          <ActivityPlayer activity={playing.resource.activity} onSubmit={(attempt) => saveAttempt(attempt, playing.document.id)} onClose={() => setPlaying(null)} />
        </div>
      ) : null}
    </section>
  );
}

export { RESOURCE_TAG };
