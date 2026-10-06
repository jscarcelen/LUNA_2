/**
 * A small in-memory Supabase stand-in for the move tests: from(table).select / insert / update / delete
 * with eq, in, maybeSingle, single. `document_tags` rows resolve `topic_tags(tag)` like PostgREST does.
 * `failWhen(fn)` makes a call fail (to prove a move rolls back): fn({ table, op, payload }) -> true.
 */
const LINK_TABLES = ["document_tags", "document_folders"]; // join tables have no id column

export function createFakeClient(seed = {}, { missingTables = [] } = {}) {
  const tables = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }));
  let counter = 0;
  let failure = null;
  const log = [];

  function from(table) {
    const missing = missingTables.includes(table) || !tables[table];
    const state = { op: "select", payload: null, filters: [], mode: "many" };
    const run = () => {
      log.push({ table, op: state.op, payload: state.payload });
      if (missing) return { data: null, error: { code: "PGRST205", message: `Could not find the table 'public.${table}' in the schema cache` } };
      if (failure && failure({ table, op: state.op, payload: state.payload })) return { data: null, error: { code: "XX000", message: "injected failure" } };
      const rows = tables[table];
      const matching = () => rows.filter((row) => state.filters.every((test) => test(row)));
      if (state.op === "insert") {
        const inserted = (Array.isArray(state.payload) ? state.payload : [state.payload]).map((row) => (LINK_TABLES.includes(table) ? { ...row } : { id: `gen-${++counter}`, ...row }));
        rows.push(...inserted);
        return { data: state.mode === "many" ? inserted : inserted[0], error: null };
      }
      if (state.op === "update") {
        const changed = matching();
        for (const row of changed) Object.assign(row, state.payload);
        return { data: state.mode === "many" ? changed : changed[0] || null, error: null };
      }
      if (state.op === "delete") {
        const doomed = new Set(matching());
        tables[table] = rows.filter((row) => !doomed.has(row));
        return { data: null, error: null };
      }
      let list = matching().map((row) => ({ ...row }));
      if (table === "document_tags") list = list.map((row) => ({ ...row, topic_tags: (tables.topic_tags || []).find((tag) => tag.id === row.topic_tag_id) || null }));
      if (state.mode === "one") return { data: list[0] || null, error: null };
      return { data: list, error: null };
    };
    const api = {
      select() { return api; },
      insert(payload) { state.op = "insert"; state.payload = payload; return api; },
      update(payload) { state.op = "update"; state.payload = payload; return api; },
      delete() { state.op = "delete"; return api; },
      eq(column, value) { state.filters.push((row) => row[column] === value); return api; },
      in(column, values) { state.filters.push((row) => values.includes(row[column])); return api; },
      maybeSingle() { state.mode = "one"; return Promise.resolve(run()); },
      single() { state.mode = "one"; return Promise.resolve(run()); },
      then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); }
    };
    return api;
  }

  return {
    from,
    rows: (table) => (tables[table] || []).map((row) => ({ ...row })),
    log,
    failWhen(test) { failure = test; },
    clearFailure() { failure = null; }
  };
}

/**
 * Accounting and Statistics in one workspace, plus a second workspace that must stay out of reach.
 *   Accounting: Uploaded material > Ledgers > Old years (doc-1, doc-2), Generated material > Study plans > Exam plan (plan-doc + quiz-1)
 *   Statistics: Uploaded material > Ledgers, Generated material
 */
