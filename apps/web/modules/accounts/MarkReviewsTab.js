"use client";

import { useCallback, useEffect, useState } from "react";
import { accountsApi } from "./api";
import { SetupNotice } from "./SetupNotice";
import { card, ghostBtn, kicker } from "./ui";

/**
 * The questions a student asked to have reviewed. A teacher confirms or changes the mark (the student's score follows);
 * a parent can read them. The AI mark is guidance: this is where a person decides what counts.
 */
export function MarkReviewsTab({ student, canDecide }) {
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
  const name = student.displayName || "the student";
  return (
    <div className={`${card} grid gap-3 p-5`}>
      <p className={kicker}>Mark reviews</p>
      <p className="m-0 text-xs text-soft-ink">Marks made by Luna’s AI are guidance. When {name} asks, {canDecide ? "you decide what counts" : "their teacher decides what counts"}{canDecide ? " and the score updates." : "."}</p>
      {error ? <p className="m-0 text-sm text-[var(--color-danger)]" role="alert">{error}</p> : null}
      {reviews === null ? <p className="m-0 text-sm text-soft-ink">Loading…</p> : !reviews.length ? <p className="m-0 text-sm text-soft-ink">{name} has not asked for any review.</p> : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {reviews.map((review) => (
            <li key={review.id} className="grid gap-1.5 rounded-xl border border-ink/10 px-3 py-2.5">
              <span className="text-sm font-semibold text-ink">{review.question_prompt || "A question"}</span>
              <span className="text-xs text-soft-ink">Answer: <strong className="text-ink">{review.given || "—"}</strong> · Expected: <strong className="text-ink">{review.expected || "—"}</strong> · Luna marked it {review.ai_correct === true ? "right" : review.ai_correct === false ? "wrong" : "unmarked"}</span>
              {review.student_note ? <span className="text-xs text-ink">“{review.student_note}”</span> : null}
              {review.status === "requested" ? (
                canDecide ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input className="min-w-0 flex-1 rounded-xl border border-ink/12 bg-white px-3 py-1.5 text-xs" placeholder="Comment for the student (optional)" value={notes[review.id] || ""} onChange={(event) => setNotes({ ...notes, [review.id]: event.target.value })} />
                    <button type="button" className={ghostBtn} disabled={busy === review.id} onClick={() => decide(review, true)}>Mark right</button>
                    <button type="button" className={ghostBtn} disabled={busy === review.id} onClick={() => decide(review, false)}>Mark wrong</button>
                  </div>
                ) : <span className="text-[11px] font-semibold text-soft-ink">Waiting for the teacher</span>
              ) : (
                <span className="text-[11px] font-semibold text-soft-ink">{review.status === "overridden" ? "Teacher changed the mark" : "Teacher confirmed the mark"}: now {review.final_correct ? "right" : "wrong"}{review.teacher_note ? ` — ${review.teacher_note}` : ""}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
