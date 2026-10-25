// キロっく：数と文字の形（重さ・回数の表し方・長さの上限・HTML に入れるときの書きかえ）
// app.js・card.js・components.js・workout.js から読む（import）

// 入力の値を数にして返す（空・数でないときは null）
export function toNullableNumber(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

// 数に単位をつけた文字（「60.5kg」）を返す。空なら「-」
export function formatMetric(value, unit, digits) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  const precision = typeof digits === "number" ? digits : 0;
  return Number(value).toFixed(precision) + (unit ? " " + unit : "");
}

// 画面表示用：3桁区切りで、空の値も 0 として表示する（Flex 用は formatMetric）
export function formatLocaleMetric(value, unit, digits) {
  const fractionDigits = typeof digits === "number" ? digits : 0;
  return (
    Number(value || 0).toLocaleString("ja-JP", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits
    }) + (unit ? " " + unit : "")
  );
}

// 数を小数 digits けたに丸めて返す
export function roundNumber(value, digits) {
  const precision = Math.pow(10, digits || 0);
  return Math.round(Number(value || 0) * precision) / precision;
}

// 文字を maxLength 字までにして返す（こえたら最後を「…」）
export function truncateText(text, maxLength) {
  const normalized = String(text || "");
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return normalized.slice(0, maxLength - 1) + "…";
}

// HTML に入れても動かないよう、< > & " ' を書きかえて返す
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// CSS のセレクタに入れられるよう書きかえて返す
export function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(String(value));
  }
  return String(value).replace(/["\\]/g, "\\$&");
}

// カードに出す重さの文字（0・空は「自重」）を返す
export function formatFlexWeight(weight) {
  if (weight === null || weight === undefined || weight === "" || Number(weight) === 0) {
    return "自重";
  }
  return Number(weight).toFixed(1) + " kg";
}
