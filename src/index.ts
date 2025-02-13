import "dotenv/config";

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";

import user from "./handlers/user.js";
import * as birthday from "./birthday/index.js";
import * as messages from "./messages/index.js";

import type * as types from "./types.js";
import { open as openDb } from "./lib/db.js";

declare module "hono" {
  interface ContextVariableMap {
    db: types.Database;
  }
}

const app = new Hono();
app.use(logger());

const db = openDb(process.env.DB_PATH);

app.use("*", async (c, next) => {
  c.set("db", db);
  await next();
});

app.route("/user", user);

app.onError((err, c) => {
  return c.json({ error: { code: "INTERNAL_SERVER_ERROR" } }, 500);
});

serve(app, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`);
  birthday.start(db);
  messages.start(db);
});

export default app;
