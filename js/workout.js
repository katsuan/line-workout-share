import {
  APP_CONFIG,
  DEFAULT_USER,
  FLEX_THEME,
  MAX_EXERCISES_PER_BUBBLE,
  MAX_FLEX_UNITS_PER_BUBBLE,
  MAX_SETS_PER_FLEX_EXERCISE
} from "./constants.js";
import {
  deepClone,
  formatFlexWeight,
  formatMetric,
  generateId,
  getTodayLocalDate,
  isValidSetInput,
  roundNumber,
  toNullableNumber,
  truncateText
} from "./utils.js";

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
    return displayName + "のきろく";
  }
  return "きろく";
}

export function resolveWorkoutTitle(title, user) {
  const normalizedTitle = String(title || "").trim();
  return normalizedTitle || getDefaultWorkoutTitle(user);
}

export function buildWorkoutFlexMessage(workout, theme, resolveGroupKey) {
  const calculatedWorkout = sanitizeWorkout(workout, resolveGroupKey);
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

export function countNamedExercises(workout) {
  return ((workout && workout.exercises) || []).filter(function (exercise) {
    return Boolean(String(exercise.name || "").trim());
  }).length;
}

// 重さと回数がどちらも正の数で入っているセットだけを、記録として数える
export function isFilledSet(set) {
  return isValidSetInput(toNullableNumber(set.weight), toNullableNumber(set.reps));
}

export function countValidSets(exercise) {
  return (exercise.sets || []).filter(isFilledSet).length;
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
          text: "Created by " + (APP_CONFIG.APP_NAME || "きろく") + " ›",
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
            text: "RM : " + formatMetric(exercise.maxEstimated1rm, "kg", 0),
            size: "sm",
            align: "end",
            flex: 3
          }
        ]
      }
    ]
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
      roundNumber(set.estimated1rm || 0, 0) === roundNumber(exercise.maxEstimated1rm || 0, 0);
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
          text: formatFlexWeight(set.weight) + "  ×  " + formatMetric(set.reps, "reps", 0),
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

function estimateExerciseFlexUnits(exercise) {
  const visibleSetCount = Math.min((exercise.sets || []).length, MAX_SETS_PER_FLEX_EXERCISE);
  const hiddenSetCount = (exercise.sets || []).length > MAX_SETS_PER_FLEX_EXERCISE ? 1 : 0;
  const memoUnits = exercise.memo ? Math.min(2, Math.ceil(String(exercise.memo).length / 24)) : 0;
  return 2 + visibleSetCount + hiddenSetCount + memoUnits;
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
