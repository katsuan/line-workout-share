// キロっく：端末に残すもの（記録の履歴・トレーニングメニュー）の読み書き。履歴（liff-workout-history）はつづくも読むので形を変えない
// app.js から読む（import）
import {
  FEATURE_FLAGS,
  MAX_HISTORY_ITEMS,
  MAX_MENUS,
  STORAGE_KEYS
} from "./settings.js?v=202610261300";

// 端末に書く。残せない（容量いっぱい・プライベートブラウズ）ときも止めない（送る・画面はそのまま使える）
function writeList(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch (error) {
    console.warn("Failed to keep " + key + ":", error);
  }
  return list;
}

// 記録の履歴を端末（localStorage）に残す入れ物を作って返す（新しいものから MAX_HISTORY_ITEMS 件）
export function createLocalStorageWorkoutRepository(hydrateWorkout) {
  return {
    // 記録を履歴のいちばん上に残す（同じ記録なら置きかえる）
    save: async function (workout) {
      if (!FEATURE_FLAGS.enableLocalHistory) {
        return workout;
      }

      const list = this.loadAll().filter(function (item) {
        return item.workoutId !== workout.workoutId;
      });

      list.unshift(hydrateWorkout(workout));
      writeList(STORAGE_KEYS.history, list.slice(0, MAX_HISTORY_ITEMS));
      return workout;
    },
    // 履歴を全部読む（壊れた記録は飛ばす）
    loadAll: function () {
      if (!FEATURE_FLAGS.enableLocalHistory) {
        return [];
      }

      try {
        const raw = localStorage.getItem(STORAGE_KEYS.history);
        if (!raw) {
          return [];
        }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          return [];
        }
        // 壊れた記録（記録の形でないもの）は飛ばし、読める記録だけ出す
        return parsed
          .filter(function (item) {
            return Boolean(item) && typeof item === "object" && !Array.isArray(item);
          })
          .map(hydrateWorkout);
      } catch (error) {
        console.warn("Failed to parse local history:", error);
        return [];
      }
    },
    // id の記録を履歴から探して返す
    findById: function (workoutId) {
      return this.loadAll().find(function (item) {
        return item.workoutId === workoutId;
      });
    },
    // id の記録を履歴から消す
    deleteById: function (workoutId) {
      return this.replaceAll(
        this.loadAll().filter(function (item) {
          return item.workoutId !== workoutId;
        })
      );
    },
    // 一覧をまるごと入れ替える（消したあとの「元に戻す」）
    replaceAll: function (list) {
      return writeList(STORAGE_KEYS.history, list);
    }
  };
}

// サーバーに残す入れ物（まだ使っていない。ランキングはモック）を作って返す
export function createApiWorkoutRepository(resolveGroupKey, mockRanking) {
  return {
    // 記録を残す（いまは何もしない）
    save: async function (workout) {
      return workout;
    },
    // ランキングを返す（いまはモック）
    getRanking: async function () {
      return mockRanking({
        groupKey: resolveGroupKey()
      });
    }
  };
}

// トレーニングメニュー（テンプレート）。この端末の localStorage に、新しく保存したものから並べて残す
export function createLocalStorageMenuRepository() {
  return {
    // トレーニングメニューを全部読む（形のちがうものは飛ばす）
    loadAll: function () {
      try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.menus) || "[]");
        return Array.isArray(parsed)
          ? parsed.filter(function (menu) {
            return menu && menu.menuId && menu.name && Array.isArray(menu.exercises);
          })
          : [];
      } catch (error) {
        console.warn("Failed to parse menus:", error);
        return [];
      }
    },
    // 名前でトレーニングメニューを探して返す
    findByName: function (name) {
      return this.loadAll().find(function (menu) {
        return menu.name === name;
      });
    },
    // 同じ名前のメニューは置き換える（呼ぶ側で「元に戻す」を出す）
    save: function (menu) {
      const list = this.loadAll().filter(function (item) {
        return item.menuId !== menu.menuId && item.name !== menu.name;
      });
      list.unshift(menu);
      return this.replaceAll(list.slice(0, MAX_MENUS));
    },
    // id のトレーニングメニューを消す
    deleteById: function (menuId) {
      return this.replaceAll(
        this.loadAll().filter(function (item) {
          return item.menuId !== menuId;
        })
      );
    },
    // 一覧をまるごと入れ替える（消す・上書きしたあとの「元に戻す」）
    replaceAll: function (list) {
      return writeList(STORAGE_KEYS.menus, list);
    }
  };
}
