"use client";

import { useEffect, useState } from "react";
import { accountsApi } from "./api";

/**
 * A thin banner above the real platform's pages. Today it only nags an under-13 student whose parent has
 * not accepted a connection yet (the sign-up form promised a parent account would be linked).
 */
export function PlatformNotice({ account, onOpenPage }) {
  const [needsParent, setNeedsParent] = useState(false);
  useEffect(() => {
    if (!account?.under13) return undefined;
    let live = true;
    accountsApi.me().then((result) => { if (live && result.ok) setNeedsParent(Boolean(result.data.needsParent)); });
    return () => { live = false; };
  }, [account]);
  if (!needsParent) return null;
  return (
    <div role="status" className="tw-scope mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[rgba(255,149,0,0.35)] bg-[rgba(255,149,0,0.08)] px-4 py-3 text-sm text-ink">
      <span>Because you are under 13, a parent needs a LUNA account connected to yours. Ask them to sign up as a Parent and accept your request.</span>
      <button type="button" className="rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold" onClick={() => onOpenPage?.("connections")}>Go to Connections</button>
    </div>
  );
}
