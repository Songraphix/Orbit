-- An Easel's background: plain, a grid of lines, or dots (owner request).
ALTER TABLE easels ADD COLUMN background TEXT NOT NULL DEFAULT 'plain';
