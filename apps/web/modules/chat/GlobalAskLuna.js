"use client";

import { useEffect, useMemo, useState } from "react";
import { AskLuna } from "./AskLuna";

// Above the feedback button; on a phone also above the tab bar.
const POSITION = "fixed bottom-[152px] right-3 z-[45] min-[761px]:bottom-16 min-[761px]:right-4";

/**
 * "Chat with Luna": the chat button that floats on every page (AppShell renders it once). It knows which
 * page the user is on, so they can ask about what they see, about their material, or about any other topic.
 * Pages that show their own Ask Luna button (the readers) hide this one.
 */
export const ASK_LUNA_EVENT = "luna:ask";

/** Opens the page-level chat from anywhere ("Ask Luna" on a selected document): `askLuna({ text, documentIds })`. */
export function askLuna(detail = {}) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(ASK_LUNA_EVENT, { detail }));
}

export function GlobalAskLuna({ title, hidden = false }) {
  const [open, setOpen] = useState(false);
  const [asked, setAsked] = useState({ ids: [], prefill: null });
  const view = useMemo(() => ({ kind: "page", title }), [title]);
  const item = useMemo(() => ({ sourceDocumentIds: asked.ids }), [asked.ids]);
  useEffect(() => {
    const onAsk = (event) => {
      const detail = event.detail || {};
      setAsked({ ids: Array.isArray(detail.documentIds) ? detail.documentIds : [], prefill: detail.text ? { text: String(detail.text), nonce: Date.now() } : null });
      setOpen(true);
    };
    window.addEventListener(ASK_LUNA_EVENT, onAsk);
    return () => window.removeEventListener(ASK_LUNA_EVENT, onAsk);
  }, []);
  if (hidden) return null;
  return <AskLuna open={open} onOpenChange={setOpen} item={item} view={view} layout="floating" mode="page" launcherPosition={POSITION} prefill={asked.prefill} />;
}
