// 週の数え方（js/streak.js）のテスト：週のはじまり・記録した週の連続。node --test test/
import test from "node:test";
import assert from "node:assert";
import { startOfWeek, weekStreak, parseDateKey } from "../js/streak.js";

const day = (key) => parseDateKey(key);
const MON = 1;
const SUN = 0;

test("週のはじまり：月曜はじまりと日曜はじまり", () => {
  // 2026-10-25 は日曜
  assert.deepStrictEqual(startOfWeek(day("2026-10-25"), MON), day("2026-10-19"));
  assert.deepStrictEqual(startOfWeek(day("2026-10-25"), SUN), day("2026-10-25"));
  assert.deepStrictEqual(startOfWeek(day("2026-10-26"), MON), day("2026-10-26"));
  assert.deepStrictEqual(startOfWeek(day("2026-10-26"), SUN), day("2026-10-25"));
});

test("週をまたいで続けて記録すると、週の数だけ連続（1週に何回でも1つ）", () => {
  const today = day("2026-10-29"); // 木曜
  const keys = ["2026-10-27", "2026-10-28", "2026-10-21", "2026-10-13"];
  assert.deepStrictEqual(weekStreak(keys, MON, today), { current: 3, best: 3, thisWeek: true });
});

test("今週まだのときは、先週までの連続を「つづいている」として出す", () => {
  const today = day("2026-10-29");
  const keys = ["2026-10-21", "2026-10-14", "2026-10-07"];
  assert.deepStrictEqual(weekStreak(keys, MON, today), { current: 3, best: 3, thisWeek: false });
});

test("先週も今週もないと、いまの連続は 0（最長は残る）", () => {
  const today = day("2026-10-29");
  const keys = ["2026-10-14", "2026-10-07", "2026-09-30"];
  assert.deepStrictEqual(weekStreak(keys, MON, today), { current: 0, best: 3, thisWeek: false });
});

test("週のはじまりが月曜と日曜で、同じ記録でも連続がちがう", () => {
  // 日曜（10/25）と次の月曜（10/26）。月曜はじまりでは別の週、日曜はじまりでは同じ週
  const today = day("2026-10-27");
  const keys = ["2026-10-25", "2026-10-26"];
  assert.deepStrictEqual(weekStreak(keys, MON, today), { current: 2, best: 2, thisWeek: true });
  assert.deepStrictEqual(weekStreak(keys, SUN, today), { current: 1, best: 1, thisWeek: true });
});

test("年をまたいでも続く", () => {
  const today = day("2026-01-07"); // 水曜
  const keys = ["2026-01-05", "2025-12-31", "2025-12-23", "2025-12-16"];
  assert.deepStrictEqual(weekStreak(keys, MON, today), { current: 4, best: 4, thisWeek: true });
  assert.deepStrictEqual(weekStreak(keys, SUN, today), { current: 4, best: 4, thisWeek: true });
});

test("途中で空いた週があれば、最長は長いほう", () => {
  const today = day("2026-10-29");
  const keys = ["2026-10-28", "2026-10-21", "2026-10-07", "2026-09-30", "2026-09-23"];
  assert.deepStrictEqual(weekStreak(keys, MON, today), { current: 2, best: 3, thisWeek: true });
});

test("記録がない・形のちがう日・未来の日は数えない", () => {
  const today = day("2026-10-29");
  assert.deepStrictEqual(weekStreak([], MON, today), { current: 0, best: 0, thisWeek: false });
  assert.deepStrictEqual(weekStreak(["x", null, "2026-13-40", "2026-11-20"], MON, today), { current: 0, best: 0, thisWeek: false });
  assert.equal(parseDateKey("2026-02-30"), null);
});
