import { Hono } from "hono";
import type { Database } from "better-sqlite3";

import user from "./user.js";
import { init as initDb } from "../lib/db.js";

describe("/user", () => {
  let app: Hono;
  let db: Database;

  const body = {
    email: " John@mail.com ",
    firstName: " John ",
    lastName: " Doe ",
    birthDate: " 2025-01-01 ",
    location: " Asia/Jakarta ",
  };

  beforeAll(() => {
    app = new Hono();
    db = initDb();

    app.use("*", async (c, next) => {
      c.set("db", db);
      await next();
    });
    app.route("/user", user);
  });

  afterAll(() => {
    db.close();
  });

  test("POST /", async () => {
    expect(db.prepare("SELECT * FROM users").all()).toStrictEqual([]);

    // success
    const res = await app.request("/user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, error: null });

    // duplicated
    const res2 = await app.request("/user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(res2.status).toBe(422);
    expect(await res2.json()).toEqual({ success: false, error: { code: "EMAIL_SHOULD_BE_UNIQUE" } });
  });

  test("PUT /", async () => {
    // success
    const res = await app.request("/user/1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: " jane@mail.com ",
        firstName: " Jane ",
        lastName: " Doe ",
        birthDate: " 2025-01-02 ",
        location: " Asia/Bangkok ",
      }),
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
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, error: null });

    // not found
    const res2 = await app.request("/user/2", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(res2.status).toBe(404);
    expect(await res2.json()).toEqual({ success: false, error: { code: "NOT_FOUND" } });
  });

  test("DELETE /", async () => {
    // success
    const res = await app.request("/user/1", { method: "DELETE" });
    expect(db.prepare("SELECT * FROM users").all()).toStrictEqual([]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, error: null });

    // not found
    const res2 = await app.request("/user/1", { method: "DELETE" });
    expect(res2.status).toBe(404);
    expect(await res2.json()).toEqual({ success: false, error: { code: "NOT_FOUND" } });
  });
});
