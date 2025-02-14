import { CronJob } from "cron";
import dayjs from "dayjs";

import type * as types from "../types.js";
import * as helpers from "../lib/helpers.js";

export function isProcessable(v: dayjs.Dayjs) {
  const d = dayjs();
  // can't use isBefore/isAfter here. https://github.com/iamkun/dayjs/issues/1456
  return v.date() === d.date() && v.hour() > d.hour();
}

type Item = {
  id: number;
  email: string;
  message: string;
};

export async function send({ id, ...data }: Item) {
  console.log(`messages.send(${id}): Sending`);

  const url = process.env.EMAIL_SERVICE_URL || "";
  const maxAttempts = parseInt(process.env.EMAIL_SERVICE_RETRY_ATTEMPTS || "5") || 5;
  const delay = parseInt(process.env.EMAIL_SERVICE_RETRY_DELAY_MS || "1000") || 1000;
  const timeout = parseInt(process.env.EMAIL_SERVICE_TIMEOUT_MS || "5000") || 5000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(`${url}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(timeout),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.status === "sent") {
          console.log(`messages.send(${id}): Sent ${attempt + 1}/${maxAttempts}`);
          return Promise.resolve(id);
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        console.error(`messages.send(${id}): Request timed out ${attempt + 1}/${maxAttempts}`);
        continue;
      }
    }

    console.error(`messages.send(${id}): Failed ${attempt + 1}/${maxAttempts}`);
    if (attempt < maxAttempts) await helpers.sleep(delay);
  }

  return Promise.reject();
}

export async function handle(db: types.Database) {
  const concurrency = parseInt(process.env.EMAIL_SERVICE_CONCURRENCY || "5") || 5;

  const datetime = dayjs().format("YYYY-MM-DD HH:mm:ss");
  console.log(`messages.handle(${datetime}): Starting`);

  try {
    const stmt = db.prepare<[string], Item>(`
      SELECT m.id, u.email, replace(mt.content, '{{full_name}}', concat(u.first_name, ' ', u.last_name)) AS message
      FROM message_templates mt
      JOIN messages m ON m.template_id = mt.id
      JOIN users u ON u.id = m.user_id
      WHERE m.status = 0 -- Scheduled
        AND m.process_at <= ?
    `);
    const items = stmt.all(datetime);
    if (!items.length) return;
    console.log(`messages.handle(${datetime}): Found ${items.length} messages`);

    // mark all messages as being processed
    const messageIds = items.map((item) => item.id);
    db.prepare(`UPDATE messages SET status = 1 WHERE id IN (${messageIds.map(() => "?").join(",")})`).run(messageIds);

    const complete = db.prepare("DELETE FROM messages WHERE id = ?");
    const requeue = db.prepare("UPDATE messages SET status = 0 WHERE id = ?");

    let success = 0;
    await helpers.runConcurrently(items, concurrency, {
      onProcess: send,
      onFail: (item) => requeue.run(item.id),
      onSuccess: (item) => {
        complete.run(item.id);
        success++;
      },
    });

    console.log(`messages.handle(${datetime}): Successfully sent ${success}/${items.length} messages`);
  } catch (err) {
    console.error(`messages.handle(${datetime}):`, err);
  }
}

/* v8 ignore start */
export function start(db: types.Database) {
  CronJob.from({ cronTime: "0 * * * *", onTick: () => handle(db), start: true }); // hourly
}
/* v8 ignore stop */
