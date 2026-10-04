INSERT IGNORE INTO content_items (id, kind, visibility)
VALUES
  ('l-small-habits', 'listening', 'public'),
  ('r-small-habits', 'reading', 'public');

INSERT IGNORE INTO content_versions (id, content_item_id, version, payload_json, status)
VALUES
  ('cv-l-small-habits-v1', 'l-small-habits', 1, JSON_OBJECT('title', 'Small Habits', 'source', 'CET6 Buddy 原创'), 'published'),
  ('cv-r-small-habits-v1', 'r-small-habits', 1, JSON_OBJECT('title', 'Why Small Habits Matter', 'source', 'CET6 Buddy 原创'), 'published');
