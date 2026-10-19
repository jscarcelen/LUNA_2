"use client";

import { EmptyState } from "../../components/EmptyState";
import { useEffect, useMemo, useState } from "react";
import { SubjectTabs } from "../ui/SubjectTabs";
import { defaultLearner } from "../performance/learners";
import { daysUntil, dueLabel, parsePlan } from "../plans/plan";
import { ReaderView } from "../reader/ReaderView";
import { UpdateDialog } from "../resources/UpdateDialog";
import { canUpdateResource } from "../resources/update";
import { DUE_OWN_PREFIX, dueInfoOf, senderNameOf } from "../accounts/shared";
import { OriginBadge } from "../plans/DeadlineBadge";
import { RowMenu } from "../ui/RowMenu";
import { displayName } from "../ui/displayName";
import { LATE_CHIP, lateTone, summariseCatchUp } from "./catchUp";
import { useT } from "../../lib/i18n/LocaleProvider.js";
import { usePhone } from "../ui/PhoneCollapse";
import { draftProgress } from "./drafts.js";
import { loadAllDrafts } from "./draftStore.js";
import { PhotoQuizMaker } from "./PhotoQuizMaker";

const card = "rounded-[18px] border border-ink/8 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";
const primaryBtn = "inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed] disabled:opacity-50";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-[var(--surface-soft)]";
const chip = "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold";

function parse(document) {
  try { return JSON.parse(String(document.content || "{}")); } catch { return null; }
}
/** The date an activity is judged by: the earlier of the sender's (imposed) date and your own. */
function dueOf(document) {
  return dueInfoOf(document).date;
}
function scoreTone(pct) {
  return pct >= 80 ? "text-[#2f9e5b]" : pct >= 50 ? "text-[#b25e00]" : "text-[var(--color-danger)]";
}

/**
 * Activities — the repository of things to do (quizzes, exams, puzzles, flashcards…) in this
 * subject, with due dates and results. Attempts are recorded per question so mistakes can be
 * reviewed and, later, fed into performance tracking.
 */
