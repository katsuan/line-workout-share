export function isValidSetInput(weight, reps) {
  return weight !== null && reps !== null && weight > 0 && reps > 0;
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
  if (weight === null || weight === undefined || weight === "") {
    return "Body Weight";
  }
  return Number(weight).toFixed(1) + " kg";
}
