"use client";

import { FORMAT_LABELS, getChildrenInsights, getClassInsights, getStudentInsights, isSampleData } from "../insights";

const card = "rounded-[18px] border border-ink/8 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";
const chip = "inline-flex items-center rounded-full bg-[var(--surface-soft)] px-2.5 py-0.5 text-[11px] font-semibold text-soft-ink";
const primaryBtn = "rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed] active:scale-[0.98]";
const ghostBtn = "rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-[var(--surface-soft)]";

function toneFor(score) {
  if (score >= 85) return "bg-teal";
  if (score >= 70) return "bg-[var(--accent)]";
  return "bg-burnt";
}

function Bar({ value, tone }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-soft)]">
      <div className={`h-full rounded-full ${tone || toneFor(value)} transition-[width] duration-700`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function Stat({ label, value, sub, tone = "text-ink" }) {
  return (
    <div className={card}>
      <p className={kicker}>{label}</p>
      <p className={`m-0 mt-2 text-3xl font-bold tracking-tight ${tone}`}>{value}</p>
      {sub ? <p className="m-0 mt-1 text-xs text-soft-ink">{sub}</p> : null}
    </div>
  );
}

function Avatar({ initials, size = "size-9 text-xs" }) {
  return <span className={`grid ${size} shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] font-bold text-[var(--accent-ink)]`}>{initials}</span>;
}

function Header({ title, subtitle, action }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h3 className="m-0 text-[26px] font-bold tracking-tight text-ink">{title}</h3>
        <p className="m-0 mt-1 text-sm text-soft-ink">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        {isSampleData ? <span className={chip} title="Real data arrives with accounts and quiz attempts">Sample data</span> : null}
        {action}
      </div>
    </div>
  );
}

function AssignmentRow({ item, showProgress }) {
  const done = item.status === "done";
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className={`grid size-8 shrink-0 place-items-center rounded-xl text-[11px] font-bold ${done ? "bg-teal/15 text-accent" : "bg-[var(--surface-soft)] text-soft-ink"}`}>{done ? "✓" : (FORMAT_LABELS[item.format] || item.format).slice(0, 2).toUpperCase()}</span>
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-sm font-semibold text-ink">{item.title}</p>
        <p className="m-0 text-xs text-soft-ink">{item.subject} · {FORMAT_LABELS[item.format] || item.format}{showProgress ? ` · ${item.completed}/${item.total} done` : ""}</p>
      </div>
      <span className={`${chip} ${done ? "" : "text-ink"}`}>{item.due}</span>
    </li>
  );
}

