"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AiGuidanceNote, card, ghostBtn, kicker } from "./parts";
import { formatDate } from "../../../lib/i18n/index.js";
import { useT, useLocale } from "../../../lib/i18n/LocaleProvider.js";

const KIND_LABEL = {
  practise: "Practise",
  reteach: "Re-teach",
  review: "Review",
  "spaced-recall": "Come back to it",
  "exam-technique": "Exam technique",
  deadline: "Due soon",
  habit: "Habit",
  "skill-primer": "Refresh a skill"
};

const cacheKey = (signature) => `luna.performance.coach.v5.${signature}`;

/**
 * Luna's read of the results.
 *
 * Everything else on this screen measures. This asks the model to read those measurements — mastery
 * per topic, the kinds of mistake, the questions that keep going wrong — and say what to do about
 * it, as actions the screen can act on: generate the practice, put it in a plan, open the material.
 * The read is cached against the evidence it was made from, so it is not re-bought on every render
 * and it visibly goes stale when the evidence moves.
 */
export function CoachPanel({ role = "student", learner = "", topics = [], errorTypes = [], stuck = [], plan = null, skillDiagnosis = null, onPractise, onSchedule, practiseLabel = "", autoRead = false }) {
  const t = useT();
  const { locale } = useLocale();
  const [state, setState] = useState({ status: "idle", read: null, error: "" });
  const signature = `${locale}|${role}|${learner}|${topics.map((topic) => `${topic.topic}:${topic.mastery}:${topic.questions}`).join(",")}|${errorTypes.map((type) => `${type.id}:${type.count}`).join(",")}|${(skillDiagnosis?.weakSkills || []).map((skill) => `${skill.id}:${Math.round((skill.acc || 0) * 100)}`).join(",")}|${plan?.name || ""}|${(plan?.upcoming || []).map((step) => `${step.title}@${step.dueDate}`).join(",")}`;
  const digest = hash(signature);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = JSON.parse(window.localStorage.getItem(cacheKey(digest)) || "null");
      setState(stored ? { status: "done", read: stored, error: "" } : { status: "idle", read: null, error: "" });
    } catch { setState({ status: "idle", read: null, error: "" }); }
  }, [digest]);

  const read = useCallback(async () => {
    setState((current) => ({ ...current, status: "reading", error: "" }));
    try {
      const response = await fetch("/api/performance/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, learner, topics, errorTypes, stuck, plan, skills: skillDigest(skillDiagnosis), language: locale })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || t("progress.coach.couldNot"));
      try { window.localStorage.setItem(cacheKey(digest), JSON.stringify(payload)); } catch { /* fine without the cache */ }
      setState({ status: "done", read: payload, error: "" });
    } catch (error) {
      setState({ status: "idle", read: null, error: error.message });
    }
  }, [role, learner, topics, errorTypes, stuck, plan, skillDiagnosis, digest, locale, t]);

  // The Home reads by itself the first time it sees a given state of the evidence (the read is cached against it).
  const triedRef = useRef("");
  useEffect(() => {
    if (!autoRead || state.status !== "idle" || state.read || (!topics.length && !errorTypes.length) || triedRef.current === digest) return;
    triedRef.current = digest;
    try { if (window.localStorage.getItem(cacheKey(digest))) return; } catch { /* no cache to look in */ }
    read();
  }, [autoRead, state.status, state.read, digest, topics.length, errorTypes.length, read]);

  const { read: result, status, error } = state;

  if (!topics.length && !errorTypes.length) {
    return <p className="m-0 rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-soft-ink">{t("progress.coach.empty")}</p>;
  }

  return (
    <div className="grid gap-3">
      <AiGuidanceNote />
      {result ? (
        <>
          <p className="m-0 text-[15px] font-semibold leading-snug text-ink">{result.headline}</p>
          <p className="m-0 text-sm leading-relaxed text-soft-ink">{result.diagnosis}</p>
          <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-soft-ink">{t("progress.coach.top5")}</p>
          <div className="grid gap-2">
            {(result.actions || []).slice(0, 5).map((action, index) => (
              <div key={`${action.title}-${index}`} className="rounded-xl border border-ink/10 p-3">
                <p className="m-0 flex flex-wrap items-baseline justify-between gap-2 text-sm font-bold text-ink">
                  <span className="min-w-0">{index + 1}. {action.title}</span>
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-soft-ink">{KIND_LABEL[action.kind] ? t(`progress.coach.kind.${action.kind}`) : action.kind} · {action.effort}{action.planStep && action.dueDate ? ` · ${t("progress.coach.due", { date: action.dueDate })}` : ""}</span>
                </p>
                <p className="m-0 mt-1 text-[11px] text-soft-ink">{action.why}</p>
                <p className="m-0 mt-1 text-[10px] font-semibold uppercase tracking-wider text-soft-ink">{action.planStep ? t("progress.coach.inPlan") : t("progress.coach.notInPlan")}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {action.planStep ? (
                    onPractise ? <button type="button" className={ghostBtn} onClick={() => onPractise(action)}>{practiseLabel || t("progress.coach.doIt")}</button> : null
                  ) : (
                    <>
                      {onPractise ? <button type="button" className={ghostBtn} onClick={() => onPractise(action)}>{t("progress.coach.createIt")}</button> : null}
                      {onSchedule ? <button type="button" className={ghostBtn} onClick={() => onSchedule(action)}>{t("progress.coach.addToPlan")}</button> : null}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          {result.messages ? (
            <details className="rounded-xl bg-[var(--surface-soft)] p-3">
              <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-soft-ink">{t("progress.coach.sameThing")}</summary>
              <div className="mt-2 grid gap-2">
                {[["student", t("progress.coach.toLearner")], ["parent", t("progress.coach.toParent")], ["teacher", t("progress.coach.toTeacher")]].map(([key, label]) => (
                  <p key={key} className="m-0 text-[12px] text-ink"><span className="font-semibold text-soft-ink">{label}: </span>{result.messages[key]}</p>
                ))}
              </div>
            </details>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={ghostBtn} disabled={status === "reading"} onClick={read}>{status === "reading" ? t("progress.coach.reading") : t("progress.coach.readAgain")}</button>
            <span className="text-[10px] text-soft-ink">{t("progress.coach.readAt", { when: result.readAt ? formatDate(result.readAt, locale, { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" }) : t("progress.coach.earlier") })}</span>
          </div>
        </>
      ) : (
        <>
          <p className="m-0 text-sm text-soft-ink">{t("progress.coach.intro")}</p>
          <button type="button" className={ghostBtn} disabled={status === "reading"} onClick={read}>{status === "reading" ? t("progress.coach.readingResults") : t("progress.coach.readMine")}</button>
          {error ? <p className="m-0 text-xs text-[var(--color-danger)]">{error}</p> : null}
        </>
      )}
    </div>
  );
}

/** What the coach is told about skills: the weak ones (and the topics they hold back) and each topic's verdict. */
function skillDigest(diagnosis) {
  if (!diagnosis || !diagnosis.rows) return null;
  return {
    headline: diagnosis.headline,
    weakSkills: (diagnosis.weakSkills || []).slice(0, 5).map((skill) => ({ id: skill.id, label: skill.label, accuracy: skill.acc, accuracyWithout: skill.accWithout, asked: skill.asked, lifts: skill.lifts.slice(0, 4) })),
    topics: (diagnosis.topics || []).filter((topic) => topic.verdict !== "ok").slice(0, 8).map((topic) => ({ topic: topic.topic, verdict: topic.verdict, skills: topic.skills, reason: topic.reason }))
  };
}

/** A short, stable key for one state of the evidence. */
function hash(text) {
  let value = 0;
  for (let index = 0; index < text.length; index += 1) value = (value * 31 + text.charCodeAt(index)) | 0;
  return Math.abs(value).toString(36);
}

export { card, kicker };
