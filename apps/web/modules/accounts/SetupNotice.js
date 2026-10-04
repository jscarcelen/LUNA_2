/**
 * Shown wherever the accounts tables are missing. A plain explanation instead of a crash: accounts work
 * as soon as the migration has been applied once.
 */
export const ACCOUNTS_MIGRATION = "supabase/migrations/202610040001_accounts_links_sharing.sql";

export function SetupNotice({ compact = false }) {
  return (
    <div role="alert" className={`rounded-2xl border border-[rgba(255,149,0,0.35)] bg-[rgba(255,149,0,0.08)] ${compact ? "p-3 text-xs" : "p-5 text-sm"} text-ink`}>
      <p className="m-0 font-semibold">Accounts need one database step</p>
      <p className="m-0 mt-1">
        Apply <code className="rounded bg-white px-1 py-0.5">{ACCOUNTS_MIGRATION}</code> in the Supabase SQL editor (or with the Supabase MCP <code className="rounded bg-white px-1 py-0.5">apply_migration</code>), then reload this page.
        The demo at <a className="font-semibold text-[var(--accent-ink)] underline" href="/app">/app</a> keeps working in the meantime.
      </p>
    </div>
  );
}
