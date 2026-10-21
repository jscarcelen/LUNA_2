/**
 * Files and whole folders dragged in from Finder (or Explorer). A dropped folder is read through the browser's
 * file-system entries (Safari, Chrome, Edge and Firefox all have them) and every file gets the path it had inside
 * the folder as `webkitRelativePath`, exactly like "Add folder" gives it, so the upload recreates the subfolders.
 */

/** True while the thing being dragged comes from outside the page (files), not a row of the workspace. */
export function isFileDrag(event) {
  const types = event?.dataTransfer?.types;
  return Boolean(types) && Array.from(types).includes("Files");
}

/** Hidden system files Finder carries along (.DS_Store, ._name) are never uploaded. */
export const isHiddenFile = (name) => String(name || "").startsWith(".");

function withPath(file, path) {
  if (path && path !== file.name) {
    try { Object.defineProperty(file, "webkitRelativePath", { value: path, configurable: true }); } catch { /* keep the file, flat */ }
  }
  return file;
}

const fileOf = (entry) => new Promise((resolve, reject) => entry.file(resolve, reject));

/** A directory reader hands entries out in pages (100 at a time in Chrome); read until it returns none. */
async function childrenOf(directory) {
  const reader = directory.createReader();
  const all = [];
  for (;;) {
    const page = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    if (!page.length) return all;
    all.push(...page);
  }
}

async function collect(entry, prefix, out) {
  if (!entry || isHiddenFile(entry.name)) return;
  const path = prefix ? `${prefix}/${entry.name}` : entry.name;
  if (entry.isFile) {
    try { out.push(withPath(await fileOf(entry), prefix ? path : "")); } catch { /* unreadable: skipped */ }
  } else if (entry.isDirectory) {
    for (const child of await childrenOf(entry)) await collect(child, path, out);
  }
}

/**
 * Every file in a drop, folders opened. The entries must be taken while the drop event runs (the browser empties
 * `dataTransfer` right after), so call this synchronously from the handler and await the promise afterwards.
 */
export function filesFromDrop(dataTransfer) {
  const items = Array.from(dataTransfer?.items || []).filter((item) => item.kind === "file");
  const entries = items.map((item) => (typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null));
  const plain = Array.from(dataTransfer?.files || []);
  if (!entries.length || entries.some((entry) => !entry)) return Promise.resolve(plain.filter((file) => !isHiddenFile(file.name)));
  return (async () => {
    const out = [];
    for (const entry of entries) await collect(entry, "", out);
    return out;
  })();
}
