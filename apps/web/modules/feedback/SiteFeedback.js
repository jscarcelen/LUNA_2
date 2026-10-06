"use client";

import { usePathname } from "next/navigation";
import { FeedbackWidget } from "./FeedbackWidget";

/**
 * The feedback button on every page outside the app itself (landing, log in, password reset…). Inside /app and /platform
 * AppShell mounts its own widget, which knows the page, role and account; the owner's board has none. TEMPORARY — see README.md.
 */
export function SiteFeedback() {
  const path = usePathname() || "/";
  if (path === "/app" || path.startsWith("/app/") || path.startsWith("/platform") || path.startsWith("/feedback-admin")) return null;
  const key = path === "/" ? "landing" : path.split("/")[1] || "landing";
  return <FeedbackWidget page={key} title={key === "landing" ? "the landing page" : ""} standalone />;
}
