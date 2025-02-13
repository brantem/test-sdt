import type { Database } from "better-sqlite3";
import { CronJob } from "cron";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export function getUTCTimestamp(date: string, location: string) {
  return dayjs.tz(`${date}T09:00:00`, location).utc();
}

export function collect(db: Database) {
  type User = {
    id: number;
    birth_date: string;
    location: string;
  };

  try {
    const date = dayjs().format("YYYY-MM-DD");
    console.log(`birthday.collect: ${date}`);

    // we need to get users with birthdays between today and today+1 to ensure we don't miss anyone. example: suppose
    // today is 2025-01-01, and a user has a birthdate of 2025-01-01 in Pacific/Kiritimati. if we only query
    // `birth_date = date`, the UTC equivalent of their birthday would be `2024-12-31 19:00:00`, which is in the past,
    // meaning they would never receive a birthday message. by using a range, the user will be caught in the previous
    // day's run (2024-12-31), ensuring they get the message.
    const users = db
      .prepare<[string, string], User>("SELECT id, birth_date, location FROM users WHERE birth_date BETWEEN ? AND ?")
      .all(date, dayjs(date).add(1, "day").format("YYYY-MM-DD"));
    if (!users.length) return;

    const values = users.reduce((values, user) => {
      const v = getUTCTimestamp(user.birth_date, user.location);
      if (v.date() !== dayjs().date()) return values;
      return [...values, [user.id, v.format("YYYY-MM-DD HH:mm:ss")]];
    }, [] as any[]);

    const stmt = db.prepare(`
      INSERT INTO messages (user_id, template_id, process_at)
      VALUES ${values.map(() => `(?, 1, ?)`).join(", ")}
      ON CONFLICT DO NOTHING
    `);
    stmt.run(values.flat());
    console.log(`birthday.collect: Queued ${values.length} messages`);
  } catch (err) {
    console.error("birthday.collect", err);
  }
}

export function start(db: Database) {
  CronJob.from({ cronTime: "0 0 * * *", onTick: () => collect(db), start: true }); // daily
}
