ALTER TABLE users
  ADD COLUMN username VARCHAR(40) NULL AFTER id,
  ADD COLUMN password_hash VARCHAR(255) NULL AFTER role,
  ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT TRUE AFTER password_hash,
  ADD COLUMN status ENUM('active', 'disabled') NOT NULL DEFAULT 'active' AFTER must_change_password,
  ADD UNIQUE KEY users_username_uk (username);

UPDATE users
SET username = CONCAT('legacy_', LEFT(REPLACE(id, '-', ''), 24))
WHERE username IS NULL;

ALTER TABLE users
  MODIFY username VARCHAR(40) NOT NULL;
