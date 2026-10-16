// 推定1RM・ボリュームを計算できるセット（重さも回数も 1 以上）
export function isValidSetInput(weight, reps) {
  return weight !== null && reps !== null && weight > 0 && reps > 0;
}

// 記録として残すセット（重さ・回数が両方入っていればよい。0kg は自重、0回は挑戦の記録）
export function isRecordedSetInput(weight, reps) {
  return weight !== null && reps !== null && weight >= 0 && reps >= 0;
}

export function toNullableNumber(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

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

export function roundNumber(value, digits) {
  const precision = Math.pow(10, digits || 0);
  return Math.round(Number(value || 0) * precision) / precision;
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

export function truncateText(text, maxLength) {
  const normalized = String(text || "");
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return normalized.slice(0, maxLength - 1) + "…";
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(String(value));
  }
  return String(value).replace(/["\\]/g, "\\$&");
}

export function formatFlexWeight(weight) {
  if (weight === null || weight === undefined || weight === "" || Number(weight) === 0) {
    return "自重";
  }
  return Number(weight).toFixed(1) + " kg";
}

// 文字列（日本語を含む JSON など）を URL に入れられる形にする（UTF-8 → base64url）
export function encodeBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach(function (b) {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeBase64Url(text) {
  const b64 = String(text || "").replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64 + "===".slice((b64.length + 3) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, function (c) {
    return c.charCodeAt(0);
  }));
}
