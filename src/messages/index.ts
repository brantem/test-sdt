import type { Database } from "better-sqlite3";
import { CronJob } from "cron";
import dayjs from "dayjs";

export function isProcessable(v: dayjs.Dayjs) {
  const d = dayjs();
  // can't use isBefore/isAfter here. https://github.com/iamkun/dayjs/issues/1456
  return v.date() === d.date() && v.hour() > d.hour();
}

// TODO: function to remove from messages

function process(db: Database) {
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

    // no need to do anything with the unsuccessful messages, they will be caught in the next hour

    if (successIds.length) {
      db.prepare(`DELETE FROM messages WHERE id IN (${successIds.map(() => "?").join(",")})`).run(successIds);
    }
    console.log(`messages.send: Successfully sent ${successIds.length} messages`);
  } catch (err) {
    console.error("messages.send", err);
  }
}

export function start(db: Database) {
  CronJob.from({ cronTime: "0 * * * *", onTick: () => process(db), start: true }); // hourly
}
