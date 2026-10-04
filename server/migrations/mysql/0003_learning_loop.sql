CREATE TABLE IF NOT EXISTS question_groups (
  id VARCHAR(36) PRIMARY KEY,
  content_item_id VARCHAR(36) NOT NULL,
  module ENUM('word', 'listening', 'reading', 'translation', 'writing') NOT NULL,
  title VARCHAR(255) NOT NULL,
  mode VARCHAR(40) NOT NULL DEFAULT 'practice',
  payload_json JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT question_groups_content_fk FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS questions (
  id VARCHAR(80) NOT NULL,
  version INT UNSIGNED NOT NULL,
  group_id VARCHAR(36) NULL,
  kind VARCHAR(40) NOT NULL,
  prompt TEXT NOT NULL,
  answer_json JSON NOT NULL,
  explanation TEXT NULL,
  payload_json JSON NOT NULL,
  status ENUM('draft', 'review', 'published', 'withdrawn') NOT NULL DEFAULT 'published',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id, version),
  KEY questions_group_idx (group_id),
  CONSTRAINT questions_group_fk FOREIGN KEY (group_id) REFERENCES question_groups(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS question_options (
  question_id VARCHAR(80) NOT NULL,
  question_version INT UNSIGNED NOT NULL,
  option_index INT UNSIGNED NOT NULL,
  option_text TEXT NOT NULL,
  PRIMARY KEY (question_id, question_version, option_index),
  CONSTRAINT question_options_question_fk FOREIGN KEY (question_id, question_version) REFERENCES questions(id, version) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS assets (
  id VARCHAR(36) PRIMARY KEY,
  owner_id VARCHAR(36) NOT NULL,
  object_key VARCHAR(512) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  byte_size BIGINT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  visibility ENUM('private', 'team', 'public') NOT NULL DEFAULT 'private',
  duration_ms INT UNSIGNED NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY assets_object_key_uk (object_key),
  KEY assets_owner_created_idx (owner_id, created_at),
  CONSTRAINT assets_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS corrections (
  id VARCHAR(36) PRIMARY KEY,
  attempt_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  corrected_answer_json JSON NOT NULL,
  self_check_json JSON NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY corrections_attempt_uk (attempt_id),
  CONSTRAINT corrections_attempt_fk FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE,
  CONSTRAINT corrections_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS collections (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  content_item_id VARCHAR(80) NOT NULL,
  content_version INT UNSIGNED NOT NULL DEFAULT 1,
  kind VARCHAR(40) NOT NULL,
  note TEXT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY collections_user_content_uk (user_id, content_item_id, kind),
  KEY collections_user_created_idx (user_id, created_at),
  CONSTRAINT collections_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS open_submissions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  module ENUM('translation', 'writing') NOT NULL,
  prompt_id VARCHAR(80) NOT NULL,
  response_text TEXT NOT NULL,
  self_check_json JSON NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY open_submissions_user_created_idx (user_id, created_at),
  CONSTRAINT open_submissions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS daily_task_progress (
  user_id VARCHAR(36) NOT NULL,
  plan_date DATE NOT NULL,
  task_key ENUM('review', 'new_words', 'input', 'output', 'game') NOT NULL,
  target_count INT UNSIGNED NOT NULL,
  completed_count INT UNSIGNED NOT NULL DEFAULT 0,
  points INT UNSIGNED NOT NULL,
  completed_at TIMESTAMP(3) NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, plan_date, task_key),
  CONSTRAINT daily_task_progress_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS checkins (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  checkin_date DATE NOT NULL,
  plan_tier ENUM('light', 'standard', 'custom') NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY checkins_user_date_uk (user_id, checkin_date),
  CONSTRAINT checkins_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO content_items (id, kind, visibility)
VALUES
  ('w-sustainable', 'word', 'public'),
  ('w-inevitable', 'word', 'public'),
  ('w-conventional', 'word', 'public'),
  ('w-alleviate', 'word', 'public'),
  ('w-substantial', 'word', 'public');

INSERT IGNORE INTO content_versions (id, content_item_id, version, payload_json, status)
VALUES
  ('cv-sustainable-1', 'w-sustainable', 1, JSON_OBJECT('word','sustainable','meaning','可持续的；可维持的'), 'published'),
  ('cv-inevitable-1', 'w-inevitable', 1, JSON_OBJECT('word','inevitable','meaning','不可避免的'), 'published'),
  ('cv-conventional-2', 'w-conventional', 2, JSON_OBJECT('word','conventional','meaning','传统的；常规的'), 'published'),
  ('cv-alleviate-1', 'w-alleviate', 1, JSON_OBJECT('word','alleviate','meaning','缓解'), 'published'),
  ('cv-substantial-1', 'w-substantial', 1, JSON_OBJECT('word','substantial','meaning','大量的；实质性的'), 'published');
