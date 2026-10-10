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
  previewOpen: "liff-workout-preview-open"
};

export const MAX_HISTORY_ITEMS = 10;
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

export const EXERCISE_CATALOG = [
  { id: "bench-press", name: "ベンチプレス", muscle: "胸" },
  { id: "incline-dumbbell-press", name: "インクラインダンベルプレス", muscle: "胸" },
  { id: "machine-chest-press", name: "チェストプレス", muscle: "胸" },
  { id: "pec-deck", name: "ペックデック", muscle: "胸" },
  { id: "lat-pulldown", name: "ラットプルダウン", muscle: "背中" },
  { id: "seated-row", name: "シーテッドロー", muscle: "背中" },
  { id: "one-hand-row", name: "ワンハンドロー", muscle: "背中" },
  { id: "pull-up", name: "チンニング", muscle: "背中" },
  { id: "barbell-squat", name: "バーベルスクワット", muscle: "脚" },
  { id: "leg-press", name: "レッグプレス", muscle: "脚" },
  { id: "romanian-deadlift", name: "ルーマニアンデッドリフト", muscle: "脚" },
  { id: "leg-extension", name: "レッグエクステンション", muscle: "脚" },
  { id: "shoulder-press", name: "ショルダープレス", muscle: "肩" },
  { id: "side-raise", name: "サイドレイズ", muscle: "肩" },
  { id: "rear-delt-fly", name: "リアデルトフライ", muscle: "肩" },
  { id: "upright-row", name: "アップライトロー", muscle: "肩" },
  { id: "barbell-curl", name: "バーベルカール", muscle: "腕" },
  { id: "dumbbell-curl", name: "ダンベルカール", muscle: "腕" },
  { id: "triceps-pushdown", name: "トライセプスプレスダウン", muscle: "腕" },
  { id: "skull-crusher", name: "スカルクラッシャー", muscle: "腕" },
  { id: "ab-wheel", name: "アブローラー", muscle: "体幹" },
  { id: "cable-crunch", name: "ケーブルクランチ", muscle: "体幹" },
  { id: "plank", name: "プランク", muscle: "体幹" },
  { id: "hanging-leg-raise", name: "ハンギングレッグレイズ", muscle: "体幹" }
];

export const MUSCLE_FILTERS = ["all", "胸", "背中", "脚", "肩", "腕", "体幹", "その他"];
