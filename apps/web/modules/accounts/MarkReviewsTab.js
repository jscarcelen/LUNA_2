"use client";

import { useCallback, useEffect, useState } from "react";
import { accountsApi } from "./api";
import { SetupNotice } from "./SetupNotice";
import { card, ghostBtn, kicker } from "./ui";
import { useT } from "../../lib/i18n/LocaleProvider.js";

/**
 * The questions a student asked to have reviewed. A teacher confirms or changes the mark (the student's score follows);
 * a parent can read them. The AI mark is guidance: this is where a person decides what counts.
 */
export function MarkReviewsTab({ student, canDecide }) {
  const t = useT();
  const [reviews, setReviews] = useState(null);
  const [setup, setSetup] = useState(null);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const result = await accountsApi.studentReviews(student.id);
    if (result.setupNeeded) { setSetup({ migration: result.migration || "" }); return; }
    if (!result.ok) { setError(result.error); setReviews([]); return; }
    setError("");
    setReviews(result.data.reviews || []);
  }, [student.id]);
  useEffect(() => { setReviews(null); load(); }, [load]);

  async function decide(review, correct) {
    setBusy(review.id);
    const result = await accountsApi.decideReview(review.id, correct, notes[review.id] || "");
    setBusy("");
    if (!result.ok) { setError(result.error); return; }
    load();
  }

  if (setup) return <SetupNotice migration={setup.migration} />;
  const name = student.displayName || t("people.rev.theStudent");
  return (
    <div className={`${card} grid gap-3 p-5`}>
      <p className={kicker}>{t("people.rev.title")}</p>
      <p className="m-0 text-xs text-soft-ink">{t("people.rev.intro", { name })} {canDecide ? t("people.rev.youDecide") : t("people.rev.teacherDecides")}{canDecide ? ` ${t("people.rev.scoreUpdates")}` : "."}</p>
      {error ? <p className="m-0 text-sm text-[var(--color-danger)]" role="alert">{error}</p> : null}
      {reviews === null ? <p className="m-0 text-sm text-soft-ink">{t("common.loading")}</p> : !reviews.length ? <p className="m-0 text-sm text-soft-ink">{t("people.rev.none", { name })}</p> : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {reviews.map((review) => (
            <li key={review.id} className="grid gap-1.5 rounded-xl border border-ink/10 px-3 py-2.5">
              <span className="text-sm font-semibold text-ink">{review.question_prompt || t("people.rev.aQuestion")}</span>
              <span className="text-xs text-soft-ink">{t("people.rev.answer")}: <strong className="text-ink">{review.given || "—"}</strong> · {t("people.rev.expected")}: <strong className="text-ink">{review.expected || "—"}</strong> · {review.ai_correct === true ? t("people.rev.markedRight") : review.ai_correct === false ? t("people.rev.markedWrong") : t("people.rev.markedNone")}</span>
              {review.student_note ? <span className="text-xs text-ink">“{review.student_note}”</span> : null}
              {review.status === "requested" ? (
                canDecide ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input className="min-w-0 flex-1 rounded-xl border border-ink/12 bg-white px-3 py-1.5 text-xs" placeholder={t("people.rev.commentPh")} value={notes[review.id] || ""} onChange={(event) => setNotes({ ...notes, [review.id]: event.target.value })} />
                    <button type="button" className={ghostBtn} disabled={busy === review.id} onClick={() => decide(review, true)}>{t("people.rev.markRight")}</button>
                    <button type="button" className={ghostBtn} disabled={busy === review.id} onClick={() => decide(review, false)}>{t("people.rev.markWrong")}</button>
                  </div>
                ) : <span className="text-[11px] font-semibold text-soft-ink">{t("people.rev.waiting")}</span>
              ) : (
                <span className="text-[11px] font-semibold text-soft-ink">{review.status === "overridden" ? t("people.rev.changed") : t("people.rev.confirmed")}: {review.final_correct ? t("people.rev.nowRight") : t("people.rev.nowWrong")}{review.teacher_note ? ` — ${review.teacher_note}` : ""}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
