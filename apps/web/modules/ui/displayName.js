/**
 * What a person reads as a file name. Generated files are stored as "<title>.resource.json" (and attempts as
 * "<title> · attempt.json"); the storage suffix is an implementation detail, so every place that SHOWS a name
 * goes through this helper. Never use it to build a stored name.
 */
export function displayName(name) {
  return String(name ?? "")
    .replace(/\.resource\.json$/i, "")
    .replace(/\s*[·-]\s*attempt\.json$/i, "")
    .trim();
}

/** After a rename the stored name keeps the suffix the old one had (code recognises generated files by it). */
export function keepStorageSuffix(oldName, newName) {
  const next = String(newName ?? "").trim();
  if (/\.resource\.json$/i.test(String(oldName ?? "")) && !/\.resource\.json$/i.test(next)) return `${next}.resource.json`;
  return next;
}

/**
 * A name typed in a save or rename box, checked only when the person confirms: the box may be empty while
 * they type (clearing it to retype is normal), and an empty or blank name is refused with a reason instead
 * of being replaced by a default. With `oldName` (a rename) the stored suffix is kept (keepStorageSuffix).
 * @returns {{ ok: true, name: string } | { ok: false, reason: "empty" }}
 */
export function nameToSave(typed, oldName = "") {
  const name = String(typed ?? "").replace(/\s+/g, " ").trim();
  if (!name) return { ok: false, reason: "empty" };
  return { ok: true, name: oldName ? keepStorageSuffix(oldName, name) : name };
}
