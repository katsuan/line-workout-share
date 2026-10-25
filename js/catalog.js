// キロっく：種目の一覧・部位の絞りこみ・おすすめメニュー
// app.js・workout.js から読む（import）

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

// おすすめのトレーニングメニュー（はじめから入っているテンプレート）。
// 種目は EXERCISE_CATALOG の id、セットは「回数 × セット数」。重さは人によるので空のまま入れる
export const MENU_PRESETS = [
  {
    menuId: "preset-chest",
    name: "胸の日",
    exercises: [
      { catalogId: "bench-press", sets: 3, reps: 10 },
      { catalogId: "incline-dumbbell-press", sets: 3, reps: 10 },
      { catalogId: "pec-deck", sets: 3, reps: 12 },
      { catalogId: "triceps-pushdown", sets: 3, reps: 12 }
    ]
  },
  {
    menuId: "preset-back",
    name: "背中の日",
    exercises: [
      { catalogId: "lat-pulldown", sets: 3, reps: 10 },
      { catalogId: "seated-row", sets: 3, reps: 10 },
      { catalogId: "one-hand-row", sets: 3, reps: 10 },
      { catalogId: "barbell-curl", sets: 3, reps: 10 }
    ]
  },
  {
    menuId: "preset-legs",
    name: "脚の日",
    exercises: [
      { catalogId: "barbell-squat", sets: 3, reps: 10 },
      { catalogId: "leg-press", sets: 3, reps: 12 },
      { catalogId: "romanian-deadlift", sets: 3, reps: 10 },
      { catalogId: "leg-extension", sets: 3, reps: 12 }
    ]
  },
  {
    menuId: "preset-shoulders-arms",
    name: "肩・腕の日",
    exercises: [
      { catalogId: "shoulder-press", sets: 3, reps: 10 },
      { catalogId: "side-raise", sets: 3, reps: 15 },
      { catalogId: "dumbbell-curl", sets: 3, reps: 12 },
      { catalogId: "skull-crusher", sets: 3, reps: 12 }
    ]
  },
  {
    menuId: "preset-full-body",
    name: "全身（はじめての人に）",
    exercises: [
      { catalogId: "bench-press", sets: 3, reps: 10 },
      { catalogId: "lat-pulldown", sets: 3, reps: 10 },
      { catalogId: "leg-press", sets: 3, reps: 10 },
      { catalogId: "ab-wheel", sets: 2, reps: 10 }
    ]
  }
];
