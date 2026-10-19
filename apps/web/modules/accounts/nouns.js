/** Plural of the people noun used across My students / My children ("student" → "students", "child" → "children"). */
export const pluralNoun = (noun) => (noun === "child" ? "children" : `${noun}s`);

/** The name a parent types to confirm deleting a child's account, and the one shown in the dialog. */
export const childLabel = (student) => String(student?.displayName || student?.email || "this child").trim();

/** Does what was typed match the child's name (ignoring case and extra spaces)? Never true for an empty name. */
export const matchesChildName = (typed, student) => {
  const norm = (value) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  return Boolean(norm(childLabel(student))) && norm(typed) === norm(childLabel(student));
};
