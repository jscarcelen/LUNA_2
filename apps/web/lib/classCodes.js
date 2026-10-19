/**
 * Class join codes, the pure rules (no database, no network): the code alphabet and generator, how a typed code is
 * cleaned and validated, and the decision "may this student join this class, and how is an under-14 approved".
 * The database side is lib/classesRepository.js; the routes are app/api/accounts/classes/*.
 *
 * Approval of an under-14 (the school route): a student under 14 normally waits for a guardian's email approval.
 * A class whose teacher ticked "I confirm the school holds parental consent for students under 14 who join with this
 * code" (stored on the class with the teacher's id and a timestamp) lets an under-14 join with its code and be
 * approved by that confirmation instead. Any other class keeps the guardian flow.
 */
// Deliberately no import of accountsCore.js (it pulls node:crypto): this file is also bundled into the browser, so the
// two age rules it needs are repeated here and tests/class-codes.test.ts checks they agree with accountsCore.
const GUARDIAN_AGE = 14;
const needsGuardianConsent = (age) => Number.isFinite(age) && age < GUARDIAN_AGE;

function ageFromBirthDate(birthDate, now = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(birthDate || ""));
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  let age = now.getUTCFullYear() - year;
  if (now.getUTCMonth() + 1 < month || (now.getUTCMonth() + 1 === month && now.getUTCDate() < day)) age -= 1;
  return age >= 0 ? age : null;
}

/** Unambiguous: no I, L, O, Q (look like 1, 0) and no U, V (confused when handwritten). 20 letters, 20^6 = 64 million codes. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPRSTWXYZ";
export const CODE_LENGTH = 6;
export const MAX_CODE_ATTEMPTS = 8;
export const CLASS_NAME_MAX = 60;

/** The sentence the teacher ticks; the same text is shown in the UI and kept in the docs. */
export const SCHOOL_CONSENT_STATEMENT = "I confirm the school holds parental consent for students under 14 who join with this code";

/**
 * A random code of CODE_LENGTH letters. `randomInt(max)` must return an integer in [0, max): inject crypto.randomInt in
 * production (never Math.random for a secret) and a fixed sequence in tests.
 */
export function generateClassCode(randomInt) {
  let code = "";
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    const pick = Number(randomInt(CODE_ALPHABET.length));
    if (!Number.isInteger(pick) || pick < 0 || pick >= CODE_ALPHABET.length) throw new RangeError("randomInt must return an integer below the alphabet size.");
    code += CODE_ALPHABET[pick];
  }
  return code;
}

/** What a person types ("abc-def", " abcdef ", "ABC DEF") -> "ABCDEF"; anything that cannot be a code becomes "". */
export function normalizeClassCode(value) {
  const text = String(value || "").toUpperCase().replace(/[\s\-_.]/g, "");
  if (text.length !== CODE_LENGTH) return "";
  for (const letter of text) if (!CODE_ALPHABET.includes(letter)) return "";
  return text;
}

/** Show a code in two blocks of three ("ABC DEF") so it is easy to read out loud. */
export const formatClassCode = (code) => (code && code.length === CODE_LENGTH ? `${code.slice(0, 3)} ${code.slice(3)}` : String(code || ""));

export const normalizeClassName = (value) => String(value || "").replace(/\s+/g, " ").trim().slice(0, CLASS_NAME_MAX);

/**
 * Validates the creation form. The consent tick is never assumed: only a literal `true` records it.
 * @returns {{ ok: true, name: string, schoolConsent: boolean } | { ok: false, error: string }}
 */
export function validateClassCreation({ name, schoolConsent } = {}) {
  const clean = normalizeClassName(name);
  if (!clean) return { ok: false, error: "Give the class a name." };
  return { ok: true, name: clean, schoolConsent: schoolConsent === true };
}

/**
 * The age a student account counts as for the under-14 rule: the birth date wins, then an age given at sign-up, then the
 * under-13 flag. null = unknown (treated as not under 14: the account was created through the normal sign-up).
 */
export function studentAgeOf(row, now = new Date()) {
  if (!row) return null;
  const born = ageFromBirthDate(row.birth_date ?? row.birthDate, now);
  if (born !== null) return born;
  if (row.under_13 ?? row.under13) return GUARDIAN_AGE - 2;
  const age = Number(row.age);
  return Number.isFinite(age) && age > 0 ? age : null;
}

/**
 * May a student of this age join this class with its code, and how is an under-14 approved?
 *  - class missing or code switched off: `invalid_code` (the same answer for both, so a code cannot be probed);
 *  - 14 and over (or age unknown on an existing account): joins, `approval: "none"` (a student's own choice to join);
 *  - under 14 and the class carries the school's consent confirmation: joins, `approval: "school"`;
 *  - under 14 otherwise: `needs_guardian`, the guardian-email flow stays.
 * @param {{ age: number|null, classRow: null | { enabled?: boolean, schoolConsentAt?: string|null, schoolConsentBy?: string|null } }} input
 * @returns {{ ok: true, approval: "none" | "school" } | { ok: false, code: "invalid_code" | "needs_guardian", needsGuardian?: boolean }}
 */
export function decideClassJoin({ age, classRow }) {
  if (!classRow || classRow.enabled === false) return { ok: false, code: "invalid_code" };
  if (!needsGuardianConsent(age)) return { ok: true, approval: "none" };
  if (hasSchoolConsent(classRow)) return { ok: true, approval: "school" };
  return { ok: false, code: "needs_guardian", needsGuardian: true };
}

/** The confirmation counts only with both who confirmed it and when. */
export const hasSchoolConsent = (classRow) => Boolean(classRow?.schoolConsentAt && classRow?.schoolConsentBy);

export const CLASS_JOIN_MESSAGES = {
  invalid_code: "That class code did not work. Check it with your teacher.",
  needs_guardian: "This class has no school consent for students under 14. A parent or guardian has to agree first: use the parent or guardian email option instead.",
  teacher_only: "Only students can join a class with a code.",
  rate_limited: "Too many tries. Wait a few minutes and try again."
};