export function seedWorkspace() {
  return {
    workspaces: [{ id: "w1", owner_user_id: "u1" }, { id: "w2", owner_user_id: "u2" }],
    subjects: [
      { id: "acc", workspace_id: "w1", name: "Accounting" },
      { id: "sta", workspace_id: "w1", name: "Statistics" },
      { id: "oth", workspace_id: "w2", name: "Elsewhere" },
      { id: "shr", workspace_id: "w1", name: "Shared documents" }
    ],
    folders: [
      { id: "a-up", subject_id: "acc", name: "Uploaded material", parent_folder_id: null },
      { id: "a-led", subject_id: "acc", name: "Ledgers", parent_folder_id: "a-up" },
      { id: "a-sub", subject_id: "acc", name: "Old years", parent_folder_id: "a-led" },
      { id: "a-gen", subject_id: "acc", name: "Generated material", parent_folder_id: null },
      { id: "a-plans", subject_id: "acc", name: "Study plans", parent_folder_id: "a-gen" },
      { id: "a-loose", subject_id: "acc", name: "Resources not in study plans", parent_folder_id: "a-gen" },
      { id: "a-exam", subject_id: "acc", name: "Exam plan", parent_folder_id: "a-plans" },
      { id: "s-up", subject_id: "sta", name: "Uploaded material", parent_folder_id: null },
      { id: "s-led", subject_id: "sta", name: "Ledgers", parent_folder_id: "s-up" },
      { id: "s-gen", subject_id: "sta", name: "Generated material", parent_folder_id: null },
      { id: "o-up", subject_id: "oth", name: "Uploaded material", parent_folder_id: null }
    ],
    documents: [
      { id: "doc-1", subject_id: "acc", folder_id: "a-led", name: "Ledger basics", content: "text" },
      { id: "doc-2", subject_id: "acc", folder_id: "a-sub", name: "Ledger 2019", content: "text" },
      { id: "doc-3", subject_id: "acc", folder_id: "a-up", name: "Syllabus", content: "text" },
      { id: "quiz-1", subject_id: "acc", folder_id: "a-exam", name: "Exam quiz", content: "{}" },
      { id: "plan-doc", subject_id: "acc", folder_id: "a-exam", name: "Exam plan", content: JSON.stringify({ name: "Exam plan", materialIds: ["doc-3"], items: [{ resourceId: "quiz-1" }] }) },
      { id: "notes-1", subject_id: "acc", folder_id: null, name: "notes", content: JSON.stringify({ kind: "document-notes", documentId: "doc-1" }) },
      { id: "attempt-1", subject_id: "acc", folder_id: null, name: "attempt", content: JSON.stringify({ kind: "activity-attempt", activityDocumentId: "quiz-1", attempt: {} }) },
      { id: "shared-1", subject_id: "acc", folder_id: "a-up", name: "From a teacher", content: "x" },
      { id: "sdoc", subject_id: "sta", folder_id: "s-up", name: "Statistics notes", content: "x" }
    ],
    document_folders: [
      { document_id: "doc-1", folder_id: "a-led" },
      { document_id: "doc-1", folder_id: "a-up" },
      { document_id: "doc-2", folder_id: "a-sub" }
    ],
    topic_tags: [
      { id: "tt-a-notes", subject_id: "acc", tag: "doc-notes" },
      { id: "tt-a-attempt", subject_id: "acc", tag: "activity-attempt" },
      { id: "tt-a-plan", subject_id: "acc", tag: "study-plan" },
      { id: "tt-a-fav", subject_id: "acc", tag: "favourite" },
      { id: "tt-a-shared", subject_id: "acc", tag: "shared-by:abc" },
      { id: "tt-s-fav", subject_id: "sta", tag: "favourite" }
    ],
    document_tags: [
      { document_id: "notes-1", topic_tag_id: "tt-a-notes" },
      { document_id: "attempt-1", topic_tag_id: "tt-a-attempt" },
      { document_id: "plan-doc", topic_tag_id: "tt-a-plan" },
      { document_id: "doc-1", topic_tag_id: "tt-a-fav" },
      { document_id: "shared-1", topic_tag_id: "tt-a-shared" }
    ],
    document_chunks: [
      { id: "c1", document_id: "doc-1", subject_id: "acc" },
      { id: "c2", document_id: "doc-2", subject_id: "acc" }
    ],
    attempts: [{ id: "at1", activity_document_id: "quiz-1", subject_id: "acc" }],
    study_plans: []
  };
}
