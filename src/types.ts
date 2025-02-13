import type { Database as BaseDatabase } from "better-sqlite3";

export type Database = BaseDatabase & {
  reader: BaseDatabase;
  writer: BaseDatabase;
};
