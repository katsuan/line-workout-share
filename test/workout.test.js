// 作りかけ（?draft=）の読み込みと、送るカードの組み立てのテスト。node --test test/
import test from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { checkMessages } = require(path.join(os.homedir(), "GitHub/q-oqrn/tools/qtest/fake-gas.js"));
const XSS = "<img src=x onerror=alert(1)>"; // qcheck-ok: W8 テストの見本の文字（画面では動かさない）

globalThis.window = { APP_CONFIG: { LIFF_ID: "2009927582-2isjfmkk", APP_NAME: "kiloQ" } };
const W = await import("../js/workout.js");
const U = await import("../js/utils.js");

const pack = (v) => U.encodeBase64Url(JSON.stringify(v));
// main.js と同じ読み方（base64url → JSON → unpack）
const readDraft = (raw) => {
  try {
    return W.unpackWorkoutDraft(JSON.parse(U.decodeBase64Url(raw)));
  } catch {
    return null;
  }
};
const errorsOf = (message) => checkMessages([message]).filter((p) => p.level === "error");

test("自分で作った draft を読み戻せる", () => {
  const w = W.createWorkoutFromMenu({ name: "背中の日", exercises: [{ name: "デッドリフト", sets: [{ weight: 100, reps: 5 }, { weight: 0, reps: 10 }] }] });
  const back = readDraft(U.encodeBase64Url(JSON.stringify(W.packWorkoutDraft(w))));
  assert.equal(back.title, "背中の日");
  assert.equal(back.exercises[0].name, "デッドリフト");
  assert.deepEqual(back.exercises[0].sets.map((s) => [s.weight, s.reps]), [[100, 5], [0, 10]]);
});

test("壊れた base64・JSON でない・形のちがう draft は null（落ちない）", () => {
  for (const raw of ["%%%", "!!", "e30", pack([1]), pack("x"), pack({ e: [] }), pack({ e: [null, 5, "a"] }), pack({ e: "x" })]) {
    assert.equal(readDraft(raw), null, raw);
  }
});

test("文字は文字のまま、長さに上限", () => {
  const w = readDraft(pack({ t: XSS + "あ".repeat(500), e: [[XSS.repeat(10), { a: 1 }, ["胸"], "m".repeat(5000), [[1, 1]]], [{ a: 1 }, "", "", "", []]] }));
  assert.equal(w.title.length, W.TEXT_LIMITS.title);
  assert.ok(w.title.startsWith(XSS));
  assert.equal(w.exercises[0].name.length, W.TEXT_LIMITS.name);
  assert.equal(w.exercises[0].catalogId, "");
  assert.equal(w.exercises[0].primaryMuscle, "");
  assert.equal(w.exercises[0].memo.length, W.TEXT_LIMITS.memo);
  assert.equal(w.exercises[1].name, "");
});

test("種目・セットの数と、重さ・回数の範囲", () => {
  const rows = Array.from({ length: 50 }, (_, i) => ["種目" + i, "", "", "", Array.from({ length: 100 }, () => [-5, 1e9])]);
  rows[0][4] = [["60", "8"], [true, null], ["abc", ""], null, [0, 0]];
  const w = readDraft(pack({ e: rows }));
  assert.equal(w.exercises.length, 20);
  assert.deepEqual(w.exercises[0].sets.map((s) => [s.weight, s.reps]), [[60, 8], ["", ""], ["", ""], [0, 0]]);
  assert.equal(w.exercises[1].sets.length, 30);
  assert.equal(w.exercises[1].sets[0].weight, "");
  assert.equal(w.exercises[1].sets[0].reps, "");
});

test("送るカード：ふつうの記録は LINE が受けつける形", () => {
  const w = W.createWorkoutFromMenu({ name: "胸の日", exercises: [{ name: "ベンチプレス", memo: "調子よし", sets: [{ weight: 60, reps: 8 }, { weight: 70, reps: 5 }] }] });
  const message = W.buildWorkoutFlexMessage(w);
  assert.deepEqual(errorsOf(message), []);
  assert.equal(message.type, "flex");
});

test("送るカード：長い文字・変な文字・たくさんの種目でも受けつける形で、文字のまま", () => {
  const exercises = Array.from({ length: 20 }, (_, i) => ({ name: XSS + "x".repeat(500) + i, memo: XSS.repeat(50), sets: Array.from({ length: 30 }, () => ({ weight: 9999, reps: 9999 })) }));
  const w = W.createWorkoutFromMenu({ name: XSS + "あ".repeat(2000), exercises });
  w.user = { displayName: "な".repeat(300), userId: null, pictureUrl: null };
  w.date = "d".repeat(500);
  const message = W.buildWorkoutFlexMessage(w);
  assert.deepEqual(errorsOf(message), []);
  assert.ok(message.altText.length <= 400);
  const json = JSON.stringify(message);
  assert.ok(json.includes(XSS));
  const texts = [];
  (function walk(n) {
    if (!n || typeof n !== "object") return;
    if (n.type === "text") texts.push(n.text);
    Object.values(n).forEach(walk);
  })(message.contents);
  assert.ok(texts.every((t) => typeof t === "string" && t.length <= 60), "カードの文字は 60 字まで");
});

test("送るカード：draft から読んだ記録も受けつける形", () => {
  const w = readDraft(pack({ t: XSS, e: [[XSS, "", "", XSS, [[60, 8], [-1, 5]]]] }));
  assert.deepEqual(errorsOf(W.buildWorkoutFlexMessage(w)), []);
});

test("escapeHtml は < > \" ' & を文字にする", () => {
  assert.equal(U.escapeHtml(XSS + "\"'&"), "&lt;" + XSS.slice(1, -1) + "&gt;&quot;&#39;&amp;");
});
