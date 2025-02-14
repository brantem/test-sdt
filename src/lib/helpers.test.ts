import * as helpers from "./helpers.js";

describe("helpers", () => {
  test("isValidTimezone", () => {
    expect(helpers.isValidTimezone("Asia/Jakarta")).toBeTruthy();
    expect(helpers.isValidTimezone("a/b")).toBeFalsy();
  });

  describe("runConcurrently", () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];

    it("should not modify items", async () => {
      await helpers.runConcurrently(items, 1, {
        onProcess() {
          return Promise.resolve();
        },
      });

      expect(items).not.toHaveLength(0);
    });

    it("should run without a problem", async () => {
      const failedIds: number[] = [];
      const successIds: number[] = [];

      await helpers.runConcurrently(items, 1, {
        async onProcess(item: (typeof items)[number]) {
          switch (item.id) {
            case 1:
              return Promise.reject();
            case 2:
              throw new Error("error");
            default:
              return Promise.resolve(item.id);
          }
        },
        onFail(item) {
          failedIds.push(item.id);
        },
        onSuccess(item) {
          successIds.push(item.id);
        },
      });

      expect(failedIds).toEqual([1 /* reject */, 2 /* throw */]);
      expect(successIds).toEqual([3]);
    });

    it("should respect concurrency limit", async () => {
      let active = 0;
      let maxActive = 0;

      await helpers.runConcurrently(items, 2, {
        async onProcess(item: (typeof items)[0]) {
          active++;
          maxActive = Math.max(maxActive, active);
          await helpers.sleep(10);
          active--;
          return item.id;
        },
      });

      expect(maxActive).toBe(2);
    });
  });
});
