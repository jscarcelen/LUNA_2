/**
 * Shown wherever a migration is missing. A plain explanation instead of a crash: it works as soon as the
 * migration has been applied once. Accounts need the first one; sharing with permissions and the open network
 * need `202610060001` (pass `migration` + `title` for that one).
 */
import { useT } from "../../lib/i18n/LocaleProvider.js";

export const ACCOUNTS_MIGRATION = "supabase/migrations/202610040001_accounts_links_sharing.sql";
export const SHARING_MIGRATION = "supabase/migrations/202610060001_network_sharing_grants.sql";
export const GROUPS_MIGRATION = "supabase/migrations/202610070001_groups_exam_dates.sql";

export function SetupNotice({ compact = false, migration = ACCOUNTS_MIGRATION, title }) {
  const t = useT();
  return (
    <div role="alert" className={`rounded-2xl border border-[rgba(255,149,0,0.35)] bg-[rgba(255,149,0,0.08)] ${compact ? "p-3 text-xs" : "p-5 text-sm"} text-ink`}>
      <p className="m-0 font-semibold">{title || t("dialogs.setup.title")}</p>
      <p className="m-0 mt-1">
        {t("dialogs.setup.apply")} <code className="rounded bg-white px-1 py-0.5">{migration}</code> {t("dialogs.setup.inEditor")} <code className="rounded bg-white px-1 py-0.5">apply_migration</code>{t("dialogs.setup.reload")}{" "}
        {t("dialogs.setup.demo")} <a className="font-semibold text-[var(--accent-ink)] underline" href="/app">/app</a> {t("dialogs.setup.demoKeeps")}
      </p>
    </div>
  );
}
