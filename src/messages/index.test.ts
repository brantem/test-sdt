import dayjs from "dayjs";

import * as messages from "./index.js";

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

    test("sends message successfully", async () => {
      fetchMock.mockResponse(() => ({ ok: true, body: JSON.stringify({ status: "sent" }) }));
      expect(await messages.send(message)).toBe(message.id);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test("retries after error and succeeds", async () => {
      fetchMock
        .mockResponseOnce({ ok: false, body: "{}" })
        .mockResponseOnce({ ok: true, body: JSON.stringify({ status: "sent" }) });

      // TODO: test delay

      expect(await messages.send(message)).toBe(message.id);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    test("retries after abort and succeeds", async () => {
      fetchMock.mockAbortOnce().mockResponseOnce({ ok: true, body: JSON.stringify({ status: "sent" }) });

      // TODO: test delay

      expect(await messages.send(message)).toBe(message.id);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    test("returns null after reaching max retries", async () => {
      fetchMock.mockResponse({ ok: false, body: undefined });

      // TODO: test delay

      expect(await messages.send(message)).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });
});
