-- Adaptive learning engine — Phase 4: Relational study plans
-- Replaces the JSON-blob plan documents. Old blobs kept for backward compat.

CREATE TABLE study_plans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id    uuid NOT NULL,
  learner_id       text NOT NULL,
  subject_id       uuid REFERENCES subjects(id) ON DELETE SET NULL,
  document_id      uuid REFERENCES documents(id) ON DELETE SET NULL,   -- backward compat blob ref

  name             text NOT NULL,
  start_date       date,
  exam_date        date,
  minutes_per_week int DEFAULT 120,
  status           text DEFAULT 'active',   -- active|paused|completed|archived

  -- Snapshot of mastery at plan generation time (for deviation detection)
  mastery_snapshot jsonb DEFAULT '{}',

  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX ON study_plans(learner_id);
CREATE INDEX ON study_plans(owner_user_id);

-- -------------------------------------------------------------------------
CREATE TABLE study_plan_items (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id              uuid NOT NULL REFERENCES study_plans(id) ON DELETE CASCADE,
  concept_id           uuid REFERENCES concepts(id) ON DELETE SET NULL,
  activity_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,

  kind                 text NOT NULL,       -- quiz|flashcards|explanation|worksheet|exam|review
  due_date             date,
  minutes              int DEFAULT 20,
  status               text DEFAULT 'pending',   -- pending|done|skipped|rescheduled
  priority_score       float,
  reason               text,               -- human-readable: "4 interpretation errors this week"
  auto_generated       boolean DEFAULT false,

  done_at              timestamptz,
  created_at           timestamptz DEFAULT now()
);

CREATE INDEX ON study_plan_items(plan_id, due_date);
CREATE INDEX ON study_plan_items(plan_id, status);
CREATE INDEX ON study_plan_items(concept_id);
