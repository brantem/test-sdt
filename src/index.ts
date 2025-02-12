import "dotenv/config";

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import type { Database } from "better-sqlite3";

import user from "./handlers/user.js";
import * as jobs from "./jobs/index.js";

import { init as initDb } from "./lib/db.js";

declare module "hono" {
  interface ContextVariableMap {
    db: Database;
  }
}

const app = new Hono();
app.use(logger());

const db = initDb(process.env.DB_PATH);

app.use("*", async (c, next) => {
  c.set("db", db);
  await next();
});

app.route("/user", user);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: { code: "INTERNAL_SERVER_ERROR" } }, 500);
});

serve(app, (info) => {
  jobs.start(db);
  console.log(`Server is running on http://localhost:${info.port}`);
});

export default app;
