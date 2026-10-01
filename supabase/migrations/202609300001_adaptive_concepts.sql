-- Adaptive learning engine — Phase 1: Knowledge graph
-- concepts & prerequisites extracted from reference documents at upload time

CREATE TABLE concepts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_document_id  uuid REFERENCES documents(id) ON DELETE SET NULL,
  owner_user_id       uuid NOT NULL,

  name                text NOT NULL,
  description         text,
  topic               text,            -- maps to existing topic_tags.name
  bloom_level         text,            -- remember|understand|apply|analyse|evaluate|create
  difficulty          float DEFAULT 0.5 CHECK (difficulty >= 0 AND difficulty <= 1),
  importance          float DEFAULT 0.5 CHECK (importance >= 0 AND importance <= 1),
  question_types      text[] DEFAULT '{}',

  source_pages        int[]  DEFAULT '{}',
  source_chunk_ids    uuid[] DEFAULT '{}',

  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX ON concepts(workspace_id);
CREATE INDEX ON concepts(source_document_id);
CREATE INDEX ON concepts(owner_user_id);

-- -------------------------------------------------------------------------
CREATE TABLE concept_prerequisites (
  concept_id      uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  prerequisite_id uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  strength        float DEFAULT 1.0 CHECK (strength >= 0 AND strength <= 1),
  PRIMARY KEY (concept_id, prerequisite_id)
);

-- -------------------------------------------------------------------------
-- Maps generated questions back to the concepts they test.
-- question_id is the ActivityQuestion.id (text), stable within the generated document.
CREATE TABLE question_concept_map (
  question_id           text NOT NULL,
  activity_document_id  uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  concept_id            uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  is_primary            boolean DEFAULT true,
  weight                float DEFAULT 1.0,
  PRIMARY KEY (question_id, concept_id)
);

CREATE INDEX ON question_concept_map(concept_id);
CREATE INDEX ON question_concept_map(activity_document_id);
