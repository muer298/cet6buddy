CREATE TABLE IF NOT EXISTS spelling_attempts (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  content_item_id VARCHAR(80) NOT NULL,
  content_version INT UNSIGNED NOT NULL,
  answer_text VARCHAR(255) NOT NULL,
  is_correct BOOLEAN NOT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  submitted_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY spelling_attempts_idempotency_uk (idempotency_key),
  KEY spelling_attempts_user_content_idx (user_id, content_item_id, submitted_at),
  CONSTRAINT spelling_attempts_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
