"use client";

import { useEffect, useMemo, useState } from "react";
import { byConcept, byDifficulty, byResource, bySkill, estimateExamMinutes, forPlan, joinAttempts, readResources, repeatedMistakes, streak, summarise, timeByKind, timeline, dailyActivity } from "./metrics";
import { parsePlan, planProgress } from "../plans/plan";
import { parseResource } from "../resources/resource";
import { addLearner, readLearners, removeLearner } from "./learners";
import { GOAL_TAG, buildGoal, goalProgress, parseGoal } from "./plan";
import { PhoneCollapse } from "../ui/PhoneCollapse";
import { attentionFlags, buildEvidence, byLearner, classTopicCoverage, classTopicMatrix, learnerSubjectMatrix, masteryOverTime, nextActions, overallMastery, retentionOf, statusOf, topicMastery } from "./mastery";
import { analyseErrors } from "./errors";
import { TRACK_BY, coverageOf, targetsFor } from "./targets";
import { blankView, duplicateView, exportView, importView, readViews, removeView, upsertView, visiblePanels } from "./views";
import { panelById } from "./dashboard/registry";
import { Customise } from "./dashboard/Customise";
import { card, ghostBtn, kicker, percent } from "./dashboard/parts";
import { publish, readStores } from "../marketplace/market";

/** A filter control never grows past this, whatever the longest option is called. */
const field = "max-w-[10.5rem] truncate rounded-xl border border-ink/12 bg-white px-2.5 py-1.5 text-xs text-ink";
const primaryBtn = "inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed] disabled:opacity-50";
const tone = (value) => (value >= 0.8 ? "text-[#2f9e5b]" : value >= 0.5 ? "text-[#b25e00]" : "text-[var(--color-danger)]");
const EMPTY_FILTERS = { folder: "", agent: "", template: "", source: "", kind: "", resource: "", skill: "", difficulty: "", from: "", to: "" };

/**
 * Performance — as much or as little as the reader wants.
 *
 * Underneath is one layer of learning intelligence: learner → subject → topic → mastery, with the
 * evidence each number came from. On top of it the reader arranges panels: a curated view per profile
 * to begin with, then anything hidden, reordered, widened or switched between "now", "over time" and
 * "broken down", with several saved views reachable as tabs. What counts as a subject and a topic is
 * the user's own study plans — the targets they set — rather than a taxonomy Luna invents.
 */
