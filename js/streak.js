// 週の数え方（草グラフの週の区切りと「◯週 連続」）。筋トレは毎日しないので、連続は日ではなく週で数える。
// 中身：週のはじまりの日を返す・記録した週の連続（いま・最長）を数える。画面には触らない。
// 読むところ：app.js の草グラフ（renderGrass）。週のはじまり（月曜＝1・日曜＝0）は Q 共通の設定（q-oqrn の shared/week-start.js）を app.js が渡す。

const DAY = 24 * 60 * 60 * 1000;

// "2026-10-25" の形の日付を、その日の 0 時（この端末の時間）の Date にして返す。形がちがえば null
export function parseDateKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // 「2026-13-40」のように、ない日は null（Date は次の月へ回してしまうので、もどして確かめる）
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? d : null;
}

// date をふくむ週のはじまりの日（0 時）を返す。weekStart は 1＝月曜（既定）、0＝日曜
export function startOfWeek(date, weekStart) {
  const first = weekStart === 0 ? 0 : 1;
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() - first + 7) % 7));
  return d;
}

// 2つの週のはじまりの日のあいだが何週か（夏時間などで 1 時間ずれても丸める）
function weeksBetween(a, b) {
  return Math.round((b - a) / (7 * DAY));
}

// 記録した日（"2026-10-25" の並び）から、記録した週の連続を数えて返す。1週に1回でも記録があればその週は○。
//   current  … いまの連続（今週に記録がなければ、先週までの連続。先週もなければ 0）
//   best     … いちばん長かった連続
//   thisWeek … 今週に記録があるか（false なら「今週やれば伸びる」）
// today はテスト用（ふだんは今日）
export function weekStreak(dateKeys, weekStart, today = new Date()) {
  const thisStart = startOfWeek(today, weekStart);
  // 記録した週を「今週から何週前か」の数にする（未来の日は数えない）
  const ago = new Set();
  (dateKeys || []).forEach((key) => {
    const d = parseDateKey(key);
    if (!d) return;
    const n = weeksBetween(startOfWeek(d, weekStart), thisStart);
    if (n >= 0) ago.add(n);
  });
  const thisWeek = ago.has(0);
  let current = 0;
  for (let n = thisWeek ? 0 : 1; ago.has(n); n += 1) current += 1;
  // 最長：古い週から順に見て、となりあう週が続くあいだ数える
  let best = 0;
  let run = 0;
  let prev = null;
  [...ago].sort((a, b) => b - a).forEach((n) => {
    run = prev !== null && prev - n === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = n;
  });
  return { current, best, thisWeek };
}
