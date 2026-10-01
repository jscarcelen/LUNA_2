# LUNA — Adaptive Learning Engine: Architecture & Phased Implementation Plan

> **Status**: Design document — not yet implemented  
> **Last updated**: 2026-09-30  
> **Owner**: Jonathan Sanz  

---

## 1. Audit findings summary

The full audit is in the code comments; this section gives the verdict.

### What already exists and is worth building on

| Component | File(s) | Quality |
|---|---|---|
| Topic-level mastery formula | `performance/mastery.js:masteryOf()` | Good — blends recency, difficulty, coverage, retention, staleness |
| 8-type error classifier | `performance/errors.js:classifyError()` | Good heuristic — needs persistence |
| Per-question attempt data | `ActivityQuestion`, `Attempt` types | Solid schema — topic, difficulty, skill, correct, ms, confidence |
| Rich in-memory metrics | `performance/metrics.js` | Comprehensive — 12+ computed metrics |
| Vector embedding + RAG | `pipeline/chunking.js`, `document_chunks` table | Works — needs concept-level overlay |
| Coach LLM endpoint | `app/api/performance/coach/route.js` | Good — needs structured input |
| Plan LLM endpoint | `app/api/plans/generate/route.js` | One-shot only — needs algorithmic backbone |

### What does not exist

| Missing capability | Impact |
|---|---|
| Knowledge graph (concepts + prerequisites) | No structured curriculum map |
| Initial diagnostic assessment | System is blind at student's first session |
| DB-persisted student model | Mastery is recomputed from scratch every render; O(n) with all attempts |
| Concept-level mastery (not just topic-level) | Can't detect prerequisite gaps |
| Error type persistence | Error types lost between sessions; can't trend over time |
| Algorithmic planner | Entire plan is LLM-generated; no algorithmic constraints |
| Spaced repetition scheduling | No SM-2 / FSRS; re-study timing is arbitrary |
| Resource selection policy | User chooses; LLM decides within that; no mastery-aware logic |
| Re-planning on deviation | Plan never updates after initial generation |
| Cross-topic pattern detection | "You struggle with interpretation across all probability topics" doesn't exist |
| Format effectiveness model | `insights.js` format scores are hardcoded sample data |

### The fundamental architectural problem

Everything is stored as JSON blobs inside the `documents` table. Attempts, plans, resources, goals — all tagged documents. This makes cross-entity queries, indexed lookups, and algorithmic computation nearly impossible without full table scans in JavaScript. The mastery model recomputes from zero on every page load.

The redesign keeps the document model for content (resources, study materials) but adds proper relational tables for the adaptive learning loop.

---

## 2. Target architecture

```
REFERENCE DOCUMENTS
        │
        ▼  (at upload time, once)
KNOWLEDGE GRAPH
  concepts · prerequisites · difficulty · importance · source refs
        │
        ▼
INITIAL DIAGNOSTIC  (first session per subject)
        │
        ▼
STUDENT CONCEPT STATE  ←──────────────────────────────────────┐
  mastery · confidence · retention · error_profile · spacing  │
        │                                                      │
        ▼                                                      │
PLANNING ENGINE (algorithmic)                                 │
  priority score = f(mastery_gap, importance, urgency,        │
                     prereqs, forgetting, error_freq)         │
        │                                                      │
        ▼                                                      │
RESOURCE SELECTION POLICY                                     │
  (mastery, error_type, exam_proximity) → resource_kind       │
        │                                                      │
        ▼                                                      │
ACTIVITY (quiz / flashcards / worksheet / explanation…)       │
        │                                                      │
        ▼                                                      │
ASSESSMENT + ERROR DIAGNOSIS (per question, persisted)        │
        │                                                      │
        └──────────────────────────────────────────────────────┘
                        (update state, recompute priority, trigger replan)
```

**LLM is responsible for**: document understanding, concept extraction, content generation (questions/flashcards/summaries), open-answer evaluation, error narrative explanation, pattern interpretation.

**Algorithm is responsible for**: student state, mastery tracking, priority scoring, spaced-repetition scheduling, resource type selection, plan construction, re-planning, aggregation, trend calculation.

---

## 3. New data model

### 3.1 `concepts` table

