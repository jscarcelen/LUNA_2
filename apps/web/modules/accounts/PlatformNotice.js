"use client";

import { useEffect, useState } from "react";
import { accountsApi } from "./api";

const banner = "tw-scope mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[rgba(255,149,0,0.35)] bg-[rgba(255,149,0,0.08)] px-4 py-3 text-sm text-ink";
const smallBtn = "rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50";

/** What the resend button said, in words. */
export function resendMessage(result) {
  if (!result.ok) return { tone: "error", text: result.setupNeeded ? "Email confirmation needs one database step first." : result.error };
  if (result.data?.alreadyVerified) return { tone: "ok", text: "Your email is already confirmed. Reload the page." };
  const confirmation = result.data?.confirmation || {};
  if (confirmation.mailSetupNeeded) return { tone: confirmation.devPreview ? "ok" : "error", text: confirmation.devPreview ? "Email is not set up, so this is development mode: the link is printed in the server console." : "Email is not set up yet, so we cannot send it. Ask the person who runs this Luna to configure email.", link: confirmation.devPreview?.links?.[0] };
  if (confirmation.delivered) return { tone: "ok", text: "Sent. Check your inbox (and spam). The new link replaces the old one." };
  return { tone: "error", text: "We could not send the email. Try again in a moment." };
}

/**
 * Banners above the real platform's pages: (1) the email is not confirmed yet - with a rate-limited
 * "Resend email" button, and (2) an under-13 student whose parent has not accepted a connection yet.
 */
export function PlatformNotice({ account, onOpenPage }) {
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
    setResend({ busy: false, message: resendMessage(result) });
  }

  const unverified = account?.emailVerified === false;
  if (!unverified && !needsParent) return null;
  return (
    <>
      {unverified ? (
        <div role="status" className={banner}>
          <span className="min-w-0 flex-1 basis-60">
            <strong>Verify your email.</strong> We sent a link to {account.email}. Until you confirm it you can use your own workspace, but you cannot connect with other people, share or assign work.
            {resend.message ? (
              <span className={`mt-1 block text-xs ${resend.message.tone === "error" ? "text-[var(--color-danger)]" : "text-soft-ink"}`} role={resend.message.tone === "error" ? "alert" : undefined}>
                {resend.message.text}{resend.message.link ? <> <a className="font-semibold text-[var(--accent-ink)] underline" href={resend.message.link}>Open the link</a></> : null}
              </span>
            ) : null}
          </span>
          <button type="button" className={smallBtn} onClick={sendAgain} disabled={resend.busy}>{resend.busy ? "Sending…" : "Resend email"}</button>
        </div>
      ) : null}
      {needsParent ? (
        <div role="status" className={banner}>
          <span>Because you are under 13, a parent needs a LUNA account connected to yours. Ask them to sign up as a Parent and accept your request.</span>
          <button type="button" className={smallBtn} onClick={() => onOpenPage?.("connections")}>Go to Connections</button>
        </div>
      ) : null}
    </>
  );
}
