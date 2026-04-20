-- Drop the multi-admin invite system + the admins.email column.
-- SQLite refuses ALTER TABLE DROP COLUMN on a UNIQUE column, so we use the
-- standard rebuild recipe: create a new table with the desired shape, copy
-- rows over (preserving id), drop the old table, rename the new one.

DROP TABLE IF EXISTS admin_invites;

CREATE TABLE admins_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  name TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  enrolled_at TEXT,
  created_at TEXT NOT NULL
);

INSERT INTO admins_new (id, name, active, enrolled_at, created_at)
SELECT id, name, active, enrolled_at, created_at FROM admins;

DROP TABLE admins;

ALTER TABLE admins_new RENAME TO admins;
