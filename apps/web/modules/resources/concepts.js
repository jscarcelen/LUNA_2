/**
 * What a resource teaches.
 *
 * Every generated resource carries a list of concepts — small, granular learning goals ("solve a
 * quadratic by factorising", "name the parts of a cell") — proposed by Luna and edited by the
 * person. They are what makes a study plan meaningful: several resources can teach the same
 * concept, a plan's goals are expressed as concepts, and performance can then be read per concept
 * rather than per document.
 */

export const CONCEPT_LEVELS = ["remember", "understand", "apply", "analyse"];

/** Same concept written slightly differently ("Quadratic Equations" / "quadratic equation"). */
export function conceptKey(name) {
  const normalised = String(name || "").toLowerCase().trim().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ");
  return normalised.endsWith("s") && normalised.length > 3 ? normalised.slice(0, -1) : normalised;
}

let counter = 0;
export const newConcept = (name, detail = "", level = "understand") => ({
  id: `c_${Date.now().toString(36)}${(counter += 1).toString(36)}`,
  name: String(name || "").trim(),
  detail,
  level: CONCEPT_LEVELS.includes(level) ? level : "understand"
});

export function resourceConcepts(resource) {
  return Array.isArray(resource?.concepts) ? resource.concepts : [];
}

/** All concepts across resources, each with the resources that teach it. */
export function conceptIndex(rows = []) {
  const map = new Map();
  for (const row of rows) {
    for (const concept of resourceConcepts(row.resource)) {
      const key = conceptKey(concept.name);
      if (!key) continue;
      const entry = map.get(key) || { key, name: concept.name, level: concept.level, resources: [] };
      entry.resources.push({ documentId: row.document.id, name: row.resource.name });
      map.set(key, entry);
    }
  }
  return [...map.values()].sort((a, b) => b.resources.length - a.resources.length || a.name.localeCompare(b.name));
}

/** Concepts a set of resources covers, deduplicated — what a plan actually teaches. */
export function coveredConcepts(rows = [], documentIds = []) {
  const wanted = new Set(documentIds);
  return conceptIndex(rows.filter((row) => wanted.has(row.document.id)));
}
