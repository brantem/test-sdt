import { Hono } from "hono";
import type { Database } from "better-sqlite3";

import user from "./user.js";
import { init as initDb } from "../lib/db.js";

describe("/user", () => {
  let app: Hono;
  let db: Database;

  const john = {
    email: " John@mail.com ",
    firstName: " John ",
    lastName: " Doe ",
    birthDate: " 2025-01-01 ",
    location: " Asia/Jakarta ",
  };

  beforeEach(() => {
    vi.setSystemTime(new Date(2025, 0, 1, 1, 0)); // 2025-01-01 01:00
    app = new Hono();
    db = initDb();

    app.use("*", async (c, next) => {
      c.set("db", db);
      await next();
    });
    app.route("/user", user);
  });

  afterEach(() => {
    db.close();
    vi.useRealTimers();
  });

  describe("POST /", () => {
    it("creates a user and schedules a message if the UTC timestamp is in the future", async () => {
      expect(db.prepare("SELECT * FROM users").all()).toStrictEqual([]);
      expect(db.prepare("SELECT * FROM messages").all()).toStrictEqual([]);
      const res = await app.request("/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(john),
      });
      expect(db.prepare("SELECT * FROM users").all()).toStrictEqual([
        {
          id: 1,
          email: "john@mail.com",
          first_name: "John",
          last_name: "Doe",
          birth_date: "2025-01-01",
          location: "Asia/Jakarta",
        },
      ]);
      // UTC Timestamp: 2025-01-01 02:00:00
      expect(db.prepare("SELECT * FROM messages").all()).toStrictEqual([
        {
          id: 1,
          user_id: 1,
          template_id: 1,
          process_at: "2025-01-01 02:00:00",
        },
      ]);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ user: { id: 1 }, error: null });
    });

    it("creates a user but skips scheduling if the UTC timestamp is not in the future", async () => {
      expect(db.prepare("SELECT * FROM users").all()).toStrictEqual([]);
      expect(db.prepare("SELECT * FROM messages").all()).toStrictEqual([]);
      const res = await app.request("/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...john, location: "Asia/Hong_Kong" }), // UTC+08:00
      });
      expect(db.prepare("SELECT * FROM users").all()).toStrictEqual([
        {
          id: 1,
          email: "john@mail.com",
          first_name: "John",
          last_name: "Doe",
          birth_date: "2025-01-01",
          location: "Asia/Hong_Kong",
        },
      ]);
      // UTC Timestamp: 2025-01-01 01:00:00
      expect(db.prepare("SELECT * FROM messages").all()).toStrictEqual([]);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ user: { id: 1 }, error: null });
    });

    it("fails when email is duplicated", async () => {
      db.exec(`
        INSERT INTO users (email, first_name, last_name, birth_date, location)
        VALUES ('john@mail.com', 'John', 'Doe', '2025-01-01', 'Asia/Jakarta');
      `);

      const res = await app.request("/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(john),
      });
      expect(res.status).toBe(422);
      expect(await res.json()).toEqual({ user: null, error: { code: "EMAIL_SHOULD_BE_UNIQUE" } });
    });
  });

  describe("PUT /:id", () => {
    const jane = {
      email: " jane@mail.com ",
      firstName: " Jane ",
      lastName: " Doe ",
      birthDate: " 2025-01-02 ",
      location: " Asia/Bangkok ",
    };

    beforeEach(async () => {
      db.exec(`
        INSERT INTO users (email, first_name, last_name, birth_date, location)
        VALUES ('john@mail.com', 'John', 'Doe', '2025-01-01', 'Asia/Jakarta');
      `);
    });

    it("successfully updates a user and removes the message if the new birth_date is in a different date", async () => {
      db.exec(`
        INSERT INTO messages (user_id, template_id, process_at)
        VALUES (1, 1, '2025-01-01 02:00:00');
      `);

      const res = await app.request("/user/1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jane),
      });
      expect(db.prepare("SELECT * FROM users").all()).toStrictEqual([
        {
          id: 1,
          email: "jane@mail.com",
          first_name: "Jane",
          last_name: "Doe",
          birth_date: "2025-01-02",
          location: "Asia/Bangkok",
        },
      ]);
      // message is removed because the new birth_date is in a different date
      expect(db.prepare("SELECT * FROM messages").all()).toStrictEqual([]);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true, error: null });
    });

    it("successfully updates a user and queue a message if the new birth_date is today", async () => {
      db.exec(`
        UPDATE users SET birth_date = '2025-01-02';
        DELETE FROM messages;
      `);

      const res = await app.request("/user/1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...jane, birthDate: "2025-01-01" }),
      });
      expect(db.prepare("SELECT * FROM users").all()).toStrictEqual([
        {
          id: 1,
          email: "jane@mail.com",
          first_name: "Jane",
          last_name: "Doe",
          birth_date: "2025-01-01",
          location: "Asia/Bangkok",
        },
      ]);
      // message is queued because birth_date is today
      expect(db.prepare("SELECT * FROM messages").all()).toStrictEqual([
        {
          id: 1,
          user_id: 1,
          template_id: 1,
          process_at: "2025-01-01 02:00:00",
        },
      ]);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true, error: null });
    });

    it("fails to update a nonexistent user", async () => {
      const res = await app.request("/user/2", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(john),
      });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ success: false, error: { code: "NOT_FOUND" } });
    });

    it("fails when email is duplicated", async () => {
      db.exec(`
        INSERT INTO users (email, first_name, last_name, birth_date, location)
        VALUES ('jane@mail.com', 'Jane', 'Doe', '2025-01-01', 'Asia/Jakarta')
      `);

      const res = await app.request("/user/2", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...jane, email: "john@mail.com" }),
      });
      expect(res.status).toBe(422);
      expect(await res.json()).toEqual({ success: false, error: { code: "EMAIL_SHOULD_BE_UNIQUE" } });
    });
  });

  describe("DELETE /:id", () => {
    beforeEach(async () => {
      db.exec(`
        INSERT INTO users (email, first_name, last_name, birth_date, location)
        VALUES ('john@mail.com', 'John', 'Doe', '2025-01-01', 'Asia/Jakarta')
      `);
    });

    it("successfully deletes a user", async () => {
      const res = await app.request("/user/1", { method: "DELETE" });
      expect(db.prepare("SELECT * FROM users").all()).toStrictEqual([]);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true, error: null });
    });

    it("fails to delete a nonexistent user", async () => {
      const res = await app.request("/user/2", { method: "DELETE" });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ success: false, error: { code: "NOT_FOUND" } });
    });
  });
});
