// 端末に残したプロフィールを読むところのテスト
import test from "node:test";
import assert from "node:assert";
const XSS = "<img src=x onerror=alert(1)>"; // qcheck-ok: W8 テストの見本の文字（画面では動かさない）

const mem = {};
globalThis.window = { APP_CONFIG: {} };
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => (mem[k] = String(v)) };
const L = await import("../js/liff.js");

test("名前・写真（https）だけを読み、LINE のユーザー ID は読まない", () => {
  mem["liff-workout-profile"] = JSON.stringify({ userId: "U123", displayName: XSS, pictureUrl: "javascript:void(0)" });
  const p = L.loadCachedProfile();
  assert.equal(p.userId, null);
  assert.equal(p.displayName, XSS);
  assert.equal(p.pictureUrl, null);
});

test("壊れた中身・形のちがう中身でも落ちない", () => {
  for (const bad of ["{", "5", "null", JSON.stringify({ displayName: { a: 1 } })]) {
    mem["liff-workout-profile"] = bad;
    assert.equal(L.loadCachedProfile().displayName, "anonymous");
  }
});

test("残すときも、LINE のユーザー ID は残さない", () => {
  L.saveCachedProfile({ userId: "U123", displayName: "たろう", pictureUrl: "https://profile.line-scdn.net/x" });
  const saved = JSON.parse(mem["liff-workout-profile"]);
  assert.equal(saved.userId, null);
  assert.equal(saved.displayName, "たろう");
});
