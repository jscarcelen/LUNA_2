"use client";

import { useEffect, useState } from "react";
import { accountsApi } from "./api";
import { useT } from "../../lib/i18n/LocaleProvider.js";
import { tEn } from "../../lib/i18n/index.js";

const banner = "tw-scope mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[rgba(255,149,0,0.35)] bg-[rgba(255,149,0,0.08)] px-4 py-3 text-sm text-ink";
const smallBtn = "rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50";

/** What the resend button said, in words. */
export function resendMessage(result, t = tEn) {
  if (!result.ok) return { tone: "error", text: result.setupNeeded ? t("dialogs.notice.dbStep") : result.error };
  if (result.data?.alreadyVerified) return { tone: "ok", text: t("dialogs.notice.already") };
  const confirmation = result.data?.confirmation || {};
  if (confirmation.mailSetupNeeded) return { tone: confirmation.devPreview ? "ok" : "error", text: confirmation.devPreview ? t("dialogs.notice.devMode") : t("dialogs.notice.noMail"), link: confirmation.devPreview?.links?.[0] };
  if (confirmation.delivered) return { tone: "ok", text: t("dialogs.notice.sent") };
  return { tone: "error", text: t("dialogs.notice.failed") };
}

/**
 * Banners above the real platform's pages: (1) the email is not confirmed yet - with a rate-limited
 * "Resend email" button, and (2) an under-13 student whose parent has not accepted a connection yet.
 */
export function PlatformNotice({ account, onOpenPage }) {
  const t = useT();
  const [needsParent, setNeedsParent] = useState(false);
  const [resend, setResend] = useState({ busy: false, message: null });
  useEffect(() => {
    if (!account?.under13) return undefined;
    let live = true;
    accountsApi.me().then((result) => { if (live && result.ok) setNeedsParent(Boolean(result.data.needsParent)); });
    return () => { live = false; };
  }, [account]);

  async function sendAgain() {
    setResend({ busy: true, message: null });
    const result = await accountsApi.resendVerification();
    setResend({ busy: false, message: resendMessage(result, t) });
  }

  const unverified = account?.emailVerified === false;
  if (!unverified && !needsParent) return null;
  return (
    <>
      {unverified ? (
        <div role="status" className={banner}>
          <span className="min-w-0 flex-1 basis-60">
            <strong>{t("dialogs.notice.verify")}</strong> {t("dialogs.notice.sentLink", { email: account.email })}
            {resend.message ? (
              <span className={`mt-1 block text-xs ${resend.message.tone === "error" ? "text-[var(--color-danger)]" : "text-soft-ink"}`} role={resend.message.tone === "error" ? "alert" : undefined}>
                {resend.message.text}{resend.message.link ? <> <a className="font-semibold text-[var(--accent-ink)] underline" href={resend.message.link}>{t("dialogs.notice.openLink")}</a></> : null}
              </span>
            ) : null}
          </span>
          <button type="button" className={smallBtn} onClick={sendAgain} disabled={resend.busy}>{resend.busy ? t("dialogs.notice.sending") : t("dialogs.notice.resend")}</button>
        </div>
      ) : null}
      {needsParent ? (
        <div role="status" className={banner}>
          <span>{t("dialogs.notice.under13")}</span>
          <button type="button" className={smallBtn} onClick={() => onOpenPage?.("connections")}>{t("dialogs.notice.goConnections")}</button>
        </div>
      ) : null}
    </>
  );
}
