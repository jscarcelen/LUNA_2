-- Adaptive learning engine — Phase 3: Student concept state (the heart of the model)
-- Persisted mastery, SM-2 spacing, and error profiles per (learner, concept).

CREATE TABLE student_concept_state (
  learner_id            text NOT NULL,
  concept_id            uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  owner_user_id         uuid NOT NULL,

  -- Mastery estimate (weighted formula V1; upgradeable to full BKT/FSRS later)
  mastery               float DEFAULT 0 CHECK (mastery >= 0 AND mastery <= 1),
  mastery_confidence    float DEFAULT 0,   -- uncertainty width (0 = certain 0, 1 = very uncertain)

  -- Evidence counts
  attempts_total        int DEFAULT 0,
  attempts_correct      int DEFAULT 0,
  recent_accuracy       float,              -- last max(4, 40%) of questions for this concept
  overall_accuracy      float,

  -- Error profile (persisted counts; never reset, only incremented)
  err_conceptual        int DEFAULT 0,
  err_procedural        int DEFAULT 0,
  err_calculation       int DEFAULT 0,
  err_interpretation    int DEFAULT 0,
  err_application       int DEFAULT 0,
  err_gap               int DEFAULT 0,
  err_careless          int DEFAULT 0,
  err_incomplete        int DEFAULT 0,

  -- SM-2 spaced repetition
  ease_factor           float DEFAULT 2.5,
  interval_days         int DEFAULT 0,
  next_review_at        timestamptz,
  last_practiced        timestamptz,
  first_practiced       timestamptz,

  -- Retention
  retention_estimate    float,              -- accuracy on questions answered ≥7d after first practice

  -- Trend (set by masteryService.recalculate)
  trend                 text,              -- up|down|flat

  -- Planning engine output (recomputed by planner; cached here for fast reads)
  priority_score        float,
  recommended_kind      text,

  updated_at            timestamptz DEFAULT now(),
  PRIMARY KEY (learner_id, concept_id)
);

CREATE INDEX ON student_concept_state(learner_id);
CREATE INDEX ON student_concept_state(learner_id, mastery);
CREATE INDEX ON student_concept_state(next_review_at);
CREATE INDEX ON student_concept_state(owner_user_id);