```sql
CREATE TABLE concepts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  owner_user_id   uuid NOT NULL,

  name            text NOT NULL,
  description     text,
  topic           text,                     -- parent topic (free-text, matches existing topic_tags)
  bloom_level     text,                     -- remember | understand | apply | analyse | evaluate | create
  difficulty      float DEFAULT 0.5,        -- 0–1, LLM-estimated from source material
  importance      float DEFAULT 0.5,        -- 0–1, LLM-estimated
  question_types  text[] DEFAULT '{}',      -- which question types make sense

  source_pages    int[] DEFAULT '{}',       -- page references in source document
  source_chunk_ids uuid[] DEFAULT '{}',     -- document_chunks that cover this concept

  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX ON concepts(workspace_id);
CREATE INDEX ON concepts(source_document_id);
```

### 3.2 `concept_prerequisites` table

```sql
CREATE TABLE concept_prerequisites (
  concept_id      uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  prerequisite_id uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  strength        float DEFAULT 1.0,        -- 0–1: how critical is this prerequisite
  PRIMARY KEY (concept_id, prerequisite_id)
);
```

### 3.3 `question_concept_map` table

```sql
CREATE TABLE question_concept_map (
  question_id           text NOT NULL,       -- ActivityQuestion.id
  activity_document_id  uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  concept_id            uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  is_primary            boolean DEFAULT true,
  weight                float DEFAULT 1.0,   -- how strongly does this Q test this concept?
  PRIMARY KEY (question_id, concept_id)
);

CREATE INDEX ON question_concept_map(concept_id);
CREATE INDEX ON question_concept_map(activity_document_id);
```

### 3.4 `attempts` table (replaces JSON-blob storage)

```sql
CREATE TABLE attempts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id         uuid NOT NULL,
  learner_id            text NOT NULL,        -- localStorage learner string until auth lands
  activity_document_id  uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  subject_id            uuid REFERENCES subjects(id) ON DELETE SET NULL,

  at                    timestamptz NOT NULL,
  score                 float,                -- 0–1
  total                 int,
  duration_ms           int,

  created_at            timestamptz DEFAULT now()
);

CREATE INDEX ON attempts(learner_id, subject_id);
CREATE INDEX ON attempts(activity_document_id);
CREATE INDEX ON attempts(at);
```

### 3.5 `attempt_results` table

```sql
CREATE TABLE attempt_results (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id      uuid NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id     text NOT NULL,
  question_prompt text,
  concept_id      uuid REFERENCES concepts(id) ON DELETE SET NULL,
  topic           text,
  difficulty      text,                       -- easy | medium | hard
  skill           text,                       -- concept | calculation | application | etc.

  correct         boolean,
  given           text,
  expected        text,
  duration_ms     int,
  confidence      text,                       -- high | medium | low

  -- PERSISTED error classification (not recomputed at read time)
  error_type      text,                       -- conceptual | procedural | calculation | interpretation | application | gap | careless | incomplete
  error_severity  float,                      -- 0–1

  created_at      timestamptz DEFAULT now()
);

CREATE INDEX ON attempt_results(attempt_id);
CREATE INDEX ON attempt_results(concept_id);
CREATE INDEX ON attempt_results(topic);
```

### 3.6 `student_concept_state` table — THE HEART

```sql
CREATE TABLE student_concept_state (
  learner_id       text NOT NULL,
  concept_id       uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  owner_user_id    uuid NOT NULL,

  -- Mastery estimate (BKT-like weighted formula, V1; upgradeable to full BKT/FSRS later)
  mastery          float DEFAULT 0,           -- 0–1
  mastery_confidence float DEFAULT 0,         -- uncertainty width

  -- Evidence
  attempts_total   int DEFAULT 0,
  attempts_correct int DEFAULT 0,
  recent_accuracy  float,                     -- last max(4, 40%) of questions
  overall_accuracy float,

  -- Error profile (counts per type — persisted incrementally)
  err_conceptual   int DEFAULT 0,
  err_procedural   int DEFAULT 0,
  err_calculation  int DEFAULT 0,
  err_interpretation int DEFAULT 0,
  err_application  int DEFAULT 0,
  err_gap          int DEFAULT 0,
  err_careless     int DEFAULT 0,
  err_incomplete   int DEFAULT 0,

  -- Spaced repetition (SM-2 compatible)
  ease_factor      float DEFAULT 2.5,         -- SM-2 ease factor, starts at 2.5
  interval_days    int DEFAULT 0,             -- current review interval
  next_review_at   timestamptz,               -- when to review again
  last_practiced   timestamptz,
  first_practiced  timestamptz,

  -- Retention
  retention_estimate float,                   -- accuracy on questions answered ≥7d after first practice

  -- Trend
  trend            text,                      -- up | down | flat

  -- Planning engine output (recomputed by planner)
  priority_score   float,
  recommended_kind text,                      -- quiz | flashcards | explanation | worksheet | mixed

  updated_at       timestamptz DEFAULT now(),
  PRIMARY KEY (learner_id, concept_id)
);

CREATE INDEX ON student_concept_state(learner_id);
CREATE INDEX ON student_concept_state(learner_id, mastery);
CREATE INDEX ON student_concept_state(next_review_at);
```

