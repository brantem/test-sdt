import type { Database } from "better-sqlite3";

import * as messages from "./messages.js";

import { init as initDb } from "../lib/db.js";

describe("messages", () => {
  let db: Database;

  beforeEach(() => {
    db = initDb();
  });

  afterEach(() => {
    db.close();
  });

  describe("prepare", () => {
    beforeEach(() => {
      db.exec(`
        INSERT INTO users (email, first_name, last_name, birth_date, location)
        VALUES
          ('a@mail.com', 'a', 'z', '2025-01-01', 'Pacific/Honolulu'), -- UTC-10:00
          ('b@mail.com', 'b', 'z', '2025-01-01', 'Asia/Jakarta'),     -- UTC+07:00
          ('c@mail.com', 'c', 'z', '2025-01-02', 'Asia/Tokyo')        -- UTC+09:00
      `);
    });

    it("returns early when no birthdays are found", () => {
      messages.prepare(db);
      expect(db.prepare("SELECT * FROM messages").all()).toStrictEqual([]);
    });

    it("queues messages for users whose birthday is today in their timezone", () => {
      vi.setSystemTime(new Date(2025, 0, 1, 0, 0));
      messages.prepare(db);
      expect(db.prepare("SELECT * FROM messages").all()).toStrictEqual([
        {
          id: 1,
          user_id: 2,
          template_id: 1,
          process_at: "2025-01-01 09:00:00",
        },
      ]);
      vi.useRealTimers();
    });

    it("prevents duplicate messages", () => {
      vi.setSystemTime(new Date(2025, 0, 1, 0, 0));
      messages.prepare(db);
      messages.prepare(db);
      expect(db.prepare("SELECT * FROM messages").all()).toStrictEqual([
        {
          id: 1,
          user_id: 2,
          template_id: 1,
          process_at: "2025-01-01 09:00:00",
        },
      ]);
      vi.useRealTimers();
    });

    it("successfully process user with timezone behind UTC", () => {
      vi.setSystemTime(new Date(2025, 0, 0, 0, 0));
      messages.prepare(db);
      expect(db.prepare("SELECT * FROM messages").all()).toStrictEqual([
        {
          id: 1,
          user_id: 1,
          template_id: 1,
          process_at: "2024-12-31 16:00:00",
        },
      ]);
      vi.useRealTimers();
    });
  });
});
