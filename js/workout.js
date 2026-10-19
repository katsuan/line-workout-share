import {
  APP_CONFIG,
  DEFAULT_USER,
  EXERCISE_CATALOG,
  FLEX_THEME,
  MAX_EXERCISES_PER_BUBBLE,
  MAX_FLEX_UNITS_PER_BUBBLE,
  MAX_SETS_PER_FLEX_EXERCISE
} from "./constants.js?v=202610191254";
import {
  deepClone,
  formatFlexWeight,
  formatMetric,
  generateId,
  getTodayLocalDate,
  isRecordedSetInput,
  isValidSetInput,
  roundNumber,
  toNullableNumber,
  truncateText
} from "./utils.js?v=202610191254";

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

export function createEmptySet() {
  return {
    setId: generateId("set"),
    weight: "",
    reps: "",
    volume: 0,
    estimated1rm: 0
  };
}

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

export function estimate1rm(weight, reps) {
  return weight + (weight * reps) / 40;
}

export function hydrateWorkout(workout) {
  const baseWorkout = calculateWorkout(
    Object.assign(createEmptyWorkout(), deepClone(workout), {
      exercises: (workout.exercises || []).map(function (exercise) {
        return Object.assign(createEmptyExercise(), exercise, {
          sets: (exercise.sets || []).map(function (set) {
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

export function getDefaultWorkoutTitle(user) {
  const displayName = user ? String(user.displayName || "").trim() : "";
  if (displayName && displayName.toLowerCase() !== "anonymous") {
    return displayName + "のキロっく";
  }
  return "キロっく";
}

export function resolveWorkoutTitle(title, user) {
  const normalizedTitle = String(title || "").trim();
  return normalizedTitle || getDefaultWorkoutTitle(user);
}

// history（この端末の履歴。新しい順）を渡すと、種目ごとに前回の記録（推定RM）と今回との差をカードに出す
export function buildWorkoutFlexMessage(workout, theme, resolveGroupKey, history) {
  const calculatedWorkout = attachPreviousRecords(sanitizeWorkout(workout, resolveGroupKey), history);
  const exerciseChunks = splitExercisesForFlexBubbles(calculatedWorkout.exercises);
  const activeTheme = theme || FLEX_THEME;

  const bubbles = exerciseChunks.map(function (chunk, index) {
    return buildWorkoutBubble(calculatedWorkout, chunk, index, exerciseChunks.length, activeTheme);
  });

  return {
    type: "flex",
    altText: buildWorkoutAltText(calculatedWorkout),
    contents:
      bubbles.length === 1
        ? bubbles[0]
        : {
            type: "carousel",
            contents: bubbles
          }
  };
}

// 種目名が入っている種目だけ（選びかけ・空の種目は除く）
export function getNamedExercises(workout) {
  return ((workout && workout.exercises) || []).filter(function (exercise) {
    return Boolean(String(exercise.name || "").trim());
  });
}

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

export function countValidSets(exercise) {
  return (exercise.sets || []).filter(isFilledSet).length;
}

// その種目でいちばん推定1RMが高いセットか（入力欄の「MAX RM」の印）
export function isMaxRmSet(exercise, set) {
  const maxRm = roundNumber((exercise && exercise.maxEstimated1rm) || 0, 1);
  return Boolean(maxRm) && isFilledSet(set) && roundNumber(set.estimated1rm || 0, 1) === maxRm;
}

// 送るカードの末尾の文字（プレビューも同じ文字を使う）
export function getCreditText() {
  return "Created by " + (APP_CONFIG.APP_NAME || "kiloQ") + " ›";
}

function buildWorkoutBubble(workout, exercises, bubbleIndex, bubbleCount, theme) {
  const headerContents = [
    {
      type: "box",
      layout: "baseline",
      contents: [
        {
          type: "text",
          text: workout.date || "-",
          color: "#ffffff",
          weight: "bold",
          size: "sm",
          wrap: true,
          flex: 3,
          margin: "none"
        }
      ].concat(
        shouldShowWorkoutUser(workout)
          ? [
              {
                type: "text",
                text: workout.user.displayName,
                color: "#FDF3EA",
                size: "xs",
                align: "end",
                wrap: true,
                flex: 2
              }
            ]
          : []
      )
    },
    {
      type: "text",
      text: resolveWorkoutTitle(workout.title, workout.user),
      color: "#ffffff",
      weight: "bold",
      size: "lg",
      wrap: true,
      margin: "xs"
    }
  ];

  return {
    type: "bubble",
    size: "mega",
    styles: {
      body: {
        backgroundColor: "#FFFFFF"
      },
      footer: {
        backgroundColor: theme.footer
      }
    },
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: theme.header,
      paddingAll: "10px",
      contents: headerContents
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "6px",
      spacing: "xs",
      contents: exercises.map(function (exercise) {
        return buildExerciseBoxForFlex(exercise, theme);
      })
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "5px",
      contents: [
        {
          type: "text",
          text: getCreditText(),
          size: "xs",
          color: "#FFFFFF",
          align: "center",
          action: buildLiffFooterAction()
        }
      ]
    }
  };
}

function buildExerciseBoxForFlex(exercise, theme) {
  return {
    type: "box",
    layout: "vertical",
    spacing: "xs",
    margin: "xs",
    paddingAll: "8px",
    borderWidth: "1px",
    borderColor: theme.border,
    cornerRadius: "10px",
    contents: [
      {
        type: "box",
        layout: "baseline",
        contents: [
          {
            type: "text",
            text: exercise.name,
            weight: "bold",
            size: "sm",
            wrap: true,
            flex: 4
          },
          {
            type: "text",
            text: "RM : " + (exercise.maxEstimated1rm > 0 ? formatMetric(exercise.maxEstimated1rm, "kg", 0) : "-"),
            size: "sm",
            align: "end",
            flex: 3
          }
        ]
      }
    ]
      .concat(exercise.previous ? [buildPreviousLineForFlex(exercise, theme)] : [])
      .concat(buildSetLinesForFlex(exercise, theme))
      .concat(
        exercise.memo
          ? [
              {
                type: "text",
                text: truncateText(exercise.memo, 42),
                size: "xxs",
                color: theme.textMuted,
                wrap: true
              }
            ]
          : []
      )
  };
}

function buildSetLinesForFlex(exercise, theme) {
  const visibleSets = exercise.sets.slice(0, MAX_SETS_PER_FLEX_EXERCISE);
  const lines = visibleSets.map(function (set, index) {
    const isMaxRmSet =
      hasEstimated1rm(set) && roundNumber(set.estimated1rm || 0, 0) === roundNumber(exercise.maxEstimated1rm || 0, 0);
    return {
      type: "box",
      layout: "horizontal",
      spacing: "xs",
      alignItems: "center",
      contents: [
        {
          type: "box",
          layout: "vertical",
          width: "18px",
          flex: 0,
          contents: [
            {
              type: "text",
              text: String(index + 1),
              size: "xxs",
              color: theme.textMuted,
              align: "end"
            }
          ]
        },
        {
          type: "text",
          text: formatFlexWeight(set.weight) + "  ×  " + formatMetric(set.reps, "reps", 0) + (Number(set.reps) === 0 ? "（挑戦）" : ""),
          size: "xs",
          wrap: true,
          flex: 6
        }
      ].concat(
        isMaxRmSet
          ? [
              {
                type: "box",
                layout: "vertical",
                flex: 0,
                paddingTop: "0px",
                paddingBottom: "0px",
                paddingStart: "5px",
                paddingEnd: "5px",
                backgroundColor: theme.accent,
                cornerRadius: "2px",
                contents: [
                  {
                    type: "text",
                    text: "MAX RM",
                    size: "xxs",
                    color: "#FFFFFF",
                    align: "center",
                    wrap: false
                  }
                ]
              }
            ]
          : []
      )
    };
  });

  if (exercise.sets.length > MAX_SETS_PER_FLEX_EXERCISE) {
    lines.push({
      type: "text",
      text: "ほか " + (exercise.sets.length - MAX_SETS_PER_FLEX_EXERCISE) + " セット",
      size: "xs",
      color: "#5D6C5D"
    });
  }

  return lines;
}

function splitExercisesForFlexBubbles(exercises) {
  const chunks = [];
  let currentChunk = [];
  let currentUnits = 0;

  exercises.forEach(function (exercise) {
    const exerciseUnits = estimateExerciseFlexUnits(exercise);
    const shouldSplit =
      currentChunk.length > 0 &&
      (currentChunk.length >= MAX_EXERCISES_PER_BUBBLE ||
        currentUnits + exerciseUnits > MAX_FLEX_UNITS_PER_BUBBLE);

    if (shouldSplit) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentUnits = 0;
    }

    currentChunk.push(exercise);
    currentUnits += exerciseUnits;
  });

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

// 同じ種目の前回の記録：履歴（新しい順）から、この記録以外で同じ種目（catalogId、なければ種目名）の推定RM が出ているもの
export function findPreviousRecord(exercise, history, workoutId) {
  const sameExercise = function (other) {
    return exercise.catalogId ? other.catalogId === exercise.catalogId : String(other.name || "").trim() === String(exercise.name || "").trim();
  };
  for (const past of history || []) {
    if (!past || past.workoutId === workoutId) continue;
    const match = (past.exercises || []).find(function (other) {
      return sameExercise(other) && Number(other.maxEstimated1rm || 0) > 0;
    });
    if (match) {
      return { date: past.date || "", maxEstimated1rm: roundNumber(Number(match.maxEstimated1rm), 1) };
    }
  }
  return null;
}

function attachPreviousRecords(workout, history) {
  if (!history || !history.length) return workout;
  return Object.assign({}, workout, {
    exercises: workout.exercises.map(function (exercise) {
      const previous = exercise.maxEstimated1rm > 0 ? findPreviousRecord(exercise, history, workout.workoutId) : null;
      return previous ? Object.assign({}, exercise, { previous: previous }) : exercise;
    })
  });
}

// 「前回 10/12 RM 73 kg（+3）」の1行。上がったときはテーマの色で目立たせる
function buildPreviousLineForFlex(exercise, theme) {
  const previous = exercise.previous;
  const diff = roundNumber(exercise.maxEstimated1rm - previous.maxEstimated1rm, 1);
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "±";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(previous.date) ? Number(previous.date.slice(5, 7)) + "/" + Number(previous.date.slice(8)) + " " : "";
  return {
    type: "text",
    text: "前回 " + date + "RM " + formatMetric(previous.maxEstimated1rm, "kg", 0) + "（" + sign + Math.abs(diff) + "kg）",
    size: "xxs",
    color: diff > 0 ? theme.accent : theme.textMuted,
    weight: diff > 0 ? "bold" : "regular",
    wrap: true
  };
}

function estimateExerciseFlexUnits(exercise) {
  const visibleSetCount = Math.min((exercise.sets || []).length, MAX_SETS_PER_FLEX_EXERCISE);
  const hiddenSetCount = (exercise.sets || []).length > MAX_SETS_PER_FLEX_EXERCISE ? 1 : 0;
  const memoUnits = exercise.memo ? Math.min(2, Math.ceil(String(exercise.memo).length / 24)) : 0;
  return 2 + visibleSetCount + hiddenSetCount + memoUnits + (exercise.previous ? 1 : 0);
}

function buildWorkoutAltText(workout) {
  const rawTitle = String((workout && workout.title) || "").trim();
  const title = resolveWorkoutTitle(rawTitle, workout.user);
  const displayName = workout && workout.user ? String(workout.user.displayName || "").trim() : "";

  if (displayName && displayName.toLowerCase() !== "anonymous") {
    if (!rawTitle) {
      return title;
    }

    const senderPrefix = displayName + "'s ";
    if (title.toLowerCase().startsWith(senderPrefix.toLowerCase())) {
      return title;
    }

    return senderPrefix + title;
  }

  return (workout.date || getTodayLocalDate()) + " " + title;
}

function shouldShowWorkoutUser(workout) {
  const displayName = workout && workout.user ? String(workout.user.displayName || "").trim() : "";
  return Boolean(displayName) && displayName.toLowerCase() !== "anonymous";
}

function buildLiffFooterAction() {
  const launchUrl = buildLiffLaunchUrl();
  if (!launchUrl) {
    return undefined;
  }
  return {
    type: "uri",
    label: "Open LIFF",
    uri: launchUrl
  };
}

function buildLiffLaunchUrl() {
  const liffId = String(APP_CONFIG.LIFF_ID || "").trim();
  if (!liffId || liffId === "YOUR_LIFF_ID") {
    return "";
  }
  return "https://liff.line.me/" + liffId;
}

// ---- トレーニングメニュー（テンプレート） ----
// メニューは { menuId, name, exercises: [{ catalogId, isCustom, primaryMuscle, name, memo, sets: [{ weight, reps }] }], updatedAt }

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

// ---- 入力中の記録を、別の環境（ログインの行き来・LINE アプリ）へ持っていく形 ----
// { t: タイトル, e: [[種目名, catalogId, 部位, メモ, [[重さ, 回数], ...], 自由入力なら 1], ...] }（計算した値は持たない）
export function packWorkoutDraft(workout) {
  const exercises = getNamedExercises(workout).map(function (exercise) {
    const sets = (exercise.sets || []).map(function (set) {
      return [set.weight === "" ? "" : set.weight, set.reps === "" ? "" : set.reps];
    });
    const row = [exercise.name, exercise.catalogId || "", exercise.primaryMuscle || "", exercise.memo || "", sets];
    if (exercise.isCustom) row.push(1);
    return row;
  });
  if (!exercises.length) {
    return null;
  }
  return { t: workout.title || "", e: exercises.slice(0, 20) };
}

export function unpackWorkoutDraft(draft) {
  if (!draft || !Array.isArray(draft.e) || !draft.e.length) {
    return null;
  }
  return createWorkoutFromMenu({
    name: String(draft.t || ""),
    exercises: draft.e.slice(0, 20).map(function (row) {
      const sets = Array.isArray(row[4]) ? row[4] : [];
      return {
        name: String(row[0] || "").slice(0, 60),
        catalogId: String(row[1] || ""),
        primaryMuscle: String(row[2] || ""),
        memo: String(row[3] || "").slice(0, 200),
        isCustom: row[5] === 1,
        sets: sets.slice(0, 30).map(function (pair) {
          // 0（自重・挑戦）も残す
          const num = function (v) {
            return v === "" || v === null || !Number.isFinite(Number(v)) ? "" : Number(v);
          };
          return { weight: num(pair[0]), reps: num(pair[1]) };
        })
      };
    })
  });
}