### 3.7 `study_plans` + `study_plan_items` tables (replaces JSON blob)

```sql
CREATE TABLE study_plans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id    uuid NOT NULL,
  learner_id       text NOT NULL,
  subject_id       uuid REFERENCES subjects(id) ON DELETE SET NULL,
  document_id      uuid REFERENCES documents(id) ON DELETE SET NULL,  -- backward compat

  name             text NOT NULL,
  start_date       date,
  exam_date        date,
  minutes_per_week int DEFAULT 120,
  status           text DEFAULT 'active',   -- active | paused | completed | archived

  -- Snapshot of mastery at plan generation time (for deviation detection)
  mastery_snapshot jsonb,

  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE TABLE study_plan_items (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id              uuid NOT NULL REFERENCES study_plans(id) ON DELETE CASCADE,
  concept_id           uuid REFERENCES concepts(id) ON DELETE SET NULL,
  activity_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,  -- pre-generated resource

  kind                 text NOT NULL,       -- quiz | flashcards | explanation | worksheet | exam | review
  due_date             date,
  minutes              int DEFAULT 20,
  status               text DEFAULT 'pending',  -- pending | done | skipped | rescheduled
  priority_score       float,
  reason               text,               -- human-readable: "Weak on interpretation errors"
  auto_generated       boolean DEFAULT false,

  done_at              timestamptz,
  created_at           timestamptz DEFAULT now()
);

CREATE INDEX ON study_plan_items(plan_id, due_date);
CREATE INDEX ON study_plan_items(plan_id, status);
```

---

## 4. Core algorithms

### 4.1 Mastery update (called after each attempt)

```javascript
// modules/performance/masteryEngine.js

const DIFFICULTY_WEIGHT = { easy: 0.8, medium: 1.0, hard: 1.25 };
const SM2_MIN_EASE = 1.3;

/**
 * Update student_concept_state for one concept after a new result.
 * V1: weighted formula (same logic as existing masteryOf() but at concept level).
 * V2: replace with full BKT / FSRS when data allows.
 */
function updateConceptState(prev, result) {
  const { correct, difficulty, confidence, error_type } = result;

  // Increment counters
  const next = {
    ...prev,
    attempts_total:   prev.attempts_total + 1,
    attempts_correct: prev.attempts_correct + (correct ? 1 : 0),
    last_practiced:   new Date().toISOString(),
    first_practiced:  prev.first_practiced ?? new Date().toISOString(),
  };

  // Increment error counter
  if (!correct && error_type) {
    const key = `err_${error_type}`;
    next[key] = (next[key] ?? 0) + 1;
  }

  // Recalculate accuracy (simplified — full recalc reads last N results from DB)
  next.overall_accuracy = next.attempts_correct / next.attempts_total;
  // recent_accuracy updated by batch query in masteryService.recalculate()

  // SM-2 spacing update
  const quality = correct
    ? confidence === "high" ? 5 : confidence === "medium" ? 4 : 3
    : confidence === "high" ? 1 : 0;
  next.ease_factor = Math.max(SM2_MIN_EASE, (prev.ease_factor ?? 2.5) + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (quality < 3) {
    next.interval_days = 1;
  } else if ((prev.interval_days ?? 0) === 0) {
    next.interval_days = 1;
  } else if (prev.interval_days === 1) {
    next.interval_days = 6;
  } else {
    next.interval_days = Math.round(prev.interval_days * next.ease_factor);
  }
  const reviewAt = new Date();
  reviewAt.setDate(reviewAt.getDate() + next.interval_days);
  next.next_review_at = reviewAt.toISOString();

  return next;
}
```

