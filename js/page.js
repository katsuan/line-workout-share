// キロっく：ページ全体で使う小さな道具（季節の絵文字・ID・今日の日付・中身の写し）

// 推定1RM・ボリュームを計算できるセット（重さも回数も 1 以上）
// 季節の絵文字（Q キットの season.js。tool-share.js があとから読む）を、うれしい瞬間の短い文にときどき足す。
// なくても・止まっても、文はそのまま
export function seasonal(text) {
  try {
    return window.QSeason ? window.QSeason.decorate(text) : text;
  } catch (error) {
    return text;
  }
}

export function generateId(prefix) {
  return prefix + "-" + Math.random().toString(36).slice(2, 10);
}

export function getTodayLocalDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
}

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}
