"use client";
import { useT } from "../../lib/i18n/LocaleProvider.js";

/**
 * A small pill that floats over the reader while something another account shared with you is open, so it is
 * always clear whose it is and what you may do with it: a copy that was sent to you is read-only; a live share is
 * the owner's original, view-only or editable (and then your edits change it for everyone who has it).
 */
export function SharedNotice({ by = "", assigned = false, due = "", live = false, canEdit = false }) {
  const t = useT();
  const dueText = due ? new Date(`${due}T00:00:00`).toLocaleDateString(t.locale, { day: "numeric", month: "short" }) : "";
  const tail = live
    ? (canEdit ? t("dialogs.sharedNotice.edit") : t("dialogs.sharedNotice.view"))
    : t("dialogs.sharedNotice.readOnly");
  return (
    <div role="note" className="tw-scope pointer-events-none fixed bottom-4 left-1/2 z-[70] max-w-[92vw] -translate-x-1/2 rounded-full border border-ink/10 bg-white px-4 py-2 text-xs font-semibold text-ink shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
      {assigned ? t("dialogs.sharedNotice.assignedBy", { by: by || t("dialogs.sharedNotice.another") }) : t("dialogs.sharedNotice.sharedBy", { by: by || t("dialogs.sharedNotice.another") })}{dueText ? ` · ${t("dialogs.sharedNotice.due", { date: dueText, by: by || t("dialogs.sharedNotice.sender") })}` : ""} · {tail}
    </div>
  );
}