### 4.2 Priority score (planning engine)

```javascript
// modules/plans/priorityEngine.js

/**
 * Compute priority score for a concept, given the student's current state.
 * Higher = should study sooner.
 * All weights are tunable; start with these defaults.
 */
function conceptPriority(state, concept, examDate) {
  const daysUntilExam = examDate
    ? Math.max(0, (new Date(examDate) - Date.now()) / 86400000)
    : 365;

  const mastery     = state.mastery ?? 0;
  const masteryGap  = 1 - mastery;                                      // 0–1

  const importance  = concept.importance ?? 0.5;                        // 0–1 from knowledge graph

  // Urgency ramps up sharply in the last 14 days
  const urgency = daysUntilExam <= 3  ? 2.0
                : daysUntilExam <= 7  ? 1.7
                : daysUntilExam <= 14 ? 1.4
                : daysUntilExam <= 30 ? 1.2
                : 1.0;

  // Forgetting risk: increases after 7+ days without practice
  const daysSince = state.last_practiced
    ? (Date.now() - new Date(state.last_practiced)) / 86400000
    : 999;
  const forgetting = daysSince > 7 ? Math.min(1.5, 1 + (daysSince - 7) * 0.04) : 1.0;

  // Error frequency penalty: topics with high recent error rate need more attention
  const totalErrors = (state.err_conceptual ?? 0) + (state.err_procedural ?? 0) +
    (state.err_calculation ?? 0) + (state.err_interpretation ?? 0) +
    (state.err_application ?? 0) + (state.err_gap ?? 0);
  const errorRate   = state.attempts_total > 0 ? totalErrors / state.attempts_total : 0;
  const errorFactor = 1 + errorRate * 0.5;

  // Prerequisite risk: if this concept is a prerequisite for others, higher priority
  const prereqFactor = concept.is_prerequisite_for_count > 0 ? 1.2 : 1.0;

  const score = masteryGap * importance * urgency * forgetting * errorFactor * prereqFactor;
  return Math.min(1, score);
}
```

### 4.3 Resource selection policy

```javascript
// modules/performance/resourcePolicy.js

/**
 * Given a student's concept state and context, return the recommended resource kind.
 * Pure function — no side effects.
 *
 * @param {object} state - student_concept_state row
 * @param {object} context - { daysUntilExam, prereqsMastered, sessionNumber }
 * @returns {{ kind: string, durationMinutes: number, reason: string }}
 */
function selectResource(state, context) {
  const { mastery, attempts_total, last_practiced } = state;
  const { daysUntilExam = 365, prereqsMastered = true, sessionNumber = 1 } = context;

  const daysSince = last_practiced
    ? (Date.now() - new Date(last_practiced)) / 86400000
    : 999;

  const dominantError = getDominantError(state);
  const examSoon      = daysUntilExam <= 14;
  const firstExposure = attempts_total === 0 || !prereqsMastered;

  // Rule table (evaluated in order — first match wins)
  const rules = [
    {
      condition: !prereqsMastered,
      kind: "prerequisite_first",
      duration: 15,
      reason: "A prerequisite concept needs practice before tackling this one.",
    },
    {
      condition: firstExposure || mastery < 0.2,
      kind: "explanation",
      duration: 10,
      reason: "First exposure — start with a clear explanation and worked example.",
    },
    {
      condition: mastery < 0.4,
      kind: "flashcards",
      duration: 15,
      reason: "Low mastery — build recall with flashcards before quizzing.",
    },
    {
      condition: mastery < 0.6 && dominantError === "calculation",
      kind: "worksheet",
      duration: 20,
      reason: "Repeated calculation errors — targeted worked-problem practice.",
    },
    {
      condition: mastery < 0.6 && dominantError === "interpretation",
      kind: "scenario_quiz",
      duration: 20,
      reason: "Interpretation errors — scenario-based questions to build meaning.",
    },
    {
      condition: mastery < 0.6 && dominantError === "conceptual",
      kind: "explanation_then_quiz",
      duration: 20,
      reason: "Conceptual gap — re-explain then quiz.",
    },
    {
      condition: mastery < 0.7,
      kind: "targeted_quiz",
      duration: 15,
      reason: "Building mastery — focused retrieval practice.",
    },
    {
      condition: mastery >= 0.7 && daysSince > 14,
      kind: "spaced_retrieval",
      duration: 10,
      reason: "Mastered but not recently reviewed — spaced retrieval to maintain.",
    },
    {
      condition: mastery >= 0.7 && examSoon,
      kind: "mixed_exam",
      duration: 25,
      reason: "Exam approaching — exam-style mixed practice.",
    },
    {
      condition: mastery >= 0.7 && dominantError === "careless",
      kind: "targeted_practice",
      duration: 10,
      reason: "Careless errors — short focused drill to eliminate them.",
    },
    {
      condition: mastery >= 0.8,
      kind: "interleaved_challenge",
      duration: 20,
      reason: "Strong mastery — interleaved challenge to transfer learning.",
    },
    // Default
    {
      condition: true,
      kind: "quiz",
      duration: 15,
      reason: "General practice.",
    },
  ];

  return rules.find((r) => r.condition) || rules[rules.length - 1];
}

function getDominantError(state) {
  const errors = {
    conceptual:    state.err_conceptual ?? 0,
    procedural:    state.err_procedural ?? 0,
    calculation:   state.err_calculation ?? 0,
    interpretation: state.err_interpretation ?? 0,
    application:   state.err_application ?? 0,
    gap:           state.err_gap ?? 0,
    careless:      state.err_careless ?? 0,
    incomplete:    state.err_incomplete ?? 0,
  };
  return Object.entries(errors).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
```

