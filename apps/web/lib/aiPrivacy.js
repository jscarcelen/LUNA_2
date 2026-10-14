/**
 * Data minimisation for AI calls (docs/LEGAL_COMPLIANCE_PLAN.md L17). Free text a person typed (an answer, a chat message, a
 * request to change a plan) can carry contact details they never meant to share with a model provider. Emails, phone numbers and
 * web addresses with a personal part are replaced with a neutral marker before the text leaves the server. Study material the
 * person uploaded is NOT scrubbed: changing it would change what they are studying.
 */
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// +34 612 345 678, (415) 555-2671, 612345678 ... 8 to 15 digits with the usual separators; a short number (a year, a score) is left alone.
const PHONE = /(?<![\w.])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{2,4}(?:[\s.-]\d{2,4}){1,4}(?![\w.])/g;

export function scrubPii(value) {
  if (typeof value !== "string" || !value) return value;
  return value
    .replace(EMAIL, "[email]")
    .replace(PHONE, (match) => (match.replace(/\D/g, "").length >= 8 ? "[phone]" : match));
}

/** Scrubs every `content` string of chat messages (the model sees the conversation, not the person's contact details). */
export function scrubMessages(messages) {
  return (Array.isArray(messages) ? messages : []).map((message) => (message && typeof message.content === "string" ? { ...message, content: scrubPii(message.content) } : message));
}