export function PerformancePage({ role = "student", profileName = "", workspaces = [], selectedWorkspaceId, selectedSubjectId, onSaveGeneratedQuizDocument, onRemoveDocument, onOpenPage }) {
  const subject = workspaces.find((w) => w.id === selectedWorkspaceId)?.subjects?.find((s) => s.id === selectedSubjectId) || null;
  const documents = subject?.documents || [];
  const folders = subject?.folders || [];
  const isOwn = role === "student";

  const [learners, setLearners] = useState([]);
  const [learner, setLearner] = useState("");
  const [range, setRange] = useState(30);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [planId, setPlanId] = useState("");
  const [selectedTopic, setSelectedTopic] = useState("");
  const [views, setViews] = useState([]);
  const [viewId, setViewId] = useState("");
  const [customising, setCustomising] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState({ title: "", date: "", targetScore: 80, resourceIds: [] });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => { setLearners(readLearners()); }, []);
  useEffect(() => {
    const stored = readViews(role);
    setViews(stored);
    setViewId(stored[0].id);
  }, [role]);

  const view = views.find((entry) => entry.id === viewId) || views[0] || null;
  const trackBy = view?.trackBy || "plan";

  const changeView = (next) => {
    setViews(upsertView(role, next));
    setViewId(next.id);
  };

  /* ------------------------------------------------------------ the evidence */
  const resources = useMemo(() => readResources(documents), [documents]);
  const all = useMemo(() => joinAttempts(documents), [documents]);
  const goals = useMemo(() => documents.map(parseGoal).filter(Boolean), [documents]);
  const plans = useMemo(() => documents.map((document) => ({ document, plan: parsePlan(document) })).filter((row) => row.plan), [documents]);
  const resourceByDocumentId = useMemo(() => {
    const map = new Map();
    for (const document of documents) { const resource = parseResource(document); if (resource) map.set(document.id, resource); }
    return map;
  }, [documents]);

  const since = range ? Date.now() - range * 86400000 : 0;
  const activePlan = plans.find((row) => row.document.id === planId) || null;
  const planScoped = activePlan ? forPlan(all, activePlan.plan) : all;
  const attempts = planScoped.filter((attempt) => {
    const at = new Date(attempt.at).getTime();
    if (since && at < since) return false;
    if (filters.from && at < new Date(`${filters.from}T00:00:00`).getTime()) return false;
    if (filters.to && at > new Date(`${filters.to}T23:59:59`).getTime()) return false;
    if (isOwn ? false : learner && attempt.learner !== learner) return false;
    if (isOwn && attempt.learner && profileName && attempt.learner !== profileName) return false;
    if (filters.folder && !(attempt.folderIds || []).includes(filters.folder)) return false;
    if (filters.agent && attempt.agentName !== filters.agent) return false;
    if (filters.template && attempt.templateName !== filters.template) return false;
    if (filters.source && !(attempt.sourceNames || []).includes(filters.source)) return false;
    if (filters.kind && !(attempt.kinds || []).includes(filters.kind)) return false;
    if (filters.resource && attempt.resourceId !== filters.resource) return false;
    if (filters.skill && !(attempt.results || []).some((result) => (result.skill || "unclassified") === filters.skill)) return false;
    if (filters.difficulty && !(attempt.results || []).some((result) => (result.difficulty || "unrated") === filters.difficulty)) return false;
    return true;
  });

  /* Topics: derived from topic:Name tags on documents. Each topic links to its materials,
     any plans that include those materials, and any activities tagged with the same topic. */
  const tagTopics = useMemo(() => {
    const topicMap = new Map();
    for (const document of documents) {
      const topicTags = (document.tags || []).filter((t) => String(t).startsWith("topic:")).map((t) => String(t).slice(6));
      const isActivity = (document.tags || []).includes("activity");
      const isMaterial = !isActivity && document.sourceType !== "generated";
      for (const topic of topicTags) {
        if (!topicMap.has(topic)) topicMap.set(topic, { name: topic, materials: [], activities: [], plans: [] });
        const entry = topicMap.get(topic);
        if (isActivity) entry.activities.push(document);
        else if (isMaterial) entry.materials.push(document);
      }
    }
    // Add plans that include materials tagged with a topic
    for (const row of plans) {
      const materialIds = new Set((row.plan.items || []).map((item) => item.resourceId).filter(Boolean));
      for (const [topic, entry] of topicMap) {
        if (entry.materials.some((m) => materialIds.has(m.id))) entry.plans.push(row.document);
      }
    }
    return [...topicMap.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [documents, plans]);
  const [selectedTagTopic, setSelectedTagTopic] = useState("");

  /** Where the folder a resource is filed in stands in for a subject, when plans are not the target. */
  const folderSubjectOf = useMemo(() => {
    const roots = new Map(folders.map((folder) => [folder.id, folder]));
    const rootName = (folderId) => {
      let current = roots.get(folderId);
      while (current?.parentFolderId && roots.get(current.parentFolderId)) current = roots.get(current.parentFolderId);
      return current?.name || subject?.name || "";
    };
    const byFolder = new Map(folders.map((folder) => [folder.id, rootName(folder.id)]));
    return (attempt) => byFolder.get((attempt.folderIds || [])[0]) || subject?.name || "";
  }, [folders, subject]);

  const conceptsOfResource = useMemo(() => {
    const map = new Map();
    for (const [documentId, resource] of resourceByDocumentId) map.set(documentId, (resource.concepts || []).map((concept) => concept.name));
    return (attempt) => map.get(attempt.resourceId) || [];
  }, [resourceByDocumentId]);

  const targets = useMemo(() => targetsFor(trackBy, { plans, folderSubjectOf, conceptsOfResource, fallbackSubject: subject?.name || "" }), [trackBy, plans, folderSubjectOf, conceptsOfResource, subject]);
  const evidence = useMemo(() => buildEvidence(attempts, { subjectOf: targets.subjectOf, conceptsOf: targets.conceptsOf }), [attempts, targets]);
  const coverage = useMemo(() => coverageOf(attempts, targets.subjectOf), [attempts, targets]);

  const topics = useMemo(() => topicMastery(evidence), [evidence]);
  const overall = useMemo(() => overallMastery(topics), [topics]);
  const errors = useMemo(() => analyseErrors(evidence), [evidence]);
  const trendPoints = useMemo(() => masteryOverTime(evidence), [evidence]);
  const measured = trendPoints.filter((point) => point.mastery !== null);
  const trendChange = { points: trendPoints, change: measured.length > 1 ? (measured[measured.length - 1].mastery - measured[0].mastery) / 100 : 0 };
  const actions = useMemo(() => nextActions(topics, errors.byTopic), [topics, errors]);
  const retention = useMemo(() => retentionOf(topics), [topics]);
  const learnerRows = useMemo(() => byLearner(evidence), [evidence]);
  const flagged = useMemo(() => learnerRows.map((entry) => ({ ...entry, flags: attentionFlags(entry, (row) => analyseErrors(row.rows).types) })), [learnerRows]);
  const matrix = useMemo(() => classTopicMatrix(evidence), [evidence]);
  const classCoverage = useMemo(() => classTopicCoverage(evidence), [evidence]);
  const across = useMemo(() => learnerSubjectMatrix(evidence), [evidence]);
  const subjects = useMemo(() => {
    const map = new Map();
    for (const row of evidence) {
      const key = row.subject || subject?.name || "This space";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    return [...map.entries()].map(([name, rows]) => {
      const summary = overallMastery(topicMastery(rows));
      const series = masteryOverTime(rows, 8).filter((point) => point.mastery !== null);
      return { subject: name, mastery: summary.mastery, trend: series.length > 1 ? (series[series.length - 1].mastery - series[0].mastery) / 100 : 0 };
    }).sort((a, b) => b.mastery - a.mastery);
  }, [evidence, subject]);

  const stats = summarise(attempts);
  const planStats = activePlan ? planProgress(activePlan.plan, all) : null;
  const sessionsPerWeek = attempts.length ? (attempts.length / Math.max(7, range || 30)) * 7 : 0;

  const filterOptions = useMemo(() => ({
    agents: [...new Set(all.map((attempt) => attempt.agentName).filter(Boolean))],
    templates: [...new Set(all.map((attempt) => attempt.templateName).filter(Boolean))],
    sources: [...new Set(all.flatMap((attempt) => attempt.sourceNames || []))],
    kinds: [...new Set(all.flatMap((attempt) => attempt.kinds || []))],
    skills: [...new Set(all.flatMap((attempt) => (attempt.results || []).map((result) => result.skill || "unclassified")))],
    difficulties: [...new Set(all.flatMap((attempt) => (attempt.results || []).map((result) => result.difficulty || "unrated")))]
  }), [all]);

  async function saveGoal() {
    if (!onSaveGeneratedQuizDocument || !goalDraft.title.trim() || !goalDraft.date) return;
    setBusy(true);
    try {
      const goal = buildGoal({ title: goalDraft.title.trim(), date: goalDraft.date, learner: isOwn ? profileName : learner, resourceIds: goalDraft.resourceIds, targetScore: (Number(goalDraft.targetScore) || 80) / 100 });
      const content = JSON.stringify(goal, null, 2);
      await onSaveGeneratedQuizDocument({ folderIds: [], tags: [GOAL_TAG], file: { name: `${goal.title}.goal.json`, content, preview: goal.date, sizeBytes: content.length } });
      setGoalOpen(false);
      setGoalDraft({ title: "", date: "", targetScore: 80, resourceIds: [] });
    } finally {
      setBusy(false);
    }
  }

  /** The dates panel keeps its own editor, so adding an exam stays where the dates are read. */
  function renderGoals() {
    const mine = goals.filter((goal) => isOwn || !learner || goal.learner === learner || !goal.learner).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return (
      <div className="grid gap-2">
        <button type="button" className={`${ghostBtn} justify-self-start`} onClick={() => setGoalOpen((value) => !value)}>{goalOpen ? "Cancel" : "＋ Exam date or goal"}</button>
        {goalOpen ? (
          <div className="grid gap-2 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent-soft)]/40 p-3">
            <input className="w-full rounded-xl border border-ink/12 bg-white px-3 py-1.5 text-sm" value={goalDraft.title} onChange={(event) => setGoalDraft({ ...goalDraft, title: event.target.value })} placeholder="Biology midterm" />
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-[11px] font-semibold text-soft-ink">Date<input type="date" className="rounded-xl border border-ink/12 bg-white px-2 py-1.5 text-xs" value={goalDraft.date} onChange={(event) => setGoalDraft({ ...goalDraft, date: event.target.value })} /></label>
              <label className="grid gap-1 text-[11px] font-semibold text-soft-ink">Target %<input type="number" min="10" max="100" className="rounded-xl border border-ink/12 bg-white px-2 py-1.5 text-xs" value={goalDraft.targetScore} onChange={(event) => setGoalDraft({ ...goalDraft, targetScore: event.target.value })} /></label>
            </div>
            <div className="grid max-h-36 gap-0.5 overflow-y-auto">
              {resources.map((row) => (
                <label key={row.document.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs text-ink hover:bg-white">
                  <input type="checkbox" checked={goalDraft.resourceIds.includes(row.document.id)} onChange={(event) => setGoalDraft({ ...goalDraft, resourceIds: event.target.checked ? [...goalDraft.resourceIds, row.document.id] : goalDraft.resourceIds.filter((id) => id !== row.document.id) })} />
                  <span className="min-w-0 truncate">{row.resource.name}</span>
                </label>
              ))}
              {!resources.length ? <p className="m-0 text-xs text-soft-ink">No resources yet.</p> : null}
            </div>
            <button type="button" className={primaryBtn} disabled={busy || !goalDraft.title.trim() || !goalDraft.date} onClick={saveGoal}>{busy ? "Saving…" : "Save goal"}</button>
          </div>
        ) : null}
        {mine.map((goal) => {
          const progress = goalProgress(goal, all, resources);
          const late = progress.days !== null && progress.days < 0;
          return (
            <div key={goal.documentId} className={`rounded-2xl border p-3 ${late ? "border-[rgba(255,59,48,0.35)]" : "border-ink/10"}`}>
              <p className="m-0 flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-ink">
                <span className="min-w-0 truncate">{goal.title}</span>
                <span className={`shrink-0 text-[11px] font-semibold ${late ? "text-[var(--color-danger)]" : progress.days <= 7 ? "text-[#b25e00]" : "text-soft-ink"}`}>{late ? `${Math.abs(progress.days)} days ago` : `in ${progress.days} days`}</span>
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-soft)]"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.round(progress.onTrack * 100)}%` }} /></div>
              <p className="m-0 mt-1 text-[11px] text-soft-ink">{progress.mastered} of {progress.total} resources at target{progress.done ? ` · average ${percent(progress.average)}` : ""}</p>
              {onRemoveDocument ? <button type="button" className={`${ghostBtn} mt-2 text-[var(--color-danger)]`} onClick={() => { if (window.confirm(`Delete the goal "${goal.title}"?`)) onRemoveDocument(goal.documentId); }}>Delete</button> : null}
            </div>
          );
        })}
        {!mine.length ? <p className="m-0 text-sm text-soft-ink">No dates yet. Add an exam and tick the resources that prepare for it.</p> : null}
      </div>
    );
  }

  const context = {
    role, learner, profileName, subject, evidence, topics, overall, errors, actions, retention, trendChange,
    weeks: measured.length, subjects, flagged, matrix, coverage: classCoverage, across, stats,
    days: useMemo(() => timeline(attempts, Math.min(range || 30, 60)), [attempts, range]),
    rhythm: useMemo(() => dailyActivity(attempts, Math.min(range || 30, 45)), [attempts, range]),
    rows: useMemo(() => byResource(attempts), [attempts]),
    concepts: useMemo(() => byConcept(attempts, resourceByDocumentId), [attempts, resourceByDocumentId]),
    stuck: useMemo(() => repeatedMistakes(attempts), [attempts]),
    skills: useMemo(() => bySkill(attempts), [attempts]),
    difficulties: useMemo(() => byDifficulty(attempts), [attempts]),
    times: useMemo(() => timeByKind(attempts), [attempts]),
    examMinutes: estimateExamMinutes(attempts, 20),
    streak: useMemo(() => streak(all), [all]),
    sessionsPerWeek,
    activePlan,
    planStats,
    planSummary: activePlan && planStats ? { name: activePlan.plan.name, deadline: planStats.deadline?.date || "", done: planStats.done, total: planStats.total, late: planStats.late.length } : null,
    selectedTopic,
    selected: topics.find((entry) => entry.topic === selectedTopic) || null,
    onSelectTopic: (topic) => setSelectedTopic(topic === selectedTopic ? "" : topic),
    onPickLearner: (name) => setLearner(name),
    onOpenPage,
    onPractise: () => onOpenPage?.("activities"),
    onSchedule: () => onOpenPage?.("plans"),
    renderGoals
  };

  function publishView() {
    const stores = readStores();
    if (!stores.length) { setNotice("Create a store in the marketplace first — a dashboard is sold by a store, like everything else."); return; }
    publish({
      kind: "view",
      name: view.name,
      tagline: `${visiblePanels(view).length} panels, arranged for a ${role}`,
      description: `A performance dashboard: ${visiblePanels(view).map((panel) => panelById(panel.id)?.title).filter(Boolean).join(", ")}.`,
      subject: "Other",
      storeId: stores[0].id,
      payload: exportView(view),
      preview: visiblePanels(view).map((panel) => panelById(panel.id)?.title).filter(Boolean).slice(0, 4).join(" · ")
    });
    setNotice(`“${view.name}” is on the marketplace under ${stores[0].name}.`);
  }

  function importFromFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const next = importView(reader.result, role);
        setViews(upsertView(role, next));
        setViewId(next.id);
        setNotice(`Loaded “${next.name}”.`);
      } catch (error) { setNotice(error.message); }
    };
    reader.readAsText(file);
  }

  if (!subject) return <section className="tw-scope"><p className={`${card} p-5 text-sm text-soft-ink`}>Select a workspace and subject to see performance.</p></section>;
  if (!view) return null;

  const panels = visiblePanels(view).map((panel) => ({ panel, definition: panelById(panel.id) })).filter((entry) => entry.definition && entry.definition.roles.includes(role));
  const activeFilters = Object.values(filters).filter(Boolean).length + (planId ? 1 : 0) + (learner ? 1 : 0);

  return (
    <section className="tw-scope grid gap-4">
      {/* The views, as tabs: one dashboard per question you keep asking. */}
      <div className={`${card} grid gap-3 p-3`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap gap-1">
            {views.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => { setViewId(entry.id); setCustomising(false); }}
                className={`max-w-[14rem] truncate rounded-lg px-3 py-1.5 text-xs font-semibold transition ${entry.id === view.id ? "bg-ink text-white" : "text-soft-ink hover:bg-[var(--surface-soft)]"}`}
              >
                {entry.name}
              </button>
            ))}
            <button type="button" className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-soft-ink hover:bg-[var(--surface-soft)]" title="A new, empty view" onClick={() => { const next = blankView(role, window.prompt("Name this view", "Before the exam") || "New view"); setViews(upsertView(role, next)); setViewId(next.id); setCustomising(true); }}>＋ View</button>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <label className="flex items-center gap-1 text-[11px] font-semibold text-soft-ink">
              Track by
              <select className={field} value={trackBy} onChange={(event) => changeView({ ...view, trackBy: event.target.value })} title={TRACK_BY.find((entry) => entry.id === trackBy)?.blurb}>
                {TRACK_BY.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
              </select>
            </label>
            <button type="button" className={ghostBtn} onClick={() => setCustomising((value) => !value)}>{customising ? "Done" : "⚙ Arrange"}</button>
          </div>
        </div>
        <p className="m-0 text-[11px] text-soft-ink">
          {TRACK_BY.find((entry) => entry.id === trackBy)?.blurb}
          {trackBy === "plan" && attempts.length ? ` ${coverage.covered} of ${coverage.total} results in this period belong to a plan${coverage.share < 0.6 ? " — add the rest to a plan and they will be tracked too" : ""}.` : ""}
        </p>

        <PhoneCollapse label="Filters" activeCount={activeFilters}>
          <div className="flex flex-wrap items-center gap-1.5">
            {!isOwn ? (
              <>
                <select className={field} value={learner} onChange={(event) => setLearner(event.target.value)}>
                  <option value="">{role === "teacher" ? "Whole class" : "All children"}</option>
                  {learners.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
                <button type="button" className={ghostBtn} onClick={() => { const name = window.prompt(role === "teacher" ? "Student name" : "Child's name"); if (name) { setLearners(addLearner(name)); setLearner(name.trim()); } }}>＋</button>
                {learner ? <button type="button" className={ghostBtn} onClick={() => { if (window.confirm(`Remove ${learner} from the list? Their results stay.`)) { setLearners(removeLearner(learner)); setLearner(""); } }}>Remove {learner}</button> : null}
              </>
            ) : null}
            <select className={field} value={range} onChange={(event) => setRange(Number(event.target.value))}>
              {[[7, "Last 7 days"], [30, "Last 30 days"], [90, "Last 3 months"], [0, "All time"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input type="date" className={field} value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} title="From this date" />
            <input type="date" className={field} value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} title="Up to this date" />
            <select className={field} value={planId} onChange={(event) => setPlanId(event.target.value)}>
              <option value="">Every plan</option>
              {plans.map((row) => <option key={row.document.id} value={row.document.id}>◷ {row.plan.name}</option>)}
            </select>
            <select className={field} value={filters.folder} onChange={(event) => setFilters({ ...filters, folder: event.target.value })}><option value="">All folders</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select>
            <select className={field} value={filters.resource} onChange={(event) => setFilters({ ...filters, resource: event.target.value })}><option value="">Any resource</option>{resources.map((row) => <option key={row.document.id} value={row.document.id}>{row.resource.name}</option>)}</select>
            <select className={field} value={filters.kind} onChange={(event) => setFilters({ ...filters, kind: event.target.value })}><option value="">Any activity</option>{filterOptions.kinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select>
            <select className={field} value={filters.skill} onChange={(event) => setFilters({ ...filters, skill: event.target.value })}><option value="">Any skill</option>{filterOptions.skills.map((skill) => <option key={skill} value={skill}>{skill}</option>)}</select>
            <select className={field} value={filters.difficulty} onChange={(event) => setFilters({ ...filters, difficulty: event.target.value })}><option value="">Any difficulty</option>{filterOptions.difficulties.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select>
            <select className={field} value={filters.agent} onChange={(event) => setFilters({ ...filters, agent: event.target.value })}><option value="">Any agent</option>{filterOptions.agents.map((agent) => <option key={agent} value={agent}>{agent}</option>)}</select>
            <select className={field} value={filters.template} onChange={(event) => setFilters({ ...filters, template: event.target.value })}><option value="">Any template</option>{filterOptions.templates.map((template) => <option key={template} value={template}>{template}</option>)}</select>
            <select className={field} value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value })}><option value="">Any material</option>{filterOptions.sources.map((source) => <option key={source} value={source}>{source}</option>)}</select>
            {activeFilters ? <button type="button" className={ghostBtn} onClick={() => { setFilters(EMPTY_FILTERS); setPlanId(""); setLearner(""); }}>Clear filters</button> : null}
          </div>
        </PhoneCollapse>
        <p className="m-0 text-[11px] text-soft-ink">{attempts.length} result{attempts.length === 1 ? "" : "s"} · {stats.questions} questions · average {percent(stats.score)} <span className={tone(stats.score)}>●</span></p>
        {notice ? <p className="m-0 text-xs text-[var(--accent-ink)]">{notice}</p> : null}
      </div>

      {customising ? (
        <Customise
          view={view}
          role={role}
          canDelete={view.id !== `default_${role}`}
          onChange={changeView}
          onSaveAs={() => { const name = window.prompt("Name this view", `${view.name} copy`); if (!name) return; const next = duplicateView(view, name); setViews(upsertView(role, next)); setViewId(next.id); }}
          onDelete={() => { if (!window.confirm(`Delete the view “${view.name}”?`)) return; const remaining = removeView(role, view.id); setViews(remaining); setViewId(remaining[0].id); setCustomising(false); }}
          onPublish={publishView}
          onReset={() => { const remaining = removeView(role, view.id); const restored = readViews(role); setViews(restored); setViewId(restored[0].id); void remaining; }}
        />
      ) : null}

      {!evidence.length ? (
        <section className={`${card} p-6`}>
          <p className="m-0 text-sm text-soft-ink">
            Nothing measured in this selection yet. {trackBy === "plan" && plans.length === 0 ? "Make a study plan — its goals become the topics this screen tracks — then do an activity on Luna." : "Do an activity on Luna, or widen the filters, and this screen fills itself in."}
          </p>
        </section>
      ) : (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {panels.map(({ panel, definition }) => (
            <section key={panel.id} className={`${card} min-w-0 p-5 ${panel.size === "full" || definition.size === "full" ? "lg:col-span-2" : ""}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className={kicker}>{definition.title}</p>
                {definition.modes.length > 1 ? (
                  <span className="flex gap-1">
                    {definition.modes.map((mode) => (
                      <button key={mode} type="button" onClick={() => changeView({ ...view, panels: view.panels.map((entry) => (entry.id === panel.id ? { ...entry, mode } : entry)) })} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${panel.mode === mode ? "bg-ink text-white" : "bg-[var(--surface-soft)] text-soft-ink"}`}>
                        {mode === "value" ? "Now" : mode === "history" ? "Over time" : "Detail"}
                      </button>
                    ))}
                  </span>
                ) : null}
              </div>
              <div className="mt-3 min-w-0">{definition.render(context, panel.mode)}</div>
            </section>
          ))}
        </div>
      )}

      {/* ── Topics index ───────────────────────────────────────────────── */}
      {tagTopics.length ? (
        <section className={`${card} p-5`}>
          <p className={kicker}>Topics</p>
          <p className="m-0 mt-1 text-[11px] text-soft-ink">Topics come from <code>topic:Name</code> tags on materials, activities and plans. Tag a document in the Workspace tab to add it here.</p>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {tagTopics.map((topic) => {
              const isSelected = selectedTagTopic === topic.name;
              return (
                <div key={topic.name}
                  className={`rounded-2xl border p-3 transition cursor-pointer ${isSelected ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]/30" : "border-ink/10 hover:border-ink/20"}`}
                  onClick={() => setSelectedTagTopic(isSelected ? "" : topic.name)}>
                  <p className="m-0 flex items-center gap-2 text-sm font-semibold text-ink">
                    <span className="inline-flex size-5 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[10px] font-bold text-[var(--accent-ink)]">⬡</span>
                    {topic.name}
                  </p>
                  <div className="mt-2 grid gap-0.5 text-[11px] text-soft-ink">
                    {topic.materials.length ? <p className="m-0">📄 {topic.materials.length} material{topic.materials.length === 1 ? "" : "s"}: {topic.materials.slice(0, 3).map((m) => m.name).join(", ")}{topic.materials.length > 3 ? "…" : ""}</p> : null}
                    {topic.activities.length ? <p className="m-0">✎ {topic.activities.length} activit{topic.activities.length === 1 ? "y" : "ies"}: {topic.activities.slice(0, 2).map((a) => a.name).join(", ")}{topic.activities.length > 2 ? "…" : ""}</p> : null}
                    {topic.plans.length ? <p className="m-0">◷ In {topic.plans.length} plan{topic.plans.length === 1 ? "" : "s"}: {topic.plans.slice(0, 2).map((p) => p.name).join(", ")}</p> : null}
                    {!topic.materials.length && !topic.activities.length ? <p className="m-0 italic">No tagged items yet</p> : null}
                  </div>
                  {isSelected ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {onOpenPage ? (
                        <>
                          <button type="button" className={ghostBtn} onClick={(e) => { e.stopPropagation(); onOpenPage("workspace", { topicFilter: topic.name }); }}>Open in Workspace →</button>
                          <button type="button" className={ghostBtn} onClick={(e) => { e.stopPropagation(); onOpenPage("activities", { topicFilter: topic.name }); }}>Open in Activities →</button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[11px] text-soft-ink">
          Load a dashboard someone shared
          <input type="file" accept="application/json" aria-label="Load a performance dashboard someone shared" className="ml-2 text-[11px]" onChange={(event) => { const file = event.target.files?.[0]; if (file) importFromFile(file); event.target.value = ""; }} />
        </label>
        <button type="button" className={ghostBtn} onClick={() => { const blob = new Blob([JSON.stringify(exportView(view), null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${view.name}.luna-view.json`; anchor.click(); URL.revokeObjectURL(url); }}>⤓ Save this view as a file</button>
        <span className="text-[11px] text-soft-ink">Mastery counts as {statusOf(70).label} at 70%. A view holds the arrangement only — never anybody's results.</span>
      </div>
    </section>
  );
}