### 4.4 Re-planning trigger

```javascript
// modules/plans/replanDetector.js

/**
 * Compare current student mastery to what the plan assumed at generation time.
 * Returns whether a re-plan is warranted and why.
 */
function shouldReplan(plan, currentConceptStates) {
  const snapshot  = plan.mastery_snapshot ?? {};  // { conceptId: mastery } at plan creation
  const reasons   = [];

  for (const [conceptId, snapshotMastery] of Object.entries(snapshot)) {
    const current = currentConceptStates[conceptId]?.mastery ?? 0;
    const delta   = current - snapshotMastery;

    if (delta >= 0.25) {
      reasons.push({ kind: "mastered_faster", conceptId, delta });
    }
    if (delta <= -0.15) {
      reasons.push({ kind: "falling_behind", conceptId, delta });
    }
  }

  // Check plan adherence: how many items past due and still pending?
  const overdue = plan.items?.filter((i) =>
    i.status === "pending" && new Date(i.due_date) < new Date()
  );
  if (overdue?.length >= 3) {
    reasons.push({ kind: "plan_lag", overdueCount: overdue.length });
  }

  const examApproaching = plan.exam_date &&
    (new Date(plan.exam_date) - Date.now()) / 86400000 <= 7;
  const unmasteredCount = Object.values(currentConceptStates)
    .filter((s) => (s?.mastery ?? 0) < 0.7).length;
  if (examApproaching && unmasteredCount >= 3) {
    reasons.push({ kind: "exam_risk", unmasteredCount });
  }

  return {
    shouldReplan: reasons.length > 0,
    reasons,
  };
}
```

### 4.5 Cross-topic pattern detection

```javascript
// modules/performance/patternDetector.js

/**
 * Detect transversal skill gaps that appear across multiple topics.
 */
function detectTransversalPatterns(conceptStates, conceptGraph) {
  const patterns = [];

  // Group by dominant error type
  const byError = {};
  for (const [conceptId, state] of Object.entries(conceptStates)) {
    const dominant = getDominantError(state);
    if (dominant && state.attempts_total >= 3) {
      if (!byError[dominant]) byError[dominant] = [];
      byError[dominant].push({ conceptId, concept: conceptGraph[conceptId], state });
    }
  }

  // Interpretation errors spanning 3+ topics → flag as cross-topic gap
  for (const [errorType, items] of Object.entries(byError)) {
    const topics = [...new Set(items.map((i) => i.concept?.topic).filter(Boolean))];
    if (topics.length >= 3) {
      patterns.push({
        kind:        "transversal_error_pattern",
        errorType,
        topics,
        severity:    items.reduce((s, i) => s + (i.state[`err_${errorType}`] ?? 0), 0),
        description: `${errorType} errors detected across ${topics.length} topics (${topics.slice(0, 3).join(", ")}${topics.length > 3 ? "…" : ""})`,
      });
    }
  }

  // Prerequisite risk: concept is weak AND a prerequisite is also weak
  for (const [conceptId, state] of Object.entries(conceptStates)) {
    if ((state.mastery ?? 0) < 0.5) {
      const prereqs = conceptGraph[conceptId]?.prerequisites ?? [];
      const weakPrereqs = prereqs.filter((pid) => (conceptStates[pid]?.mastery ?? 0) < 0.6);
      if (weakPrereqs.length > 0) {
        patterns.push({
          kind:        "prerequisite_risk",
          conceptId,
          weakPrereqs,
          description: `Weak mastery on "${conceptGraph[conceptId]?.name}" may be caused by unmastered prerequisites.`,
        });
      }
    }
  }

  return patterns;
}
```

