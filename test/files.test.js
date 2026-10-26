// ファイルの名前の決まり（q-oqrn/docs/structure.md）のテスト。node --test test/
// 入口は app.js、部品は js/ に役わりの名前。前の名前（config.js・js/main.js）は、前の HTML・app.js を覚えているブラウザのために、新しいファイルを読むだけ
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("index.html は js/line-config.js と app.js を読む", () => {
  const html = read("index.html");
  assert.match(html, /<script src="\.\/js\/line-config\.js\?v=\d+"><\/script>\s*<script type="module" src="\.\/app\.js\?v=\d+"><\/script>/);
});

test("前の名前のファイルは、新しいファイルを同じ版で読むだけ", () => {
  const version = read("index.html").match(/app\.js\?v=(\d+)/)[1];
  assert.match(read("config.js"), new RegExp(`src="\\./js/line-config\\.js\\?v=${version}"`));
  assert.match(read("js/main.js"), new RegExp(`^import "\\.\\./app\\.js\\?v=${version}";$`, "m"));
});

test("js/ の中の部品は、同じ版で読みあう（版がそろっている）", () => {
  const version = read("index.html").match(/app\.js\?v=(\d+)/)[1];
  const files = ["app.js", ...fs.readdirSync(new URL("../js/", import.meta.url)).map((f) => `js/${f}`)];
  for (const f of files) {
    for (const [, v] of read(f).matchAll(/from "[^"]+\?v=(\d+)"/g)) assert.equal(v, version, f);
  }
});

test("使わない名前（utils.js・constants.js・repositories.js・core.js）のファイルがない", () => {
  const names = fs.readdirSync(new URL("../js/", import.meta.url));
  for (const bad of ["utils.js", "constants.js", "repositories.js", "core.js", "common.js", "script.js"]) assert.ok(!names.includes(bad), bad);
});

test("LINE 版の部品は Q キット（shared/liff.js・line-me.js）。app.js より前に読み、LIFF の ID は LINE_SHARE_CONFIG にも入れる", () => {
  const html = read("index.html");
  const kit = html.indexOf("shared/liff.js?v=");
  const me = html.indexOf("shared/line-me.js?v=");
  const app = html.indexOf("./app.js?v=");
  assert.ok(kit > 0 && me > 0 && kit < app && me < app, "Q キットの部品は app.js より前");
  assert.match(read("js/line-config.js"), /window\.LINE_SHARE_CONFIG = Object\.assign\(\{\}, window\.LINE_SHARE_CONFIG, \{ liffId: "2009927582-2isjfmkk" \}\)/);
  assert.match(read("js/line-config.js"), /LIFF_ID: "2009927582-2isjfmkk"/, "2つの ID は同じ");
  // ブラウザ版の案内の中身は Q キットが入れる（キロっくだけの言葉を置かない）
  assert.match(html, /<div class="ls-outside" id="line-help" hidden><\/div>/);
});

test("設定はページの下の「⚙️ 設定」（id=settings）に1つ（Q のツールの決まり ux.md A7）", () => {
  const html = read("index.html");
  assert.match(html, /<details class="ls-fold settings-fold" id="settings">[\s\S]*?⚙️<\/span>設定[\s\S]*?id="settings-body"/);
  assert.ok(html.indexOf('id="settings"') < html.indexOf("data-tool-share"), "紹介の窓口より上");
  const app = read("app.js");
  assert.match(app, /"open-settings-fold": function/);
  assert.doesNotMatch(app.slice(app.indexOf("function renderSettingsSheet"), app.indexOf("function renderSettingsFold")), /renderWeekStartField|data-theme-field/, "シートには設定を置かない");
});
