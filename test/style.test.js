// 見た目（css/）のテスト。node --test test/
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const css = fs.readFileSync(new URL("../css/preview.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

// 送るカードの見本は、暗い表示でも白い地のまま（LINE のトークの見た目）。
// 字の色が暗い表示の色（明るい字）のままだと、白い地に白い字で種目名が読めない
test("見本のカードの中は、明るい表示の字の色にする", () => {
  const rule = css.match(/(?:^|\n)\.preview-bubble\s*\{([^}]*)\}/)[1];
  assert.match(rule, /--ls-text:\s*#1f1f1c/);
  assert.match(rule, /--ls-subtext:\s*#6b6a63/);
  assert.match(rule, /--kq-secondary:\s*#264653/); // RM・セットの行の色（暗い表示では水色になる）
  assert.match(rule, /(?:^|;)\s*color:\s*var\(--ls-text\)/);
});
