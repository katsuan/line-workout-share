// 記録のダウンロード（CSV）の中身（js/history-csv.js）のテスト。node --test test/
import test from "node:test";
import assert from "node:assert";

globalThis.window = { APP_CONFIG: { LIFF_ID: "2009927582-2isjfmkk", APP_NAME: "kiloQ" } };
const { buildHistoryCsv } = await import("../js/history-csv.js");

const workout = (date, title, exercises) => ({ date, title, user: { displayName: "" }, exercises });

test("1行が1セット。日付の古い順・自重と挑戦は備考・メモは1セット目だけ", () => {
  const csv = buildHistoryCsv([
    workout("2026-10-20", "脚の日", [{ name: "スクワット", primaryMuscle: "脚", memo: "深く", sets: [{ weight: 60, reps: 10, estimated1rm: 80 }, { weight: 0, reps: 12 }] }]),
    workout("2026-10-01", "胸", [{ name: "ベンチプレス", primaryMuscle: "胸", sets: [{ weight: 100, reps: 0 }] }])
  ]);
  const rows = csv.split("\r\n");
  assert.equal(rows[0], "日付,タイトル,種目,部位,セット,重さ(kg),回数,推定RM(kg),備考,メモ");
  assert.equal(rows[1], "2026-10-01,胸,ベンチプレス,胸,1,100,0,,挑戦,");
  assert.equal(rows[2], "2026-10-20,脚の日,スクワット,脚,1,60,10,80,,深く");
  assert.equal(rows[3], "2026-10-20,脚の日,スクワット,脚,2,0,12,,自重,");
  assert.equal(rows.length, 4);
});

test("カンマ・ダブルクォート・改行のあるメモは \" でかこむ", () => {
  const csv = buildHistoryCsv([workout("2026-10-02", "a", [{ name: "x", memo: 'ゆっくり, "止める"\r\n次は重く', sets: [{ weight: 10, reps: 5 }] }])]);
  assert.ok(csv.endsWith(',"ゆっくり, ""止める""\r\n次は重く"'));
});
