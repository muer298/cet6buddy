CREATE TABLE IF NOT EXISTS imports (
  id VARCHAR(36) PRIMARY KEY,
  owner_id VARCHAR(36) NOT NULL,
  asset_id VARCHAR(36) NOT NULL,
  status ENUM('uploaded', 'draft', 'validating', 'review', 'published', 'withdrawn') NOT NULL DEFAULT 'uploaded',
  error_json JSON NULL,
  reviewer_id VARCHAR(36) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY imports_owner_created_idx (owner_id, created_at),
  KEY imports_status_updated_idx (status, updated_at),
  CONSTRAINT imports_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT imports_asset_fk FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  CONSTRAINT imports_reviewer_fk FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS publication_events (
  id VARCHAR(36) PRIMARY KEY,
  content_item_id VARCHAR(36) NOT NULL,
  content_version INT UNSIGNED NOT NULL,
  action ENUM('created', 'submitted', 'published', 'withdrawn') NOT NULL,
  actor_user_id VARCHAR(36) NOT NULL,
  reason VARCHAR(500) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY publication_events_content_idx (content_item_id, content_version, created_at),
  CONSTRAINT publication_events_content_fk FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE CASCADE,
  CONSTRAINT publication_events_actor_fk FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
