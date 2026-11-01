-- 011: how a profile looks and greets you (owner request): the name used on the new tab page,
-- an avatar emoji ('' = initials) and a colour ('' = picked from the profile's id).
ALTER TABLE profiles ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN avatar TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN color TEXT NOT NULL DEFAULT '';
