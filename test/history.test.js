// 履歴（liff-workout-history。つづくも読む）を読む・残すところのテスト。node --test test/
import test from "node:test";
import assert from "node:assert";

const mem = {};
let failWrites = false;
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => {
    if (failWrites) throw new Error("QuotaExceededError");
    mem[k] = String(v);
  },
  removeItem: (k) => delete mem[k]
};
globalThis.window = { APP_CONFIG: { LIFF_ID: "2009927582-2isjfmkk", APP_NAME: "kiloQ" } };
const W = { ...(await import("../js/workout.js")), ...(await import("../js/card.js")), ...(await import("../js/link.js")) };
const C = await import("../js/settings.js");
const R = await import("../js/store.js");
const repo = R.createLocalStorageWorkoutRepository(W.hydrateWorkout);
const KEY = C.STORAGE_KEYS.history;

const good = (id, name = "ベンチプレス") => ({ workoutId: id, title: "胸", date: "2026-10-22", exercises: [{ name, sets: [{ weight: 60, reps: 10 }] }] });

test("履歴のキーは liff-workout-history のまま（つづくも読む）", () => {
  assert.equal(KEY, "liff-workout-history");
});

test("壊れた記録がまざっていても、読める記録は消えない", () => {
  mem[KEY] = JSON.stringify([null, 5, "x", { exercises: "x" }, { exercises: [null, { name: "a", sets: "x" }] }, good("w1")]);
  const list = repo.loadAll();
  assert.ok(list.some((w) => w.workoutId === "w1"));
  assert.ok(list.every((w) => Array.isArray(w.exercises) && w.exercises.every((e) => Array.isArray(e.sets))));
});

test("hydrateWorkout は形のちがう中身でも止まらない", () => {
  for (const bad of [null, undefined, 5, "x", [], { exercises: "x" }, { exercises: [null, 3, { sets: "x" }, { sets: [null, 1] }] }]) {
    const w = W.hydrateWorkout(bad);
    assert.ok(Array.isArray(w.exercises) && w.exercises.length >= 1);
  }
});

test("端末に残せない（容量いっぱい・プライベート）ときも、送るのを止めない", async () => {
  mem[KEY] = JSON.stringify([good("w1")]);
  failWrites = true;
  try {
    await assert.doesNotReject(() => repo.save(good("w2")));
    assert.doesNotThrow(() => repo.deleteById("w1"));
    const menus = R.createLocalStorageMenuRepository();
    assert.doesNotThrow(() => menus.save({ menuId: "m1", name: "x", exercises: [] }));
  } finally {
    failWrites = false;
  }
});

test("残すのは新しいものから 10 件まで", async () => {
  mem[KEY] = "[]";
  for (let i = 0; i < 13; i++) await repo.save(good("w" + i));
  const list = repo.loadAll();
  assert.equal(C.MAX_HISTORY_ITEMS, 10);
  assert.equal(list.length, 10);
  assert.equal(list[0].workoutId, "w12");
});

test("送りなおしのカードに、自分の記録が「前回」として出ない（同じ記録は前回にしない）", () => {
  const w = Object.assign(W.createWorkoutFromMenu({ name: "胸", exercises: [{ name: "ベンチプレス", sets: [{ weight: 60, reps: 10 }] }] }), { workoutId: "same" });
  const text = (msg) => JSON.stringify(msg);
  assert.ok(!text(W.buildWorkoutFlexMessage(w, null, () => "", [W.hydrateWorkout(w)])).includes("前回"));
  const older = Object.assign(W.hydrateWorkout(w), { workoutId: "older", date: "2026-10-01" });
  assert.ok(text(W.buildWorkoutFlexMessage(w, null, () => "", [older])).includes("前回 10/1"));
});
