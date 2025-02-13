import { Hono } from "hono";
import * as v from "valibot";
import { SqliteError } from "better-sqlite3";

import * as birthday from "../birthday/index.js";
import * as messages from "../messages/index.js";

import * as validator from "../lib/validator.js";
import { isValidTimezone } from "../lib/helpers.js";

const user = new Hono();

const userSchema = v.object({
  email: v.pipe(v.string(), v.trim(), v.toLowerCase(), v.email(), v.nonEmpty()),
  firstName: v.pipe(v.string(), v.trim(), v.nonEmpty()),
  lastName: v.pipe(v.string(), v.trim(), v.nonEmpty()),
  birthDate: v.pipe(v.string(), v.trim(), v.isoDate(), v.nonEmpty()),
  location: v.pipe(
    v.string(),
    v.trim(),
    v.custom((v) => isValidTimezone(v as string)),
    v.nonEmpty()
  ),
});

user.post("/", validator.json(userSchema), async (c) => {
  const db = c.get("db");
  const body = await c.req.valid("json");

  try {
    const stmt = db.prepare<typeof body, { id: number }>(`
      INSERT INTO users (email, first_name, last_name, birth_date, location)
      VALUES (@email, @firstName, @lastName, @birthDate, @location)
      RETURNING id
    `);
    const user = stmt.get(body)!;

    const v = birthday.getUTCTimestamp(body.birthDate, body.location);
    if (messages.isProcessable(v)) birthday.schedule(db, user.id, v);

    return c.json({ success: true, error: null }, 200);
  } catch (err) {
    if (err instanceof SqliteError && err.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return c.json({ success: false, error: { code: "EMAIL_SHOULD_BE_UNIQUE" } }, 422);
    }
    console.error("POST /user", err);
    throw err;
  }
});

user.put("/:id", validator.json(userSchema), async (c) => {
  const body = await c.req.valid("json");

  try {
    const stmt = c.get("db").prepare(`
      UPDATE users
      SET email = @email, first_name = @firstName, last_name = @lastName, birth_date = @birthDate, location = @location
      WHERE id = @id
    `);
    const result = stmt.run({ id: c.req.param("id"), ...body });
    if (!result.changes) return c.json({ success: false, error: { code: "NOT_FOUND" } }, 404);

    // TODO: queue

    return c.json({ success: true, error: null }, 200);
  } catch (err) {
    if (err instanceof SqliteError && err.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return c.json({ success: false, error: { code: "EMAIL_SHOULD_BE_UNIQUE" } }, 422);
    }
    console.error("POST /user/:id", err);
    throw err;
  }
});

user.delete("/:id", async (c) => {
  try {
    const result = c.get("db").prepare("DELETE FROM users WHERE id = ?").run(c.req.param("id"));
    if (!result.changes) return c.json({ success: false, error: { code: "NOT_FOUND" } }, 404);

    return c.json({ success: true, error: null }, 200);
  } catch (err) {
    console.error("DELETE /user/:id", err);
    throw err;
  }
});

export default user;
