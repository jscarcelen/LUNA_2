-- Skills on answered questions: the transferable skills a question needs (taxonomy ids such as
-- 'derivatives', 'percentages') and the one the grader blamed for a mistake after reading the
-- learner's working. Both optional; the app works without them (attemptsRepository retries the insert
-- without these columns when they do not exist yet).
alter table attempt_results
  add column if not exists skills text[] not null default '{}',
  add column if not exists failed_skill text,
  add column if not exists has_work boolean not null default false;

create index if not exists attempt_results_failed_skill_idx on attempt_results (failed_skill) where failed_skill is not null;