/* ---------------------------------------------------------------- Student */
function StudentDashboard({ onNavigate }) {
  const data = getStudentInsights();
  const bestFormat = Object.entries(data.formatScores).sort((a, b) => b[1] - a[1])[0];
  return (
    <section className="tw-scope grid gap-4">
      <Header title={`Good to see you, ${data.student.name.split(" ")[0]}`} subtitle="Here's where you are this week and what to do next." action={<button type="button" className={primaryBtn} onClick={() => onNavigate("ai-tools")}>Start studying</button>} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Overall score" value={`${data.overall}%`} sub={`${data.student.trend >= 0 ? "+" : ""}${data.student.trend}% this week`} />
        <Stat label="Day streak" value={data.student.streak} sub="Keep it going" />
        <Stat label="Study time" value={`${(data.student.studyMinutes / 60).toFixed(1)}h`} sub="Last 30 days" />
        <Stat label="Works best for you" value={FORMAT_LABELS[bestFormat[0]]} sub={`${bestFormat[1]}% avg when you use it`} tone="text-[var(--accent-ink)]" />
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className={card}>
          <p className={kicker}>To do</p>
          <ul className="m-0 mt-1 list-none divide-y divide-ink/6 p-0">
            {data.assignments.map((item) => <AssignmentRow key={item.id} item={item} />)}
          </ul>
        </div>
        <div className={card}>
          <p className={kicker}>By subject</p>
          <div className="mt-3 grid gap-3">
            {data.subjects.map((item) => (
              <div key={item.subject}>
                <div className="mb-1 flex items-center justify-between text-sm"><span className="font-semibold text-ink">{item.subject}</span><span className="text-soft-ink">{item.score}%</span></div>
                <Bar value={item.score} />
              </div>
            ))}
          </div>
          <p className="m-0 mt-4 text-xs text-soft-ink">Focus next: <strong className="text-ink">{data.weakest.subject}</strong>. Try {FORMAT_LABELS[data.student.preferredFormat].toLowerCase()} — that's the format you score best with.</p>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className={card}>
          <p className={kicker}>Recent activity</p>
          <ul className="m-0 mt-1 list-none divide-y divide-ink/6 p-0">
            {data.activity.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span className="text-ink">{item.text}</span><span className="shrink-0 text-xs text-soft-ink">{item.when}</span></li>
            ))}
          </ul>
        </div>
        <div className={card}>
          <p className={kicker}>Quick actions</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={ghostBtn} onClick={() => onNavigate("ai-tool:quiz-generator")}>Practice quiz</button>
            <button type="button" className={ghostBtn} onClick={() => onNavigate("marketplace")}>Find an agent</button>
            <button type="button" className={ghostBtn} onClick={() => onNavigate("workspaces")}>Upload notes</button>
            <button type="button" className={ghostBtn} onClick={() => onNavigate("ai-tool:ai-tutor")}>Ask the tutor</button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- Teacher */
