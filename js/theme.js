import { DEFAULT_THEME, FLEX_THEME, STORAGE_KEYS } from "./constants.js?v=202610211352";

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

export function saveThemePreference(theme) {
  localStorage.setItem(STORAGE_KEYS.theme, JSON.stringify(theme));
}

export function applyTheme(baseColor) {
  const normalizedColor = normalizeHexColor(baseColor) || DEFAULT_THEME.baseColor;
  const root = document.documentElement;
  const theme = buildThemePalette(normalizedColor);
  root.style.setProperty("--primary", theme.primary);
  root.style.setProperty("--primary-dark", theme.primaryDark);
  root.style.setProperty("--primary-soft", theme.primarySoft);
  root.style.setProperty("--primary-tint", theme.primaryTint);
  root.style.setProperty("--primary-line", theme.primaryLine);
  root.style.setProperty("--primary-outline", theme.primaryOutline);
  root.style.setProperty("--primary-surface", theme.primarySurface);
  root.style.setProperty("--primary-surface-strong", theme.primarySurfaceStrong);
  root.style.setProperty("--primary-fade", theme.primaryFade);
  root.style.setProperty("--bg-accent", theme.bgAccent);
}

export function buildThemePalette(baseColor) {
  return {
    primary: baseColor,
    primaryDark: adjustColorLightness(baseColor, -0.24),
    primarySoft: mixColors(baseColor, "#FFFFFF", 0.76),
    primaryTint: mixColors(baseColor, "#FFF8F1", 0.9),
    primaryLine: mixColors(baseColor, "#BFC8BF", 0.52),
    primaryOutline: mixColors(baseColor, "#E6D6C8", 0.72),
    primarySurface: mixColors(baseColor, "#FFF9F3", 0.92),
    primarySurfaceStrong: mixColors(baseColor, "#FCFEFC", 0.94),
    primaryFade: mixColors(baseColor, "#F7F0E8", 0.86),
    bgAccent: mixColors(baseColor, "#F4EBDD", 0.88)
  };
}

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
