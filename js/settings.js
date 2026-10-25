// キロっく：設定（LIFF の設定・機能の ON/OFF・端末に残すキー・数の上限・色）
// app.js・card.js・liff.js・link.js・store.js・theme.js・workout.js から読む（import）

export const APP_CONFIG = window.APP_CONFIG || {};

export const FEATURE_FLAGS = Object.assign(
  {
    enableDebugMode: false,
    enableLocalHistory: true,
    enableStatsMock: true,
    enableApiAdapter: false,
    enableRanking: false
  },
  APP_CONFIG.FEATURE_FLAGS || {}
);

export const STORAGE_KEYS = {
  history: "liff-workout-history",
  theme: "liff-workout-theme",
  profile: "liff-workout-profile",
  previewOpen: "liff-workout-preview-open",
  menus: "liff-workout-menus",
  // 作りかけの記録（送る前）。次に開いたら、その続きから
  draft: "kiloq:draft"
};

export const MAX_HISTORY_ITEMS = 10;

// 保存できるトレーニングメニュー（テンプレート）の数
export const MAX_MENUS = 20;

export const MAX_SETS_PER_FLEX_EXERCISE = 8;

export const MAX_EXERCISES_PER_BUBBLE = 4;

export const MAX_FLEX_UNITS_PER_BUBBLE = 16;

export const DEFAULT_THEME = {
  baseColor: "#C96A2D"
};

export const FLEX_THEME = {
  header: "#C96A2D",
  footer: "#C96A2D",
  border: "#D68452",
  accent: "#E92B2B",
  accentSoft: "#F7DFCF",
  textMuted: "#6F5A4A"
};

export const DEFAULT_USER = {
  userId: null,
  displayName: "anonymous",
  pictureUrl: null
};
