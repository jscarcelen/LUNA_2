"use client";

import { useMemo, useState } from "react";
import { AskLuna } from "./AskLuna";

// Above the feedback button; on a phone also above the tab bar.
const POSITION = "fixed bottom-[152px] right-3 z-[45] min-[761px]:bottom-16 min-[761px]:right-4";

/**
 * "Chat with Luna": the chat button that floats on every page (AppShell renders it once). It knows which
 * page the user is on, so they can ask about what they see, about their material, or about any other topic.
 * Pages that show their own Ask Luna button (the readers) hide this one.
 */
export function GlobalAskLuna({ title, hidden = false }) {
  const [open, setOpen] = useState(false);
  const view = useMemo(() => ({ kind: "page", title }), [title]);
  if (hidden) return null;
  return <AskLuna open={open} onOpenChange={setOpen} item={{}} view={view} layout="floating" mode="page" launcherPosition={POSITION} />;
}
