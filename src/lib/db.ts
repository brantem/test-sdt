import Database from "better-sqlite3";

export function init(filename = ":memory:") {
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
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
    VALUES (1, 'Hey, {{full_name}} it''s your birthday') ON CONFLICT DO NOTHING;

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

  return db;
}
