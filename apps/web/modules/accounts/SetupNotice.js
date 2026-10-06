/**
 * Shown wherever a migration is missing. A plain explanation instead of a crash: it works as soon as the
 * migration has been applied once. Accounts need the first one; sharing with permissions and the open network
 * need `202610060001` (pass `migration` + `title` for that one).
 */
export const ACCOUNTS_MIGRATION = "supabase/migrations/202610040001_accounts_links_sharing.sql";
export const SHARING_MIGRATION = "supabase/migrations/202610060001_network_sharing_grants.sql";

export function SetupNotice({ compact = false, migration = ACCOUNTS_MIGRATION, title = "Accounts need one database step" }) {
  return (
    <div role="alert" className={`rounded-2xl border border-[rgba(255,149,0,0.35)] bg-[rgba(255,149,0,0.08)] ${compact ? "p-3 text-xs" : "p-5 text-sm"} text-ink`}>
      <p className="m-0 font-semibold">{title}</p>
      <p className="m-0 mt-1">
        Apply <code className="rounded bg-white px-1 py-0.5">{migration}</code> in the Supabase SQL editor (or with the Supabase MCP <code className="rounded bg-white px-1 py-0.5">apply_migration</code>), then reload this page.
        The demo at <a className="font-semibold text-[var(--accent-ink)] underline" href="/app">/app</a> keeps working in the meantime.
      </p>
    </div>
  );
}