function TeacherDashboard({ onNavigate }) {
  const data = getClassInsights();
  const formatEntries = Object.entries(data.formatMix).sort((a, b) => b[1] - a[1]);
  return (
    <section className="tw-scope grid gap-4">
      <Header title={data.className} subtitle={`${data.students.length} students · class average ${data.classAverage}%`} action={<button type="button" className={primaryBtn} onClick={() => onNavigate("ai-tools")}>Create a resource</button>} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Class average" value={`${data.classAverage}%`} sub="Across all subjects" />
        <Stat label="Needs attention" value={data.needsAttention.length} sub="Below 70% or trending down" tone={data.needsAttention.length ? "text-burnt" : "text-ink"} />
        <Stat label="Open assignments" value={data.assignments.filter((item) => item.status === "open").length} sub={`${data.assignments.reduce((sum, item) => sum + item.completed, 0)} submissions so far`} />
        <Stat label="Most effective format" value={FORMAT_LABELS[formatEntries[0][0]]} sub={`${formatEntries[0][1]} of ${data.students.length} students learn best with it`} tone="text-[var(--accent-ink)]" />
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className={`${card} overflow-x-auto`}>
          <p className={kicker}>Students</p>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-soft-ink">
                <th className="py-2 font-semibold">Student</th>
                <th className="py-2 font-semibold">Overall</th>
                <th className="py-2 font-semibold">Trend</th>
                <th className="py-2 font-semibold">Learns best with</th>
                <th className="py-2 font-semibold">Last active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/6">
              {data.students.map((student) => (
                <tr key={student.id}>
                  <td className="py-2.5"><span className="flex items-center gap-2"><Avatar initials={student.initials} size="size-8 text-[11px]" /><span className="font-semibold text-ink">{student.name}</span></span></td>
                  <td className="py-2.5"><span className="flex items-center gap-2"><span className="w-9 tabular-nums text-ink">{student.overall}%</span><span className="w-20"><Bar value={student.overall} /></span></span></td>
                  <td className={`py-2.5 tabular-nums ${student.trend < 0 ? "text-[var(--color-danger)]" : "text-accent"}`}>{student.trend >= 0 ? "+" : ""}{student.trend}%</td>
                  <td className="py-2.5"><span className={chip}>{FORMAT_LABELS[student.preferredFormat]}</span></td>
                  <td className="py-2.5 text-soft-ink">{student.lastActive}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-3">
          <div className={card}>
            <p className={kicker}>Suggested targeted homework</p>
            <ul className="m-0 mt-1 list-none divide-y divide-ink/6 p-0">
              {data.suggestions.map((item) => (
                <li key={item.studentId} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-sm font-semibold text-ink">{item.name} · {item.subject}</p>
                    <p className="m-0 text-xs text-soft-ink">Send as {FORMAT_LABELS[item.format].toLowerCase()} — their strongest format</p>
                  </div>
                  <button type="button" className={ghostBtn} onClick={() => onNavigate("marketplace")}>Create</button>
                </li>
              ))}
              {!data.suggestions.length ? <li className="py-2 text-sm text-soft-ink">Everyone is on track.</li> : null}
            </ul>
          </div>
          <div className={card}>
            <p className={kicker}>How this class learns</p>
            <div className="mt-3 grid gap-2">
              {formatEntries.map(([format, count]) => (
                <div key={format}>
                  <div className="mb-1 flex justify-between text-sm"><span className="text-ink">{FORMAT_LABELS[format]}</span><span className="text-soft-ink">{count}</span></div>
                  <Bar value={(count / data.students.length) * 100} tone="bg-[var(--accent)]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className={card}>
        <p className={kicker}>Assignments</p>
        <ul className="m-0 mt-1 list-none divide-y divide-ink/6 p-0">
          {data.assignments.map((item) => <AssignmentRow key={item.id} item={item} showProgress />)}
        </ul>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- Parent */
function ParentDashboard({ onNavigate }) {
  const data = getChildrenInsights();
  return (
    <section className="tw-scope grid gap-4">
      <Header title="Your children" subtitle="A calm weekly view of how each child is doing and how you can help." />
      <div className="grid gap-3 lg:grid-cols-2">
        {data.children.map((child) => (
          <div key={child.id} className={card}>
            <div className="flex items-center gap-3">
              <Avatar initials={child.initials} size="size-11 text-sm" />
              <div className="min-w-0 flex-1">
                <p className="m-0 text-base font-bold text-ink">{child.name}</p>
                <p className="m-0 text-xs text-soft-ink">{child.openAssignments} open assignment{child.openAssignments === 1 ? "" : "s"} · {child.weekMinutes} min studied this week · active {child.lastActive.toLowerCase()}</p>
              </div>
              <span className={`text-2xl font-bold tabular-nums ${child.overall >= 70 ? "text-ink" : "text-burnt"}`}>{child.overall}%</span>
            </div>
            <div className="mt-4 grid gap-2.5">
              {child.subjects.map((item) => (
                <div key={item.subject}>
                  <div className="mb-1 flex justify-between text-sm"><span className="text-ink">{item.subject}</span><span className="text-soft-ink">{item.score}%</span></div>
                  <Bar value={item.score} />
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl bg-[var(--surface-soft)] p-3">
              <p className="m-0 text-sm text-ink"><strong>What helps {child.name.split(" ")[0]}:</strong> {FORMAT_LABELS[child.preferredFormat].toLowerCase()}. Resources in this format score {child.preferredFormat === "flashcards" ? "12" : "9"}% higher than the rest.</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={primaryBtn} onClick={() => onNavigate("marketplace")}>Send practice</button>
              <button type="button" className={ghostBtn} onClick={() => onNavigate("workspaces")}>See their work</button>
            </div>
          </div>
        ))}
      </div>
      <div className={card}>
        <p className={kicker}>This week</p>
        <ul className="m-0 mt-1 list-none divide-y divide-ink/6 p-0">
          {data.activity.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span className="text-ink">{item.text}</span><span className="shrink-0 text-xs text-soft-ink">{item.when}</span></li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function DashboardPage({ role = "student", onNavigate = () => {} }) {
  if (role === "teacher") return <TeacherDashboard onNavigate={onNavigate} />;
  if (role === "parent") return <ParentDashboard onNavigate={onNavigate} />;
  return <StudentDashboard onNavigate={onNavigate} />;
}
