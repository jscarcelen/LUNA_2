/**
 * A tiny in-memory stand-in for the Supabase admin client, just big enough for the accounts code:
 * from(table).select / insert / update / delete with eq, in, is, order, limit, maybeSingle, single.
 * (`.or(...)` is not supported — tests that need it mock the function that uses it.)
 */
const TABLES = ["accounts", "account_links", "shared_items", "workspaces", "subjects", "folders", "documents", "document_tags", "document_folders", "topic_tags", "generated_document_exports", "account_tokens"];

/** Columns added by the verification migration; `legacySchema()` removes them to simulate a database that has not had it. */
const V2_DEFAULTS = { email_verified_at: null, phone: null, phone_verified_at: null, password_changed_at: null, notifications_seen_at: null, pending_invites: null };
const UNIQUES = { accounts: ["email", "phone"], account_links: ["pair_key"], account_tokens: ["token_hash"] };

export function createFakeDb() {
  let tables = {};
  let counter = 0;
  let allowedColumns = {}; // table -> Set of column names that exist (only set by legacySchema)
  const uid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

  const reset = () => {
    tables = Object.fromEntries(TABLES.map((name) => [name, []]));
    counter = 0;
    allowedColumns = {};
  };
  reset();

  /** A column the table does not have (only after legacySchema()): the error PostgREST gives. */
  function unknownColumn(table, state) {
    const allowed = allowedColumns[table];
    if (!allowed) return "";
    const named = [
      ...(typeof state.columns === "string" && state.columns !== "*" && !state.columns.includes("(") ? state.columns.split(",").map((part) => part.trim()) : []),
      ...(state.op === "insert" || state.op === "update" ? Object.keys(Array.isArray(state.payload) ? state.payload[0] || {} : state.payload || {}) : []),
      ...state.columnsUsed
    ];
    return named.find((column) => column && !allowed.has(column)) || "";
  }

  function duplicate(table, row, others) {
    for (const column of UNIQUES[table] || []) {
      if (row[column] === null || row[column] === undefined) continue;
      if (others.some((other) => other[column] === row[column])) {
        return { code: "23505", message: `duplicate key value violates unique constraint "${table}_${column}_unique"`, details: `Key (${column})=(${row[column]}) already exists.` };
      }
    }
    return null;
  }

  function from(table) {
    const missing = !tables[table];
    const state = { op: "select", payload: null, filters: [], order: null, limit: null, mode: "many", columns: "*", columnsUsed: [] };
    const run = () => {
      // A table that was never created answers the way PostgREST does before a migration is applied.
      if (missing) return { data: null, error: { code: "PGRST205", message: `Could not find the table 'public.${table}' in the schema cache` } };
      const rows = tables[table];
      const unknown = unknownColumn(table, state);
      if (unknown) return { data: null, error: { code: "42703", message: `column ${table}.${unknown} does not exist` } };
      const matching = () => rows.filter((row) => state.filters.every((test) => test(row)));
      if (state.op === "insert") {
        const defaults = table === "accounts" && !allowedColumns.accounts ? V2_DEFAULTS : {};
        const inserted = (Array.isArray(state.payload) ? state.payload : [state.payload]).map((row) => ({ id: uid(), created_at: new Date().toISOString(), ...defaults, ...row }));
        for (const row of inserted) {
          const clash = duplicate(table, row, rows);
          if (clash) return { data: null, error: clash };
        }
        rows.push(...inserted);
        return { data: state.mode === "many" ? inserted : inserted[0], error: null };
      }
      if (state.op === "update") {
        const changed = matching();
        for (const row of changed) {
          const clash = duplicate(table, { ...row, ...state.payload }, rows.filter((other) => other !== row));
          if (clash) return { data: null, error: clash };
        }
        for (const row of changed) Object.assign(row, state.payload);
        return { data: state.mode === "many" ? changed : changed[0] || null, error: null };
      }
      if (state.op === "delete") {
        const doomed = new Set(matching());
        tables[table] = rows.filter((row) => !doomed.has(row));
        return { data: null, error: null };
      }
      let list = matching();
      if (state.order) list = [...list].sort((a, b) => (String(a[state.order.column] ?? "") < String(b[state.order.column] ?? "") ? -1 : 1) * (state.order.ascending ? 1 : -1));
      if (state.limit !== null) list = list.slice(0, state.limit);
      if (table === "document_tags") list = list.map((row) => ({ ...row, topic_tags: tables.topic_tags.find((tag) => tag.id === row.topic_tag_id) || null }));
      if (state.mode === "one") return { data: list[0] || null, error: null };
      return { data: list, error: null };
    };
    const api = {
      select(columns = "*") { state.columns = columns; return api; },
      insert(payload) { state.op = "insert"; state.payload = payload; return api; },
      update(payload) { state.op = "update"; state.payload = payload; return api; },
      delete() { state.op = "delete"; return api; },
      eq(column, value) { state.columnsUsed.push(column); state.filters.push((row) => row[column] === value); return api; },
      in(column, values) { state.filters.push((row) => values.includes(row[column])); return api; },
      is(column, value) { state.filters.push((row) => (row[column] ?? null) === value); return api; },
      // Supports `a.eq.1,b.eq.2` and `and(a.eq.1,b.eq.2),and(...)`: true when any alternative matches.
      or(expression) {
        const parts = [];
        let depth = 0;
        let current = "";
        for (const char of String(expression)) {
          if (char === "(") depth += 1;
          if (char === ")") depth -= 1;
          if (char === "," && depth === 0) { parts.push(current); current = ""; } else current += char;
        }
        parts.push(current);
        const condition = (text) => {
          const [column, , ...rest] = text.split(".");
          return (row) => row[column] === rest.join(".");
        };
        const alternatives = parts.map((part) => {
          const inner = part.startsWith("and(") ? part.slice(4, -1).split(",") : [part];
          const tests = inner.map(condition);
          return (row) => tests.every((test) => test(row));
        });
        state.filters.push((row) => alternatives.some((test) => test(row)));
        return api;
      },
      order(column, { ascending = true } = {}) { state.order = { column, ascending }; return api; },
      limit(count) { state.limit = count; return api; },
      maybeSingle() { state.mode = "one"; return Promise.resolve(run()); },
      single() { state.mode = "one"; return Promise.resolve(run()); },
      then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); }
    };
    return api;
  }

  return {
    reset,
    uid,
    client: { from },
    table: (name) => tables[name],
    drop(...names) { for (const name of names) delete tables[name]; },
    /** The database before 202610050001: no new account/link columns, no account_tokens table. */
    legacySchema() {
      allowedColumns = {
        accounts: new Set(["id", "email", "password_hash", "display_name", "role", "under_13", "failed_logins", "locked_until", "created_at"]),
        account_links: new Set(["id", "kind", "requester_id", "requester_email", "target_id", "target_email", "status", "pair_key", "created_at", "responded_at"])
      };
      delete tables.account_tokens;
    },
    add(name, row) {
      const full = { id: uid(), created_at: new Date().toISOString(), ...row };
      tables[name].push(full);
      return full;
    }
  };
}

export const db = createFakeDb();
