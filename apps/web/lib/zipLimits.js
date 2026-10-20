/**
 * DOCX, PPTX and XLSX files are zip archives. A small archive can declare gigabytes of content (a "zip bomb") and
 * the parsers unpack entries fully in memory, so an upload is checked against what its central directory declares
 * before any parser opens it. Pure: reads the buffer only.
 */
export const MAX_ZIP_EXPANDED_BYTES = 300 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 5000;

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;

export const looksLikeZip = (buffer) => Boolean(buffer && buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50);

/** @returns {{ entries: number, expandedBytes: number } | null} null when the directory cannot be read (or uses ZIP64) */
export function zipDirectoryStats(buffer) {
  if (!looksLikeZip(buffer) || buffer.length < 22) return null;
  let end = -1;
  for (let at = buffer.length - 22; at >= Math.max(0, buffer.length - 65557); at -= 1) {
    if (buffer.readUInt32LE(at) === EOCD) { end = at; break; }
  }
  if (end < 0) return null;
  const entries = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);
  if (entries === 0xffff || at === 0xffffffff) return null;
  let expandedBytes = 0;
  for (let index = 0; index < entries; index += 1) {
    if (at + 46 > buffer.length || buffer.readUInt32LE(at) !== CENTRAL) return null;
    const size = buffer.readUInt32LE(at + 24);
    if (size === 0xffffffff) return null;
    expandedBytes += size;
    at += 46 + buffer.readUInt16LE(at + 28) + buffer.readUInt16LE(at + 30) + buffer.readUInt16LE(at + 32);
  }
  return { entries, expandedBytes };
}

/** Is this upload safe to unpack? Anything that is not a zip passes; a zip we cannot read does not. */
export function zipWithinLimits(buffer, { maxBytes = MAX_ZIP_EXPANDED_BYTES, maxEntries = MAX_ZIP_ENTRIES } = {}) {
  if (!looksLikeZip(buffer)) return true;
  const stats = zipDirectoryStats(buffer);
  return Boolean(stats) && stats.entries <= maxEntries && stats.expandedBytes <= maxBytes;
}
