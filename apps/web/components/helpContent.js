/**
 * The "?" next to every page title: one plain sentence on what the page is for and the one thing to try. Keyed by the
 * page (the part before "?"). Short on purpose: a person should read it in ten seconds.
 * The text lives in lib/i18n/messages (help.* and tour.*); pass `t` from useT() to get the UI language, without it English.
 * (The component is PageHelp.js. This file has a different name on purpose: names that differ only by case collide on macOS.)
 */
import { tEn } from "../lib/i18n/index.js";

export const PAGE_HELP_KEYS = ["dashboard", "workspaces", "plans", "activities", "performance", "students", "create", "templates", "marketplace", "connections"];

/** Home and Progress read differently for a teacher or a parent: classes and a child, not "your studying". */
const ROLE_HELP_KEYS = {"teacher": ["dashboard", "performance", "students"], "parent": ["dashboard", "performance", "students"]};

export function helpFor(page = "", role = "student", t = tEn) {
  const base = String(page).split("?")[0];
  const entry = (key) => ({ what: t(`help.${key}.what`), tip: t(`help.${key}.tip`) });
  if (ROLE_HELP_KEYS[role]?.includes(base)) return entry(`${role}.${base}`);
  if (PAGE_HELP_KEYS.includes(base)) return entry(base);
  if (/^(ai-tool:|custom-agent:|agent-edit:)/.test(String(page)) || ["ai-tools", "builder", "revenue"].includes(base)) return entry("create");
  return null;
}

/** The first-run tour: one step per section. `video` is an optional short clip (a path under /public); a step shows a still illustration until one is added. */
const TOURS = {"phone": [["home", "⌂"], ["study", "📚"], ["library", "▤"], ["progress", "◴"]], "student": [["home", "⌂"], ["study", "📚"], ["progress", "◴"], ["create", "✦"]], "teacher": [["home", "⌂"], ["study", "📚"], ["progress", "◴"], ["create", "✦"]], "parent": [["home", "⌂"], ["study", "📚"], ["progress", "◴"]]};

/**
 * The tour for a teacher (classes) or a parent (their child): the student's tour talks about studying, which is not their job here.
 * A student on a phone gets the phone app's four tabs (Home, Study, Library, Progress) instead (`phone`).
 */
export const tourStepsFor = (role = "student", t = tEn, { phone = false } = {}) => {
  const tour = phone && role === "student" ? "phone" : TOURS[role] && role !== "phone" ? role : "student";
  return TOURS[tour].map(([id, icon]) => ({ id, icon, video: "", title: t(`tour.${tour}.${id}.title`), text: t(`tour.${tour}.${id}.text`) }));
};

export const TOUR_KEY = "luna.tour.v1";
export const TOUR_EVENT = "luna:tour";
