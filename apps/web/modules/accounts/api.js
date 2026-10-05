"use client";

/** Thin client for /api/accounts/*. Every call resolves (never throws) to { ok, status, data, error, setupNeeded }. */
async function call(path, options) {
  try {
    const response = await fetch(path, { cache: "no-store", credentials: "same-origin", ...options });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data, error: response.ok ? "" : String(data?.error || "Something went wrong."), setupNeeded: Boolean(data?.setupNeeded) };
  } catch (error) {
    return { ok: false, status: 0, data: {}, error: `Could not reach the server: ${String(error?.message || error)}`, setupNeeded: false };
  }
}

const post = (path, body) => call(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const accountsApi = {
  me: () => call("/api/accounts/me"),
  signup: (form) => post("/api/accounts/signup", form),
  login: (form) => post("/api/accounts/login", form),
  logout: () => post("/api/accounts/logout", {}),
  connections: () => call("/api/accounts/links"),
  requestLink: (email, relation) => post("/api/accounts/links", { action: "request", email, relation }),
  changeLink: (action, linkId) => post("/api/accounts/links", { action, linkId }),
  shared: () => call("/api/accounts/share"),
  send: (payload) => post("/api/accounts/share", payload),
  studentWorkspaces: (accountId) => call(`/api/accounts/linked/workspaces?accountId=${encodeURIComponent(accountId)}`)
};

export const ROLE_LABEL = { student: "Student", teacher: "Teacher", parent: "Parent" };
