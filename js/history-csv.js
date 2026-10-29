// 記録のダウンロード（CSV。Excel・Google スプレッドシートで開ける）の中身を作る。画面には触らない（テストで呼ぶ）。
// 中身：1行が1セット。重さ 0 は「自重」、回数 0 は「挑戦」と備考に入れる。メモは種目の1セット目の行だけ。
// 読むところ：app.js の downloadHistory（ファイルにする・共有メニュー・コピーは app.js）
import { resolveWorkoutTitle } from "./workout.js?v=202610291748";

// CSV の1つのます目の文字を返す（, " 改行があれば " でかこむ）
function cell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

// 記録の一覧を、日付の古い順に CSV の文字にして返す（行の区切りは \r\n。先頭の BOM は app.js が付ける）
export function buildHistoryCsv(workouts) {
  const rows = [["日付", "タイトル", "種目", "部位", "セット", "重さ(kg)", "回数", "推定RM(kg)", "備考", "メモ"]];
  workouts
    .slice()
    .sort(function (a, b) {
      return String(a.date || "").localeCompare(String(b.date || ""));
    })
    .forEach(function (workout) {
      const title = resolveWorkoutTitle(workout.title, workout.user);
      (workout.exercises || []).forEach(function (exercise) {
        (exercise.sets || []).forEach(function (set, index) {
          const note = Number(set.weight) === 0 ? "自重" : Number(set.reps) === 0 ? "挑戦" : "";
          rows.push([
            workout.date || "",
            title,
            exercise.name || "",
            exercise.primaryMuscle || "",
            index + 1,
            set.weight,
            set.reps,
            Number(set.estimated1rm) > 0 ? set.estimated1rm : "",
            note,
            index === 0 ? exercise.memo || "" : ""
          ]);
        });
      });
    });
  return rows
    .map(function (row) {
      return row.map(cell).join(",");
    })
    .join("\r\n");
}