---

## 5. Phased implementation plan

The plan is ordered to maximise learning signal as early as possible, with each phase buildable independently.

---

### Phase 1 — Data foundations (Week 1–2)

**Goal**: Get proper DB tables in place. Everything else depends on this.

**Migrations**:
- `supabase/migrations/YYYYMMDD01_concepts.sql` — `concepts`, `concept_prerequisites` tables
- `supabase/migrations/YYYYMMDD02_attempts.sql` — `attempts`, `attempt_results` tables
- `supabase/migrations/YYYYMMDD03_student_state.sql` — `student_concept_state` table
- `supabase/migrations/YYYYMMDD04_study_plans.sql` — `study_plans`, `study_plan_items` tables

**New files**:
- `lib/attemptsRepository.js` — `saveAttempt(attempt)`, `getAttempts(learnerId, subjectId)` — writes to both new tables and old JSON blob (backward compat)
- `lib/studentStateRepository.js` — `getConceptState(learnerId, conceptId)`, `updateConceptState(learnerId, conceptId, result)`, `getSubjectStates(learnerId, subjectId)`
- `lib/conceptsRepository.js` — `getConcepts(workspaceId)`, `getConceptGraph(workspaceId)`, `saveConcepts(concepts[])`

**Modified files**:
- `modules/activities/ActivityPlayer.js` — after submitting attempt, call `lib/attemptsRepository.saveAttempt()` on the server in addition to saving the JSON blob document
- `performance/errors.js` — persist `error_type` to `attempt_results` at save time (don't just compute at read time)

**Migrations risk**: Low — additive only. Existing document-blob approach keeps working in parallel.

---

### Phase 2 — Knowledge graph (Week 2–4)

**Goal**: Extract structured concept graph from source documents at upload time.

**New files**:
- `modules/ai-tools/pipeline/conceptExtractor.js`:
  ```
  extractConcepts(documentText, documentId, workspaceId) → Concept[]
  ```
  LLM prompt asks for: name, description, topic, bloom_level, difficulty (0–1), importance (0–1), question_types[], prerequisites[] (by name, resolved to IDs after), source_pages[]
- `app/api/concepts/extract/route.js` — POST handler, called at document upload + on-demand
- `app/api/concepts/route.js` — GET concepts for a workspace/document

**Modified files**:
- `app/api/workspaces-supabase/route.js` — after successful document processing, enqueue concept extraction (can be async/background to not block upload)
- `modules/ai-tools/pipeline/agentBuilder.js` — when generating resource, map each output question to its concept_id (question already has `topic` and `skill` fields; resolve to concept_id via text match on `concepts.name`)
- `app/api/resources/concepts/route.js` — extend to also write to `question_concept_map` table (currently it writes to the resource JSON only)

**LLM usage**: One structured-output call per document upload (~500 tokens for a typical study guide). GPT-4o-mini sufficient.

**Dependencies**: Phase 1 (concepts table).

---

### Phase 3 — Student mastery model (Week 3–5)

**Goal**: Persist and compute mastery at concept level with spaced repetition scheduling. Replace O(n) client-side scans.

**New files**:
- `modules/performance/masteryEngine.js` — `updateConceptState()` (SM-2 + weighted mastery formula, see §4.1)
- `modules/performance/masteryService.js` — `recalculate(learnerId, conceptId)` reads last 20 `attempt_results` for that concept and recomputes `recent_accuracy`; called after each save
- `app/api/student/mastery/route.js` — `GET /api/student/mastery?learnerId=&subjectId=` — returns all `student_concept_state` rows for the subject

**Modified files**:
- `lib/attemptsRepository.js` — after persisting `attempt_results`, for each result call `masteryEngine.updateConceptState()` and upsert `student_concept_state`
- `modules/performance/mastery.js` — keep existing `masteryOf()` for backward compat; add `masteryFromDB()` that reads from `student_concept_state` directly (no scan)
- `PerformancePage.js` — use `masteryFromDB()` when available, fall back to computed

**Spaced repetition**: SM-2 algorithm on `student_concept_state.interval_days` and `ease_factor`. `next_review_at` is set per concept after each answer. The planner consults this when scheduling.

**Dependencies**: Phases 1 + 2 (needs concept_id to key on).

---

### Phase 4 — Adaptive resource selection (Week 5–6)

**Goal**: The system recommends what to study and in what format, based on mastery state. "Do it now" buttons work.

**New files**:
- `modules/performance/resourcePolicy.js` — `selectResource(state, context)` pure function (see §4.3)
- `app/api/student/recommendations/route.js` — `GET /api/student/recommendations?learnerId=&subjectId=` — for each concept due for review or with low mastery, returns `{ conceptId, kind, durationMinutes, reason }`

**Modified files**:
- `app/api/performance/coach/route.js` — input now includes structured `student_concept_state[]` (not just text summaries); output actions now carry `{ conceptId, kind }` matching `selectResource()` output; backend generates resource directly when "Do it now" is clicked
- `PerformancePage.js` — wire `onPractise` handler to call `/api/ai-tools/agent-builder/stream` with `{ concept, kind, learnerId }` (generate the recommended resource immediately)
- `modules/ai-tools/pipeline/agentBuilder.js` — accept `concept_id` and `kind` as top-level parameters; set difficulty, topic, question count from concept state automatically

**Format-effectiveness model**: After 3+ attempts per concept per resource kind, track `mastery_delta = mastery_after - mastery_before`. Store this in `student_concept_state` metadata. `selectResource()` uses this to prefer formats that worked for this student (Phase 4+).

**Dependencies**: Phases 1–3.

---

### Phase 5 — Adaptive study planning (Week 6–9)

**Goal**: Replace LLM-only plan generation with an algorithmic planner that uses the concept graph and student state. LLM still used for content and narratives, not for scheduling logic.

**New files**:
- `modules/plans/priorityEngine.js` — `conceptPriority(state, concept, examDate)` (see §4.2)
- `modules/plans/planner.js`:
  ```
  buildPlan(learnerId, subjectId, examDate, minutesPerWeek, conceptGraph, conceptStates)
    → study_plan + study_plan_items[]
  ```
  Algorithm:
  1. Score all concepts by priority
  2. Resolve prerequisite ordering (topological sort of unmastered prereqs)
  3. Assign SM-2 review dates to concepts already partially mastered
  4. Fill schedule from today to exam, respecting minutesPerWeek cap
  5. Reserve last 20% of time for mixed exam practice
  6. LLM generates human-readable goal names and item descriptions
- `modules/plans/replanDetector.js` — `shouldReplan(plan, currentStates)` (see §4.4)
- `app/api/plans/adaptive/route.js` — new planner endpoint (keeps old `/api/plans/generate` for fallback)
- `app/api/plans/:id/replan/route.js` — trigger re-plan; diffs old vs new schedule; returns changed items

**Modified files**:
- `app/api/plans/generate/route.js` — new default path calls algorithmic planner; LLM only generates names/descriptions, not dates/sequence
- Plan UI — show "Plan updated" indicator when re-plan is triggered automatically
- `modules/activities/ActivityPlayer.js` — after attempt save, call `POST /api/plans/:id/check-replan` (non-blocking); if `shouldReplan` returns true, surface notification

**Diagnostic first**: When `conceptStates` has zero attempts for a subject, the planner inserts a diagnostic quiz as the first item (a 10-question mixed quiz covering all major concepts, to bootstrap the student model before scheduling).

**Dependencies**: Phases 1–4 (needs concept graph, student state, resource selection).

---

### Phase 6 — Cross-topic pattern detection (Week 9–10)

**Goal**: Detect transversal error patterns and prerequisite risks spanning multiple topics.

**New files**:
- `modules/performance/patternDetector.js` — `detectTransversalPatterns(conceptStates, conceptGraph)` (see §4.5)
- `app/api/student/patterns/route.js` — `GET /api/student/patterns?learnerId=&subjectId=` — returns detected patterns

**Modified files**:
- `app/api/performance/coach/route.js` — include patterns in LLM input; ask it to explain each pattern in 1–2 sentences and suggest a targeted intervention
- `PerformancePage.js` — "Detected patterns" section below the mastery table

**Dependencies**: Phases 1–3 (needs persistent error type counts).

---

### Phase 7 — Dashboard integration (Week 10–12)

**Goal**: Surface the adaptive model in both student and teacher dashboards. Remove hardcoded sample data from `insights.js`.

**Student-facing** (keep simple):
```
STATISTICS
Overall mastery: 68%

✓ Strong: Descriptive Statistics, Regression
⚠ Needs work: Probability, Distributions

🎯 Today: 15 min — Conditional Probability
   Why: You've had 4 interpretation errors this week.
   [Start now] [Skip]

📅 Review due: Bayes Theorem in 2 days (spacing)
```

**Teacher-facing** (rich analytics):
- Concept mastery heatmap per student (reads from `student_concept_state`)
- Error type breakdown per topic
- Pattern alerts (cross-topic gaps)
- Format effectiveness per student

**Modified files**:
- `modules/dashboard/insights.js` — replace hardcoded sample data with live queries to `student_concept_state` and `attempt_results`
- `modules/dashboard/ui/DashboardPage.js` — student home shows today's recommendation (from `resourcePolicy.selectResource()`)
- Teacher performance views — add concept-level mastery table

**Dependencies**: All previous phases.

---

### Phase 8 — Evaluation framework (Week 12+, ongoing)

**Goal**: Measure whether the algorithm actually improves learning.

**New files**:
- `modules/performance/evaluation.js`:
  - `resourceEffectiveness(learnerId, subjectId)` — per resource kind: mean mastery delta before vs after
  - `planAccuracy(planId)` — predicted mastery at exam date vs actual mastery
  - `interventionSuccess(learnerId)` — which recommendations led to mastery improvement
- `/dev/learning-quality` page — internal dashboard showing these metrics

**Dependencies**: All previous phases, accumulated data.

---

## 6. Minimum viable version (can start now)

These five changes give the biggest improvement with the least disruption and can be done before the DB migrations:

| # | Change | File | Impact |
|---|---|---|---|
| 1 | Persist `error_type` when saving attempt result | `ActivityPlayer.js` + `attemptsRepository.js` | Error types stop being lost; can trend over time |
| 2 | Concept extraction at document upload | `conceptExtractor.js` | Knowledge graph bootstrapped from real documents |
| 3 | Map questions to concepts at generation time | `agentBuilder.js` | Every answer maps to a concept, not just a free-text topic |
| 4 | `selectResource()` policy surfaced on dashboard | `resourcePolicy.js` + `PerformancePage.js` | "Do it now" recommends and generates the right resource type |
| 5 | Re-plan notification after significant deviation | `replanDetector.js` + `ActivityPlayer.js` | Plan stays relevant without full algorithmic planner |

---

## 7. What NOT to change yet

- The document blob model for content storage (resources, study materials) — keep as-is
- `modules/activities/ActivityPlayer.js` UX — keep the player identical
- The coach LLM endpoint — keep as supplementary narrative layer, just improve its structured input
- `modules/document-processing/` — parsers work; don't touch
- The existing `masteryOf()` formula — it's good; extend it, don't replace it

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| Auth doesn't exist yet — student identity is localStorage `learner_id` | All new tables use `learner_id text` column; will map to real user_id when auth lands |
| DB migrations must not break existing document-blob queries | All new tables are additive; old code reads from `documents` table only; dual-write for attempts |
| Concept extraction LLM call adds latency at upload time | Run async (background job) after document is saved; don't block upload response |
| Concept quality depends on LLM extraction quality | Human review flow (like existing `review_status` on documents) for concept curation |
| Spaced repetition `next_review_at` may conflict with fixed plan dates | Planner uses `next_review_at` as a soft constraint, not a hard one; plan dates take priority |
| Cross-topic patterns require enough data to be meaningful | Suppress pattern output until `attempts_total >= 5` per concept |
