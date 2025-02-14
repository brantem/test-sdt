import { CronJob } from "cron";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

import type * as types from "../types.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export function getUTCTimestamp(date: string, location: string) {
  return dayjs.tz(`${date}T09:00:00`, location).utc(); // TODO: dynamic time
}

export function cancel(db: types.Database, userId: number) {
  try {
    const stmt = db.prepare(`
      DELETE FROM messages
      WHERE user_id = ?
        AND template_id = 1
    `);
    stmt.run(userId);
  } catch (err) {
    throw err;
  }
}

export function schedule(db: types.Database, userId: number, when: dayjs.Dayjs) {
  try {
    const stmt = db.prepare(`
      INSERT INTO messages (user_id, template_id, process_at)
      VALUES (?, 1, ?)
      ON CONFLICT (user_id, template_id)
      DO UPDATE SET process_at = EXCLUDED.process_at
    `);
    stmt.run(userId, dayjs(when).format("YYYY-MM-DD HH:mm:ss"));
  } catch (err) {
    throw err;
  }
}

type User = {
  id: number;
  birth_date: string;
  location: string;
};

export function collect(db: types.Database) {
  const today = dayjs();
  const _today = today.format("YYYY-MM-DD");
  const next = today.add(1, "day");
  console.log(`birthday.collect(${_today}): Starting`);

  try {
    // we need to get users with birthdays between today and today+1 to ensure we don't miss anyone. example: suppose
    // today is 2025-01-01, and a user has a birthdate of 2025-01-01 in Pacific/Kiritimati. if we only query
    // `birth_date = date`, the UTC equivalent of their birthday would be `2024-12-31 19:00:00`, which is in the past,
    // meaning they would never receive a birthday message. by using a range, the user will be caught in the previous
    // day's run (2024-12-31), ensuring they get the message
    const reader = db.reader.prepare<[string, string], User>(`
      SELECT id, birth_date, location
      FROM users
      WHERE birth_date BETWEEN ? AND ?
    `);
    const writer = db.prepare(`
      INSERT INTO messages (user_id, template_id, process_at)
      VALUES (?, 1, ?)
      ON CONFLICT
      DO NOTHING
    `);

    let i = 0;
    for (const user of reader.iterate(_today, next.format("YYYY-MM-DD"))) {
      const v = getUTCTimestamp(user.birth_date, user.location);
      const isSameDate = v.date() === today.date();
      const isNextDate = v.date() === next.date();
      const isMidnight = v.hour() === 0;

      // we need to schedule a message to be processed at 00:00 on the previous day. if we schedule it on the same day,
      // the hourly job running at this time will already be processing messages, so these messages won't be processed
      // at 9 AM local time but in the next hourly job instead
      if (!(isSameDate && !isMidnight) && !(isNextDate && isMidnight)) continue;
      writer.run(user.id, v.format("YYYY-MM-DD HH:mm:ss"));
      i++;
    }

    console.log(`birthday.collect(${_today}): Queued ${i} messages`);
  } catch (err) {
    console.error(`birthday.collect(${_today}):`, err);
  }
}

/* v8 ignore start */
export function start(db: types.Database) {
  CronJob.from({ cronTime: "0 0 * * *", onTick: () => collect(db), start: true }); // daily
}
/* v8 ignore stop */
