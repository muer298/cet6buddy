CREATE TABLE IF NOT EXISTS game_sessions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  game_type ENUM('root-chain', 'flash', 'streak') NOT NULL,
  mode ENUM('practice', 'challenge') NOT NULL,
  status ENUM('active', 'finished') NOT NULL DEFAULT 'active',
  rules_json JSON NOT NULL,
  question_ids_json JSON NOT NULL,
  score INT UNSIGNED NOT NULL DEFAULT 0,
  correct_count INT UNSIGNED NOT NULL DEFAULT 0,
  current_streak INT UNSIGNED NOT NULL DEFAULT 0,
  longest_streak INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at TIMESTAMP(3) NULL,
  KEY game_sessions_user_created_idx (user_id, created_at),
  CONSTRAINT game_sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS game_attempts (
  id VARCHAR(36) PRIMARY KEY,
  game_session_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  question_id VARCHAR(80) NOT NULL,
  question_version INT UNSIGNED NOT NULL,
  answer_index INT NULL,
  is_correct BOOLEAN NOT NULL,
  points INT UNSIGNED NOT NULL DEFAULT 0,
  idempotency_key VARCHAR(120) NOT NULL,
  submitted_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY game_attempts_idempotency_uk (idempotency_key),
  UNIQUE KEY game_attempts_first_answer_uk (game_session_id, question_id),
  KEY game_attempts_session_idx (game_session_id, submitted_at),
  CONSTRAINT game_attempts_session_fk FOREIGN KEY (game_session_id) REFERENCES game_sessions(id) ON DELETE CASCADE,
  CONSTRAINT game_attempts_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS teams (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  owner_id VARCHAR(36) NOT NULL,
  invite_code VARCHAR(16) NOT NULL,
  invite_expires_at TIMESTAMP(3) NOT NULL,
  member_limit INT UNSIGNED NOT NULL DEFAULT 6,
  goal_target INT UNSIGNED NOT NULL DEFAULT 20,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY teams_invite_code_uk (invite_code),
  CONSTRAINT teams_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS memberships (
  team_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  role ENUM('owner', 'member') NOT NULL DEFAULT 'member',
  status ENUM('active', 'left', 'removed') NOT NULL DEFAULT 'active',
  joined_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  left_at TIMESTAMP(3) NULL,
  PRIMARY KEY (team_id, user_id),
  KEY memberships_user_status_idx (user_id, status),
  CONSTRAINT memberships_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT memberships_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS reactions (
  id VARCHAR(36) PRIMARY KEY,
  team_id VARCHAR(36) NOT NULL,
  sender_id VARCHAR(36) NOT NULL,
  receiver_id VARCHAR(36) NOT NULL,
  message_key VARCHAR(40) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY reactions_team_created_idx (team_id, created_at),
  CONSTRAINT reactions_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT reactions_sender_fk FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT reactions_receiver_fk FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS challenges (
  id VARCHAR(36) PRIMARY KEY,
  team_id VARCHAR(36) NOT NULL,
  creator_id VARCHAR(36) NOT NULL,
  game_type ENUM('root-chain', 'flash', 'streak') NOT NULL,
  title VARCHAR(120) NOT NULL,
  rules_json JSON NOT NULL,
  question_ids_json JSON NOT NULL,
  status ENUM('open', 'closed') NOT NULL DEFAULT 'open',
  deadline_at TIMESTAMP(3) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY challenges_team_deadline_idx (team_id, deadline_at),
  CONSTRAINT challenges_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT challenges_creator_fk FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS challenge_participations (
  id VARCHAR(36) PRIMARY KEY,
  challenge_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  game_session_id VARCHAR(36) NOT NULL,
  status ENUM('active', 'finished') NOT NULL DEFAULT 'active',
  score INT UNSIGNED NOT NULL DEFAULT 0,
  correct_count INT UNSIGNED NOT NULL DEFAULT 0,
  longest_streak INT UNSIGNED NOT NULL DEFAULT 0,
  started_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at TIMESTAMP(3) NULL,
  UNIQUE KEY challenge_participations_user_uk (challenge_id, user_id),
  CONSTRAINT challenge_participations_challenge_fk FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE CASCADE,
  CONSTRAINT challenge_participations_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT challenge_participations_game_fk FOREIGN KEY (game_session_id) REFERENCES game_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
