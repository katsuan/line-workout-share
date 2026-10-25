// 画面のことばのテスト（q-oqrn/docs/ux.md の G）。node --test test/
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// 送るのは「カードで送る」。ブラウザ版では送るボタンのかわりに「LINE 版で開く」が出るので、
// はじめての案内はボタンの名前でなく「下の帯から」と言う（どちらで開いても合うように）
test("はじめての案内は、ブラウザ版でも合う言い方", () => {
  const tip = read("index.html").match(/firstTip\("kiloq", (\[[^\]]*\])/)[1];
  assert.match(tip, /下の帯からカードで送れます/);
  assert.doesNotMatch(tip, /「カードで送る」/);
});

// 「共有」「入力フォーム」は古い言い方（送るは「カードで送る」）
test("履歴の空のとき・履歴から入れたときの知らせに、古い言い方を使わない", () => {
  const app = read("app.js");
  assert.match(app, /まだ履歴がありません。カードで送ると、ここに出ます/);
  assert.doesNotMatch(app, /共有後に|入力フォームへ/);
});
