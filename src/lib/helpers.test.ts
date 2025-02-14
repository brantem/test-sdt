import * as helpers from "./helpers.js";

describe("helpers", () => {
  test("isValidTimezone", () => {
    expect(helpers.isValidTimezone("Asia/Jakarta")).toBeTruthy();
    expect(helpers.isValidTimezone("a/b")).toBeFalsy();
  });

  describe("runConcurrently", () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];

    it("should not modify items", async () => {
      const onItem = () => Promise.resolve();
      await helpers.runConcurrently(items, 1, onItem, () => {});

      expect(items).not.toHaveLength(0);
    });

    it("should run without a problem", async () => {
      const successIds = new Set<number>();

      const onItem = async (item: (typeof items)[number]) => {
        switch (item.id) {
          case 1:
            return Promise.reject();
          case 2:
            throw new Error("error");
          default:
            return Promise.resolve(item.id);
        }
      };
      await helpers.runConcurrently(items, 1, onItem, (id) => successIds.add(id));

      expect(successIds.has(1)).toBe(false); // reject
      expect(successIds.has(2)).toBe(false); // throw
      expect(successIds.has(3)).toBe(true); // success
    });

    it("should respect concurrency limit", async () => {
      let active = 0;
      let maxActive = 0;

      const onItem = async (item: (typeof items)[0]) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await helpers.sleep(10);
        active--;
        return item.id;
      };
      await helpers.runConcurrently(items, 2, onItem, () => {});

      expect(maxActive).toBe(2);
    });
  });
});
