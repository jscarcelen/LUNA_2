/**
 * Phone numbers: one account <-> one phone, compared in E.164 ("+14155552671").
 *
 * No heavy dependency on purpose. The rule is: the number must carry its country code (a leading "+" or
 * the international "00" prefix); spaces, dashes, dots and parentheses are accepted and removed. LUNA
 * does not guess a default country, because guessing wrong would link two different people to one number.
 * The phone is NOT verified by SMS yet (accounts.phone_verified_at stays null); when an SMS provider
 * exists, it only has to set that column after a code check.
 */

export const PHONE_HELP = "Include the country code, for example +1 415 555 2671 or +34 612 34 56 78.";

/** E.164: "+", a non-zero country digit, then 7 to 14 more digits (15 in total at most). */
export const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * @param {unknown} input what the person typed
 * @param {{ required?: boolean }} [options] `required: false` accepts an empty value (-> `{ ok: true, e164: "" }`),
 *   used to remove a phone from an existing account. Sign-up always requires one.
 * @returns {{ ok: true, e164: string } | { ok: false, error: string }}
 */
export function normalizePhone(input, { required = true } = {}) {
  const raw = String(input ?? "").trim();
  if (!raw) return required ? { ok: false, error: "Enter your phone number." } : { ok: true, e164: "" };
  if (raw.length > 40) return { ok: false, error: "That phone number is too long." };
  // Only digits and the usual separators; letters (or an extension such as "x123") are refused, not guessed at.
  if (!/^[+\d\s().-]+$/.test(raw)) return { ok: false, error: `Use digits only (spaces, dashes and brackets are fine). ${PHONE_HELP}` };
  let text = raw;
  // "+44 (0)20 7946 0958": the optional trunk zero written in brackets is not part of the number.
  text = text.replace(/^(\s*\+\s*\d{1,3}[\s.-]*)\(0\)/, "$1");
  const hasPlus = text.trimStart().startsWith("+");
  if (hasPlus && text.indexOf("+") !== text.search(/\S/)) return { ok: false, error: "A + sign is only allowed at the start." };
  if ((text.match(/\+/g) || []).length > 1) return { ok: false, error: "A + sign is only allowed at the start." };
  let digits = text.replace(/[^\d]/g, "");
  if (hasPlus) {
    // already international
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else {
    return { ok: false, error: `The number needs its country code. ${PHONE_HELP}` };
  }
  const e164 = `+${digits}`;
  if (!E164.test(e164)) return { ok: false, error: `That does not look like a full international phone number. ${PHONE_HELP}` };
  return { ok: true, e164 };
}

/** A phone for display with the middle hidden, e.g. in emails or logs: "+1 ••• ••• 2671". */
export function maskPhone(e164) {
  const value = String(e164 || "");
  return value.length > 6 ? `${value.slice(0, 2)}${"•".repeat(Math.max(0, value.length - 6))}${value.slice(-4)}` : "";
}
