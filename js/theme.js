// キロっく：表示設定の色。選んだ色から画面の色（Q キットの --ls-accent・キロっくの --kq-*）と、送るカードの色を作り、端末に覚える。
// app.js から読む（import）
import {
  DEFAULT_THEME,
  FLEX_THEME,
  STORAGE_KEYS
} from "./settings.js?v=202610291748";

// 端末に覚えた表示設定（色）を読んで返す（なければ初めの色）
export function loadThemePreference() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.theme);
    if (!raw) {
      return Object.assign({}, DEFAULT_THEME);
    }
    const parsed = JSON.parse(raw);
    const baseColor = normalizeHexColor(parsed && parsed.baseColor);
    return {
      baseColor: baseColor || DEFAULT_THEME.baseColor
    };
  } catch (error) {
    console.warn("Failed to load theme preference:", error);
    return Object.assign({}, DEFAULT_THEME);
  }
}

// 表示設定（色）を端末に覚える
export function saveThemePreference(theme) {
  localStorage.setItem(STORAGE_KEYS.theme, JSON.stringify(theme));
}

// 選んだ色を、Q キットの色（--ls-accent など。チップ・ボタン・タブ）と、キロっくにしかない部品の色（--kq-*）に入れる。
// 初期色のときの値は css/base.css の :root にも書いてある（開いた瞬間から色が付くように）
export function applyTheme(baseColor) {
  const normalizedColor = normalizeHexColor(baseColor) || DEFAULT_THEME.baseColor;
  const style = document.documentElement.style;
  const palette = buildThemePalette(normalizedColor);
  Object.keys(palette).forEach(function (name) {
    style.setProperty(name, palette[name]);
  });
}

// 選んだ色から、Q キットの色（--ls-accent など）とキロっくの色（--kq-*）を作って返す
function buildThemePalette(baseColor) {
  return {
    "--ls-accent": baseColor,
    "--ls-accent-strong": adjustColorLightness(baseColor, -0.12),
    "--ls-accent-soft": mixColors(baseColor, "#FFFFFF", 0.76),
    "--ls-accent-ink": adjustColorLightness(baseColor, -0.24),
    "--ls-tabs-bg": mixColors(baseColor, "#F7F0E8", 0.86),
    "--kq-tint": mixColors(baseColor, "#FFF8F1", 0.9),
    "--kq-outline": mixColors(baseColor, "#E6D6C8", 0.72),
    "--kq-surface": mixColors(baseColor, "#FFF9F3", 0.92),
    "--kq-surface-strong": mixColors(baseColor, "#FCFEFC", 0.94),
    "--kq-bg-accent": mixColors(baseColor, "#F4EBDD", 0.88)
  };
}

// 選んだ色から、送るカードの色（見出しの帯・ふち・字）を作って返す
export function getFlexTheme(baseColor) {
  return {
    header: baseColor,
    footer: baseColor,
    border: adjustColorLightness(baseColor, 0.08),
    accent: FLEX_THEME.accent,
    accentSoft: mixColors(baseColor, "#FFFFFF", 0.76),
    textMuted: mixColors(baseColor, "#43362E", 0.42)
  };
}

// 色の文字を #rrggbb にそろえて返す（#abc も）。色でなければ ""
export function normalizeHexColor(value) {
  const source = String(value || "").trim();
  if (!source) {
    return "";
  }
  const hex = source.startsWith("#") ? source : "#" + source;
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return hex.toUpperCase();
  }
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    return (
      "#" +
      hex
        .slice(1)
        .split("")
        .map(function (char) {
          return char + char;
        })
        .join("")
    ).toUpperCase();
  }
  return "";
}

// #rrggbb を { r, g, b } にして返す。色でなければ null
function hexToRgb(hex) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) {
    return null;
  }
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16)
  };
}

// { r, g, b } を #rrggbb にして返す
function rgbToHex(rgb) {
  return (
    "#" +
    [rgb.r, rgb.g, rgb.b]
      .map(function (value) {
        const clamped = Math.max(0, Math.min(255, Math.round(value)));
        return clamped.toString(16).padStart(2, "0");
      })
      .join("")
  ).toUpperCase();
}

// 2つの色を amount（0〜1）の割合でまぜた色を返す
function mixColors(colorA, colorB, amount) {
  const rgbA = hexToRgb(colorA);
  const rgbB = hexToRgb(colorB);
  if (!rgbA || !rgbB) {
    return normalizeHexColor(colorA) || DEFAULT_THEME.baseColor;
  }
  const ratio = Math.max(0, Math.min(1, Number(amount)));
  return rgbToHex({
    r: rgbA.r + (rgbB.r - rgbA.r) * ratio,
    g: rgbA.g + (rgbB.g - rgbA.g) * ratio,
    b: rgbA.b + (rgbB.b - rgbA.b) * ratio
  });
}

// 色を明るく（delta が正）・暗く（負）した色を返す
function adjustColorLightness(color, delta) {
  const rgb = hexToRgb(color);
  if (!rgb) {
    return DEFAULT_THEME.baseColor;
  }
  return rgbToHex({
    r: rgb.r + 255 * delta,
    g: rgb.g + 255 * delta,
    b: rgb.b + 255 * delta
  });
}
