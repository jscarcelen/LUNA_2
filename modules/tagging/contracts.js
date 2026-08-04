export const TAGGING_DOMAIN_VERSION = "1";
export const DEFAULT_TOPIC_TAG_COLOR = "#ffd66b";

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function normalizeTagName(tag) {
  return String(tag || "").trim().toLowerCase();
}

export function dedupeTagNames(tags) {
  const normalized = (tags || []).map((tag) => normalizeTagName(tag)).filter(Boolean);
  return Array.from(new Set(normalized));
}

export function normalizeTopicTagColor(color) {
  const nextColor = String(color || "").trim();
  if (!HEX_COLOR_PATTERN.test(nextColor)) {
    return DEFAULT_TOPIC_TAG_COLOR;
  }
  return nextColor.toLowerCase();
}