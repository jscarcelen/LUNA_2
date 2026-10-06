"use client";

import { useSyncExternalStore } from "react";

/**
 * A tiny bridge between the places that offer "Share…" (an agent card, a template, a custom component, a folder)
 * and the one dialog the real platform renders (AppShell). Those screens do not know about accounts: they ask
 * `requestShare({ kind, id, name, … })` and the shell opens the dialog. The demo (/app) has no accounts, so the
 * shell never says sharing is available there and the buttons do not appear.
 */
const listeners = new Set();
const availability = new Set();
let available = false;

export const SHARE_EVENT = "luna:share-item";

export function setSharingAvailable(value) {
  available = Boolean(value);
  for (const notify of availability) notify();
}

const subscribeAvailability = (callback) => {
  availability.add(callback);
  return () => availability.delete(callback);
};

/** True inside the real platform with a logged-in account. */
export function useSharingAvailable() {
  return useSyncExternalStore(subscribeAvailability, () => available, () => false);
}

/**
 * @param {{ kind: "document" | "folder" | "subject" | "agent" | "template" | "component", id?: string, name: string, document?: object, component?: object }} item
 */
export function requestShare(item) {
  for (const listener of listeners) listener(item);
}

export function onShareRequested(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** "Leave this share" (the person it was shared with gives it up): the shell calls the API and reloads the workspace. */
const leaveListeners = new Set();
export function requestLeaveShare(grantId) {
  for (const listener of leaveListeners) listener(grantId);
}
export function onLeaveRequested(listener) {
  leaveListeners.add(listener);
  return () => leaveListeners.delete(listener);
}
