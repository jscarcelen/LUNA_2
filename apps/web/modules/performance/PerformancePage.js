"use client";

import { useEffect, useMemo, useState } from "react";
import { activityKindLabel, byDifficulty, byResource, bySkill, errorsByTopic, estimateExamMinutes, joinAttempts, readResources, summarise, timeByKind, timeline } from "./metrics";
import { addLearner, readLearners, removeLearner } from "./learners";
import { GOAL_TAG, buildGoal, goalProgress, parseGoal } from "./plan";

const card = "rounded-[18px] border border-ink/8 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";
const field = "rounded-xl border border-ink/12 bg-white px-3 py-1.5 text-xs text-ink";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-[var(--surface-soft)]";
const primaryBtn = "inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed] disabled:opacity-50";

const percent = (value) => `${Math.round((value || 0) * 100)}%`;
const tone = (value) => (value >= 0.8 ? "text-[#2f9e5b]" : value >= 0.5 ? "text-[#b25e00]" : "text-[var(--color-danger)]");

function Kpi({ label, value, hint, accent }) {
  return (
    <div className={`${card} p-4`}>
      <p className={kicker}>{label}</p>
      <p className={`m-0 mt-1 text-2xl font-bold ${accent || "text-ink"}`}>{value}</p>
      {hint ? <p className="m-0 text-[11px] text-soft-ink">{hint}</p> : null}
    </div>
  );
}

/** Small bar chart: activity per day, colour by score. */
function Timeline({ days }) {
  const max = Math.max(1, ...days.map((day) => day.count));
  return (
    <div className="flex h-24 items-end gap-[3px]">
      {days.map((day) => (
        <div key={day.date} className="flex-1" title={`${day.date}: ${day.count} activit${day.count === 1 ? "y" : "ies"}${day.score === null ? "" : ` · ${percent(day.score)}`}`}>
          <div className="w-full rounded-t-[2px]" style={{ height: `${(day.count / max) * 100}%`, minHeight: day.count ? 3 : 0, background: day.score === null ? "#d2d2d7" : day.score >= 0.8 ? "#34c759" : day.score >= 0.5 ? "#ff9f0a" : "#ff3b30" }} />
        </div>
      ))}
    </div>
  );
}

/**
 * Performance — how the learning is going. Teachers and parents filter by child; a student sees
 * only their own. Everything is sliceable by folder, resource, agent, template, material and type,
 * and the study plan shows whether the work lines up with the exam dates.
 */
