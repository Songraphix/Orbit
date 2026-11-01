-- 009: extra data on sidebar items (PLAN.md section 5.2): a Live Folder's source, a feed item's
-- unread state, Tidy's folders. JSON; NULL for ordinary tabs and folders.
ALTER TABLE sidebar_items ADD COLUMN data_json TEXT;
