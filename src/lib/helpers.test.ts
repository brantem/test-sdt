import * as helpers from "./helpers.js";

test("isValidTimezone", () => {
  expect(helpers.isValidTimezone("Asia/Jakarta")).toBeTruthy();
  expect(helpers.isValidTimezone("a/b")).toBeFalsy();
});
