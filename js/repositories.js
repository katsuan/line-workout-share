import { FEATURE_FLAGS, MAX_HISTORY_ITEMS, MAX_MENUS, STORAGE_KEYS } from "./constants.js?v=202610191251";

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
      const trimmed = list.slice(0, MAX_HISTORY_ITEMS);
      localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(trimmed));
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
        return parsed.map(hydrateWorkout);
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
      const nextList = this.loadAll().filter(function (item) {
        return item.workoutId !== workoutId;
      });
      localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(nextList));
      return nextList;
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
    // 同じ名前のメニューは置き換える（呼ぶ側で上書きを確認する）
    save: function (menu) {
      const list = this.loadAll().filter(function (item) {
        return item.menuId !== menu.menuId && item.name !== menu.name;
      });
      list.unshift(menu);
      const trimmed = list.slice(0, MAX_MENUS);
      localStorage.setItem(STORAGE_KEYS.menus, JSON.stringify(trimmed));
      return trimmed;
    },
    deleteById: function (menuId) {
      const nextList = this.loadAll().filter(function (item) {
        return item.menuId !== menuId;
      });
      localStorage.setItem(STORAGE_KEYS.menus, JSON.stringify(nextList));
      return nextList;
    }
  };
}
