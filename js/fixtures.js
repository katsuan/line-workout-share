// 見本のデータ（「サンプルを入れる」と、ランキングのモック）
import {
  generateId,
  getTodayLocalDate
} from "./page.js?v=202610250234";

export function buildSampleWorkout(options) {
  const timestamp = new Date().toISOString();
  return {
    workoutId: generateId("workout"),
    date: getTodayLocalDate(),
    title: "上半身ワークアウト",
    user: options.user,
    groupKey: options.groupKey,
    exercises: [
      {
        exerciseId: generateId("exercise"),
        catalogId: "bench-press",
        primaryMuscle: "胸",
        name: "ベンチプレス",
        memo: "最後のセットはしっかり止めて挙上。",
        sets: [
          { setId: generateId("set"), weight: 60, reps: 8 },
          { setId: generateId("set"), weight: 65, reps: 6 },
          { setId: generateId("set"), weight: 67.5, reps: 5 }
        ]
      },
      {
        exerciseId: generateId("exercise"),
        catalogId: "lat-pulldown",
        primaryMuscle: "背中",
        name: "ラットプルダウン",
        memo: "肩をすくめずに広背筋に乗せる。",
        sets: [
          { setId: generateId("set"), weight: 45, reps: 12 },
          { setId: generateId("set"), weight: 50, reps: 10 }
        ]
      }
    ],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function mockRanking() {
  return {
    week: {
      estimated1rm: [
        { name: "Katsu", value: 122.5, label: "Bench Press" },
        { name: "Mika", value: 118.0, label: "Squat" },
        { name: "Ren", value: 110.5, label: "Deadlift" }
      ],
      totalVolume: [
        { name: "Mika", value: 16420, label: "12 workouts" },
        { name: "Katsu", value: 14980, label: "10 workouts" },
        { name: "Ren", value: 13120, label: "9 workouts" }
      ]
    },
    month: {
      estimated1rm: [
        { name: "Mika", value: 130.0, label: "Squat" },
        { name: "Katsu", value: 125.5, label: "Bench Press" },
        { name: "Ren", value: 119.0, label: "Deadlift" }
      ],
      totalVolume: [
        { name: "Mika", value: 58240, label: "38 workouts" },
        { name: "Ren", value: 56320, label: "35 workouts" },
        { name: "Katsu", value: 54110, label: "34 workouts" }
      ]
    }
  };
}
