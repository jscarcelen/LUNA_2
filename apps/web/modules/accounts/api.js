"use client";

/** Thin client for /api/accounts/*. Every call resolves (never throws) to { ok, status, data, error, setupNeeded }. */
async function call(path, options) {
  try {
    const response = await fetch(path, { cache: "no-store", credentials: "same-origin", ...options });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data, error: response.ok ? "" : String(data?.error || "Something went wrong."), setupNeeded: Boolean(data?.setupNeeded), migration: String(data?.migration || "") };
  } catch (error) {
    return { ok: false, status: 0, data: {}, error: `Could not reach the server: ${String(error?.message || error)}`, setupNeeded: false, migration: "" };
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
  resendVerification: () => post("/api/accounts/resend-verification", {}),
  verifyEmail: (token) => post("/api/accounts/verify-email", { token }),
  requestPasswordReset: (email) => post("/api/accounts/password-reset/request", { email }),
  confirmPasswordReset: (form) => post("/api/accounts/password-reset/confirm", form),
  updatePhone: (phone, currentPassword) => post("/api/accounts/settings", { action: "phone", phone, currentPassword }),
  changePassword: (form) => post("/api/accounts/settings", { action: "password", ...form }),
  notifications: () => call("/api/accounts/notifications"),
  markNotificationsSeen: () => post("/api/accounts/notifications", { action: "seen" }),
  studentWorkspaces: (accountId) => call(`/api/accounts/linked/workspaces?accountId=${encodeURIComponent(accountId)}`)
};

export const ROLE_LABEL = { student: "Student", teacher: "Teacher", parent: "Parent" };
