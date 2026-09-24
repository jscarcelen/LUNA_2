"use client";

import { useMemo, useState } from "react";
import { PLAN_COLOURS, buildPlan, newDeadline, newGoal, newItem } from "./plan";
import { resourceConcepts } from "../resources/concepts";
import { bySkill, summarise } from "../performance/metrics";

const input = "w-full rounded-xl border border-ink/12 bg-white px-3 py-2 text-sm text-ink";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-[var(--surface-soft)]";
const primaryBtn = "inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed] disabled:opacity-50";
const chip = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold";

const KINDS = [
  { id: "quiz", label: "Quizzes" },
  { id: "flashcards", label: "Flashcards" },
  { id: "summary", label: "Summaries" },
  { id: "worksheet", label: "Worksheets" },
  { id: "exam", label: "Practice exams" }
];

/**
 * "Plan it for me": pick the material, the deadline and the kinds of practice, and Luna lays the
 * work out between now and the date — more time on what the learner keeps getting wrong, the last
 * stretch left for review. The result is an ordinary plan, so every step can be moved afterwards.
 */
export function GeneratePlanDialog({ documents = [], resources = [], attempts = [], onCancel, onDone, onSavePlan }) {
  const [name, setName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [minutes, setMinutes] = useState(120);
  const [kinds, setKinds] = useState(["quiz", "flashcards"]);
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const material = useMemo(() => documents.filter((document) => document.sourceType !== "generated" || (document.tags || []).includes("resource")), [documents]);
  const resourceByDocumentId = useMemo(() => new Map(resources.map((row) => [row.document.id, row.resource])), [resources]);

  /** What the learner is good and bad at, so the plan is fitted to them rather than generic. */
  const performance = useMemo(() => {
    if (!attempts.length) return null;
    const stats = summarise(attempts);
    const skills = bySkill(attempts);
    return {
      activities: stats.done,
      average: stats.score,
      minutesPerQuestion: stats.perQuestion ? Math.max(1, Math.round(stats.perQuestion / 60)) : 0,
      weakConcepts: skills.filter((skill) => skill.asked >= 2 && skill.rate > 0.3).map((skill) => skill.skill),
      strongConcepts: skills.filter((skill) => skill.asked >= 2 && skill.rate <= 0.1).map((skill) => skill.skill)
    };
  }, [attempts]);

  const toggle = (list, setList, value) => setList(list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]);

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/plans/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deadline,
          minutesPerWeek: minutes,
          kinds,
          performance,
          materials: picked.map((id) => {
            const document = documents.find((item) => item.id === id);
            const resource = resourceByDocumentId.get(id);
            return {
              id,
              name: resource?.name || document?.name || "",
              kind: resource ? "generated resource" : "material",
              concepts: resource ? resourceConcepts(resource).map((concept) => concept.name) : []
            };
          })
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not build the plan");
      const proposal = data.plan || {};
      const goals = (proposal.goals || []).map((goal) => ({ ...newGoal(goal.title, goal.targetScore || 0.8), concepts: goal.concepts || [] }));
      const items = (proposal.items || []).map((item) => {
        const goal = goals.find((entry) => entry.title.toLowerCase() === String(item.goal || "").toLowerCase());
        const known = documents.find((document) => document.id === item.sourceId);
        return {
          ...newItem({
            resourceId: known && resourceByDocumentId.has(item.sourceId) ? item.sourceId : "",
            title: item.title,
            kind: item.kind,
            dueDate: item.dueDate,
            goalId: goal?.id || "",
            minutes: item.minutes || 30
          }),
          note: item.generate ? `Luna will generate a ${item.generate} from “${known?.name || "the material"}”.` : (known ? `Material: ${known.name}` : ""),
          generate: item.generate || "",
          sourceDocumentId: item.sourceId || "",
          concepts: item.concepts || []
        };
      });
      const plan = buildPlan({
        name: name.trim() || proposal.name || "Study plan",
        deadlines: [newDeadline("Exam", deadline, "exam")],
        colour: PLAN_COLOURS[Math.floor(Math.random() * PLAN_COLOURS.length)],
        note: proposal.note || "",
        goals,
        items,
        materialIds: picked
      });
      await onSavePlan?.(plan);
      onDone?.(`Planned ${items.length} step${items.length === 1 ? "" : "s"} up to ${new Date(`${deadline}T00:00:00`).toLocaleDateString()}${performance ? ", fitted to how you have been scoring" : ""}.`);
    } catch (problem) {
      setError(String(problem.message || problem));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tw-scope fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/30 p-4" onClick={onCancel}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-[0_24px_64px_rgba(0,0,0,0.25)]" onClick={(event) => event.stopPropagation()}>
        <h4 className="m-0 text-lg font-bold text-ink">Plan it for me</h4>
        <p className="m-0 mt-1 text-xs text-soft-ink">Choose what to study and when it has to be ready. Luna spreads the work, generates the practice it needs, and gives more time to what you keep getting wrong.</p>
        <div className="mt-4 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-soft-ink">Plan name<input className={input} value={name} onChange={(event) => setName(event.target.value)} placeholder="Maths final · June" /></label>
            <label className="grid gap-1 text-xs font-semibold text-soft-ink">Ready by<input type="date" className={input} value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
          </div>
          <label className="grid gap-1 text-xs font-semibold text-soft-ink">Time per week
            <select className={input} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}>
              {[60, 120, 180, 240, 360].map((value) => <option key={value} value={value}>{value / 60} hour{value > 60 ? "s" : ""} a week</option>)}
            </select>
          </label>
          <div>
            <p className="m-0 text-xs font-semibold text-soft-ink">Practice to generate</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {KINDS.map((entry) => <button key={entry.id} type="button" onClick={() => toggle(kinds, setKinds, entry.id)} className={`${chip} ${kinds.includes(entry.id) ? "bg-[var(--accent)] text-white" : "border border-ink/15 text-soft-ink"}`}>{entry.label}</button>)}
            </div>
          </div>
          <div>
            <p className="m-0 text-xs font-semibold text-soft-ink">Material to study ({picked.length} selected)</p>
            <div className="mt-1.5 grid max-h-44 gap-1 overflow-y-auto rounded-xl border border-ink/10 p-2">
              {material.map((document) => (
                <label key={document.id} className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={picked.includes(document.id)} onChange={() => toggle(picked, setPicked, document.id)} />
                  <span className="truncate">{resourceByDocumentId.get(document.id)?.name || document.name}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-soft-ink">{document.sourceType === "generated" ? "resource" : "material"}</span>
                </label>
              ))}
              {!material.length ? <p className="m-0 text-xs text-soft-ink">Nothing in this folder yet.</p> : null}
            </div>
          </div>
          {performance ? <p className="m-0 rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-[11px] text-soft-ink">Luna will use your results: {performance.activities} activities, {Math.round(performance.average * 100)}% average{performance.weakConcepts.length ? `, weakest on ${performance.weakConcepts.slice(0, 3).join(", ")}` : ""}.</p> : null}
        </div>
        {error ? <p className="m-0 mt-2 text-xs text-[var(--color-danger)]">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onCancel}>Cancel</button>
          <button type="button" className={primaryBtn} disabled={busy || !deadline || !picked.length} onClick={generate}>{busy ? "Planning…" : "Build my plan"}</button>
        </div>
      </div>
    </div>
  );
}
