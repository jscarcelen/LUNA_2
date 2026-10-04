"use client";

/**
 * A small pill that floats over the reader while a document someone sent you is open, so it is always
 * clear whose it is and that it cannot be changed.
 */
export function SharedNotice({ by = "", assigned = false, due = "" }) {
  const dueText = due ? new Date(`${due}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";
  return (
    <div role="note" className="tw-scope pointer-events-none fixed bottom-4 left-1/2 z-[70] max-w-[92vw] -translate-x-1/2 rounded-full border border-ink/10 bg-white px-4 py-2 text-xs font-semibold text-ink shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
      {assigned ? "Assigned by" : "Shared by"} {by || "another account"}{dueText ? ` · due ${dueText}` : ""} · read-only — you can highlight and take notes
    </div>
  );
}
