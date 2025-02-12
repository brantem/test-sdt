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
  `);

  return db;
}
