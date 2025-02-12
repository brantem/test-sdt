import type { Database } from "better-sqlite3";
import { CronJob } from "cron";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

function prepare(db: Database) {
  type User = {
    id: number;
    birth_date: string;
    location: string;
  };

  try {
    const date = dayjs().format("YYYY-MM-DD");
    console.log(`messages.prepare: ${date}`);

    // need to get everything between today and today+1. this server always runs in UTC (TZ=UTC), but some timezones are
    // behind UTC. for example, a user has a birthday on 2025-02-12 and is in Pacific/Honolulu (UTC-10:00). the
    // scheduled send time would be 2025-02-11T23:00:00 UTC, which is before the job runs at 2025-02-12T00:00:00 UTC.
    // the user will also never receive the message on 2025-02-11 because the date stored in the db is 2025-02-12. that
    // means the user would never receive a birthday message. to fix this, we need to schedule from the previous day, so
    // we query between today (2025-02-11) and today+1 (2025-02-12). this ensures we catch users in timezones behind UTC
    const users = db
      .prepare<[string, string], User>("SELECT id, birth_date, location FROM users WHERE birth_date BETWEEN ? AND ?")
      .all(date, dayjs(date).add(1, "day").format("YYYY-MM-DD"));
    if (!users.length) return;

    const values = users.reduce((values, user) => {
      const processAt = dayjs(user.birth_date).set("hour", 9).tz(user.location);
      if (processAt.get("date") !== dayjs(date).get("date")) return values;
      return [...values, [user.id, 1 /* TODO: dynamic */, processAt.format("YYYY-MM-DD HH:mm:ss")]];
    }, [] as any[]);

    const stmt = db.prepare(`
      INSERT INTO messages (user_id, template_id, process_at)
      VALUES ${values.map(() => `(?, ?, ?)`).join(", ")}
      ON CONFLICT DO NOTHING
    `);
    stmt.run(values.flat());
    console.log(`messages.prepare: Queued ${values.length} messages`);
  } catch (err) {
    console.error(err);
  }
}

function send(db: Database) {
  type Message = {
    id: number;
    email: string;
    message: string;
  };

  try {
    const datetime = dayjs().format("YYYY-MM-DD HH:mm:ss");
    console.log(`messages.send: ${datetime}`);

    const stmt = db.prepare<[string]>(`
      SELECT m.id, u.email, replace(mt.content, '{{full_name}}', concat(u.first_name, ' ', u.last_name)) AS message
      FROM message_templates mt
      JOIN messages m ON m.template_id = mt.id
      JOIN users u ON u.id = m.user_id
      WHERE m.process_at <= ?
    `);
    const messages = stmt.all(datetime);
    if (!messages.length) return;
    console.log(`messages.send: Found ${messages.length} messages`);

    console.log(messages);

    const successIds: Message["id"][] = [];
    for (const message of messages) {
      // TODO: send message
    }

    if (successIds.length) {
      db.prepare(`DELETE FROM messages WHERE id IN (${successIds.map(() => "?").join(",")})`).run(successIds);
    }
    console.log(`messages.send: Successfully sent ${successIds.length} messages`);
  } catch (err) {
    console.error(err);
  }
}

export function start(db: Database) {
  // CronJob.from({ cronTime: "0 0 * * *", onTick: () => prepare(db), start: true });
  CronJob.from({ cronTime: "* * * * *", onTick: () => prepare(db), start: true });
  // CronJob.from({ cronTime: "0 * * * *", onTick: () => send(db), start: true });
  CronJob.from({ cronTime: "*/30 * * * * *", onTick: () => send(db), start: true });
}
