"use client";

import { useEffect, useMemo, useState } from "react";
import { AskLuna } from "./AskLuna";


/**
 * "Ask Luna": the page-level chat (AppShell renders it once; it is opened from the single "Ask Luna" menu button, AskLunaMenu.js). It knows which
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
  return <AskLuna open={open} onOpenChange={setOpen} item={item} view={view} layout="floating" mode="page" hideLauncher prefill={asked.prefill} />;
}
