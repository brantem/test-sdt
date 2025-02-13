import type { Database } from "better-sqlite3";
import dayjs from "dayjs";

import * as messages from "./index.js";

import { init as initDb } from "../lib/db.js";

describe("messages", () => {
  beforeAll(() => {
    vi.stubEnv("EMAIL_SERVICE_URL", "https://example.com");
    vi.stubEnv("EMAIL_SERVICE_RETRY_ATTEMPTS", "3");
    vi.stubEnv("EMAIL_SERVICE_RETRY_DELAY_MS", "2");
    vi.stubEnv("EMAIL_SERVICE_TIMEOUT_MS", "1");
    vi.stubEnv("EMAIL_SERVICE_BATCH_SIZE", "1");
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  test("isProcessable", () => {
    vi.setSystemTime(new Date(2025, 0, 1, 1, 0)); // 2025-01-01 01:00
    expect(messages.isProcessable(dayjs("2025-01-01 00:00"))).toBeFalsy();
    expect(messages.isProcessable(dayjs("2025-01-01 01:00"))).toBeFalsy();
    expect(messages.isProcessable(dayjs("2025-01-01 02:00"))).toBeTruthy();
    vi.useRealTimers();
  });

  describe("send", () => {
    const message = { id: 1, email: "a@mail.com", message: "a" };

    beforeEach(() => {
      fetchMock.resetMocks();
    });

    it("sends message successfully", async () => {
      fetchMock.mockResponse(() => ({ ok: true, body: JSON.stringify({ status: "sent" }) }));
      expect(await messages.send(message)).toBe(message.id);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("retries after error and succeeds", async () => {
      fetchMock
        .mockResponseOnce({ ok: false, body: "{}" })
        .mockResponseOnce({ ok: true, body: JSON.stringify({ status: "sent" }) });

      // TODO: test delay

      expect(await messages.send(message)).toBe(message.id);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("retries after timeout and succeeds", async () => {
      fetchMock
        .mockResponseOnce(() => Promise.reject(new DOMException("The operation timed out.", "TimeoutError")))
        .mockResponseOnce({ ok: true, body: JSON.stringify({ status: "sent" }) });

      // TODO: test delay

      expect(await messages.send(message)).toBe(message.id);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("returns null after reaching max retries", async () => {
      fetchMock.mockResponse({ ok: false, body: undefined });

      // TODO: test delay

      expect(await messages.send(message)).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });

  describe("handle", () => {
    let db: Database;

    beforeAll(() => {});

    beforeEach(() => {
      vi.setSystemTime(new Date(2025, 0, 1, 1, 0)); // 2025-01-01 01:00

      fetchMock.resetMocks();

      db = initDb();
      db.exec(`
        INSERT INTO users (email, first_name, last_name, birth_date, location)
        VALUES
          ('a@mail.com', 'a', 'a', '2025-01-01', 'Asia/Tokyo'),     -- UTC+09:00
          ('b@mail.com', 'b', 'b', '2025-01-01', 'Asia/Hong_Kong'), -- UTC+08:00
          ('c@mail.com', 'c', 'c', '2025-01-01', 'Asia/Jakarta');   -- UTC+07:00
      `);
    });

    afterEach(() => {
      db.close();
      vi.useRealTimers();
    });

    it("does nothing when there are no messages to process", async () => {
      await messages.handle(db);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("sends messages and removes successfully processed ones", async () => {
      // first message succeeds, others fail
      fetchMock
        .mockResponseOnce({ ok: true, body: JSON.stringify({ status: "sent" }) })
        .mockResponse(() => Promise.reject(new DOMException("The operation timed out.", "TimeoutError")));

      db.exec(`
        INSERT INTO messages (user_id, template_id, process_at)
        VALUES
          (1, 1, '2025-01-01 00:00:00'), -- message that failed in the previous run
          (2, 1, '2025-01-01 01:00:00'), -- message that should be processed now
          (3, 1, '2025-01-01 02:00:00'); -- future message (should not be processed yet)
      `);

      await messages.handle(db);
      expect((await Promise.all(fetchMock.requests().map((req) => req.json()))).map((body) => body.email)).toEqual([
        "a@mail.com", // success
        "b@mail.com", // failed 1/3
        "b@mail.com", // failed 2/3
        "b@mail.com", // failed 3/3
      ]);
      expect(db.prepare("SELECT id FROM messages").all()).toStrictEqual([
        { id: 2 }, // failed
        { id: 3 }, // future message
      ]);
    });
  });
});
