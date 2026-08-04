export const WORKSPACES_DOMAIN_VERSION = "1";

export const DEFAULT_WORKSPACE_COLOR = "#2f6db2";
export const DEFAULT_SUBJECT_COLOR = "#2a5f9e";

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function normalizeWorkspaceName(name) {
  return String(name || "").trim();
}

export function normalizeSubjectName(name) {
  return String(name || "").trim();
}

export function normalizeWorkspaceColor(color) {
  const nextColor = String(color || "").trim();
  if (!HEX_COLOR_PATTERN.test(nextColor)) {
    return DEFAULT_WORKSPACE_COLOR;
  }
  return nextColor.toLowerCase();
}

export function normalizeSubjectColor(color) {
  const nextColor = String(color || "").trim();
  if (!HEX_COLOR_PATTERN.test(nextColor)) {
    return DEFAULT_SUBJECT_COLOR;
  }
  return nextColor.toLowerCase();
}