PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'learner' CHECK (role IN ('learner', 'editor', 'admin')),
  created_at TEXT NOT NULL
);

CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  plan_tier TEXT NOT NULL DEFAULT 'standard' CHECK (plan_tier IN ('light', 'standard', 'custom')),
  exam_date TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai'
);

CREATE TABLE content_items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  owner_id TEXT REFERENCES users(id),
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'team', 'public')),
  created_at TEXT NOT NULL
);

CREATE TABLE content_versions (
  id TEXT PRIMARY KEY,
  content_item_id TEXT NOT NULL REFERENCES content_items(id),
  version INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'withdrawn')),
  created_at TEXT NOT NULL,
  UNIQUE (content_item_id, version)
);

CREATE TABLE study_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  effective_date TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  UNIQUE (user_id, effective_date)
);

CREATE TABLE study_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  source TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('practice', 'challenge')),
  status TEXT NOT NULL CHECK (status IN ('active', 'finished')),
  frozen_question_versions_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE TABLE attempts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES study_sessions(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  question_id TEXT NOT NULL,
  question_version INTEGER NOT NULL,
  answer_json TEXT NOT NULL,
  is_correct INTEGER,
  idempotency_key TEXT NOT NULL UNIQUE,
  submitted_at TEXT NOT NULL,
  UNIQUE (session_id, user_id, question_id)
);

CREATE TABLE review_states (
  user_id TEXT NOT NULL REFERENCES users(id),
  content_item_id TEXT NOT NULL REFERENCES content_items(id),
  skill TEXT NOT NULL CHECK (skill IN ('meaning', 'spelling', 'listening', 'reading', 'output')),
  due_at TEXT NOT NULL,
  interval_days INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, content_item_id, skill)
);

CREATE TABLE point_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  points INTEGER NOT NULL,
  reason TEXT NOT NULL,
  reward_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE INDEX attempts_session_idx ON attempts(session_id, submitted_at);
CREATE INDEX review_states_due_idx ON review_states(user_id, due_at);
CREATE INDEX point_ledger_user_idx ON point_ledger(user_id, created_at);
