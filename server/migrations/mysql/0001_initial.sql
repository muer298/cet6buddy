CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  role ENUM('learner', 'editor', 'admin') NOT NULL DEFAULT 'learner',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS profiles (
  user_id VARCHAR(36) PRIMARY KEY,
  nickname VARCHAR(80) NOT NULL,
  plan_tier ENUM('light', 'standard', 'custom') NOT NULL DEFAULT 'standard',
  exam_date DATE NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',
  CONSTRAINT profiles_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS content_items (
  id VARCHAR(36) PRIMARY KEY,
  kind VARCHAR(40) NOT NULL,
  owner_id VARCHAR(36) NULL,
  visibility ENUM('private', 'team', 'public') NOT NULL DEFAULT 'private',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT content_items_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS content_versions (
  id VARCHAR(36) PRIMARY KEY,
  content_item_id VARCHAR(36) NOT NULL,
  version INT UNSIGNED NOT NULL,
  payload_json JSON NOT NULL,
  status ENUM('draft', 'review', 'published', 'withdrawn') NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY content_versions_item_version_uk (content_item_id, version),
  CONSTRAINT content_versions_item_fk FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS study_plans (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  effective_date DATE NOT NULL,
  plan_json JSON NOT NULL,
  UNIQUE KEY study_plans_user_date_uk (user_id, effective_date),
  CONSTRAINT study_plans_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS study_sessions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  source VARCHAR(80) NOT NULL,
  mode ENUM('practice', 'challenge') NOT NULL,
  status ENUM('active', 'finished') NOT NULL,
  question_ids_json JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at TIMESTAMP(3) NULL,
  KEY study_sessions_user_created_idx (user_id, created_at),
  CONSTRAINT study_sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS attempts (
  id VARCHAR(36) PRIMARY KEY,
  session_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  question_id VARCHAR(80) NOT NULL,
  question_version INT UNSIGNED NOT NULL,
  answer_index INT NOT NULL,
  is_correct BOOLEAN NULL,
  idempotency_key VARCHAR(120) NOT NULL,
  submitted_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY attempts_idempotency_uk (idempotency_key),
  UNIQUE KEY attempts_first_answer_uk (session_id, user_id, question_id),
  KEY attempts_session_idx (session_id, submitted_at),
  CONSTRAINT attempts_session_fk FOREIGN KEY (session_id) REFERENCES study_sessions(id) ON DELETE CASCADE,
  CONSTRAINT attempts_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS review_states (
  user_id VARCHAR(36) NOT NULL,
  content_item_id VARCHAR(36) NOT NULL,
  skill ENUM('meaning', 'spelling', 'listening', 'reading', 'output') NOT NULL,
  due_at TIMESTAMP(3) NOT NULL,
  interval_days INT UNSIGNED NOT NULL DEFAULT 1,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, content_item_id, skill),
  KEY review_states_due_idx (user_id, due_at),
  CONSTRAINT review_states_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT review_states_item_fk FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS point_ledger (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  points INT NOT NULL,
  reason VARCHAR(255) NOT NULL,
  reward_key VARCHAR(160) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY point_ledger_reward_uk (reward_key),
  KEY point_ledger_user_idx (user_id, created_at),
  CONSTRAINT point_ledger_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO users (id, email, role)
VALUES ('user-demo', 'demo@cet6-buddy.local', 'learner');

INSERT IGNORE INTO profiles (user_id, nickname, plan_tier, timezone)
VALUES ('user-demo', '六级学习者', 'standard', 'Asia/Shanghai');
