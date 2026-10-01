-- Adaptive learning engine — Phase 2: Proper relational attempt storage
-- Replaces the JSON-blob approach (which stays for backward compat during transition)

CREATE TABLE attempts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id         uuid NOT NULL,
  learner_id            text NOT NULL,          -- localStorage learner string; maps to user_id when auth lands
  activity_document_id  uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  subject_id            uuid REFERENCES subjects(id) ON DELETE SET NULL,

  at                    timestamptz NOT NULL,
  score                 float,
  total                 int,
  duration_ms           int,

  created_at            timestamptz DEFAULT now()
);

CREATE INDEX ON attempts(learner_id, subject_id);
CREATE INDEX ON attempts(activity_document_id);
CREATE INDEX ON attempts(at);
CREATE INDEX ON attempts(owner_user_id);

-- -------------------------------------------------------------------------
CREATE TABLE attempt_results (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id      uuid NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id     text NOT NULL,
  question_prompt text,
  concept_id      uuid REFERENCES concepts(id) ON DELETE SET NULL,
  topic           text,
  difficulty      text,
  skill           text,

  correct         boolean,
  given           text,
  expected        text,
  duration_ms     int,
  confidence      text,            -- high|medium|low

  -- Persisted error classification (NOT recomputed at read time)
  error_type      text,            -- conceptual|procedural|calculation|interpretation|application|gap|careless|incomplete
  error_severity  float,

  created_at      timestamptz DEFAULT now()
);

CREATE INDEX ON attempt_results(attempt_id);
CREATE INDEX ON attempt_results(concept_id);
CREATE INDEX ON attempt_results(topic);
CREATE INDEX ON attempt_results(error_type);
