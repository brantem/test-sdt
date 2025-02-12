import type { Database } from "better-sqlite3";

import * as messages from "./messages.js";

export function start(db: Database) {
  messages.start(db);
}