export function PerformancePage({ role = "student", profileName = "", workspaces = [], selectedWorkspaceId, selectedSubjectId, onSaveGeneratedQuizDocument, onRemoveDocument, onOpenPage }) {
  const subject = workspaces.find((w) => w.id === selectedWorkspaceId)?.subjects?.find((s) => s.id === selectedSubjectId) || null;
  const documents = subject?.documents || [];
  const folders = subject?.folders || [];
  const isOwn = role === "student";

  const [learners, setLearners] = useState([]);
  const [learner, setLearner] = useState("");
  const [range, setRange] = useState(30);
  const [filters, setFilters] = useState({ folder: "", agent: "", template: "", source: "", kind: "", resource: "", skill: "", difficulty: "" });
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState({ title: "", date: "", targetScore: 80, resourceIds: [] });
  const [busy, setBusy] = useState(false);
  useEffect(() => { setLearners(readLearners()); }, []);

  const resources = useMemo(() => readResources(documents), [documents]);
  const all = useMemo(() => joinAttempts(documents), [documents]);
  const goals = useMemo(() => documents.map(parseGoal).filter(Boolean), [documents]);

  const since = Date.now() - range * 86400000;
  const attempts = all.filter((attempt) => {
    if (range && new Date(attempt.at).getTime() < since) return false;
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

  const stats = summarise(attempts);
  const topics = errorsByTopic(attempts);
  const rows = byResource(attempts);
  const days = timeline(attempts, Math.min(range || 30, 60));
  const agents = [...new Set(all.map((a) => a.agentName).filter(Boolean))];
  const usedTemplates = [...new Set(all.map((a) => a.templateName).filter(Boolean))];
  const sources = [...new Set(all.flatMap((a) => a.sourceNames || []))];
  const kinds = [...new Set(all.flatMap((a) => a.kinds || []))];
  const skills = bySkill(attempts);
  const difficulties = byDifficulty(attempts);
  const times = timeByKind(attempts);
  const examMinutes = estimateExamMinutes(attempts, 20);
  const allSkills = [...new Set(all.flatMap((a) => (a.results || []).map((r) => r.skill || "unclassified")))];
  const allDifficulties = [...new Set(all.flatMap((a) => (a.results || []).map((r) => r.difficulty || "unrated")))];
  const repeated = rows.filter((row) => row.times > 1);
  const improving = repeated.filter((row) => row.delta > 0.05).length;

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

  if (!subject) return <section className="tw-scope"><p className={`${card} p-5 text-sm text-soft-ink`}>Select a workspace and subject to see performance.</p></section>;

  return (
    <section className="tw-scope grid gap-4">
      <div className={`${card} grid gap-3 p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={kicker}>Performance · {subject.name}</p>
            <h3 className="m-0 mt-1 text-xl font-bold text-ink">{isOwn ? "How you are doing" : role === "teacher" ? "How the class is doing" : "How your children are doing"}</h3>
            <p className="m-0 mt-1 text-sm text-soft-ink">Built from every activity done on Luna: scores, mistakes by topic, repetition and progress towards your dates.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isOwn ? (
              <>
                <select className={field} value={learner} onChange={(event) => setLearner(event.target.value)}>
                  <option value="">{role === "teacher" ? "Whole class" : "All children"}</option>
                  {learners.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
                <button type="button" className={ghostBtn} onClick={() => { const name = window.prompt(role === "teacher" ? "Student name" : "Child's name"); if (name) { setLearners(addLearner(name)); setLearner(name.trim()); } }}>＋ {role === "teacher" ? "Student" : "Child"}</button>
                {learner ? <button type="button" className={ghostBtn} onClick={() => { if (window.confirm(`Remove ${learner} from the list? Their results stay.`)) { setLearners(removeLearner(learner)); setLearner(""); } }}>Remove</button> : null}
              </>
            ) : null}
            <select className={field} value={range} onChange={(event) => setRange(Number(event.target.value))}>
              {[[7, "Last 7 days"], [30, "Last 30 days"], [90, "Last 3 months"], [0, "All time"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className={field} value={filters.folder} onChange={(event) => setFilters({ ...filters, folder: event.target.value })}><option value="">All folders</option>{folders.map((f) => <option key={f.id} value={f.id}>📁 {f.name}</option>)}</select>
          <select className={field} value={filters.resource} onChange={(event) => setFilters({ ...filters, resource: event.target.value })}><option value="">Any resource</option>{resources.map((row) => <option key={row.document.id} value={row.document.id}>{row.resource.name}</option>)}</select>
          <select className={field} value={filters.kind} onChange={(event) => setFilters({ ...filters, kind: event.target.value })}><option value="">Any activity type</option>{kinds.map((k) => <option key={k} value={k}>{activityKindLabel(k)}</option>)}</select>
          <select className={field} value={filters.skill} onChange={(event) => setFilters({ ...filters, skill: event.target.value })}><option value="">Any skill</option>{allSkills.map((s2) => <option key={s2} value={s2}>{s2}</option>)}</select>
          <select className={field} value={filters.difficulty} onChange={(event) => setFilters({ ...filters, difficulty: event.target.value })}><option value="">Any difficulty</option>{allDifficulties.map((d) => <option key={d} value={d}>{d}</option>)}</select>
          <select className={field} value={filters.agent} onChange={(event) => setFilters({ ...filters, agent: event.target.value })}><option value="">Any agent</option>{agents.map((a) => <option key={a} value={a}>{a}</option>)}</select>
          <select className={field} value={filters.template} onChange={(event) => setFilters({ ...filters, template: event.target.value })}><option value="">Any template</option>{usedTemplates.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          <select className={field} value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value })}><option value="">Any material</option>{sources.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          {Object.values(filters).some(Boolean) ? <button type="button" className={ghostBtn} onClick={() => setFilters({ folder: "", agent: "", template: "", source: "", kind: "", resource: "", skill: "", difficulty: "" })}>Clear</button> : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Activities done" value={stats.done} hint={`${stats.resources} different resources`} />
        <Kpi label="Average score" value={percent(stats.score)} accent={tone(stats.score)} hint={`${stats.questions} questions answered`} />
        <Kpi label="Mistakes" value={stats.errors} accent={stats.errors ? "text-[var(--color-danger)]" : "text-ink"} hint={stats.questions ? `${percent(stats.errors / stats.questions)} of answers` : ""} />
        <Kpi label="Repeated" value={repeated.length} hint={`${improving} improved on the retry`} />
        <Kpi label="Time on task" value={`${stats.minutes} min`} hint={stats.perQuestion ? `${stats.perQuestion}s per question${examMinutes ? ` · a 20-question exam ≈ ${examMinutes} min` : ""}` : range ? `last ${range} days` : "all time"} />
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className={`${card} p-5`}>
          <p className={kicker}>Activity over time</p>
          <div className="mt-3"><Timeline days={days} /></div>
          <p className="m-0 mt-2 text-[11px] text-soft-ink">Bar height = activities that day · colour = average score (green ≥ 80%, amber ≥ 50%).</p>

          <p className={`${kicker} mt-5`}>Mistakes by topic</p>
          <div className="mt-2 grid gap-1.5">
            {topics.slice(0, 8).map((topic) => (
              <div key={topic.topic} className="rounded-xl border border-ink/10 p-2.5">
                <p className="m-0 flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-ink"><span>{topic.topic}</span><span className={tone(1 - topic.rate)}>{topic.errors} mistake{topic.errors === 1 ? "" : "s"} · {percent(topic.rate)} of its questions</span></p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-soft)]"><div className="h-full rounded-full bg-[var(--color-danger)]" style={{ width: `${Math.min(100, topic.rate * 100)}%` }} /></div>
                {topic.examples.slice(0, 2).map((example, index) => <p key={index} className="m-0 mt-1 text-[11px] text-soft-ink">✗ {example.prompt} <span className="text-ink">→ {example.expected}</span></p>)}
              </div>
            ))}
            {!topics.length ? <p className="m-0 text-sm text-soft-ink">No mistakes recorded in this selection.</p> : null}
          </div>

          <p className={`${kicker} mt-5`}>By resource</p>
          <div className="mt-2 grid gap-1">
            {rows.slice(0, 12).map((row) => (
              <div key={row.key} className="flex flex-wrap items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm hover:bg-[var(--surface-soft)]">
                <span className="min-w-0 flex-1 truncate text-ink">{row.name}</span>
                <span className="text-[11px] text-soft-ink">{row.times}× · {row.errors} mistakes</span>
                {row.times > 1 ? <span className={`text-[11px] font-semibold ${row.delta > 0 ? "text-[#2f9e5b]" : row.delta < 0 ? "text-[var(--color-danger)]" : "text-soft-ink"}`}>{row.delta > 0 ? "▲" : row.delta < 0 ? "▼" : "="} {percent(Math.abs(row.delta))}</span> : null}
                <span className={`w-12 text-right font-semibold ${tone(row.best)}`}>{percent(row.best)}</span>
              </div>
            ))}
            {!rows.length ? <p className="m-0 text-sm text-soft-ink">Nothing done yet — open a resource and do it on Luna.</p> : null}
          </div>
        </section>

        <section className={`${card} p-5`}>
          <div className="flex items-center justify-between gap-2">
            <p className={kicker}>Study plan</p>
            <button type="button" className={ghostBtn} onClick={() => setGoalOpen((value) => !value)}>{goalOpen ? "Cancel" : "＋ Goal / exam date"}</button>
          </div>
          {goalOpen ? (
            <div className="mt-3 grid gap-2 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent-soft)]/40 p-3">
              <input className={`${field} w-full`} value={goalDraft.title} onChange={(event) => setGoalDraft({ ...goalDraft, title: event.target.value })} placeholder="Biology midterm" />
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-[11px] font-semibold text-soft-ink">Date<input type="date" className={field} value={goalDraft.date} onChange={(event) => setGoalDraft({ ...goalDraft, date: event.target.value })} /></label>
                <label className="grid gap-1 text-[11px] font-semibold text-soft-ink">Target score %<input type="number" min="10" max="100" className={field} value={goalDraft.targetScore} onChange={(event) => setGoalDraft({ ...goalDraft, targetScore: event.target.value })} /></label>
              </div>
              <p className="m-0 text-[11px] font-semibold text-soft-ink">Resources that count towards it</p>
              <div className="grid max-h-36 gap-0.5 overflow-y-auto">
                {resources.map((row) => (
                  <label key={row.document.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs text-ink hover:bg-white">
                    <input type="checkbox" checked={goalDraft.resourceIds.includes(row.document.id)} onChange={(event) => setGoalDraft({ ...goalDraft, resourceIds: event.target.checked ? [...goalDraft.resourceIds, row.document.id] : goalDraft.resourceIds.filter((id) => id !== row.document.id) })} />
                    <span className="truncate">{row.resource.name}</span>
                  </label>
                ))}
                {!resources.length ? <p className="m-0 text-xs text-soft-ink">No resources yet.</p> : null}
              </div>
              <button type="button" className={primaryBtn} disabled={busy || !goalDraft.title.trim() || !goalDraft.date} onClick={saveGoal}>{busy ? "Saving…" : "Save goal"}</button>
            </div>
          ) : null}
          <div className="mt-3 grid gap-2">
            {goals.filter((goal) => isOwn || !learner || goal.learner === learner || !goal.learner).sort((a, b) => String(a.date).localeCompare(String(b.date))).map((goal) => {
              const progress = goalProgress(goal, all, resources);
              const late = progress.days !== null && progress.days < 0;
              return (
                <div key={goal.documentId} className={`rounded-2xl border p-3 ${late ? "border-[rgba(255,59,48,0.35)]" : "border-ink/10"}`}>
                  <p className="m-0 flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-ink">
                    <span>{goal.title}</span>
                    <span className={`text-[11px] font-semibold ${late ? "text-[var(--color-danger)]" : progress.days <= 7 ? "text-[#b25e00]" : "text-soft-ink"}`}>{new Date(`${goal.date}T00:00:00`).toLocaleDateString()} · {late ? `${Math.abs(progress.days)} days ago` : `in ${progress.days} days`}</span>
                  </p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-soft)]"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.round(progress.onTrack * 100)}%` }} /></div>
                  <p className="m-0 mt-1 text-[11px] text-soft-ink">{progress.mastered} of {progress.total} resources at target{progress.done ? ` · average ${percent(progress.average)}` : ""}{goal.learner ? ` · ${goal.learner}` : ""}</p>
                  {progress.pending.length ? <p className="m-0 mt-1 text-[11px] text-ink">Next: {progress.pending.slice(0, 3).map((row) => row.resource.name).join(", ")}{progress.pending.length > 3 ? ` +${progress.pending.length - 3}` : ""}</p> : <p className="m-0 mt-1 text-[11px] text-[#2f9e5b]">All planned work done.</p>}
                  <div className="mt-2 flex gap-2">
                    <button type="button" className={ghostBtn} onClick={() => onOpenPage?.("resources")}>Open resources</button>
                    {onRemoveDocument ? <button type="button" className={`${ghostBtn} text-[var(--color-danger)]`} onClick={() => { if (window.confirm(`Delete the goal "${goal.title}"?`)) onRemoveDocument(goal.documentId); }}>Delete</button> : null}
                  </div>
                </div>
              );
            })}
            {!goals.length ? <p className="m-0 text-sm text-soft-ink">No dates yet. Add an exam or a deadline and tick the resources that prepare for it — the bar shows whether the work is on track.</p> : null}
          </div>

          <p className={`${kicker} mt-5`}>What the mistakes are about</p>
          <div className="mt-2 grid gap-1">
            {skills.map((entry) => (
              <div key={entry.skill} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-ink">{entry.skill}</span>
                <span className="text-[11px] text-soft-ink">{entry.asked} q{entry.seconds ? ` · ${entry.seconds}s` : ""}</span>
                <span className={`w-20 text-right text-[11px] font-semibold ${entry.rate > 0.4 ? "text-[var(--color-danger)]" : entry.rate > 0.15 ? "text-[#b25e00]" : "text-[#2f9e5b]"}`}>{entry.errors} wrong · {percent(entry.rate)}</span>
              </div>
            ))}
            {!skills.length ? <p className="m-0 text-sm text-soft-ink">Classify the questions of a resource (Resources → open → Questions &amp; sources) to see this.</p> : null}
          </div>

          <p className={`${kicker} mt-5`}>By difficulty</p>
          <div className="mt-2 grid gap-1">
            {difficulties.map((entry) => (
              <div key={entry.difficulty} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate capitalize text-ink">{entry.difficulty}</span>
                <span className="text-[11px] text-soft-ink">{entry.asked} q{entry.seconds ? ` · ${entry.seconds}s` : ""}</span>
                <span className={`w-16 text-right text-[11px] font-semibold ${tone(1 - entry.rate)}`}>{percent(1 - entry.rate)}</span>
              </div>
            ))}
          </div>

          <p className={`${kicker} mt-5`}>Time per question</p>
          <div className="mt-2 grid gap-1">
            {times.map((entry) => (
              <div key={entry.kind} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-ink">{activityKindLabel(entry.kind)}</span>
                <span className="text-[11px] text-soft-ink">{entry.count} answered</span>
                <span className="w-14 text-right font-semibold text-ink">{entry.seconds}s</span>
              </div>
            ))}
            {!times.length ? <p className="m-0 text-sm text-soft-ink">Timing is recorded from now on, each time an activity is done on Luna.</p> : null}
          </div>

          <p className={`${kicker} mt-5`}>By activity type</p>
          <div className="mt-2 grid gap-1">
            {kinds.map((kind) => {
              const ofKind = attempts.filter((attempt) => (attempt.kinds || []).includes(kind));
              const kindStats = summarise(ofKind);
              return ofKind.length ? (
                <div key={kind} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-ink">{activityKindLabel(kind)}</span>
                  <span className="text-[11px] text-soft-ink">{kindStats.done}×</span>
                  <span className={`w-12 text-right font-semibold ${tone(kindStats.score)}`}>{percent(kindStats.score)}</span>
                </div>
              ) : null;
            })}
            {!attempts.length ? <p className="m-0 text-sm text-soft-ink">Nothing yet.</p> : null}
          </div>
        </section>
      </div>
    </section>
  );
}
