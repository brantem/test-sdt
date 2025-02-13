import type { Database } from "better-sqlite3";

import * as birthday from "./index.js";

import { init as initDb } from "../lib/db.js";

describe("birthday", () => {
  test("getUTCTimestamp", () => {
    const date = "2025-01-01";
    expect(birthday.getUTCTimestamp(date, "Pacific/Niue").format("YYYY-MM-DD HH:mm")).toBe("2025-01-01 20:00"); // UTC-11:00
    expect(birthday.getUTCTimestamp(date, "Asia/Jakarta").format("YYYY-MM-DD HH:mm")).toBe("2025-01-01 02:00"); // UTC+07:00
    expect(birthday.getUTCTimestamp(date, "Asia/Tokyo").format("YYYY-MM-DD HH:mm")).toBe("2025-01-01 00:00"); // UTC+09:00
    expect(birthday.getUTCTimestamp(date, "Pacific/Kiritimati").format("YYYY-MM-DD HH:mm")).toBe("2024-12-31 19:00"); // UTC+14:00
  });

  test("cancel", () => {
    const db = initDb();

    db.exec(`
      INSERT INTO users (email, first_name, last_name, birth_date, location) VALUES ('a@mail.com', 'a', 'a', '2025-01-01', 'Asia/Jakarta');
      INSERT INTO messages (user_id, template_id, process_at) VALUES (1, 1, '2025-01-01 02:00:00');
    `);

    birthday.cancel(db, 1);
    expect(db.prepare("SELECT * FROM messages").all()).toStrictEqual([]);

    db.close();
  });

  describe("schedule", () => {
    let db: Database;

    beforeEach(() => {
      db = initDb();
    });

    afterEach(() => {
      db.close();
    });

    beforeEach(() => {
      db.exec(`
        INSERT INTO users (email, first_name, last_name, birth_date, location)
        VALUES ('a@mail.com', 'a', 'a', '2025-01-01', 'Asia/Jakarta')
      `);
    });

    it("queues a message successfully", () => {
      birthday.schedule(db, 1, birthday.getUTCTimestamp("2025-01-01", "Asia/Jakarta"));
      expect(db.prepare("SELECT * FROM messages").all()).toStrictEqual([
        {
          id: 1,
          user_id: 1,
          template_id: 1,
          process_at: "2025-01-01 02:00:00",
        },
      ]);
    });
  });

  describe("collect", () => {
    let db: Database;

    beforeEach(() => {
      db = initDb();
    });

    afterEach(() => {
      db.close();
    });

    beforeEach(() => {
      db.exec(`
        INSERT INTO users (email, first_name, last_name, birth_date, location)
        VALUES
          ('a@mail.com', 'a', 'a', '2025-01-01', 'Pacific/Niue'),       -- UTC-11:00
          ('b@mail.com', 'b', 'b', '2025-01-01', 'Asia/Jakarta'),       -- UTC+07:00
          ('c@mail.com', 'c', 'c', '2025-01-01', 'Asia/Tokyo'),         -- UTC+09:00
          ('d@mail.com', 'd', 'd', '2025-01-01', 'Pacific/Kiritimati'), -- UTC+14:00
          ('e@mail.com', 'e', 'e', '2025-01-02', 'Asia/Jakarta')        -- UTC+07:00
      `);
    });

    it("returns early when no birthdays are found", () => {
      birthday.collect(db);
      expect(db.prepare("SELECT * FROM messages").all()).toStrictEqual([]);
    });

    it("queues messages for users whose birthday is today in their timezone", () => {
      vi.setSystemTime(new Date(2025, 0, 1, 0, 0)); // 2025-01-01 00:00
      birthday.collect(db);
      expect(db.prepare("SELECT * FROM messages").all()).toStrictEqual([
        {
          id: 1,
          user_id: 1,
          template_id: 1,
          process_at: "2025-01-01 20:00:00",
        },
        {
          id: 2,
          user_id: 2,
          template_id: 1,
          process_at: "2025-01-01 02:00:00",
        },
      ]);
      vi.useRealTimers();
    });

    it("prevents duplicate messages", () => {
      vi.setSystemTime(new Date(2025, 0, 1, 0, 0)); // 2025-01-01 00:00
      birthday.collect(db);
      birthday.collect(db);
      expect(db.prepare("SELECT * FROM messages").all()).toStrictEqual([
        {
          id: 1,
          user_id: 1,
          template_id: 1,
          process_at: "2025-01-01 20:00:00",
        },
        {
          id: 2,
          user_id: 2,
          template_id: 1,
          process_at: "2025-01-01 02:00:00",
        },
      ]);
      vi.useRealTimers();
    });

    it("handles birthdays in timezones ahead of UTC correctly", () => {
      vi.setSystemTime(new Date(2025, 0, 0, 0, 0)); // 2024-12-31 00:00
      birthday.collect(db);
      expect(db.prepare("SELECT * FROM messages").all()).toStrictEqual([
        {
          id: 1,
          user_id: 3,
          template_id: 1,
          process_at: "2025-01-01 00:00:00",
        },
        {
          id: 2,
          user_id: 4,
          template_id: 1,
          process_at: "2024-12-31 19:00:00",
        },
      ]);
      vi.useRealTimers();
    });
  });
});
