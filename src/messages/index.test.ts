import dayjs from "dayjs";

import * as messages from "./index.js";

import type * as types from "../types.js";
import { open as openDb } from "../lib/db.js";

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
      await expect(messages.send(message)).resolves.toBe(message.id);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("retries after error and succeeds", async () => {
      fetchMock
        .mockResponseOnce({ ok: false, body: "{}" })
        .mockResponseOnce({ ok: true, body: JSON.stringify({ status: "sent" }) });

      // TODO: test delay

      await expect(messages.send(message)).resolves.toBe(message.id);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("retries after timeout and succeeds", async () => {
      fetchMock
        .mockResponseOnce(() => Promise.reject(new DOMException("The operation timed out.", "TimeoutError")))
        .mockResponseOnce({ ok: true, body: JSON.stringify({ status: "sent" }) });

      // TODO: test delay

      await expect(messages.send(message)).resolves.toBe(message.id);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("rejects after reaching max retries", async () => {
      fetchMock.mockResponse({ ok: false, body: undefined });

      // TODO: test delay

      await expect(messages.send(message)).rejects.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });

  describe("handle", () => {
    let db: types.Database;

    beforeEach(() => {
      vi.setSystemTime(new Date(2025, 0, 1, 1, 0)); // 2025-01-01 01:00

      fetchMock.resetMocks();

      db = openDb();
      db.exec(`
        INSERT INTO users (email, first_name, last_name, birth_date, location)
        VALUES
          ('a@mail.com', 'a', 'a', '2025-01-01', 'Asia/Tokyo'),     -- UTC+09:00
          ('b@mail.com', 'b', 'b', '2025-01-01', 'Asia/Tokyo'),     -- UTC+09:00
          ('c@mail.com', 'c', 'c', '2025-01-01', 'Asia/Hong_Kong'), -- UTC+08:00
          ('d@mail.com', 'c', 'c', '2025-01-01', 'Asia/Jakarta');   -- UTC+07:00
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
        INSERT INTO messages (user_id, template_id, status, process_at)
        VALUES
          (1, 1, 1, '2025-01-01 00:00:00'), -- message that is still being processed (should not be picked up to prevent duplication)
          (2, 1, 0, '2025-01-01 00:00:00'), -- message that failed in the previous run
          (3, 1, 0, '2025-01-01 01:00:00'), -- message that should be processed now
          (4, 1, 0, '2025-01-01 02:00:00'); -- future message (should not be processed yet)
      `);

      await messages.handle(db);
      expect((await Promise.all(fetchMock.requests().map((req) => req.json()))).map((body) => body.email)).toEqual([
        "b@mail.com", // success
        "c@mail.com", // failed 1/3
        "c@mail.com", // failed 2/3
        "c@mail.com", // failed 3/3
      ]);
      expect(db.prepare("SELECT id, status FROM messages").all()).toStrictEqual([
        { id: 1, status: 1 }, // still being processed
        { id: 3, status: 0 }, // failed
        { id: 4, status: 0 }, // future message
      ]);
    });
  });
});
