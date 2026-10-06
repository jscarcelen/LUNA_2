"use client";

/**
 * A small pill that floats over the reader while something another account shared with you is open, so it is
 * always clear whose it is and what you may do with it: a copy that was sent to you is read-only; a live share is
 * the owner's original, view-only or editable (and then your edits change it for everyone who has it).
 */
export function SharedNotice({ by = "", assigned = false, due = "", live = false, canEdit = false }) {
  const dueText = due ? new Date(`${due}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";
  const tail = live
    ? (canEdit ? "you can edit — changes update the original for everyone" : "view only — you can highlight and take your own notes")
    : "read-only — you can highlight and take notes";
  return (
    <div role="note" className="tw-scope pointer-events-none fixed bottom-4 left-1/2 z-[70] max-w-[92vw] -translate-x-1/2 rounded-full border border-ink/10 bg-white px-4 py-2 text-xs font-semibold text-ink shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
      {assigned ? "Assigned by" : "Shared by"} {by || "another account"}{dueText ? ` · due ${dueText}, set by ${by || "the sender"}` : ""} · {tail}
    </div>
  );
}
