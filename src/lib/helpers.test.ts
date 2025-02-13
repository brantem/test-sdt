import * as helpers from "./helpers.js";

describe("helpers", () => {
  test("isValidTimezone", () => {
    expect(helpers.isValidTimezone("Asia/Jakarta")).toBeTruthy();
    expect(helpers.isValidTimezone("a/b")).toBeFalsy();
  });

  describe("processInBatches", () => {
    it("should process correctly", async () => {
      const cb = vi.fn();
      await helpers.processInBatches([1, 2, 3], 2, cb);
      expect(cb).toHaveBeenCalledTimes(2);
      expect(cb).toHaveBeenCalledWith([1, 2]);
      expect(cb).toHaveBeenCalledWith([3]);
    });

    it("should stop if it receives an empty array", () => {
      const cb = vi.fn();
      helpers.processInBatches([], 1, cb);
      expect(cb).not.toHaveBeenCalled();
    });

    it("should stop if it receives an empty size", () => {
      const cb = vi.fn();
      helpers.processInBatches([1], 0, cb);
      expect(cb).not.toHaveBeenCalled();
    });
  });
});
