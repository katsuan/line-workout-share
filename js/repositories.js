import { FEATURE_FLAGS, MAX_HISTORY_ITEMS, MAX_MENUS, STORAGE_KEYS } from "./constants.js?v=202610241400";

// 端末に書く。残せない（容量いっぱい・プライベートブラウズ）ときも止めない（送る・画面はそのまま使える）
function writeList(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch (error) {
    console.warn("Failed to keep " + key + ":", error);
  }
  return list;
}

export function createLocalStorageWorkoutRepository(hydrateWorkout) {
  return {
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
    findById: function (workoutId) {
      return this.loadAll().find(function (item) {
        return item.workoutId === workoutId;
      });
    },
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

export function createApiWorkoutRepository(resolveGroupKey, mockRanking) {
  return {
    save: async function (workout) {
      return workout;
    },
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
