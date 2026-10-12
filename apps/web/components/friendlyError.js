/**
 * Turn what a failed request returned into a sentence a person can act on. A readable message from the server is kept
 * (it was written for people: "That name is already taken"); anything technical (stack traces, database codes,
 * "Unexpected token") becomes a plain sentence about what to do.
 */
const TECHNICAL = /(PGRST|supabase|postgres|SQLSTATE|TypeError|ReferenceError|SyntaxError|Unexpected token|undefined|is not a function|JSON|ECONN|ETIMEDOUT|stack|relation ".*" does not exist|violates|\bat \w+\.js)/i;

export function friendlyMessage(raw = "", status = 0) {
  const text = String(raw || "").trim();
  if (/failed to fetch|networkerror|load failed|could not reach|network request failed/i.test(text) || status === 0 && !text) return "Luna can't be reached right now. Check your connection and try again.";
  if (status === 401) return "Please sign in again to continue.";
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "That item no longer exists. Refresh the page and try again.";
  if (status === 413) return "That is too large to send in one go. Reduce the file size or upload fewer files at a time.";
  if (status === 429) return "Too many requests. Wait a moment and try again.";
  const readable = text && text.length <= 180 && !TECHNICAL.test(text) && /\s/.test(text);
  if (readable) return text;
  return status >= 500 || TECHNICAL.test(text) ? "Something went wrong on our side. Try again in a moment." : "That did not work. Try again.";
}
