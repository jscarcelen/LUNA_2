import type { DataObject, DataValue, FieldDef } from "./types";
import { slug } from "./model";

type Row = Record<string, DataValue>;

/**
 * Square puzzle (tarsia): N×N tiles from pairs. Pair k = (a, b) is placed on one internal edge —
 * `a` on one tile, `b` on its neighbour — so the solved grid always matches. Internal edges are
 * numbered row by row: first the N(N−1) horizontal joins, then the N(N−1) vertical joins.
 */
export function tilesFromPairs(pairs: Row[], size = 4): Row[] {
  const n = Math.max(2, size);
  const tiles: Row[] = Array.from({ length: n * n }, () => ({ top: "", right: "", bottom: "", left: "" }));
  const a = (row: Row) => String(row.word_a ?? row.a ?? row.left ?? row.word ?? Object.values(row)[0] ?? "");
  const b = (row: Row) => String(row.word_b ?? row.b ?? row.right ?? row.translation ?? Object.values(row)[1] ?? "");
  let k = 0;
  for (let r = 0; r < n; r += 1) for (let c = 0; c < n - 1; c += 1) {
    const pair = pairs[k];
    if (pair) { tiles[r * n + c].right = a(pair); tiles[r * n + c + 1].left = b(pair); }
    k += 1;
  }
  for (let r = 0; r < n - 1; r += 1) for (let c = 0; c < n; c += 1) {
    const pair = pairs[k];
    if (pair) { tiles[r * n + c].bottom = a(pair); tiles[(r + 1) * n + c].top = b(pair); }
    k += 1;
  }
  return tiles;
}

/** Number of pairs a tarsia of `size` needs (internal edges). */
export function tarsiaPairCount(size = 4): number {
  return 2 * size * (size - 1);
}

/** Fills derived lists in `data` from their source lists (idempotent; existing derived data is replaced). */
export function deriveData(fields: FieldDef[], data: DataObject): DataObject {
  let out = data;
  for (const field of fields) {
    if (field.type !== "array" || !field.derive) continue;
    const sourceKey = Object.keys(out).find((k) => slug(k) === slug(field.derive!.from));
    const source = sourceKey ? out[sourceKey] : undefined;
    if (!Array.isArray(source)) continue;
    const size = field.derive.size || (field.sampleCount ? Math.round(Math.sqrt(field.sampleCount)) : 4);
    if (field.derive.kind === "tarsia") out = { ...out, [slug(field.name)]: tilesFromPairs(source as Row[], size) };
  }
  return out;
}
