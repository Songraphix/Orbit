-- 016: workspace templates (roadmap P2.5): a Space's tabs, icon and colours, kept to start new
-- Spaces from. tabs_json: [{ section: 'pinned' | 'today', title, url }].
CREATE TABLE space_templates (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT NOT NULL,
  name        TEXT NOT NULL,
  icon        TEXT NOT NULL,
  theme_json  TEXT NOT NULL,
  tabs_json   TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
