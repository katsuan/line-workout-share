// キロっく：記録の形（種目・セット・推定1RM・ボリューム）と、トレーニングメニュー
// app.js・card.js・link.js から読む（import）
import {
  EXERCISE_CATALOG
} from "./catalog.js?v=202610261900";
import {
  roundNumber,
  toNullableNumber
} from "./format.js?v=202610261900";
import {
  deepClone,
  generateId,
  getTodayLocalDate
} from "./page.js?v=202610261900";
import {
  APP_CONFIG,
  DEFAULT_USER
} from "./settings.js?v=202610261900";

// 文字の長さの上限（入力欄の maxlength・送るカード・リンクの draft で同じ）
export const TEXT_LIMITS = { title: 40, name: 60, memo: 200, catalogId: 40, muscle: 20, displayName: 20, altText: 400 };

// 重さ・回数の上限（リンクの draft から読むとき）
export const NUMBER_MAX = 9999;

// 空の記録（今日の日付・種目1つ）を作って返す
export function createEmptyWorkout() {
  const timestamp = new Date().toISOString();
  return calculateWorkout({
    workoutId: generateId("workout"),
    date: getTodayLocalDate(),
    title: "",
    user: Object.assign({}, DEFAULT_USER),
    groupKey: APP_CONFIG.DEFAULT_GROUP_KEY || null,
    exercises: [createEmptyExercise()],
    totalVolume: 0,
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

// 空の種目（セット1つ）を作って返す
export function createEmptyExercise() {
  return {
    exerciseId: generateId("exercise"),
    catalogId: "",
    isCustom: false,
    primaryMuscle: "",
    selectionMuscle: "",
    name: "",
    memo: "",
    sets: [createEmptySet()],
    totalVolume: 0,
    maxEstimated1rm: 0
  };
}

// 空のセットを作って返す
export function createEmptySet() {
  return {
    setId: generateId("set"),
    weight: "",
    reps: "",
    volume: 0,
    estimated1rm: 0
  };
}

// 記録の推定1RM・ボリューム・セットの数などを計算しなおした写しを返す
export function calculateWorkout(workout) {
  const clonedWorkout = deepClone(workout);
  let workoutVolume = 0;

  clonedWorkout.exercises = (clonedWorkout.exercises || []).map(function (exercise) {
    let exerciseVolume = 0;
    let exerciseMax1rm = 0;

    exercise.sets = (exercise.sets || []).map(function (set) {
      const weight = toNullableNumber(set.weight);
      const reps = toNullableNumber(set.reps);
      const isValid = isValidSetInput(weight, reps);
      const volume = isValid ? weight * reps : 0;
      const estimated1rm = isValid ? estimate1rm(weight, reps) : 0;

      if (isValid) {
        exerciseVolume += volume;
        exerciseMax1rm = Math.max(exerciseMax1rm, estimated1rm);
      }

      return Object.assign({}, set, {
        weight: weight === null ? "" : weight,
        reps: reps === null ? "" : reps,
        volume: roundNumber(volume, 1),
        estimated1rm: roundNumber(estimated1rm, 1)
      });
    });

    workoutVolume += exerciseVolume;

    return Object.assign({}, exercise, {
      totalVolume: roundNumber(exerciseVolume, 1),
      maxEstimated1rm: roundNumber(exerciseMax1rm, 1)
    });
  });

  clonedWorkout.totalVolume = roundNumber(workoutVolume, 1);
  return clonedWorkout;
}

// 重さと回数から推定1RM を返す（重さ×(1＋回数÷40)。O'Conner の式）
function estimate1rm(weight, reps) {
  return weight + (weight * reps) / 40;
}

// 端末に残った記録（前の版・壊れたものもある）から、入力の形を作る。形のちがうところは初めの値に
const isPlainObject = function (value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};

// 並びの中の、ふつうのオブジェクトだけを返す（並びでなければ []）
const objectsIn = function (value) {
  return Array.isArray(value) ? value.filter(isPlainObject) : [];
};

// 端末に残った記録（前の版・壊れたものもある）から、入力の形にした記録を返す
export function hydrateWorkout(workout) {
  const source = isPlainObject(workout) ? workout : {};
  const baseWorkout = calculateWorkout(
    Object.assign(createEmptyWorkout(), deepClone(source), {
      exercises: objectsIn(source.exercises).map(function (exercise) {
        return Object.assign(createEmptyExercise(), exercise, {
          sets: objectsIn(exercise.sets).map(function (set) {
            return Object.assign(createEmptySet(), set);
          })
        });
      })
    })
  );

  if (!baseWorkout.exercises.length) {
    baseWorkout.exercises = [createEmptyExercise()];
  }

  return baseWorkout;
}

// 送る記録にする：名前のない種目と、重さか回数のないセットを外して返す
export function sanitizeWorkout(workout, resolveGroupKey) {
  const calculatedWorkout = calculateWorkout(workout);
  const validExercises = calculatedWorkout.exercises
    .map(function (exercise) {
      const validSets = (exercise.sets || []).filter(isFilledSet);

      return Object.assign({}, exercise, {
        name: (exercise.name || "").trim(),
        memo: (exercise.memo || "").trim(),
        sets: validSets
      });
    })
    .filter(function (exercise) {
      return exercise.name && exercise.sets.length > 0;
    })
    .map(function (exercise) {
      const totalVolume = exercise.sets.reduce(function (sum, set) {
        return sum + Number(set.volume || 0);
      }, 0);
      const maxEstimated1rm = exercise.sets.reduce(function (max, set) {
        return Math.max(max, Number(set.estimated1rm || 0));
      }, 0);
      return Object.assign({}, exercise, {
        totalVolume: roundNumber(totalVolume, 1),
        maxEstimated1rm: roundNumber(maxEstimated1rm, 1)
      });
    });

  const totalVolume = validExercises.reduce(function (sum, exercise) {
    return sum + Number(exercise.totalVolume || 0);
  }, 0);

  return Object.assign({}, calculatedWorkout, {
    title: (calculatedWorkout.title || "").trim(),
    user: Object.assign({}, DEFAULT_USER, calculatedWorkout.user || {}),
    groupKey: calculatedWorkout.groupKey || (typeof resolveGroupKey === "function" ? resolveGroupKey() : null),
    exercises: validExercises,
    totalVolume: roundNumber(totalVolume, 1),
    updatedAt: new Date().toISOString()
  });
}

// タイトルが空のときのタイトル（「◯◯のキロっく」か「キロっく」）を返す
export function getDefaultWorkoutTitle(user) {
  const displayName = user ? String(user.displayName || "").trim() : "";
  if (displayName && displayName.toLowerCase() !== "anonymous") {
    return displayName + "のキロっく";
  }
  return "キロっく";
}

// タイトル（空なら初めのタイトル）を返す
export function resolveWorkoutTitle(title, user) {
  const normalizedTitle = String(title || "").trim();
  return normalizedTitle || getDefaultWorkoutTitle(user);
}

// 種目名が入っている種目だけ（選びかけ・空の種目は除く）
export function getNamedExercises(workout) {
  return ((workout && workout.exercises) || []).filter(function (exercise) {
    return Boolean(String(exercise.name || "").trim());
  });
}

// 名前の入った種目の数を返す
export function countNamedExercises(workout) {
  return getNamedExercises(workout).length;
}

// 重さと回数がどちらも入っているセットを、記録として数える（0kg＝自重、0回＝挑戦も残す。推定1RMは出さない）
export function isFilledSet(set) {
  return isRecordedSetInput(toNullableNumber(set.weight), toNullableNumber(set.reps));
}

// 推定1RMが出るセット（重さも回数も 1 以上）
export function hasEstimated1rm(set) {
  return Number((set && set.estimated1rm) || 0) > 0;
}

// 種目の、重さと回数の入ったセットの数を返す
export function countValidSets(exercise) {
  return (exercise.sets || []).filter(isFilledSet).length;
}

// その種目でいちばん推定1RMが高いセットか（入力欄の「MAX RM」の印）
export function isMaxRmSet(exercise, set) {
  const maxRm = roundNumber((exercise && exercise.maxEstimated1rm) || 0, 1);
  return Boolean(maxRm) && isFilledSet(set) && roundNumber(set.estimated1rm || 0, 1) === maxRm;
}

// 今の入力からメニューを作る。種目名のない種目は外し、重さ・回数は入っているものをそのまま残す（次に入れたときの目安）
export function buildMenuFromWorkout(workout, name, menuId) {
  const exercises = (workout.exercises || [])
    .filter(function (exercise) {
      return String(exercise.name || "").trim();
    })
    .map(function (exercise) {
      const sets = (exercise.sets || []).map(function (set) {
        return { weight: set.weight === "" ? "" : set.weight, reps: set.reps === "" ? "" : set.reps };
      });
      return {
        catalogId: exercise.catalogId || "",
        isCustom: Boolean(exercise.isCustom),
        primaryMuscle: exercise.primaryMuscle || "",
        name: String(exercise.name).trim(),
        memo: String(exercise.memo || "").trim(),
        sets: sets.length ? sets : [{ weight: "", reps: "" }]
      };
    });
  return {
    menuId: menuId || generateId("menu"),
    name: name,
    exercises: exercises,
    updatedAt: new Date().toISOString()
  };
}

// おすすめのメニュー（MENU_PRESETS の「回数 × セット数」）を、保存したメニューと同じ形にする
export function expandMenuPreset(preset) {
  return {
    menuId: preset.menuId,
    name: preset.name,
    isPreset: true,
    exercises: preset.exercises
      .map(function (item) {
        const catalog = EXERCISE_CATALOG.find(function (entry) {
          return entry.id === item.catalogId;
        });
        if (!catalog) {
          return null;
        }
        const sets = [];
        for (let i = 0; i < item.sets; i += 1) {
          sets.push({ weight: "", reps: item.reps });
        }
        return { catalogId: catalog.id, isCustom: false, primaryMuscle: catalog.muscle, name: catalog.name, memo: "", sets: sets };
      })
      .filter(Boolean)
  };
}

// メニューから新しい入力を作る（タイトルはメニュー名、日付は今日）
export function createWorkoutFromMenu(menu) {
  const workout = createEmptyWorkout();
  workout.title = menu.name || "";
  workout.exercises = (menu.exercises || []).map(function (item) {
    return Object.assign(createEmptyExercise(), {
      catalogId: item.catalogId || "",
      isCustom: Boolean(item.isCustom),
      primaryMuscle: item.primaryMuscle || "",
      selectionMuscle: item.primaryMuscle || (item.isCustom ? "その他" : ""),
      name: item.name || "",
      memo: item.memo || "",
      sets: (item.sets && item.sets.length ? item.sets : [{ weight: "", reps: "" }]).map(function (set) {
        return Object.assign(createEmptySet(), { weight: set.weight, reps: set.reps });
      })
    });
  });
  if (!workout.exercises.length) {
    workout.exercises = [createEmptyExercise()];
  }
  return calculateWorkout(workout);
}

// 「4種目・12セット」のような要約
export function summarizeMenu(menu) {
  const exercises = menu.exercises || [];
  const sets = exercises.reduce(function (sum, exercise) {
    return sum + (exercise.sets || []).length;
  }, 0);
  return exercises.length + "種目・" + sets + "セット";
}

// 推定1RM を計算できるセット（重さも回数も 1 以上）かを返す
export function isValidSetInput(weight, reps) {
  return weight !== null && reps !== null && weight > 0 && reps > 0;
}

// 記録として残すセット（重さ・回数が両方入っていればよい。0kg は自重、0回は挑戦の記録）
export function isRecordedSetInput(weight, reps) {
  return weight !== null && reps !== null && weight >= 0 && reps >= 0;
}
