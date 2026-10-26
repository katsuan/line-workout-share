// キロっく：送るカード（LINE の Flex）を作る。種目が多いときは横に並べ、最後のカードに「🏋️ 同じメニューでやる」
// app.js から読む（import）
import {
  formatFlexWeight,
  formatMetric,
  roundNumber,
  truncateText
} from "./format.js?v=202610261030";
import {
  buildLiffLaunchUrl,
  buildSameMenuUrl
} from "./link.js?v=202610261030";
import {
  getTodayLocalDate
} from "./page.js?v=202610261030";
import {
  APP_CONFIG,
  FLEX_THEME,
  MAX_EXERCISES_PER_BUBBLE,
  MAX_FLEX_UNITS_PER_BUBBLE,
  MAX_SETS_PER_FLEX_EXERCISE
} from "./settings.js?v=202610261030";
import {
  hasEstimated1rm,
  isMaxRmSet,
  resolveWorkoutTitle,
  sanitizeWorkout,
  TEXT_LIMITS
} from "./workout.js?v=202610261030";

const MAX_FLEX_BUBBLES = 12;

// history（この端末の履歴。新しい順）を渡すと、種目ごとに前回の記録（推定RM）と今回との差をカードに出す
export function buildWorkoutFlexMessage(workout, theme, resolveGroupKey, history) {
  const calculatedWorkout = attachPreviousRecords(sanitizeWorkout(workout, resolveGroupKey), history);
  const exerciseChunks = splitExercisesForFlexBubbles(calculatedWorkout.exercises);
  const activeTheme = theme || FLEX_THEME;

  // LINE のカルーセルは 12 枚まで。入らない種目は、最後のカードに「ほか N 種目」と出す
  const shownChunks = exerciseChunks.slice(0, MAX_FLEX_BUBBLES);
  const hiddenCount = exerciseChunks.slice(MAX_FLEX_BUBBLES).reduce(function (sum, chunk) {
    return sum + chunk.length;
  }, 0);
  const bubbles = shownChunks.map(function (chunk, index) {
    return buildWorkoutBubble(calculatedWorkout, chunk, index, shownChunks.length, activeTheme);
  });
  if (hiddenCount > 0) {
    bubbles[bubbles.length - 1].body.contents.push({
      type: "text",
      text: "ほか " + hiddenCount + " 種目",
      size: "xs",
      color: "#5D6C5D",
      margin: "sm"
    });
  }

  return {
    type: "flex",
    altText: truncateText(buildWorkoutAltText(calculatedWorkout), TEXT_LIMITS.altText),
    contents:
      bubbles.length === 1
        ? bubbles[0]
        : {
            type: "carousel",
            contents: bubbles
          }
  };
}

// 送るカードの末尾の文字（プレビューも同じ文字を使う）
export function getCreditText() {
  return "Created by " + (APP_CONFIG.APP_NAME || "kiloQ") + " ›";
}

// 1枚のカード（見出し・種目・下の帯）を作る。最後のカードには「🏋️ 同じメニューでやる」を付ける
function buildWorkoutBubble(workout, exercises, bubbleIndex, bubbleCount, theme) {
  const headerContents = [
    {
      type: "box",
      layout: "baseline",
      contents: [
        {
          type: "text",
          text: truncateText(workout.date, 20) || "-",
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
                text: truncateText(workout.user.displayName, TEXT_LIMITS.displayName),
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
      text: truncateText(resolveWorkoutTitle(workout.title, workout.user), TEXT_LIMITS.title),
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
      spacing: "xs",
      contents: [
        // 最後のカードに「同じメニューでやる」（受けとった人がキロっくで同じ種目・セットから始められる）
        ...(bubbleIndex === bubbleCount - 1 ? buildSameMenuButton(workout) : []),
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

// カードの中の種目1つぶんの箱（種目名・RM・セット・前回・メモ）を作る
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
            text: truncateText(exercise.name, TEXT_LIMITS.name),
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

// 種目のセットの行（何セット目・重さ×回数・MAX RM の印）を作る。多いときは「ほか N セット」
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

// 種目を、1枚のカードに入る量ずつのまとまりに分ける
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
function findPreviousRecord(exercise, history, workoutId) {
  // 同じ種目か（種目の一覧から選んだものは id で、自由入力は名前で比べる）を返す
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

// 種目ごとに、履歴の前回の推定1RM を付けて返す（前回がなければそのまま）
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

// 種目1つがカードの中でとる高さの目安（行の数）を返す
function estimateExerciseFlexUnits(exercise) {
  const visibleSetCount = Math.min((exercise.sets || []).length, MAX_SETS_PER_FLEX_EXERCISE);
  const hiddenSetCount = (exercise.sets || []).length > MAX_SETS_PER_FLEX_EXERCISE ? 1 : 0;
  const memoUnits = exercise.memo ? Math.min(2, Math.ceil(String(exercise.memo).length / 24)) : 0;
  return 2 + visibleSetCount + hiddenSetCount + memoUnits + (exercise.previous ? 1 : 0);
}

// トーク一覧などに出る代わりの文（タイトル・種目の数・セットの数）を返す
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

// カードに名前を出すか（LINE の名前があり、名前なしでないか）を返す
function shouldShowWorkoutUser(workout) {
  const displayName = workout && workout.user ? String(workout.user.displayName || "").trim() : "";
  return Boolean(displayName) && displayName.toLowerCase() !== "anonymous";
}

// 最後のカードの「🏋️ 同じメニューでやる」のボタンを返す（URL が作れないときは []）
function buildSameMenuButton(workout) {
  const url = buildSameMenuUrl(workout);
  if (!url) {
    return [];
  }
  return [
    {
      type: "button",
      style: "secondary",
      height: "sm",
      color: "#FFFFFF",
      action: { type: "uri", label: "🏋️ 同じメニューでやる", uri: url }
    }
  ];
}

// 下の帯の文字を押したとき、キロっくの LINE 版を開くしかけを返す（作れないときは undefined）
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
