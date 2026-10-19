import { tActive } from "../lib/i18n/index.js";

/**
 * Turn what a failed request returned into a sentence a person can act on. A readable message from the server is kept
 * (it was written for people: "That name is already taken"); anything technical (stack traces, database codes,
 * "Unexpected token") becomes a plain sentence about what to do.
 */
const TECHNICAL = /(PGRST|supabase|postgres|SQLSTATE|TypeError|ReferenceError|SyntaxError|Unexpected token|undefined|is not a function|JSON|ECONN|ETIMEDOUT|stack|relation ".*" does not exist|violates|\bat \w+\.js)/i;

export function friendlyMessage(raw = "", status = 0, t = tActive) {
  const text = String(raw || "").trim();
  if (/failed to fetch|networkerror|load failed|could not reach|network request failed/i.test(text) || status === 0 && !text) return t("misc.err.network");
  if (status === 401) return t("misc.err.401");
  if (status === 403) return t("misc.err.403");
  if (status === 404) return t("misc.err.404");
  if (status === 413) return t("misc.err.413");
  if (status === 429) return t("misc.err.429");
  const readable = text && text.length <= 180 && !TECHNICAL.test(text) && /\s/.test(text);
  if (readable) return text;
  return status >= 500 || TECHNICAL.test(text) ? t("misc.err.server") : t("misc.err.generic");
}
