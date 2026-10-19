"use client";

import { useState } from "react";
import { useT } from "../../lib/i18n/LocaleProvider.js";

/**
 * Shown in Study plans and Practice when the only topics are the shared ones ("Shared documents", "Shared with me"):
 * plans and activities belong in a topic of your own, so the first step is to name one.
 */
export function FirstSubjectCard({ onCreateSubject }) {
  const t = useT();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function create(event) {
    event.preventDefault();
    const clean = String(name || "").trim();
    if (!clean || busy) return;
    setBusy(true);
    try { await onCreateSubject(clean); } finally { setBusy(false); }
  }
  return (
    <section className="tw-scope grid gap-4">
      <form onSubmit={create} className="grid gap-3 rounded-[18px] border border-ink/10 bg-white p-6 shadow-[var(--shadow)]">
        <h2 className="m-0 text-xl font-bold text-ink">{t("courses.firstSubject.title")}</h2>
        <p className="m-0 text-sm text-soft-ink">{t("courses.firstSubject.body")}</p>
        <div className="flex flex-wrap gap-2">
          <input
            className="min-w-0 flex-1 rounded-full border border-ink/15 px-4 py-2 text-sm text-ink"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("courses.firstSubject.placeholder")}
            aria-label={t("courses.firstSubject.label")}
          />
          <button type="submit" disabled={!name.trim() || busy} className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {t("courses.firstSubject.create")}
          </button>
        </div>
      </form>
    </section>
  );
}
