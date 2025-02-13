import dayjs from "dayjs";

import * as messages from "./index.js";

describe("messages", () => {
  test("isProcessable", () => {
    vi.setSystemTime(new Date(2025, 0, 1, 1, 0)); // 2025-01-01 01:00
    expect(messages.isProcessable(dayjs("2025-01-01 00:00"))).toBeFalsy();
    expect(messages.isProcessable(dayjs("2025-01-01 01:00"))).toBeFalsy();
    expect(messages.isProcessable(dayjs("2025-01-01 02:00"))).toBeTruthy();
    vi.useRealTimers();
  });
});
