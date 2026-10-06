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
  // live shares with permissions (files, folders, topics, study plans)
  grantOverview: () => call("/api/accounts/grants"),
  grantsOn: (kind, id) => call(`/api/accounts/grants?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`),
  shareLive: ({ kind, itemId, recipientIds, groupIds = [], permission }) => post("/api/accounts/grants", { action: "share", kind, itemId, recipientIds, groupIds, permission }),
  changePermission: (grantId, permission) => post("/api/accounts/grants", { action: "permission", grantId, permission }),
  revokeGrant: (grantId) => post("/api/accounts/grants", { action: "revoke", grantId }),
  leaveGrant: (grantId) => post("/api/accounts/grants", { action: "leave", grantId }),
  // copies of agents, templates and components
  shareCopy: (payload) => post("/api/accounts/share-copy", payload),
  pendingComponents: () => call("/api/accounts/share-copy"),
  markComponentsImported: (ids) => post("/api/accounts/share-copy", { kind: "imported", ids }),
  resendVerification: () => post("/api/accounts/resend-verification", {}),
  verifyEmail: (token) => post("/api/accounts/verify-email", { token }),
  requestPasswordReset: (email) => post("/api/accounts/password-reset/request", { email }),
  confirmPasswordReset: (form) => post("/api/accounts/password-reset/confirm", form),
  updatePhone: (phone, currentPassword) => post("/api/accounts/settings", { action: "phone", phone, currentPassword }),
  changePassword: (form) => post("/api/accounts/settings", { action: "password", ...form }),
  notifications: () => call("/api/accounts/notifications"),
  markNotificationsSeen: () => post("/api/accounts/notifications", { action: "seen" }),
  studentWorkspaces: (accountId) => call(`/api/accounts/linked/workspaces?accountId=${encodeURIComponent(accountId)}`),
  // groups of students (teacher / parent)
  groups: () => call("/api/accounts/groups"),
  createGroup: ({ name, colour, memberIds }) => post("/api/accounts/groups", { action: "create", name, colour, memberIds }),
  updateGroup: (groupId, patch) => post("/api/accounts/groups", { action: "update", groupId, ...patch }),
  deleteGroup: (groupId) => post("/api/accounts/groups", { action: "delete", groupId }),
  addGroupMembers: (groupId, memberIds) => post("/api/accounts/groups", { action: "addMembers", groupId, memberIds }),
  removeGroupMembers: (groupId, memberIds) => post("/api/accounts/groups", { action: "removeMembers", groupId, memberIds }),
  setMemberGroups: (memberId, groupIds) => post("/api/accounts/groups", { action: "setMemberGroups", memberId, groupIds }),
  groupMembers: ({ groupId, studentIds, offset = 0, limit = 10 }) => call(`/api/accounts/linked/members?${groupId ? `groupId=${encodeURIComponent(groupId)}` : `studentIds=${encodeURIComponent((studentIds || []).join(","))}`}&offset=${offset}&limit=${limit}`),
  // exam dates (teacher / parent send; students receive)
  examDates: () => call("/api/accounts/exam-dates"),
  sendExamDate: (payload) => post("/api/accounts/exam-dates", { action: "send", ...payload }),
  updateExamDate: (batchId, patch) => post("/api/accounts/exam-dates", { action: "update", batchId, ...patch }),
  cancelExamDate: (batchId) => post("/api/accounts/exam-dates", { action: "cancel", batchId }),
  dismissExamDate: (examDateId) => post("/api/accounts/exam-dates", { action: "dismiss", examDateId }),
  restoreExamDate: (examDateId) => post("/api/accounts/exam-dates", { action: "restore", examDateId }),
  linkPlanToExamDate: (examDateId, planDocumentId) => post("/api/accounts/exam-dates", { action: "link", examDateId, planDocumentId })
};

export const ROLE_LABEL = { student: "Student", teacher: "Teacher", parent: "Parent" };
