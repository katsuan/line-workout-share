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
