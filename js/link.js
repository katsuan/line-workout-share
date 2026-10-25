// キロっく：URL の受け渡し（LINE 版を開く URL・「同じメニューでやる」の ?menu=・作りかけの ?draft=。base64url の JSON）
import {
  APP_CONFIG
} from "./settings.js?v=202610250234";
import {
  createWorkoutFromMenu,
  getNamedExercises,
  NUMBER_MAX,
  TEXT_LIMITS
} from "./workout.js?v=202610250234";

// 受けとった人が、同じ種目・セットで始められるリンク（?menu=）。メモは入れない（自分用の書きこみのため）。
// LINE のボタンの URL は 1000 字まで：入らなければ重さを外し、それでも入らなければ種目を減らす。どうしても入らなければ null
export const SAME_MENU_URL_MAX = 1000;

export function buildSameMenuUrl(workout) {
  const launchUrl = buildLiffLaunchUrl();
  const packed = packWorkoutDraft(workout);
  if (!launchUrl || !packed) {
    return null;
  }
  const rows = packed.e.map(function (row) {
    return [row[0], row[1], row[2], "", row[4]].concat(row.slice(5));
  });
  const urlOf = function (list) {
    return launchUrl + "?menu=" + encodeBase64Url(JSON.stringify({ t: packed.t, e: list }));
  };
  const withoutWeights = rows.map(function (row) {
    return [row[0], row[1], row[2], "", row[4].map(function (set) { return ["", set[1]]; })].concat(row.slice(5));
  });
  for (const list of [rows, withoutWeights]) {
    for (let n = list.length; n >= 1; n--) {
      const url = urlOf(list.slice(0, n));
      if (url.length <= SAME_MENU_URL_MAX) {
        return url;
      }
    }
  }
  return null;
}

export function buildLiffLaunchUrl() {
  const liffId = String(APP_CONFIG.LIFF_ID || "").trim();
  if (!liffId || liffId === "YOUR_LIFF_ID") {
    return "";
  }
  return "https://liff.line.me/" + liffId;
}

// ---- トレーニングメニュー（テンプレート） ----
// メニューは { menuId, name, exercises: [{ catalogId, isCustom, primaryMuscle, name, memo, sets: [{ weight, reps }] }], updatedAt }

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

// リンク（?draft=・?menu=）の文字（base64url の JSON）から記録に戻す。読めない・maxLength より長いときは null
export function readPackedWorkout(raw, maxLength = Infinity) {
  if (typeof raw !== "string" || !raw || raw.length > maxLength) {
    return null;
  }
  try {
    return unpackWorkoutDraft(JSON.parse(decodeBase64Url(raw)));
  } catch (error) {
    return null;
  }
}

// リンク（?draft=）や端末から読む作りかけ。外から来た中身なので、形・長さ・数の範囲を確かめてから使う
export function unpackWorkoutDraft(draft) {
  if (!draft || typeof draft !== "object" || !Array.isArray(draft.e)) {
    return null;
  }
  const text = function (v, max) {
    return typeof v === "string" ? v.slice(0, max) : "";
  };
  // 0（自重・挑戦）も残す。数でない・範囲の外は空
  const num = function (v) {
    if (v === "" || v === null || typeof v === "boolean") return "";
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= NUMBER_MAX ? n : "";
  };
  const exercises = draft.e
    .slice(0, 20)
    .filter(Array.isArray)
    .map(function (row) {
      const sets = Array.isArray(row[4]) ? row[4] : [];
      return {
        name: text(row[0], TEXT_LIMITS.name),
        catalogId: text(row[1], TEXT_LIMITS.catalogId),
        primaryMuscle: text(row[2], TEXT_LIMITS.muscle),
        memo: text(row[3], TEXT_LIMITS.memo),
        isCustom: row[5] === 1,
        sets: sets
          .slice(0, 30)
          .filter(Array.isArray)
          .map(function (pair) {
            return { weight: num(pair[0]), reps: num(pair[1]) };
          })
      };
    });
  if (!exercises.length) {
    return null;
  }
  return createWorkoutFromMenu({ name: text(draft.t, TEXT_LIMITS.title), exercises: exercises });
}

// 文字列（日本語を含む JSON など）を URL に入れられる形にする（UTF-8 → base64url）
export function encodeBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach(function (b) {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeBase64Url(text) {
  const b64 = String(text || "").replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64 + "===".slice((b64.length + 3) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, function (c) {
    return c.charCodeAt(0);
  }));
}
