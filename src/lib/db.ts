import Database from "better-sqlite3";

import type * as types from "../types.js";

function _open(filename: string) {
  const db = new Database(filename);

  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");

  return db;
}

export function open(filename = ":memory:"): types.Database {
  const writer = _open(filename);

  // IMPROVE: migrations
  writer.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      birth_date DATE NOT NULL,
      location TEXT NOT NULL,
      UNIQUE (email)
    );

    CREATE TABLE IF NOT EXISTS message_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL
    );
    INSERT INTO message_templates
    VALUES (1, 'Hey, {{full_name}} it''s your birthday')
    ON CONFLICT (id)
    DO NOTHING;

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      template_id INTEGER NOT NULL,
      process_at DATETIME NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (template_id) REFERENCES message_templates(id) ON DELETE CASCADE,
      UNIQUE (user_id, template_id)
    );
  `);

  let reader;
  if (filename === ":memory:") {
    // if we try to open two connections to ":memory:", it will result in two separate databases, so we assign reader to
    // writer to ensure they share the same instance
    reader = writer;
    writer.unsafeMode(); // https://github.com/WiseLibs/better-sqlite3/issues/203
  } else {
    reader = _open(filename);
  }

  return Object.assign(writer, { writer, reader });
}