export function ActivitiesPage({ role = "student", profileName = "", workspaces = [], selectedWorkspaceId, selectedSubjectId, onSaveGeneratedQuizDocument, onUpdateGeneratedDocument, onUpdateDocumentMeta, onRemoveDocument, onOpenTool, onSelectSubject, onUploadTxt }) {
  const t = useT();
  const phone = usePhone();
  const dateLocale = t.locale === "es" ? "es-ES" : undefined;
  const subject = workspaces.find((w) => w.id === selectedWorkspaceId)?.subjects?.find((s) => s.id === selectedSubjectId) || null;
  const docs = subject?.documents || [];
  const activities = useMemo(() => docs.filter((d) => (d.tags || []).includes("activity")).map((d) => ({ document: d, parsed: parse(d) })).filter((a) => a.parsed?.activity), [docs]);
  const attempts = useMemo(() => docs.filter((d) => (d.tags || []).includes("activity-attempt")).map((d) => parse(d)).filter((p) => p?.attempt).map((p) => p), [docs]);
  const [playing, setPlaying] = useState(null);
  // Quizzes started and saved for later ("Save and finish later"): activity document id -> draft. Never attempts.
  const [drafts, setDrafts] = useState(() => new Map());
  useEffect(() => {
    if (playing) return undefined;
    let cancelled = false;
    // Read again whenever a quiz is closed: it may just have been saved for later, or submitted.
    const timer = window.setTimeout(() => { loadAllDrafts().then((map) => { if (!cancelled) setDrafts(map); }).catch(() => {}); }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [playing]);
  // "Make a quiz from your notes" (photos): open while making, then the new quiz is opened as soon as it is in the list.
  const [photoMaker, setPhotoMaker] = useState(false);
  const [openWhenReady, setOpenWhenReady] = useState("");
  const [updating, setUpdating] = useState(null); // an activity row whose "Update…" dialog is open
  const [updateStatus, setUpdateStatus] = useState("");
  const [view, setView] = useState("todo");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [editingDue, setEditingDue] = useState("");
  const [errorFilter, setErrorFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [sort, setSort] = useState("priority");
  const [grouped, setGrouped] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  function toggleGroup(id) { setCollapsedGroups((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; }); }

  const allTopics = useMemo(() => [...new Set(docs.flatMap((d) => (d.tags || []).filter((t) => String(t).startsWith("topic:")).map((t) => String(t).slice(6))))], [docs]);

  /** Which study plan each activity belongs to — an activity can be scheduled by one. */
  const plans = useMemo(() => docs.map((document) => ({ document, plan: parsePlan(document) })).filter((row) => row.plan), [docs]);
  const planByResource = useMemo(() => {
    const map = new Map();
    for (const { document, plan } of plans) {
      for (const item of plan.items || []) {
        if (item.resourceId) map.set(item.resourceId, { id: document.id, name: plan.name, colour: plan.colour, dueDate: item.dueDate, goalId: item.goalId });
      }
    }
    return map;
  }, [plans]);

  const attemptsFor = (a) => attempts.filter((p) => (p.activityDocumentId && p.activityDocumentId === a.document.id) || p.activityId === a.parsed.activity.id);
  const rows = activities.map((a) => {
    const list = attemptsFor(a).sort((x, y) => String(y.attempt.at).localeCompare(String(x.attempt.at)));
    const best = list.reduce((m, p) => Math.max(m, p.attempt.total ? p.attempt.score / p.attempt.total : 0), 0);
    return { ...a, attempts: list, best, due: dueOf(a.document), dueInfo: dueInfoOf(a.document), dueBy: senderNameOf(a.document, subject?.folders || []), done: list.length > 0, folder: (subject?.folders || []).find((f) => (a.document.folderIds || []).includes(f.id))?.name || "" };
  });
  /** Priority: what is late first, then what is due soonest, then everything without a date. */
  const priority = (row) => {
    const days = daysUntil(row.due);
    if (row.done) return 10000;
    if (days === null) return 5000;
    return days;
  };
  const sorters = {
    priority: (a, b) => priority(a) - priority(b) || String(a.due || "9999").localeCompare(String(b.due || "9999")),
    due: (a, b) => String(a.due || "9999").localeCompare(String(b.due || "9999")),
    plan: (a, b) => String(a.plan?.name || "zzz").localeCompare(String(b.plan?.name || "zzz")) || priority(a) - priority(b),
    name: (a, b) => String(a.parsed.activity.title).localeCompare(String(b.parsed.activity.title))
  };
  const withPlans = rows.map((row) => ({ ...row, plan: planByResource.get(row.document.id) || null }));
  const visible = withPlans
    .filter((r) => (view === "todo" ? !r.done : view === "done" ? r.done : true))
    .filter((r) => (planFilter === "" ? true : planFilter === "__none" ? !r.plan : r.plan?.id === planFilter))
    .filter((r) => (topicFilter === "" ? true : (r.document.tags || []).includes(`topic:${topicFilter}`)))
    .sort(sorters[sort] || sorters.priority);
  /** Late rows in the order shown: the first keeps the red chip, the rest are amber. */
  const lateOrder = new Map();
  for (const row of visible) if (row.due && !row.done && row.due < new Date().toISOString().slice(0, 10)) lateOrder.set(row.document.id, lateOrder.size);
  const summary = summariseCatchUp(rows, { attempts }, t);
  const firstLate = visible.find((row) => lateOrder.get(row.document.id) === 0) || null;
  /** Grouping puts each plan's work together, with everything unplanned at the end. */
  const groups = grouped
    ? [...new Map(visible.map((row) => [row.plan?.id || "", { id: row.plan?.id || "", name: row.plan?.name || t("practice.noPlan"), colour: row.plan?.colour || "#8e98ab" }])).values()]
      .map((group) => ({ ...group, rows: visible.filter((row) => (row.plan?.id || "") === group.id) }))
    : [{ id: "", name: "", colour: "", rows: visible }];
  const active = withPlans.find((r) => r.document.id === selected) || null;
  useEffect(() => {
    if (!openWhenReady) return;
    const row = withPlans.find((entry) => entry.document.id === openWhenReady);
    if (row) { setOpenWhenReady(""); setSelected(row.document.id); setPlaying(row); }
  }, [openWhenReady, withPlans]);

  const allErrors = useMemo(() => {
    const out = [];
    for (const r of rows) for (const p of r.attempts) for (const res of p.attempt.results || []) if (res.correct === false) out.push({ ...res, activity: r.parsed.activity.title, at: p.attempt.at });
    return out;
  }, [rows]);
  const errorTopics = [...new Set(allErrors.map((e) => e.topic || e.group || "").filter(Boolean))];

  async function saveAttempt(attempt, documentId) {
    if (!onSaveGeneratedQuizDocument) return;
    const content = JSON.stringify({ kind: "activity-attempt", attempt, activityDocumentId: documentId, activityId: attempt.activityId, learner: defaultLearner(role, profileName) }, null, 2);
    try { await onSaveGeneratedQuizDocument({ folderIds: [], tags: ["activity-attempt"], file: { name: `${attempt.activityTitle} · attempt.json`, content, preview: `${attempt.score}/${attempt.total}`, sizeBytes: content.length } }); } catch { /* keep local */ }
  }
  async function setDue(row, date) {
    if (!onUpdateDocumentMeta) return;
    // A date the sender set is theirs (the server keeps it whatever is sent); your own date sits next to it as `due-own:`.
    const prefix = row.dueInfo?.imposed ? DUE_OWN_PREFIX : "due:";
    const tags = (row.document.tags || []).filter((t) => !String(t).startsWith(prefix));
    await onUpdateDocumentMeta(row.document.id, { folderIds: row.document.folderIds || [], tags: date ? [...tags, `${prefix}${date}`] : tags });
  }

  if (!subject) return <section className="tw-scope grid gap-3"><SubjectTabs workspaces={workspaces} selectedWorkspaceId={selectedWorkspaceId} selectedSubjectId={selectedSubjectId} onSelectSubject={onSelectSubject} /><p className={`${card} p-5 text-sm text-soft-ink`}>{t("practice.selectSubject")}</p></section>;

  return (
    <section className="tw-scope grid gap-4">
      <SubjectTabs workspaces={workspaces} selectedWorkspaceId={selectedWorkspaceId} selectedSubjectId={selectedSubjectId} onSelectSubject={onSelectSubject} />
      <div className={`${card} flex flex-wrap items-center justify-between gap-3 p-5`}>
        <div>
          <p className={kicker}>{t("practice.kicker", { name: subject.name })}</p>
          {role !== "teacher" && summary.headline ? <p className="m-0 mt-1 text-sm font-semibold text-[#1f7a3a]">✓ {summary.headline}</p> : null}
          <h3 className="m-0 mt-1 text-xl font-bold text-ink">{t("practice.counts", { todo: rows.filter((r) => !r.done).length, done: rows.filter((r) => r.done).length })}</h3>
          <p className="m-0 mt-1 text-sm text-soft-ink">{role === "teacher" ? t("practice.desc.teacher") : t("practice.desc.student")}</p>
          {role !== "teacher" && summary.catchUp && firstLate ? (
            <p className="m-0 mt-2 flex flex-wrap items-center gap-2 text-sm text-ink">{summary.catchUp}<button type="button" className={ghostBtn} onClick={() => setPlaying(firstLate)}>{t("practice.startIt")}</button></p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1 rounded-xl bg-[var(--surface-soft)] p-1">{[["todo", t("practice.tab.todo")], ["done", t("practice.tab.done")], ["all", t("practice.tab.all")], ["errors", t("practice.tab.errors", { count: allErrors.length })]].map(([value, text]) => <button key={value} type="button" onClick={() => setView(value)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${view === value ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink"}`}>{text}</button>)}</div>
          {onUploadTxt && onSaveGeneratedQuizDocument && role !== "parent" ? <button type="button" className={phone ? primaryBtn : ghostBtn + " py-2 text-sm"} onClick={() => setPhotoMaker(true)}>📷 {phone ? t("practice.photo.makeShort") : t("practice.photo.fromPhotos")}</button> : null}
          {onOpenTool && !(phone && onUploadTxt && onSaveGeneratedQuizDocument && role !== "parent") ? <button type="button" className={primaryBtn} onClick={() => onOpenTool("create")}>{t("practice.make")}</button> : null}
          {/* Phone: the study-plan, topic and sort filters sit behind this button so the activities are what you see. */}
          {view !== "errors" ? <button type="button" className={`grid size-10 place-items-center rounded-full border text-lg leading-none md:hidden ${filtersOpen ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "border-ink/15 bg-white text-ink"}`} aria-label={t("practice.filterSort")} aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}>⚙</button> : null}
        </div>
        {view !== "errors" ? (
          <div className={`${filtersOpen ? "grid" : "hidden"} w-full gap-2 md:flex md:flex-wrap md:items-center`}>
            <select className="w-full rounded-xl border border-ink/12 bg-white px-3 py-2 text-xs md:w-auto md:py-1.5" value={planFilter} onChange={(event) => setPlanFilter(event.target.value)}>
              <option value="">{t("practice.allPlans")}</option>
              {plans.map((row) => <option key={row.document.id} value={row.document.id}>◷ {row.plan.name}</option>)}
              <option value="__none">{t("practice.noPlan")}</option>
            </select>
            {allTopics.length ? (
              <select className="w-full rounded-xl border border-ink/12 bg-white px-3 py-2 text-xs md:w-auto md:py-1.5" value={topicFilter} onChange={(event) => setTopicFilter(event.target.value)}>
                <option value="">{t("practice.allTopics")}</option>
                {allTopics.map((topic) => <option key={topic} value={topic}>⬡ {topic}</option>)}
              </select>
            ) : null}
            <select className="w-full rounded-xl border border-ink/12 bg-white px-3 py-2 text-xs md:w-auto md:py-1.5" value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="priority">{t("practice.sort.priority")}</option>
              <option value="due">{t("practice.sort.due")}</option>
              <option value="plan">{t("practice.sort.plan")}</option>
              <option value="name">{t("practice.sort.name")}</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-soft-ink"><input type="checkbox" checked={grouped} onChange={(event) => setGrouped(event.target.checked)} />{t("practice.group")}</label>
          </div>
        ) : null}
      </div>

      {view === "errors" ? (
        <section className={`${card} p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={kicker}>{t("practice.errors.title")}</p>
            <select className="rounded-xl border border-ink/15 bg-white px-3 py-1.5 text-xs" value={errorFilter} onChange={(event) => setErrorFilter(event.target.value)}><option value="all">{t("practice.allTopics")}</option>{errorTopics.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          </div>
          <div className="mt-3 grid gap-2">
            {allErrors.filter((e) => errorFilter === "all" || (e.topic || e.group) === errorFilter).map((e, index) => (
              <div key={`${e.id}-${index}`} className="rounded-xl border border-[rgba(255,59,48,0.3)] bg-[rgba(255,59,48,0.04)] px-3 py-2">
                <p className="m-0 text-sm font-semibold text-ink">{e.prompt}</p>
                <p className="m-0 mt-0.5 text-xs text-soft-ink">{t("practice.yourAnswer")} <span className="text-[var(--color-danger)]">{e.given || "—"}</span> · {t("practice.correct")} <span className="text-ink">{e.expected}</span></p>
                <p className="m-0 mt-0.5 text-[10px] text-soft-ink">{e.activity}{e.topic ? ` · ${e.topic}` : ""}{e.difficulty ? ` · ${e.difficulty}` : ""} · {new Date(e.at).toLocaleDateString(dateLocale)}</p>
              </div>
            ))}
            {!allErrors.length ? <p className="m-0 text-sm text-soft-ink">{t("practice.errors.none")}</p> : null}
          </div>
        </section>
      ) : (
        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <section className={`${card} p-5`}>
            <div className="grid gap-4">
              {groups.map((group) => {
                const isCollapsed = collapsedGroups.has(group.id || "none");
                return (
                <div key={group.id || "none"}>
                  {grouped ? (
                    <button type="button" onClick={() => toggleGroup(group.id || "none")} className="m-0 mb-2 flex w-full items-center gap-2 text-left text-xs font-bold uppercase tracking-[0.1em] text-soft-ink transition hover:text-ink">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: group.colour }} />
                      <span className="flex-1">{group.name}</span>
                      <span className="font-normal">{group.rows.length}</span>
                      <span className="text-soft-ink">{isCollapsed ? "▸" : "▾"}</span>
                    </button>
                  ) : null}
            {!isCollapsed && <div className="grid gap-2">
              {group.rows.map((r) => {
                const q = r.parsed.activity.questions.length;
                const pct = Math.round(r.best * 100);
                const overdue = r.due && !r.done && r.due < new Date().toISOString().slice(0, 10);
                const lateChip = overdue ? LATE_CHIP[lateTone(lateOrder.get(r.document.id) ?? 1)] : "";
                // A saved draft: "In progress · 3/6 answered" and Continue (it is not an attempt, so the row is not done because of it).
                const inProgress = drafts.has(r.document.id) ? draftProgress(drafts.get(r.document.id), r.parsed.activity) : null;
                const menu = [
                  { label: r.dueInfo.imposed ? t("practice.menu.ownDate") : t("practice.menu.deadline"), icon: "◷", onSelect: () => setEditingDue(r.document.id) },
                  canUpdateResource(r.parsed) ? { label: t("practice.menu.update"), icon: "✦", title: t("practice.menu.updateHint"), onSelect: () => setUpdating(r) } : null,
                  onRemoveDocument ? { label: t("common.delete"), icon: "🗑", danger: true, onSelect: () => { if (window.confirm(t("practice.confirmDelete", { title: displayName(r.parsed.activity.title) }))) onRemoveDocument(r.document.id); } } : null
                ];
                return (
                  <div key={r.document.id} className={`grid gap-3 rounded-2xl border p-3 transition ${selected === r.document.id ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]/30" : "border-ink/10"}`}>
                    <div className="flex items-start gap-2">
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelected(r.document.id)}>
                        <span className="m-0 block break-words text-sm font-bold leading-snug text-ink [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden">{displayName(r.parsed.activity.title)}</span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {inProgress ? <span className={`${chip} bg-[var(--accent-soft)] text-[var(--accent-ink)]`}>{t("practice.draft.inProgress")} · {t("practice.draft.answered", { answered: inProgress.answered, total: inProgress.total })}</span> : r.done ? <span className={`${chip} bg-[rgba(52,199,89,0.15)] text-[#1f7a3a]`}>{t("practice.chip.done")}</span> : <span className={`${chip} bg-[var(--surface-soft)] text-soft-ink`}>{t("practice.chip.todo")}</span>}
                          {overdue ? <span className={`${chip} ${lateChip}`}>{dueLabel(r.due, t)}</span> : null}
                        </span>
                        <span className="m-0 mt-1.5 block text-xs text-soft-ink">{t.plural("practice.questions", q)}{r.parsed.agentName ? ` · ${r.parsed.agentName}` : ""}{r.plan ? ` · ◷ ${r.plan.name}` : r.folder ? ` · 📁 ${r.folder}` : ""}{r.attempts.length ? ` · ${t.plural("practice.attempts", r.attempts.length)} · ${t("practice.best")} ` : ""}{r.attempts.length ? <span className={`font-semibold ${scoreTone(pct)}`}>{pct}%</span> : null}</span>
                      </button>
                      <RowMenu label={t("practice.moreFor")} items={menu} />
                    </div>
                    {r.dueInfo.imposed ? (
                      <p className="m-0 flex flex-wrap items-center gap-1.5 text-[11px] text-soft-ink" title={t("practice.setBy", { name: r.dueBy || t("practice.yourTeacher") })}>
                        <OriginBadge imposed by={r.dueBy} />
                        <span className="font-semibold text-ink">{dueLabel(r.dueInfo.imposed.date, t)}</span>
                        {r.dueInfo.own?.date ? <span>· {t("practice.yourDate", { date: dueLabel(r.dueInfo.own.date, t) })}</span> : null}
                      </p>
                    ) : r.due ? (
                      <p className="m-0 flex flex-wrap items-center gap-1.5 text-[11px] text-soft-ink"><OriginBadge imposed={false} /><span className="font-semibold text-ink">{dueLabel(r.due, t)}</span></p>
                    ) : null}
                    {editingDue === r.document.id ? (
                      <label className="flex flex-wrap items-center gap-2 text-xs text-soft-ink">{r.dueInfo.imposed ? t("practice.myOwnDate") : t("practice.myDeadline")}
                        <input type="date" className="rounded-lg border border-ink/25 px-2 py-1 text-xs" max={r.dueInfo.imposed?.date || undefined} value={r.dueInfo.imposed ? r.dueInfo.own?.date || "" : r.due} onChange={(event) => setDue(r, event.target.value)} />
                        <button type="button" className={ghostBtn} onClick={() => setEditingDue("")}>{t("practice.done")}</button>
                      </label>
                    ) : null}
                    <button type="button" className={`${primaryBtn} w-full py-2.5 text-base`} onClick={() => setPlaying(r)}>{inProgress ? t("practice.draft.continue") : r.done ? t("practice.tryAgain") : t("practice.start")}</button>
                  </div>
                );
              })}
            </div>}
                </div>
                );
              })}
              {!visible.length ? <EmptyState title={view === "todo" ? t("practice.empty.todoTitle") : t("practice.empty.title")} text={view === "todo" ? t("practice.empty.todoText") : t("practice.empty.text")} action={view === "todo" ? t("practice.empty.action") : undefined} onAction={() => onOpenTool?.("create")} /> : null}
            </div>
          </section>
          <section className={`${card} p-5`}>
            <p className={kicker}>{t("practice.results")}</p>
            {!active ? <p className="m-0 mt-2 text-sm text-soft-ink">{t("practice.selectToSee")}</p> : (
              <div className="mt-2 grid gap-3">
                <p className="m-0 text-base font-bold text-ink">{active.parsed.activity.title}</p>
                {!active.attempts.length ? <p className="m-0 text-sm text-soft-ink">{t("practice.notAttempted")}</p> : active.attempts.map((p, index) => (
                  <div key={index} className="rounded-xl border border-ink/10 p-3">
                    <p className="m-0 flex items-center justify-between text-sm"><span className="text-soft-ink">{new Date(p.attempt.at).toLocaleString(dateLocale)}</span><span className={`font-bold ${scoreTone(p.attempt.total ? (p.attempt.score / p.attempt.total) * 100 : 0)}`}>{p.attempt.score} / {p.attempt.total}</span></p>
                    {(p.attempt.results || []).filter((r) => r.correct === false).slice(0, 6).map((r) => <p key={r.id} className="m-0 mt-1 text-xs text-ink">✗ {r.prompt} <span className="text-soft-ink">→ {r.expected}</span></p>)}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {updateStatus ? <p className="m-0 px-1 text-xs text-[var(--accent-ink)]">{updateStatus}</p> : null}
      {updating ? (
        <UpdateDialog
          document={updating.document}
          resource={updating.parsed}
          workspace={workspaces.find((w) => w.id === selectedWorkspaceId) || null}
          fallbackSubjectId={selectedSubjectId}
          onClose={() => setUpdating(null)}
          onSaveGeneratedQuizDocument={onSaveGeneratedQuizDocument}
          onUpdateGeneratedDocument={onUpdateGeneratedDocument}
          onDone={(message) => { setUpdateStatus(message); setPlaying(null); }}
        />
      ) : null}
      {photoMaker ? (
        <PhotoQuizMaker
          workspaceId={selectedWorkspaceId}
          subjectId={selectedSubjectId}
          subjectName={subject.name}
          onUploadTxt={onUploadTxt}
          onSaveGeneratedQuizDocument={onSaveGeneratedQuizDocument}
          onClose={() => setPhotoMaker(false)}
          onMoreOptions={onOpenTool ? () => { setPhotoMaker(false); onOpenTool("create"); } : undefined}
          onDone={(documentId) => { setPhotoMaker(false); setView("todo"); setOpenWhenReady(documentId); }}
        />
      ) : null}
      {playing ? (
        <ReaderView
          resource={playing.parsed}
          activity={playing.parsed.activity}
          chat={{ documentId: playing.document.id }}
          highlights={playing.parsed.highlights || []}
          onSaveHighlights={onUpdateGeneratedDocument ? (list) => { const content = JSON.stringify({ ...playing.parsed, highlights: list }, null, 2); return onUpdateGeneratedDocument(playing.document.id, { file: { name: playing.document.name, content, sizeBytes: content.length } }); } : undefined}
          onSubmit={(attempt) => saveAttempt(attempt, playing.document.id)}
          onUpdate={canUpdateResource(playing.parsed) ? () => setUpdating(playing) : undefined}
          onClose={() => setPlaying(null)}
        />
      ) : null}
    </section>
  );
}
