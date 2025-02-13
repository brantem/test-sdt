import type { Database } from "better-sqlite3";
import { CronJob } from "cron";
import dayjs from "dayjs";
import { processInBatches, sleep } from "../lib/helpers.js";

export function isProcessable(v: dayjs.Dayjs) {
  const d = dayjs();
  // can't use isBefore/isAfter here. https://github.com/iamkun/dayjs/issues/1456
  return v.date() === d.date() && v.hour() > d.hour();
}

type Data = {
  id: number;
  email: string;
  message: string;
};

export async function send({ id, ...data }: Data) {
  console.log(`messages.send(${id}): Sending`);

  const url = process.env.EMAIL_SERVICE_URL || "";
  const maxAttempts = parseInt(process.env.EMAIL_SERVICE_RETRY_ATTEMPTS || "3") || 3;
  const delay = parseInt(process.env.EMAIL_SERVICE_RETRY_DELAY_MS || "1000") || 1000;
  const timeout = parseInt(process.env.EMAIL_SERVICE_TIMEOUT_MS || "5000") || 5000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(timeout),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.status === "sent") {
          console.log(`messages.send(${id}): Sent ${attempt + 1}/${maxAttempts}`);
          return id;
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        console.error(`messages.send(${id}): Request timed out ${attempt + 1}/${maxAttempts}`);
        continue;
      }
    }

    console.error(`messages.send(${id}): Failed ${attempt + 1}/${maxAttempts}`);
    if (attempt < maxAttempts) await sleep(delay);
  }

  return null;
}

export async function handle(db: Database) {
  const concurrency = parseInt(process.env.EMAIL_SERVICE_CONCURRENCY || "1") || 1;

  try {
    const datetime = dayjs().format("YYYY-MM-DD HH:mm:ss");
    console.log(`messages.handle: ${datetime}`);

    const stmt = db.prepare<[string], Data>(`
      SELECT m.id, u.email, replace(mt.content, '{{full_name}}', concat(u.first_name, ' ', u.last_name)) AS message
      FROM message_templates mt
      JOIN messages m ON m.template_id = mt.id
      JOIN users u ON u.id = m.user_id
      WHERE m.process_at <= ?
    `);
    const items = stmt.all(datetime);
    if (!items.length) return;
    console.log(`messages.handle: Found ${items.length} messages`);

    const successIds: Data["id"][] = [];
    await processInBatches(items, concurrency, async (items) => {
      const results = await Promise.allSettled(items.map((data) => send(data)));
      results.forEach((result) => {
        if (result.status !== "fulfilled" || !result.value) return;
        successIds.push(result.value);
      });
    });

    // no need to do anything with the unsuccessful messages, they will be caught in the next run

    if (successIds.length) {
      db.prepare(`DELETE FROM messages WHERE id IN (${successIds.map(() => "?").join(",")})`).run(successIds);
    }
    console.log(`messages.send: Successfully sent ${successIds.length}/${items.length} messages`);
  } catch (err) {
    console.error("messages.send", err);
  }
}

export function start(db: Database) {
  CronJob.from({ cronTime: "0 * * * *", onTick: () => handle(db), start: true }); // hourly
}
