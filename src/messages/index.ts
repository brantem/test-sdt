import type { Database } from "better-sqlite3";
import { CronJob } from "cron";
import dayjs from "dayjs";
import { sleep } from "../lib/helpers.js";

export function isProcessable(v: dayjs.Dayjs) {
  const d = dayjs();
  // can't use isBefore/isAfter here. https://github.com/iamkun/dayjs/issues/1456
  return v.date() === d.date() && v.hour() > d.hour();
}

type Message = {
  id: number;
  email: string;
  message: string;
};

export async function send({ id, ...message }: Message) {
  const ENDPOINT = process.env.MESSAGES_SEND_ENDPOINT || "";
  const RETRIES = parseInt(process.env.MESSAGES_SEND_RETRIES || "3") || 3;
  const RETRY_DELAY = parseInt(process.env.MESSAGES_SEND_RETRY_DELAY || "1000") || 1000;
  const TIMEOUT = parseInt(process.env.MESSAGES_SEND_TIMEOUT || "1000") || 1000;

  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(TIMEOUT),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.status === "sent") {
          console.log(`messages.send(${id}): Sent ${attempt + 1}/${RETRIES}`);
          return id;
        }
      }

      console.error(`messages.send(${id}): Failed ${attempt + 1}/${RETRIES}:`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        console.error(`messages.send(${id}): Request timed out ${attempt + 1}/${RETRIES}`);
      } else {
        console.error(`messages.send(${id}): Failed ${attempt + 1}/${RETRIES}`);
      }
    }

    if (attempt < RETRIES) await sleep(RETRY_DELAY);
  }

  return null;
}

function handle(db: Database) {
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
  CronJob.from({ cronTime: "0 * * * *", onTick: () => handle(db), start: true }); // hourly
}
