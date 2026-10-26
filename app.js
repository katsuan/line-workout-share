// キロっく（kiloQ）：入口。画面（入力・送信プレビュー・履歴・シート）を作り、ボタン・入力を受け、部品（js/）をつなぐ。
// index.html から読む（type="module"）。ファイルの一覧は README
import {
  buildWorkoutFlexMessage as buildWorkoutFlexPayload,
  getCreditText
} from "./js/card.js?v=202610261700";
import {
  EXERCISE_CATALOG,
  MENU_PRESETS,
  MUSCLE_FILTERS
} from "./js/catalog.js?v=202610261700";
import {
  renderButton,
  renderChip,
  renderDisclosureToggle,
  renderEmpty,
  renderField,
  renderSheet,
  renderStartButton
} from "./js/components.js?v=202610261700";
import {
  buildSampleWorkout,
  mockRanking
} from "./js/fixtures.js?v=202610261700";
import {
  cssEscape,
  escapeHtml,
  formatLocaleMetric
} from "./js/format.js?v=202610261700";
import {
  buildLineAppUrl,
  getLiffEnvironment,
  initLiff as initializeLiffState,
  loadCachedProfile,
  loginWithLine,
  safelyGetLiffContext
} from "./js/liff.js?v=202610261700";
import {
  encodeBase64Url,
  packWorkoutDraft,
  readPackedWorkout,
  unpackWorkoutDraft
} from "./js/link.js?v=202610261700";
import {
  deepClone,
  generateId,
  getTodayLocalDate,
  seasonal
} from "./js/page.js?v=202610261700";
import {
  APP_CONFIG,
  DEFAULT_THEME,
  DEFAULT_USER,
  FEATURE_FLAGS,
  MAX_HISTORY_ITEMS,
  MAX_MENUS,
  STORAGE_KEYS
} from "./js/settings.js?v=202610261700";
import {
  createApiWorkoutRepository,
  createLocalStorageMenuRepository,
  createLocalStorageWorkoutRepository
} from "./js/store.js?v=202610261700";
import { startOfWeek, weekStreak } from "./js/streak.js?v=202610261700";
import {
  applyTheme,
  getFlexTheme as buildFlexTheme,
  loadThemePreference,
  normalizeHexColor,
  saveThemePreference
} from "./js/theme.js?v=202610261700";
import {
  buildMenuFromWorkout,
  calculateWorkout,
  countNamedExercises,
  countValidSets,
  createEmptyExercise,
  createEmptySet,
  createEmptyWorkout,
  createWorkoutFromMenu,
  expandMenuPreset,
  getDefaultWorkoutTitle,
  getNamedExercises,
  hasEstimated1rm,
  hydrateWorkout,
  isFilledSet,
  isMaxRmSet,
  resolveWorkoutTitle,
  sanitizeWorkout as sanitizeWorkoutModel,
  summarizeMenu,
  TEXT_LIMITS
} from "./js/workout.js?v=202610261700";

(function () {

  const appState = {
    activeTab: "input",
    workout: null,
    rankingPeriod: "week",
    rankingData: null,
    history: [],
    menus: [],
    ui: {
      openJsonPreview: false,
      previewOpen: loadPreviewOpen(),
      metricsOpen: false,
      suppressScrollSpyUntil: 0,
      expandedExerciseId: null,
      memoOpenExerciseIds: {},
      settingsModalOpen: false,
      // トレーニングメニュー（テンプレート）のシート。menuName は「保存する名前」の入力中の値
      menuModalOpen: false,
      menuName: "",
      openHistoryIds: {},
      // 履歴の月ごとのまとまり（"2026-10" → 開いているか）。まだ触っていない月は、いちばん新しい月だけ開く
      openHistoryMonths: {}
    },
    theme: Object.assign({}, DEFAULT_THEME),
    liff: {
      initialized: false,
      ready: false,
      previewOnly: true,
      shareAvailable: false,
      profile: Object.assign({}, DEFAULT_USER),
      context: null,
      error: null
    }
  };

  const elements = {};

  const LocalStorageWorkoutRepository = createLocalStorageWorkoutRepository(hydrateWorkout);
  const ApiWorkoutRepository = createApiWorkoutRepository(resolveGroupKey, mockRanking);
  const MenuRepository = createLocalStorageMenuRepository();

  // 送り先を選んでいるあいだにもう一度押されても、送る画面は1つだけ
  let sharing = false;
  // 見出しの右の本人のアイコン（shared/line-me.js の mount の返事。読めなければ null）と、LIFF を起こし終えた約束
  let lineMe = null;
  let liffDone = () => {};
  const liffReadyPromise = new Promise((resolve) => {
    liffDone = resolve;
  });

  document.addEventListener("DOMContentLoaded", initApp);

  // デバッグモード（Flex JSON のコピーなど）かを返す
  function isDebugModeEnabled() {
    return Boolean(FEATURE_FLAGS.enableDebugMode);
  }

  // ランキング（デバッグ用）を出すかを返す
  function isRankingEnabled() {
    return isDebugModeEnabled() && Boolean(FEATURE_FLAGS.enableRanking);
  }

  // 種目の一覧から id の種目を探して返す
  function findCatalogExercise(catalogId) {
    return EXERCISE_CATALOG.find(function (item) {
      return item.id === catalogId;
    });
  }

  // はじめに動かす：設定・作りかけ・履歴・メニューを読み、画面を作り、LINE とつなぐ（つながらないときも使える）
  async function initApp() {
    cacheElements();
    bindEvents();
    document.title = document.title || APP_CONFIG.APP_NAME || "kiloQ";

    appState.theme = loadThemePreference();
    applyTheme(appState.theme.baseColor);
    appState.liff.profile = loadCachedProfile();
    appState.workout = createEmptyWorkout();
    const resumed = restoreLocalDraft();
    appState.history = loadWorkoutHistory();
    appState.menus = MenuRepository.loadAll();
    syncWorkoutUser();
    if (isRankingEnabled()) {
      appState.rankingData = await getRanking();
    }

    // 見出しの右に本人のアイコン（つづく・しょくじと同じ見た目。Q キットの shared/line-me.js）。
    // 押すと「あなたの記録」と設定のシート。キロっくはボットにつながないので、ボットの行・送っていない数は出さない。
    // ブラウザ版でも出す（設定を開くため。ログインしていないので灰色のふち）
    lineMe = window.QLineMe
      ? window.QLineMe.mount({
          liffId: APP_CONFIG.LIFF_ID,
          show: true,
          bot: false,
          ready: liffReadyPromise,
          initial: isNamed(appState.liff.profile) ? { name: appState.liff.profile.displayName, picture: appState.liff.profile.pictureUrl || "" } : null,
          onOpen: openSettingsSheet
        })
      : null;
    renderShell();
    renderInput();
    renderPreview();
    renderHistory();
    if (isRankingEnabled()) {
      renderRanking();
    }

    const liffResult = await initLiff();
    liffDone();
    // 知らせは1つずつなので、LINE とつながらない知らせを先に出し、下の「元に戻す」「新しく作る」のある知らせで上書きする
    if (!liffResult.ready) {
      notify(
        isDebugModeEnabled()
          ? "共有機能を使えないため、プレビュー中心で起動しました。デバッグ用のJSON確認は利用できます。"
          : "ここでは見本だけ。送るときは LINE 版で。",
        "warn"
      );
    }
    // ログインの行き来・LINE アプリへ移る前に入れていた記録を戻す（そちらがあれば、前回の続きより先）
    if (!restoreCarriedDraft() && resumed) {
      showResumed();
    }

    syncWorkoutUser();
    renderInput();
    renderShell();
    renderPreview();
  }

  // よく使う画面の部品を elements に覚える
  function cacheElements() {
    elements.statusFallback = document.getElementById("status-fallback");
    elements.tabNav = document.getElementById("tab-nav");
    elements.tabButtons = Array.from(elements.tabNav.querySelectorAll("[data-tab]"));
    elements.tabInput = document.getElementById("tab-input");
    elements.tabPreview = document.getElementById("tab-preview");
    elements.tabHistory = document.getElementById("tab-history");
    elements.tabRanking = document.getElementById("tab-ranking");
    elements.tabRankingButton = document.getElementById("tab-button-ranking");
    elements.actionBar = document.getElementById("action-bar");
    elements.copyJsonButton = document.getElementById("copy-json-button");
    elements.shareButton = document.getElementById("share-button");
    elements.lineHelp = document.getElementById("line-help");
    elements.lineLoginButton = document.getElementById("line-login-button");
    elements.lineAppLink = document.getElementById("line-app-link");
  }

  // 押す・入力・スクロール・開け閉めを受けるしかけを付ける
  function bindEvents() {
    document.addEventListener("click", handleClick);
    // 下の送信バーの高さを測り、本文の下の余白にする（案内が出る・消えるたびに高さが変わる）
    if (elements.actionBar) {
      // 下の送る帯の高さを測り、本文の下の余白（--action-bar-height）にする
      const syncActionBarHeight = function () {
        document.documentElement.style.setProperty("--action-bar-height", elements.actionBar.offsetHeight + "px");
      };
      syncActionBarHeight();
      if (typeof ResizeObserver === "function") {
        new ResizeObserver(syncActionBarHeight).observe(elements.actionBar);
      } else {
        window.addEventListener("resize", syncActionBarHeight);
      }
    }
    // 開閉（<details> の ls-fold）の開け閉めを覚えておき、描き直しても戻らないようにする（toggle は伝わらないので capture で受ける）
    document.addEventListener("toggle", rememberFoldState, true);
    document.addEventListener("input", handleInput);
    document.addEventListener("change", handleInput);
    window.addEventListener("scroll", syncActiveTabToScroll, { passive: true });
    window.addEventListener("resize", syncActiveTabToScroll);
  }

  // data-fold="metrics"（この記録の集計）・"json"（デバッグ）・data-history-month（履歴の月）
  function rememberFoldState(event) {
    const fold = event.target;
    if (!fold || !fold.dataset) {
      return;
    }
    if (fold.dataset.historyMonth) {
      appState.ui.openHistoryMonths[fold.dataset.historyMonth] = fold.open;
    } else if (fold.dataset.fold === "metrics") {
      appState.ui.metricsOpen = fold.open;
    } else if (fold.dataset.fold === "json") {
      appState.ui.openJsonPreview = fold.open;
    }
  }

  // LINE とつないで（LIFF）、その結果を appState.liff に入れて返す
  async function initLiff() {
    const nextState = await initializeLiffState({
      cachedProfile: appState.liff.profile
    });
    appState.liff = Object.assign({}, appState.liff, nextState);
    return appState.liff;
  }

  // 送信プレビューを開いておくか（端末に覚える。保存できなくても開いた状態で動く）
  function loadPreviewOpen() {
    try {
      return window.localStorage.getItem(STORAGE_KEYS.previewOpen) !== "false";
    } catch (error) {
      return true;
    }
  }

  // 送信プレビューを開いているかを端末に覚える（覚えられなくても切りかわる）
  function savePreviewOpen(isOpen) {
    try {
      window.localStorage.setItem(STORAGE_KEYS.previewOpen, String(isOpen));
    } catch (error) {
      // 保存できなくても表示はそのまま切り替わる
    }
  }

  // 表示設定の色を変えて、画面と端末に入れる（色でなければ何もしない）
  function updateTheme(baseColor) {
    const normalizedColor = normalizeHexColor(baseColor);
    if (!normalizedColor) {
      return;
    }
    appState.theme.baseColor = normalizedColor;
    applyTheme(normalizedColor);
    saveThemePreference(appState.theme);
  }

  // 表示設定の色を初めの色にもどす
  function resetTheme() {
    appState.theme = Object.assign({}, DEFAULT_THEME);
    applyTheme(appState.theme.baseColor);
    saveThemePreference(appState.theme);
  }

  // いまの色から、送るカードの色を返す
  function getFlexTheme() {
    const baseColor =
      appState.theme && appState.theme.baseColor ? appState.theme.baseColor : DEFAULT_THEME.baseColor;
    return buildFlexTheme(baseColor);
  }

  // 入力中の記録から、id の種目を探して返す
  function findExercise(exerciseId) {
    return appState.workout.exercises.find(function (item) {
      return item.exerciseId === exerciseId;
    });
  }

  // 入力・プレビュー・タブをまとめて描き直す（ワークアウト全体が変わったとき）
  function renderWorkoutViews() {
    renderInput();
    renderPreview();
    renderShell();
  }

  // 種目を最後に足して開く（catalogId を渡すと、その種目を選んだ形で）
  function addExercise(catalogId) {
    const exercise = createEmptyExercise();
    if (catalogId) {
      applyCatalogToExercise(exercise, catalogId);
    }
    appState.workout.exercises.push(exercise);
    appState.activeTab = "input";
    appState.ui.expandedExerciseId = exercise.exerciseId;
    touchWorkout();
    renderWorkoutViews();
    scrollToExerciseCard(exercise.exerciseId);
  }

  // 種目を、afterExerciseId の種目のすぐ下に足して開く
  function insertExerciseAfter(afterExerciseId, catalogId) {
    const exercise = createEmptyExercise();
    if (catalogId) {
      applyCatalogToExercise(exercise, catalogId);
    }

    const nextExercises = appState.workout.exercises.slice();
    const insertIndex = nextExercises.findIndex(function (item) {
      return item.exerciseId === afterExerciseId;
    });

    if (insertIndex === -1) {
      addExercise(catalogId);
      return;
    }

    nextExercises.splice(insertIndex + 1, 0, exercise);
    appState.workout.exercises = nextExercises;
    appState.activeTab = "input";
    appState.ui.expandedExerciseId = exercise.exerciseId;
    touchWorkout();
    renderWorkoutViews();
    scrollToExerciseCard(exercise.exerciseId);
  }

  // 消すときは確かめずにすぐ消し、トーストの「元に戻す」で戻せるようにする（Q のツール共通）
  function removeExercise(exerciseId) {
    const exercise = findExercise(exerciseId);
    const undo = undoInputChange();
    if (appState.workout.exercises.length === 1) {
      appState.workout.exercises = [createEmptyExercise()];
      appState.ui.expandedExerciseId = appState.workout.exercises[0].exerciseId;
    } else {
      appState.workout.exercises = appState.workout.exercises.filter(function (exercise) {
        return exercise.exerciseId !== exerciseId;
      });
      if (appState.ui.expandedExerciseId === exerciseId) {
        appState.ui.expandedExerciseId = appState.workout.exercises[0]
          ? appState.workout.exercises[0].exerciseId
          : "";
      }
    }
    delete appState.ui.memoOpenExerciseIds[exerciseId];
    touchWorkout();
    renderWorkoutViews();
    notify("🗑 " + (exercise && exercise.name ? "「" + exercise.name + "」" : "種目") + "を消しました。", "info", undo);
  }

  // 種目にセットを1つ足す（前のセットの重さ・回数を引きつぐ）
  function addSet(exerciseId) {
    const exercise = findExercise(exerciseId);
    if (!exercise) {
      return;
    }
    // 直前のセットの重さ・回数を引き継ぎ、−／＋で微調整するだけで入力できるようにする
    const lastSet = exercise.sets[exercise.sets.length - 1];
    const newSet = createEmptySet();
    if (lastSet) {
      newSet.weight = lastSet.weight;
      newSet.reps = lastSet.reps;
    }
    exercise.sets.push(newSet);
    appState.ui.expandedExerciseId = exerciseId;
    touchWorkout();
    renderInput();
    renderPreview();
  }

  // 種目のセットを1つ消す（「元に戻す」で戻せる）
  function removeSet(exerciseId, setId) {
    const exercise = findExercise(exerciseId);
    if (!exercise) {
      return;
    }

    const undo = undoInputChange();
    if (exercise.sets.length === 1) {
      exercise.sets = [createEmptySet()];
    } else {
      exercise.sets = exercise.sets.filter(function (set) {
        return set.setId !== setId;
      });
    }
    appState.ui.expandedExerciseId = exerciseId;
    touchWorkout();
    renderInput();
    renderPreview();
    notify("🗑 セットを消しました。", "info", undo);
  }

  // 種目の一覧から選んだ種目の名前・部位を、入力中の種目に入れる
  function applyCatalogToExercise(exercise, catalogId) {
    const catalogExercise = findCatalogExercise(catalogId);
    if (!catalogExercise) {
      return;
    }
    exercise.catalogId = catalogExercise.id;
    exercise.isCustom = false;
    exercise.name = catalogExercise.name;
    exercise.primaryMuscle = catalogExercise.muscle;
    exercise.selectionMuscle = catalogExercise.muscle;
  }

  // 種目えらびの部位の絞りこみを変える
  function updateExerciseSelectionMuscle(exerciseId, muscle) {
    const exercise = findExercise(exerciseId);
    if (!exercise) {
      return;
    }
    exercise.selectionMuscle = muscle;
    appState.ui.expandedExerciseId = exerciseId;
    renderInput();
  }

  // 種目の一覧から種目を選ぶ
  function chooseExerciseCatalog(exerciseId, catalogId) {
    const exercise = findExercise(exerciseId);
    if (!exercise) {
      return;
    }
    applyCatalogToExercise(exercise, catalogId);
    appState.ui.expandedExerciseId = exerciseId;
    touchWorkout();
    renderInput();
    renderPreview();
  }

  // 一覧にない種目を、自由に名前を入れる形にする
  function startCustomExercise(exerciseId) {
    const exercise = findExercise(exerciseId);
    if (!exercise) {
      return;
    }
    exercise.catalogId = "";
    exercise.isCustom = true;
    exercise.primaryMuscle = exercise.selectionMuscle || exercise.primaryMuscle || "";
    exercise.name = "";
    appState.ui.expandedExerciseId = exerciseId;
    touchWorkout();
    renderInput();
    renderPreview();
  }

  // 種目のカードを開く・たたむ（開くのは1つだけ）
  function toggleExercisePanel(exerciseId) {
    appState.ui.expandedExerciseId =
      appState.ui.expandedExerciseId === exerciseId ? "" : exerciseId;
    renderInput();
  }

  // 種目のメモの欄を開く・たたむ
  function toggleExerciseMemo(exerciseId) {
    appState.ui.memoOpenExerciseIds[exerciseId] = !isExerciseMemoOpen(exerciseId);
    appState.ui.expandedExerciseId = exerciseId;
    renderInput();
  }

  // 入力中の記録から送るカードを作る（いまの色・履歴の前回つき）
  function buildWorkoutFlexMessage(workout) {
    return buildWorkoutFlexPayload(workout, getFlexTheme(), resolveGroupKey, appState.history);
  }

  // 送れる形か確かめる。{ valid, errors, workout: 送る形にした記録 } を返す
  function validateWorkout(workout) {
    const errors = [];
    const calculatedWorkout = calculateWorkout(workout);
    const sanitizedWorkout = sanitizeWorkout(workout);

    if (!sanitizedWorkout.date) {
      errors.push("日付を入れると送れます。");
    }

    calculatedWorkout.exercises.forEach(function (exercise, index) {
      const hasValidSet = (exercise.sets || []).some(isFilledSet);
      if (hasValidSet && !(exercise.name || "").trim()) {
        errors.push("種目" + (index + 1) + "の名前を入れると送れます。");
      }
    });

    // 名前がないだけのときは、そちらの知らせだけにする
    if (!sanitizedWorkout.exercises.length && !errors.length) {
      errors.push("種目とセットを1つ以上入れると送れます。");
    }

    return {
      valid: errors.length === 0,
      errors: errors,
      workout: sanitizedWorkout
    };
  }

  // 記録を履歴に残す（いまは端末に）
  async function saveWorkout(workout) {
    const repository = getWorkoutRepository();
    return repository.save(workout);
  }

  // 記録を残す入れ物（端末かサーバー）を返す
  function getWorkoutRepository() {
    if (FEATURE_FLAGS.enableApiAdapter) {
      return ApiWorkoutRepository;
    }
    return LocalStorageWorkoutRepository;
  }

  // 端末の履歴を全部読んで返す
  function loadWorkoutHistory() {
    return LocalStorageWorkoutRepository.loadAll();
  }

  // いまの入力を覚えておき、「元に戻す」で戻す関数を返す（消す・入れ替える前に呼ぶ）
  function undoInputChange() {
    const saved = deepClone(appState.workout);
    const savedExpandedId = appState.ui.expandedExerciseId;
    return function () {
      appState.workout = saved;
      appState.ui.expandedExerciseId = savedExpandedId;
      appState.activeTab = "input";
      renderWorkoutViews();
      notify("元に戻しました。", "info");
    };
  }

  // 入力を入れかえて、最初の種目を開く
  function setWorkout(workout) {
    appState.workout = workout;
    appState.ui.expandedExerciseId = workout.exercises[0] ? workout.exercises[0].exerciseId : "";
  }

  // 入力中の内容を別のもの（履歴・メニュー・サンプル・空）に入れ替える。最初の種目を開いて入力タブへ。
  // 種目を入力していたときは、確かめる代わりにトーストの「元に戻す」で前の入力に戻せる
  function replaceWorkout(workout, message) {
    const undo = countNamedExercises(appState.workout) > 0 ? undoInputChange() : null;
    setWorkout(workout);
    syncWorkoutUser();
    appState.activeTab = "input";
    renderWorkoutViews();
    notify(message, "info", undo);
  }

  // 履歴の記録を入力に入れる（入力中の種目があれば「元に戻す」で戻せる）
  function restoreWorkout(workoutId) {
    const restored = LocalStorageWorkoutRepository.findById(workoutId);
    if (!restored) {
      notify("選択した履歴が見つかりませんでした。", "warn");
      return;
    }
    replaceWorkout(hydrateWorkout(restored), "前の記録を入れました。重さ・回数を直して送れます。");
  }

  // 「カードで送る」を押したとき。送り先を選んでいるあいだにもう一度押されても、送る画面は1つだけ
  async function shareWorkout(workout) {
    if (sharing) {
      return;
    }
    sharing = true;
    try {
      await shareWorkoutOnce(workout);
    } finally {
      sharing = false;
    }
  }

  // 送る：形を確かめ、カードを作って送り先を選ぶ。送れたら履歴に残し、続けて送る・閉じるのシート
  async function shareWorkoutOnce(workout) {
    const validation = validateWorkout(workout);
    if (!validation.valid) {
      notify(validation.errors.join(" "), "error");
      appState.activeTab = "input";
      renderInput(); // 名前のない種目の下に、赤い字の知らせを出す
      renderShell();
      return;
    }

    const shareableWorkout = createShareSnapshot(validation.workout);
    const message = buildWorkoutFlexMessage(shareableWorkout);

    if (!appState.liff.ready || !appState.liff.shareAvailable) {
      appState.activeTab = "preview";
      appState.ui.openJsonPreview = isDebugModeEnabled();
      renderShell();
      renderPreview();
      if (isDebugModeEnabled()) {
        const copied = await copyText(JSON.stringify(message, null, 2));
        if (copied) {
          notify(
            "shareTargetPicker が使えないため、デバッグ用に Flex JSON をコピーしました。",
            "warn"
          );
        } else {
          notify(
            "shareTargetPicker が使えないため、デバッグ用に Flex JSON プレビューを表示しています。",
            "warn"
          );
        }
      } else {
        notify("ここでは見本だけ。送るときは、下の「ログインして送る」か「LINE 版で開く」から。", "warn");
      }
      return;
    }

    try {
      const result = await window.liff.shareTargetPicker([message]);
      if (result) {
        // 履歴に残すのは送れたときだけ（送るのをやめた記録が、履歴・次の「前回」に入らないように）
        // いっぱいのときは、いちばん古い記録があふれて消える。消えた記録は、あとで控えを保存できるように覚えておく
        const before = appState.history.slice();
        await saveWorkout(shareableWorkout);
        appState.history = loadWorkoutHistory();
        const kept = new Set(appState.history.map((item) => item.workoutId));
        const dropped = before.filter((item) => !kept.has(item.workoutId));
        renderHistory();
        renderShell();
        // 送った記録は、次に開いたときの「前回の続き」にしない
        sentDraft = JSON.stringify(packWorkoutDraft(appState.workout));
        keepLocalDraft();
        // 送ったあと：続けて別のトークにも・閉じる・もう少し作る（Q キット）
        if (window.LineShareUI && typeof window.LineShareUI.afterSent === "function") {
          window.LineShareUI.afterSent({
            // 「続けて別のトークにも送る」：同じカードを、もう一度送り先を選んで送る。送れたら true
            resend: async function () {
              return Boolean(await window.liff.shareTargetPicker([message]));
            }
          });
        } else {
          notify(seasonal("送りました。"), "info");
        }
        if (dropped.length) {
          const name = [formatShortDate(dropped[0].date), String(dropped[0].title || "").trim()].filter(Boolean).join(" ");
          window.setTimeout(function () {
            if (window.LineShareUI && typeof window.LineShareUI.toast === "function") {
              window.LineShareUI.toast("📦 履歴がいっぱいなので、いちばん古い記録" + (name ? "（" + name + "）" : "") + "を消しました。", {
                actionLabel: "控えを保存",
                onAction: function () {
                  void downloadHistory("", dropped);
                },
                ms: 9000
              });
            }
          }, 600);
        }
      } else {
        notify("送るのをやめました。入れた記録は残っています。", "info");
      }
    } catch (error) {
      console.error("shareTargetPicker failed:", error);
      appState.activeTab = "preview";
      appState.ui.openJsonPreview = isDebugModeEnabled();
      renderShell();
      renderPreview();
      notify(
        isDebugModeEnabled()
          ? "共有でエラーが発生しました。デバッグ用にFlex JSONプレビューへ切り替えています。"
          : "送れませんでした。少し待って、もう一度押してね。",
        "error"
      );
    }
  }

  // 送る記録の写し（新しい ID・タイトル・時刻）を作って返す
  function createShareSnapshot(workout) {
    const now = new Date().toISOString();
    return hydrateWorkout(
      Object.assign({}, workout, {
        workoutId: generateId("workout"),
        title: resolveWorkoutTitle(workout.title, workout.user),
        createdAt: now,
        updatedAt: now
      })
    );
  }

  // 入力の画面（始め方・種目のカード・下の操作）を描きなおす
  function renderInput() {
    const workout = appState.workout;
    if (appState.ui.expandedExerciseId === null) {
      appState.ui.expandedExerciseId = getDefaultExpandedExerciseId(workout.exercises);
    }
    // 並びは「記録の前提 → 主な作業 → 補助的な操作」
    //   1. 見出し（アイコン＋「記録入力」だけ）  2. 始め方（メニュー・履歴から入れる）
    //   3. ワークアウトタイトル（日付は入力した日を自動で使う）  4. 種目とセット  5. サンプル・リセット
    const html = [
      '<div class="input-stack">',
      '  <div class="input-page-head">',
      // アイコンは見出し（ロゴの右）に出す（Q キットの shared/line-me.js）。読めなかったときだけ、ここに前のボタン
      lineMe ? "" : renderSettingsTrigger(),
      '    <h2 class="panel-title">記録入力</h2>',
      "  </div>",
      renderInputStartActions(),
      renderSettingsSheet(),
      renderMenuSheet(),
      '  <section class="ls-panel" aria-label="ワークアウトタイトル">',
      renderField({
        label: "ワークアウトタイトル",
        input:
          '<input class="ls-input" data-field="title" type="text" maxlength="' + TEXT_LIMITS.title + '" placeholder="背中トレ など" value="' +
          escapeHtml(workout.title || "") +
          '" />'
      }),
      "  </section>",
      renderCurrentExerciseIndicator(workout.exercises),
      renderExerciseStack(workout.exercises),
      renderInputUtilityActions(),
      "</div>"
    ].join("");

    elements.tabInput.innerHTML = html;
    updateActionBar();
  }

  // 履歴がいっぱい（10件）のとき：送ると、いちばん古い記録が消えることを、送る前に知らせる（控えのダウンロードへ）。
  // 9件のときは「あと1件でいっぱい」。送れる形になってから出す（入れる前から出すと、うるさいので）。同じ記録を送りなおすとき（履歴の中の記録を置きかえるだけ）は出さない
  function renderHistoryFullNote() {
    const list = appState.history || [];
    if (list.some((item) => item.workoutId === appState.workout.workoutId)) return "";
    if (list.length >= MAX_HISTORY_ITEMS) {
      const oldest = list[list.length - 1] || {};
      const name = [formatShortDate(oldest.date), String(oldest.title || "").trim()].filter(Boolean).join(" ");
      return (
        '<p class="talk-preview-note is-warn history-full-note">履歴は ' + MAX_HISTORY_ITEMS + " 件まで。送ると、いちばん古い記録" +
        (name ? "（" + escapeHtml(name) + "）" : "") +
        'が消えます。<button class="text-link-button" data-action="download-history" type="button">⬇️ 先に控えをダウンロード</button></p>'
      );
    }
    if (list.length === MAX_HISTORY_ITEMS - 1) {
      return '<p class="talk-preview-note history-full-note">履歴はあと1件でいっぱい（' + MAX_HISTORY_ITEMS + " 件まで）。そのあとは、送るたびにいちばん古い記録が消えます。</p>";
    }
    return "";
  }

  // 「2026-10-01」→「10/1」（読めなければ ""）
  function formatShortDate(date) {
    const m = String(date || "").match(/^\d{4}-(\d{2})-(\d{2})$/);
    return m ? Number(m[1]) + "/" + Number(m[2]) : "";
  }

  // 送信プレビュー（送るカードの見本・この記録の集計）を描きなおす。作りかけも端末に残す
  function renderPreview() {
    keepLocalDraft(); // 入力が変わるたびに呼ばれるので、ここで作りかけを端末に残す
    const calculatedWorkout = calculateWorkout(appState.workout);
    const validation = validateWorkout(appState.workout);
    const shareableWorkout = validation.workout;
    const flexMessage = buildWorkoutFlexMessage(appState.workout);
    const bubbles = flexMessage.contents.type === "carousel" ? flexMessage.contents.contents : [flexMessage.contents];

    const isOpen = appState.ui.previewOpen;
    const html = [
      '<div class="preview-stack">',
      // おくるカード(line-share)と同じ、LINE のトーク画面に近い枠
      '  <section class="talk-preview' + (isOpen ? "" : " is-closed") + '" aria-label="送信プレビュー">',
      '    <div class="talk-preview-head" data-disclosure-host>',
      '      <span class="talk-preview-label">送信プレビュー</span>',
      renderDisclosureToggle({ isOpen: isOpen, action: "toggle-preview", title: "送信プレビュー" }),
      "    </div>",
      isOpen ? renderBubbleCarousel(shareableWorkout, bubbles) : "",
      validation.valid
        ? '<p class="talk-preview-note">' +
        (bubbles.length > 1
          ? "カード" + bubbles.length + "枚を横に並べて送ります。横にスクロールして確認できます。"
          : "入力した内容が、そのままこのカードで送られます。") +
        "</p>"
        : '<p class="talk-preview-note is-warn">送る前に：' +
        escapeHtml(validation.errors.join(" ")) +
        "</p>",
      validation.valid ? renderHistoryFullNote() : "",
      "  </section>",
      isOpen ? renderExerciseMetrics(calculatedWorkout) : "",
      isDebugModeEnabled()
        ? '<details class="ls-fold" data-fold="json"' +
        (appState.ui.openJsonPreview ? " open" : "") +
        ">" +
        "  <summary>Flex JSON プレビュー</summary>" +
        '  <div class="ls-fold-body">' +
        '    <p class="ls-hint">デバッグ用のFlex JSON確認です。</p>' +
        '    <pre class="json-preview">' +
        escapeHtml(JSON.stringify(flexMessage, null, 2)) +
        "</pre>" +
        "  </div>" +
        "</details>"
        : "",
      "</div>"
    ].join("");

    elements.tabPreview.innerHTML = html;
    updateActionBar();
  }

  // 履歴の画面（月ごとのまとまり・ダウンロード・10 件までの説明）を描きなおす
  function renderHistory() {
    if (!FEATURE_FLAGS.enableLocalHistory) {
      elements.tabHistory.innerHTML = renderEmpty("⚙️", "localStorage 履歴は無効化されています。js/line-config.js の feature flag で切り替えできます。");
      return;
    }

    if (!appState.history.length) {
      elements.tabHistory.innerHTML = renderEmpty("🕘", "まだ履歴がありません。カードで送ると、ここに出ます（この端末に、新しいものから " + MAX_HISTORY_ITEMS + " 件まで）。");
      return;
    }

    // 月ごと（新しい月が上）にまとめる。日付のない記録は最後に「日付なし」
    const months = [];
    const byMonth = {};
    appState.history.forEach(function (workout) {
      const key = historyMonthKey(workout);
      if (!byMonth[key]) {
        byMonth[key] = [];
        months.push(key);
      }
      byMonth[key].push(workout);
    });
    months.sort(function (a, b) {
      return a === "none" ? 1 : b === "none" ? -1 : b.localeCompare(a);
    });

    const html = [
      '<div class="history-tools">',
      '  <p class="history-tools-count' + (appState.history.length >= MAX_HISTORY_ITEMS - 1 ? " is-warn" : "") + '">' +
        escapeHtml(String(appState.history.length)) + " / " + MAX_HISTORY_ITEMS + "件の記録" +
        (appState.history.length >= MAX_HISTORY_ITEMS ? "（いっぱい。次に送ると、いちばん古い記録が消えます）" : appState.history.length === MAX_HISTORY_ITEMS - 1 ? "（あと1件でいっぱい）" : "") +
        "</p>",
      renderButton({ label: "⬇ 記録をダウンロード", action: "download-history" }),
      "</div>",
      '<p class="ls-hint small history-limit">この端末に残るのは、新しいものから ' + MAX_HISTORY_ITEMS + " 件までです。それより古い記録は消えるので、残したいときは「記録をダウンロード」で控えを。</p>",
      '<div class="ls-folds">',
      months
        .map(function (key, index) {
          const list = byMonth[key];
          const stored = appState.ui.openHistoryMonths[key];
          const isOpen = stored === undefined ? index === 0 : stored;
          return [
            '<details class="ls-fold" data-history-month="' + escapeHtml(key) + '"' + (isOpen ? " open" : "") + ">",
            "  <summary>",
            '    <span class="history-month-title">' + escapeHtml(historyMonthLabel(key)) + "</span>",
            '    <span class="ls-fold-meta">' + escapeHtml(String(list.length)) + "回</span>",
            "  </summary>",
            '  <div class="ls-fold-body">',
            '    <div class="history-stack">' + list.map(renderHistoryCard).join("") + "</div>",
            '    <div class="history-month-tools">',
            renderButton({ label: "⬇ この月をダウンロード", action: "download-history", attrs: { "data-month": key } }),
            "    </div>",
            "  </div>",
            "</details>"
          ].join("");
        })
        .join(""),
      "</div>"
    ].join("");

    elements.tabHistory.innerHTML = html;
  }

  // 記録の月（"2026-10"、日付がなければ "none"）を返す
  function historyMonthKey(workout) {
    const date = String((workout && workout.date) || "");
    return /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : "none";
  }

  // 月の見出し（「2026年10月」「日付なし」）を返す
  function historyMonthLabel(key) {
    return key === "none" ? "日付なし" : Number(key.slice(0, 4)) + "年" + Number(key.slice(5, 7)) + "月";
  }

  // ---- 記録のダウンロード（CSV。Excel・Google スプレッドシートで開ける） ----
  // 1行が1セット。重さ 0 は「自重」、回数 0 は「挑戦」と備考に入れる。
  // LINE の中のブラウザはファイルを保存できないことが多いので、そこでは共有メニュー（ファイル）→ だめならコピー
  function buildHistoryCsv(workouts) {
    // CSV の1つのます目の文字を返す（, " 改行があれば " でかこむ）
    const cell = function (value) {
      const text = value === null || value === undefined ? "" : String(value);
      return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    };
    const rows = [["日付", "タイトル", "種目", "部位", "セット", "重さ(kg)", "回数", "推定RM(kg)", "備考", "メモ"]];
    workouts
      .slice()
      .sort(function (a, b) {
        return String(a.date || "").localeCompare(String(b.date || ""));
      })
      .forEach(function (workout) {
        const title = resolveWorkoutTitle(workout.title, workout.user);
        (workout.exercises || []).forEach(function (exercise) {
          (exercise.sets || []).forEach(function (set, index) {
            const note = Number(set.weight) === 0 ? "自重" : Number(set.reps) === 0 ? "挑戦" : "";
            rows.push([
              workout.date || "",
              title,
              exercise.name || "",
              exercise.primaryMuscle || "",
              index + 1,
              set.weight,
              set.reps,
              Number(set.estimated1rm) > 0 ? set.estimated1rm : "",
              note,
              index === 0 ? exercise.memo || "" : ""
            ]);
          });
        });
      });
    return rows.map(function (row) {
      return row.map(cell).join(",");
    }).join("\r\n");
  }

  // 履歴（month を渡すとその月だけ）を CSV でダウンロードする。LINE 版では共有メニューかコピー
  // only：その記録だけ（送ったときに履歴からあふれた記録の控えなど）
  async function downloadHistory(month, only) {
    const list = only
      ? only
      : month
      ? appState.history.filter(function (workout) {
          return historyMonthKey(workout) === month;
        })
      : appState.history;
    if (!list.length) {
      notify("ダウンロードできる記録がありません。", "warn");
      return;
    }
    const csv = buildHistoryCsv(list);
    const stamp = month && month !== "none" ? month : getTodayLocalDate();
    const name = "kiloq-records-" + stamp + ".csv";
    const file = new File(["\uFEFF" + csv], name, { type: "text/csv" }); // 先頭の BOM で Excel でも文字化けしない
    const env = getLiffEnvironment();

    if (env.inClient) {
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: name });
          notify("記録を共有メニューに渡しました（ファイルに保存できます）。", "info");
          return;
        }
      } catch (error) {
        if (error && error.name === "AbortError") return;
      }
      try {
        await navigator.clipboard.writeText(csv);
        notify("LINE 版ではファイルに保存できないので、記録（CSV）をコピーしました。メモやスプレッドシートに貼ってね。", "info");
      } catch (error) {
        notify("ダウンロードできませんでした。ブラウザで開くと保存できます。", "warn");
      }
      return;
    }

    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // 少しあとで、ダウンロードに使った中身を手放す
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
    notify(name + " をダウンロードしました。", "info");
  }

  // ランキング（デバッグ用）の画面を描きなおす
  function renderRanking() {
    if (!isRankingEnabled() || !elements.tabRanking) {
      return;
    }

    if (!appState.rankingData) {
      elements.tabRanking.innerHTML = renderEmpty("⏳", "ランキングを読み込み中です。");
      return;
    }

    const periodData = appState.rankingData[appState.rankingPeriod];
    const html = [
      '<section class="ls-panel">',
      '  <div class="ls-panel-head">',
      '    <p class="section-label">Ranking Mock</p>',
      '    <h2 class="ls-panel-title">ランキングタブ</h2>',
      '    <p class="ls-hint">初期実装はモック表示です。将来は API アダプタへ差し替えできます。</p>',
      "  </div>",
      '  <div class="ls-chips">',
      [
        { period: "week", label: "今週" },
        { period: "month", label: "今月" }
      ]
        .map(function (item) {
          return renderChip({
            label: item.label,
            action: "change-ranking-period",
            pressed: appState.rankingPeriod === item.period,
            attrs: { "data-period": item.period }
          });
        })
        .join(""),
      "  </div>",
      '  <div class="ranking-grid">',
      renderRankingCard("推定1RMランキング", periodData.estimated1rm, "kg"),
      renderRankingCard("総ボリュームランキング", periodData.totalVolume, "kg"),
      "  </div>",
      "</section>"
    ].join("");

    elements.tabRanking.innerHTML = html;
  }

  // ランキングを返す（いまはモック）
  async function getRanking() {
    if (FEATURE_FLAGS.enableApiAdapter) {
      return ApiWorkoutRepository.getRanking({
        groupKey: resolveGroupKey(),
        period: appState.rankingPeriod
      });
    }

    if (FEATURE_FLAGS.enableStatsMock) {
      return mockRanking({
        groupKey: resolveGroupKey()
      });
    }

    return {
      week: {
        estimated1rm: [],
        totalVolume: []
      },
      month: {
        estimated1rm: [],
        totalVolume: []
      }
    };
  }

  // 画面のボタンを押したとき：data-action の名前から、CLICK_ACTIONS の処理を呼ぶ
  function handleClick(event) {
    const button = event.target.closest("button");
    if (!button) {
      // シートの外側（暗いところ）を押したら閉じる
      const sheetClose = event.target.getAttribute && event.target.getAttribute("data-sheet-close");
      if (sheetClose && CLICK_ACTIONS[sheetClose]) {
        CLICK_ACTIONS[sheetClose]({}, event.target);
        return;
      }
      // 開閉できる見出しは、▾ だけでなく行のどこを押しても開閉する
      const host = event.target.closest("[data-disclosure-host]");
      const toggle = host && !event.target.closest("input, textarea, select, label, a")
        ? host.querySelector(".disclosure-toggle")
        : null;
      if (toggle) {
        toggle.click();
      }
      return;
    }

    if (button.parentElement === elements.tabNav) {
      setActiveTab(button.getAttribute("data-tab"));
      return;
    }

    if (button === elements.copyJsonButton) {
      void copyCurrentFlexJson();
      return;
    }

    if (button === elements.shareButton) {
      void shareWorkout(appState.workout);
      return;
    }

    const handler = CLICK_ACTIONS[button.getAttribute("data-action")];
    if (handler) {
      handler(button.dataset, button);
    }
  }

  // data-action の名前 → 押したときの処理（data-* の値は dataset で受け取る）
  const CLICK_ACTIONS = {
    "line-login": function () {
      startLineLogin();
    },
    "step-set": function (data, button) {
      stepSetValue(button);
    },
    "toggle-preview": function () {
      appState.ui.previewOpen = !appState.ui.previewOpen;
      savePreviewOpen(appState.ui.previewOpen);
      renderPreview();
    },
    "jump-to-current-exercise": function (data) {
      scrollToExerciseCard(data.exerciseId);
    },
    "open-history-input": function () {
      setActiveTab("history");
    },
    "open-menu-modal": function () {
      openMenuModal();
    },
    "close-menu-modal": function () {
      appState.ui.menuModalOpen = false;
      renderInput();
    },
    "save-menu": function () {
      saveCurrentAsMenu();
    },
    "apply-menu": function (data) {
      applyMenu(data.menuId);
    },
    "delete-menu": function (data) {
      deleteMenu(data.menuId);
    },
    "sample-workout": function () {
      applySampleWorkout();
    },
    "reset-workout": function () {
      resetWorkout();
    },
    // 「✏️ 新しく」：空の記録からはじめる（入れていた種目があれば「元に戻す」で戻せる）
    "new-workout": function () {
      replaceWorkout(createEmptyWorkout(), "新しい記録をはじめます。");
    },
    "remove-exercise": function (data) {
      removeExercise(data.exerciseId);
    },
    "add-set": function (data) {
      addSet(data.exerciseId);
    },
    "remove-set": function (data) {
      removeSet(data.exerciseId, data.setId);
    },
    "download-history": function (data) {
      void downloadHistory(data.month || "");
    },
    "restore-history": function (data) {
      restoreWorkout(data.workoutId);
    },
    "delete-history": function (data) {
      deleteHistory(data.workoutId);
    },
    "toggle-history-card": function (data) {
      toggleHistoryCard(data.workoutId);
    },
    "change-ranking-period": function (data) {
      changeRankingPeriod(data.period);
    },
    "insert-exercise-after": function (data) {
      insertExerciseAfter(data.afterExerciseId, data.catalogId);
    },
    "set-exercise-muscle": function (data) {
      updateExerciseSelectionMuscle(data.exerciseId, data.muscle || "");
    },
    "choose-exercise-card": function (data) {
      chooseExerciseCatalog(data.exerciseId, data.catalogId);
    },
    "start-custom-exercise": function (data) {
      startCustomExercise(data.exerciseId);
    },
    "toggle-exercise-panel": function (data) {
      toggleExercisePanel(data.exerciseId);
    },
    "toggle-exercise-memo": function (data) {
      toggleExerciseMemo(data.exerciseId);
    },
    "open-settings-modal": function () {
      openSettingsSheet();
    },
    "close-settings-modal": function () {
      appState.ui.settingsModalOpen = false;
      renderInput();
    },
    "reset-theme": function () {
      resetTheme();
      renderInput();
      renderPreview();
    },
    // 週のはじまり（月曜・日曜）。Q 共通の設定なので、同じ端末のつづく・くるかな・BabyQ にもそろう
    "set-week-start": function (data) {
      setWeekStart(Number(data.weekStart));
      renderInput();
      showLatestWeeks();
    }
  };

  // 入力欄が変わったとき：タイトル・種目・重さ・回数・メモなどを入力中の記録に入れる
  function handleInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    // メニューの名前は入力中に描き直さない（カーソルが飛ばないように）
    if (target.hasAttribute("data-menu-field")) {
      appState.ui.menuName = target.value;
      return;
    }

    if (target.hasAttribute("data-field")) {
      const field = target.getAttribute("data-field");
      appState.workout[field] = target.value;
      touchWorkout();
      renderPreview();
      renderShell();
      return;
    }

    if (target.hasAttribute("data-theme-field")) {
      const field = target.getAttribute("data-theme-field");
      if (field === "baseColor") {
        const nextColor = normalizeHexColor(target.value);
        if (!nextColor) {
          return;
        }
        updateTheme(nextColor);
        renderInput();
        renderPreview();
      }
      return;
    }

    if (target.hasAttribute("data-exercise-field")) {
      const exerciseId = target.getAttribute("data-exercise-id");
      const field = target.getAttribute("data-exercise-field");
      const exercise = findExercise(exerciseId);
      if (!exercise) {
        return;
      }
      exercise[field] = target.value;
      touchWorkout();
      renderPreview();
      return;
    }


    if (target.hasAttribute("data-set-field")) {
      const exerciseId = target.getAttribute("data-exercise-id");
      const setId = target.getAttribute("data-set-id");
      const field = target.getAttribute("data-set-field");
      const exercise = findExercise(exerciseId);
      if (!exercise) {
        return;
      }
      const set = exercise.sets.find(function (item) {
        return item.setId === setId;
      });
      if (!set) {
        return;
      }
      set[field] = target.value;
      touchWorkout();
      syncRenderedSetSummary(exerciseId);
      renderPreview();
    }
  }

  // 画面の外わく（タブ・見出し・送る帯・シート）を描きなおす
  function renderShell() {
    if (!isRankingEnabled() && appState.activeTab === "ranking") {
      appState.activeTab = "input";
    }

    renderTabButtonLabels();

    // 送信プレビューは「入力」の一部として扱う
    const navTab = appState.activeTab === "preview" ? "input" : appState.activeTab;
    elements.tabButtons.forEach(function (button) {
      button.setAttribute("aria-selected", String(button.getAttribute("data-tab") === navTab));
    });

    if (elements.tabRankingButton) {
      elements.tabRankingButton.hidden = !isRankingEnabled();
    }

    setPanelVisibility("input", elements.tabInput);
    setPanelVisibility("preview", elements.tabPreview);
    setPanelVisibility("history", elements.tabHistory);
    if (isRankingEnabled()) {
      setPanelVisibility("ranking", elements.tabRanking);
    } else if (elements.tabRanking) {
      elements.tabRanking.hidden = true;
    }
    updateActionBar();
  }

  // タブの名前と、その下の小さな字（件数など）を描きなおす
  function renderTabButtonLabels() {
    if (!elements.tabButtons || !elements.tabButtons.length) {
      return;
    }

    elements.tabButtons.forEach(function (button) {
      const tab = button.getAttribute("data-tab");
      if (tab === "input") {
        button.innerHTML = renderTabButtonLabel("入力", "");
      } else if (tab === "history") {
        // いっぱいに近い（あと1件・いっぱい）ときは「10/10件」をオレンジに
        const near = appState.history.length >= MAX_HISTORY_ITEMS - 1;
        button.innerHTML = renderTabButtonLabel("履歴", near ? appState.history.length + "/" + MAX_HISTORY_ITEMS + "件" : String(appState.history.length) + "件", near);
      } else if (tab === "ranking") {
        button.innerHTML = renderTabButtonLabel("ランキング", "");
      }
    });
  }

  // タブの名前（大きな字と下の小さな字）の HTML を返す
  function renderTabButtonLabel(main, sub, warn) {
    return '<span class="tab-main">' + escapeHtml(main) + '</span><span class="tab-sub' + (warn ? " is-warn" : "") + '">' + escapeHtml(sub || "") + "</span>";
  }

  // タブ → 描く関数・パネルの要素（知らないタブは入力）
  const TAB_RENDERERS = {
    input: renderInput,
    preview: renderPreview,
    history: renderHistory,
    ranking: renderRanking
  };

  // 開いているタブの画面を描きなおす
  function renderActiveTab() {
    (TAB_RENDERERS[appState.activeTab] || renderInput)();
  }

  // タブの名前から、その画面の部品を返す
  function getPanelElement(tab) {
    const panels = {
      input: elements.tabInput,
      preview: elements.tabPreview,
      history: elements.tabHistory,
      ranking: elements.tabRanking
    };
    return panels[tab] || elements.tabInput;
  }

  // 知らせは Q キットのトースト（送る帯の上に数秒）。気をつけてほしいもの（warn・error）は長めに出す。
  // undo を渡すと「元に戻す」ボタンが付く。ui.js が読めないときは、ページの下の文字で知らせる
  const NOTICE_MS = { info: 3000, warn: 8000, error: 8000 };

  // トーストで知らせる（undo を渡すと「元に戻す」つき）。Q キットがないときは画面の上の欄に
  function notify(message, type, undo) {
    const ms = undo ? 6000 : NOTICE_MS[type] || NOTICE_MS.info;
    if (window.LineShareUI && typeof window.LineShareUI.toast === "function") {
      window.LineShareUI.toast(message, undo ? { actionLabel: "元に戻す", onAction: undo, ms: ms } : { ms: ms });
      return;
    }
    const box = elements.statusFallback;
    box.textContent = message;
    box.hidden = false;
    window.clearTimeout(notify.timerId);
    notify.timerId = window.setTimeout(function () {
      box.hidden = true;
    }, ms);
  }

  // タブを切りかえて、その画面まで動かす
  function setActiveTab(tab) {
    if (tab === "ranking" && !isRankingEnabled()) {
      appState.activeTab = "input";
      renderActiveTab();
      renderShell();
      scrollToPanel("input");
      return;
    }
    appState.activeTab = tab;
    if (tab !== "preview") {
      appState.ui.openJsonPreview = false;
    }
    appState.ui.suppressScrollSpyUntil = Date.now() + 900;
    renderActiveTab();
    renderShell();
    scrollToPanel(tab);
  }

  // タブの画面を出す（ランキングはデバッグのときだけ）
  function setPanelVisibility(tabName, element) {
    if (!element) {
      return;
    }
    const shouldShow = tabName === "ranking" ? isRankingEnabled() : true;
    element.hidden = !shouldShow;
  }

  // 下の送る帯（送るボタン・デバッグのコピー・ブラウザ版の案内）を描きなおす
  function updateActionBar() {
    if (!elements.actionBar || !elements.shareButton || !elements.copyJsonButton) {
      return;
    }

    renderLineHelp();

    elements.copyJsonButton.hidden = !isDebugModeEnabled();
    elements.copyJsonButton.textContent = appState.liff.shareAvailable
      ? "Flex JSONコピー"
      : "デバッグコピー";
  }

  // ---- ブラウザ版：送れる環境（ログイン・LINE 版）へ移る導線 ----
  const DRAFT_KEY = "kiloq:carry-draft";

  // 入力中の記録を、URL に入れる文字（base64url）にして返す。種目がなければ ""
  function encodedDraft() {
    const draft = packWorkoutDraft(appState.workout);
    return draft ? encodeBase64Url(JSON.stringify(draft)) : "";
  }

  // 送り先選びが使えないとき（LIFF の準備ができてからだけ）、送るボタンの上に案内を出す
  function renderLineHelp() {
    if (!elements.lineHelp) {
      return;
    }
    const show = appState.liff.initialized && !appState.liff.shareAvailable && !isDebugModeEnabled();
    elements.lineHelp.hidden = !show;
    // 送れないときは「カードで送る」を出さない（押しても送れないので、案内のログイン／LINE 版だけにする）
    elements.shareButton.hidden = show;
    if (!show) {
      return;
    }
    const env = getLiffEnvironment();
    // LINE アプリの中で使えないときはログインでは直らないので、ログインのボタンは出さない
    elements.lineLoginButton.hidden = !appState.liff.ready || env.inClient || env.loggedIn;
    const appUrl = buildLineAppUrl(encodedDraft());
    elements.lineAppLink.hidden = !appUrl || env.inClient;
    elements.lineAppLink.href = appUrl || "#";
  }

  // 🔑 ログインして送る：入力をこのブラウザに残してから、LINE のログインへ
  function startLineLogin() {
    // ログインの行き来で入力が消えないよう、このブラウザに一時的に残す
    try {
      const draft = encodedDraft();
      if (draft) sessionStorage.setItem(DRAFT_KEY, draft);
    } catch (error) {
      console.warn("Failed to keep draft:", error);
    }
    if (!loginWithLine()) {
      notify("ログインを始められませんでした。少し待って、もう一度押してね。", "warn");
    }
  }

  // URL の ?name= を読んで、URL からは消す（開きなおしても、もう一度入れない）。なければ null
  function takeUrlParam(name) {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(name)) {
      return null;
    }
    const value = url.searchParams.get(name) || "";
    url.searchParams.delete(name);
    history.replaceState(null, "", url);
    return value;
  }

  // 送られたカードの「同じメニューでやる」（?menu=）。リンクがあったら true（読めなかったときも、その知らせを残すため）。
  // 入れたときは、前の入力を「元に戻す」で戻せる
  function takeSharedMenu() {
    const raw = takeUrlParam("menu");
    if (raw === null) {
      return false;
    }
    const workout = readPackedWorkout(raw, 4000);
    if (!workout) {
      notify("メニューのリンクが読めませんでした（途中で切れていないか確かめてね）。", "warn");
      return true;
    }
    replaceWorkout(workout, "送られたメニューを入れました。重さ・回数は自分に合わせて直してね。");
    return true;
  }

  // ?draft=（LINE アプリで開いたとき）か、ログイン前にこのブラウザに残した記録を、入力に戻す。戻したら true
  function restoreCarriedDraft() {
    if (takeSharedMenu()) {
      return true;
    }
    let raw = takeUrlParam("draft") || "";
    try {
      raw = raw || sessionStorage.getItem(DRAFT_KEY) || "";
      sessionStorage.removeItem(DRAFT_KEY);
    } catch (error) {
      // このブラウザに残せない端末は、?draft= だけ
    }
    const workout = readPackedWorkout(raw);
    if (!workout) {
      return false;
    }
    setWorkout(workout);
    notify("入力していた記録を戻しました。", "info");
    return true;
  }

  // ---- 作りかけ（送る前の記録）を端末に残し、次に開いたら続きから ----
  // 送り終えた記録は残さない（sentDraft と同じ中身のあいだは消しておく）
  let sentDraft = "";

  // 作りかけの記録を端末に残す（送り終えた記録・空のときは消す）
  function keepLocalDraft() {
    const draft = packWorkoutDraft(appState.workout);
    const text = draft ? JSON.stringify(draft) : "";
    try {
      if (!text || text === sentDraft) window.localStorage.removeItem(STORAGE_KEYS.draft);
      else window.localStorage.setItem(STORAGE_KEYS.draft, text);
    } catch (error) {
      // 残せなくても使える
    }
  }

  // 前回の作りかけがあれば入れる（入れたら true）
  function restoreLocalDraft() {
    try {
      const workout = unpackWorkoutDraft(JSON.parse(window.localStorage.getItem(STORAGE_KEYS.draft) || "null"));
      if (!workout) {
        return false;
      }
      setWorkout(workout);
      return true;
    } catch (error) {
      return false;
    }
  }

  // 「前回の続きから開きました［新しく作る］」（新しく作っても「元に戻す」で戻せる）
  function showResumed() {
    if (!window.LineShareUI || typeof window.LineShareUI.toast !== "function") {
      return;
    }
    window.LineShareUI.toast("前回の続きから開きました", {
      actionLabel: "新しく作る",
      ms: 8000,
      // 「新しく作る」：空の記録にする（「元に戻す」で戻せる）
      onAction: function () {
        replaceWorkout(createEmptyWorkout(), "新しく作りはじめました。");
      }
    });
  }

  // タブの画面のいちばん上まで動かす
  function scrollToPanel(tab) {
    const panel = getPanelElement(tab);
    if (!panel || panel.hidden || typeof panel.scrollIntoView !== "function") {
      return;
    }
    appState.ui.suppressScrollSpyUntil = Date.now() + 900;
    window.requestAnimationFrame(function () {
      panel.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }

  // 種目のカードまで動かす（見つからなければ入力の画面の上へ）
  function scrollToExerciseCard(exerciseId) {
    if (!exerciseId) {
      scrollToPanel("input");
      return;
    }

    appState.ui.suppressScrollSpyUntil = Date.now() + 900;
    window.requestAnimationFrame(function () {
      const target = document.querySelector(
        '[data-exercise-card-id="' + cssEscape(exerciseId) + '"]'
      );
      if (!target || typeof target.scrollIntoView !== "function") {
        scrollToPanel("input");
        return;
      }
      target.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }

  // スクロールした位置に合わせて、タブの選んでいる印を動かす
  function syncActiveTabToScroll() {
    if (Date.now() < Number(appState.ui.suppressScrollSpyUntil || 0)) {
      return;
    }

    const candidates = [
      { tab: "input", element: elements.tabPreview },
      { tab: "input", element: elements.tabInput },
      { tab: "history", element: elements.tabHistory }
    ].filter(function (item) {
      return item.element && !item.element.hidden;
    });

    if (!candidates.length) {
      return;
    }

    const threshold = 128;
    let active = candidates[0].tab;
    let bestDistance = Number.POSITIVE_INFINITY;

    candidates.forEach(function (item) {
      const rect = item.element.getBoundingClientRect();
      const distance = Math.abs(rect.top - threshold);
      if (rect.top <= threshold && distance <= bestDistance) {
        bestDistance = distance;
        active = item.tab;
      } else if (bestDistance === Number.POSITIVE_INFINITY && distance < bestDistance) {
        bestDistance = distance;
        active = item.tab;
      }
    });

    if (active !== appState.activeTab) {
      appState.activeTab = active;
      renderShell();
    }
  }

  // 記録の名前（LINE の名前と写真）を入れる。タイトルが空なら初めのタイトルに
  function syncWorkoutUser() {
    appState.workout.user = Object.assign({}, DEFAULT_USER, appState.liff.profile || {});
    if (!String(appState.workout.title || "").trim()) {
      appState.workout.title = getDefaultWorkoutTitle(appState.workout.user);
    }
    appState.workout.groupKey = resolveGroupKey();
    touchWorkout(false);
  }

  // グループ・トークの ID（ランキング用）を返す。わからなければ初めの値
  function resolveGroupKey() {
    const context = appState.liff.context || safelyGetLiffContext() || {};
    return context.groupId || context.roomId || APP_CONFIG.DEFAULT_GROUP_KEY || null;
  }

  // 入力が変わったとき：日付を今日にし、更新の時刻を入れる（renewWorkoutId なら ID も新しく）
  function touchWorkout(renewWorkoutId) {
    // 日付は手入力させず、記録を入力した日をそのまま使う
    appState.workout.date = getTodayLocalDate();
    appState.workout = calculateWorkout(appState.workout);
    if (renewWorkoutId !== false) {
      appState.workout.workoutId = appState.workout.workoutId || generateId("workout");
    }
    appState.workout.updatedAt = new Date().toISOString();
    appState.ui.openJsonPreview = false;
  }

  // 送る記録にする（名前のない種目・入っていないセットを外す）
  function sanitizeWorkout(workout) {
    return sanitizeWorkoutModel(workout, resolveGroupKey);
  }

  // 種目のカード1つ（番号・名前・まとめ・開いたときの入力欄）の HTML を返す
  function renderExerciseCard(exercise, exerciseIndex) {
    const showExerciseFields = Boolean(exercise.catalogId || exercise.isCustom);
    const exerciseTitle = exercise.name
      ? exercise.name
      : exercise.isCustom
        ? "種目名を入力"
        : "種目を選択";
    const isExpanded = !showExerciseFields || isExerciseExpanded(exercise.exerciseId);
    const summary = showExerciseFields ? renderExerciseSummary(exercise) : "";
    const canRemoveExercise = appState.workout.exercises.length > 1;

    return [
      '<section class="exercise-card" data-exercise-card-id="' +
        escapeHtml(exercise.exerciseId) +
        '">',
      '  <div class="exercise-header" data-disclosure-host>',
      '    <div class="exercise-heading">',
      '      <p class="section-label">エクササイズ ' + (exerciseIndex + 1) + "</p>",
      '      <h3 class="exercise-title">' + escapeHtml(exerciseTitle) + "</h3>",
      summary ? '      <p class="exercise-meta">' + escapeHtml(summary) + "</p>" : "",
      "    </div>",
      '    <div class="exercise-actions">' +
        (showExerciseFields
          ? renderDisclosureToggle({
              isOpen: isExpanded,
              action: "toggle-exercise-panel",
              title: "種目",
              attrs: {
                "data-exercise-id": exercise.exerciseId
              }
            })
          : "") +
        renderButton({
          label: "消す",
          className: "is-danger delete-pill",
          action: "remove-exercise",
          title: "種目を消す",
          disabled: !canRemoveExercise,
          attrs: {
            "data-exercise-id": exercise.exerciseId
          }
        }) +
        "</div>",
      "  </div>",
      '  <div class="exercise-body">',
      !showExerciseFields
        ? renderExercisePicker(exercise)
        : renderSelectedExerciseFields(exercise, isExpanded),
      "  </div>",
      "</section>"
    ].join("");
  }

  // 種目のカードのならび（あいだの「＋ 種目を足す」もふくむ）の HTML を返す
  function renderExerciseStack(exercises) {
    return (
      exercises
      .map(function (exercise, exerciseIndex) {
        return renderExerciseCard(exercise, exerciseIndex);
      })
      .join("") +
      renderExerciseTailAddButton()
    );
  }

  // 種目追加は親指で押しやすい横幅いっぱいのボタン（いちばん下の種目のうしろに足す）
  function renderExerciseTailAddButton() {
    const exercises = appState.workout.exercises;
    return renderButton({
      label: "+ 種目追加",
      className: "is-block tail-add-button",
      action: "insert-exercise-after",
      attrs: { "data-after-exercise-id": exercises.length ? exercises[exercises.length - 1].exerciseId : "" }
    });
  }

  // 開いた種目のカードの中身（部位と種目えらび・セットの行・メモ）の HTML を返す
  function renderSelectedExerciseFields(exercise, isExpanded) {
    if (!isExpanded) {
      return "";
    }

    return [
      '<div class="exercise-content-shell">',
      exercise.isCustom
        ? renderField({
            label: "種目名",
            input:
              '<input class="ls-input" data-exercise-field="name" data-exercise-id="' +
              escapeHtml(exercise.exerciseId) +
              '" type="text" maxlength="' +
              TEXT_LIMITS.name +
              '" placeholder="ベンチプレス / スクワット など" value="' +
              escapeHtml(exercise.name || "") +
              '" enterkeyhint="done" />' +
              // セットを入れたのに名前がないとき：欄のすぐ下に赤い字で（送る前に気づけるように）
              (!(exercise.name || "").trim() && (exercise.sets || []).some(isFilledSet)
                ? '<p class="ls-hint is-error">種目名を入れると送れます</p>'
                : "")
          })
        : "",
      '    <div class="sets-stack">',
      (exercise.sets || [])
        .map(function (set, setIndex) {
          return renderSetRow(exercise, set, setIndex);
        })
        .join(""),
      "    </div>",
      '    <div class="exercise-inline-actions">',
      renderButton({
        label: "+ セット追加",
        className: "add-set-button",
        action: "add-set",
        attrs: { "data-exercise-id": exercise.exerciseId }
      }),
      renderButton({
        label: getExerciseMemoButtonLabel(exercise),
        className: "memo-toggle-button",
        action: "toggle-exercise-memo",
        title: "種目メモ",
        attrs: {
          "data-exercise-id": exercise.exerciseId
        }
      }),
      "    </div>",
      renderExerciseMemoField(exercise),
      "</div>"
    ].join("");
  }

  // 1セット分の行。スマホで押しやすいよう2段にし、kg・回数は −／＋ でも変えられる
  //   上段: 何セット目・推定RM・消す  下段: kg と回数
  function renderSetRow(exercise, set, setIndex) {
    const exerciseId = exercise.exerciseId;
    const canRemoveSet = exercise.sets.length > 1;
    const ids =
      'data-exercise-id="' + escapeHtml(exerciseId) + '" data-set-id="' + escapeHtml(set.setId) + '"';
    return [
      '<div class="set-row">',
      '  <div class="set-row-head">',
      '    <span class="set-badge">' + (setIndex + 1) + "セット目</span>",
      '    <div class="set-head-meta' +
        (isMaxRmSet(exercise, set) ? " is-max-rm" : "") +
        '" data-set-meta="estimated1rm" ' +
        ids +
        '><small class="metric-label">推定RM</small><strong class="metric-value" data-set-summary="estimated1rm" ' +
        ids +
        ">" +
        escapeHtml(hasEstimated1rm(set) ? formatLocaleMetric(set.estimated1rm, "kg", 1) : "-") +
        "</strong></div>",
      renderButton({
        label: "消す",
        className: "is-danger delete-pill",
        action: "remove-set",
        title: "このセットを消す",
        disabled: !canRemoveSet,
        attrs: {
          "data-exercise-id": exerciseId,
          "data-set-id": set.setId
        }
      }),
      "  </div>",
      '  <div class="set-row-inputs">',
      renderSetStepper({ field: "weight", unit: "kg", step: 2.5, inputmode: "decimal", inputStep: "0.5", value: set.weight, ids: ids }),
      renderSetStepper({ field: "reps", unit: "回", step: 1, inputmode: "numeric", inputStep: "1", value: set.reps, ids: ids }),
      "  </div>",
      "</div>"
    ].join("");
  }

  // 数値入力の左右に −／＋。押すと入力欄の値を変えて input イベントを出すので、手入力と同じ処理で反映される
  function renderSetStepper(options) {
    const label = options.unit === "kg" ? "重さ" : "回数";
    return [
      '<div class="set-stepper">',
      '  <button class="stepper-button" data-action="step-set" data-set-field="' +
        options.field +
        '" data-step="' +
        -options.step +
        '" type="button" aria-label="' +
        label +
        "を" +
        options.step +
        '減らす">−</button>',
      '  <label class="stepper-field">',
      '    <input class="stepper-input" aria-label="' +
        label +
        "（" +
        options.unit +
        '）" data-set-field="' +
        options.field +
        '" ' +
        options.ids +
        ' type="number" inputmode="' +
        options.inputmode +
        '" step="' +
        options.inputStep +
        '" min="0" placeholder="0" value="' +
        escapeHtml(String(options.value ?? "")) +
        '" />',
      '    <span class="stepper-unit">' + options.unit + "</span>",
      "  </label>",
      '  <button class="stepper-button" data-action="step-set" data-set-field="' +
        options.field +
        '" data-step="' +
        options.step +
        '" type="button" aria-label="' +
        label +
        "を" +
        options.step +
        '増やす">＋</button>',
      "</div>"
    ].join("");
  }

  // セットの − ／ ＋ を押したとき、重さ・回数を1目もり動かす
  function stepSetValue(button) {
    const row = button.closest(".set-row");
    const field = button.getAttribute("data-set-field");
    const input = row && row.querySelector('input[data-set-field="' + field + '"]');
    if (!input) {
      return;
    }
    const step = Number(button.getAttribute("data-step")) || 0;
    const next = Math.max(0, (Number(input.value) || 0) + step);
    // 重さは 0.5kg 刻み、回数は整数にそろえる
    input.value = String(field === "reps" ? Math.round(next) : Math.round(next * 2) / 2);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // 種目のまとめ（セットの数・推定1RM）だけを描きなおす（入力中は全体を描きなおさない）
  function syncRenderedSetSummary(exerciseId) {
    const exercise = findExercise(exerciseId);
    if (!exercise) {
      return;
    }

    (exercise.sets || []).forEach(function (set) {
      const ids = '[data-exercise-id="' + cssEscape(exerciseId) + '"][data-set-id="' + cssEscape(set.setId) + '"]';
      const summaryNode = document.querySelector('[data-set-summary="estimated1rm"]' + ids);
      const metaNode = document.querySelector('[data-set-meta="estimated1rm"]' + ids);
      if (!summaryNode || !metaNode) {
        return;
      }
      summaryNode.textContent = hasEstimated1rm(set) ? formatLocaleMetric(set.estimated1rm, "kg", 1) : "-";
      metaNode.classList.toggle("is-max-rm", isMaxRmSet(exercise, set));
    });
  }

  // この記録の集計（種目ごとのセット・ボリューム・推定1RM）の HTML を返す
  function renderExerciseMetrics(workout) {
    const previewExercises = getNamedExercises(workout);

    if (!previewExercises.length) {
      return "";
    }

    // 入力欄までの距離が伸びないよう、集計は開閉にする（ふだんは閉じておく。開け閉めは rememberFoldState が覚える）
    return [
      '<details class="ls-fold" data-fold="metrics"' + (appState.ui.metricsOpen ? " open" : "") + ">",
      '  <summary><span class="ls-fold-icon" aria-hidden="true">📊</span>この記録の集計',
      '    <span class="ls-fold-meta">' + escapeHtml(String(previewExercises.length)) + "種目</span>",
      "  </summary>",
      '  <div class="ls-fold-body stats-list">' + previewExercises.map(renderExerciseStatCard).join("") + "</div>",
      "</details>"
    ].join("");
  }

  // 始め方：保存したメニュー（とおすすめ）か、履歴から入れる。スマホでも詰まらないよう見出しとは別の行に、等幅で並べる
  // （履歴がなければメニューだけを1列で）
  // 入力の始め方は3つ：新しく（空から）・メニューから（保存した組み合わせ）・履歴から（前に送った記録）。履歴がまだなければ2つ
  function renderInputStartActions() {
    const buttons = [
      renderStartButton({ icon: "✏️", label: "新しく", sub: "空から入れる", action: "new-workout" }),
      renderStartButton({ icon: "📋", label: "メニュー", sub: "保存したもの", action: "open-menu-modal" })
    ];
    if (appState.history.length) {
      buttons.push(renderStartButton({ icon: "🕘", label: "履歴から", sub: "前の記録を使う", action: "open-history-input" }));
    }
    return '<div class="input-start-row is-' + buttons.length + '" role="group" aria-label="入力の始め方">' + buttons.join("") + "</div>";
  }

  // 入力の画面のいちばん下の小さな操作（サンプル・リセット）の HTML を返す
  function renderInputUtilityActions() {
    return [
      // 補助的な操作は一番下に小さく（「履歴から始める」は見出しの横へ移した）
      '<div class="input-utility-row">',
      '  <button class="text-link-button" data-action="sample-workout" type="button">サンプルを入れる</button>',
      "</div>"
    ].join("");
  }

  // 見出しの右の表示設定のボタン（LINE の写真か頭文字）の HTML を返す
  function renderSettingsTrigger() {
    const profile = appState.liff.profile || DEFAULT_USER;
    const avatar = profile.pictureUrl
      ? '<img class="user-avatar-image" src="' + escapeHtml(profile.pictureUrl) + '" alt="" />'
      : '<span class="user-avatar-fallback">' + escapeHtml(getUserInitial(profile.displayName)) + "</span>";
    return [
      '<button class="user-avatar-button" data-action="open-settings-modal" type="button" aria-label="記録の草グラフと表示設定を開く" title="表示設定">',
      '  <span class="user-avatar">' + avatar + "</span>",
      "</button>"
    ].join("");
  }

  // 「あなたの記録」と設定のシートを開く（見出しのアイコン・前のボタンから）
  function openSettingsSheet() {
    appState.ui.settingsModalOpen = true;
    renderInput();
    showLatestWeeks();
  }

  // 名前のある LINE のプロフィールか（名前なし・anonymous でない）
  function isNamed(profile) {
    const name = profile ? String(profile.displayName || "").trim().toLowerCase() : "";
    return !!name && name !== "anonymous";
  }

  // シートのいちばん上：だれでログインしているか・LINE 版とブラウザ版の記録のちがい（つづく・しょくじと同じ言葉。shared/line-me.js の describe）
  function renderLoginRows() {
    if (!lineMe || !window.QLineMe) return "";
    const rows = window.QLineMe.describe(
      Object.assign({}, lineMe.status(), { bot: false, moveHint: "ページの下の「💾 この端末の記録をバックアップ」でうつせます" })
    );
    return (
      '<ul class="login-rows">' +
      rows.map((row) => '<li><span aria-hidden="true">' + escapeHtml(row.icon) + "</span><span>" + escapeHtml(row.text) + "</span></li>").join("") +
      "</ul>"
    );
  }

  // 表示設定のシート（草グラフ・週のはじまり・色）の HTML を返す。閉じているときは ""
  function renderSettingsSheet() {
    if (!appState.ui.settingsModalOpen) {
      return "";
    }
    const color = escapeHtml(appState.theme.baseColor || DEFAULT_THEME.baseColor);
    return renderSheet({
      label: "あなたの記録と表示設定",
      title: "あなたの記録",
      closeAction: "close-settings-modal",
      body: [
        renderLoginRows(),
        renderGrass(),
        renderWeekStartField(),
        '<h4 class="sheet-subtitle">表示設定</h4>',
        '<p class="ls-hint">アプリと送信プレビューの基調色を変更できます。</p>',
        '<div class="settings-color-row">',
        renderField({
          label: "ベースカラー",
          input: '<input class="color-input" data-theme-field="baseColor" type="color" value="' + color + '" />'
        }),
        renderField({
          label: "HEX",
          input:
            '<input class="ls-input" data-theme-field="baseColor" type="text" inputmode="text" value="' +
            color +
            '" placeholder="#C96A2D" />'
        }),
        "</div>",
        '<div class="settings-actions">',
        renderButton({ label: "初期色に戻す", className: "is-danger", action: "reset-theme" }),
        "</div>"
      ].join("")
    });
  }

  // ---- 週のはじまり（Q 共通の設定。q-oqrn の shared/week-start.js。はじめは月曜） ----
  // 共通の設定が読めないとき（電波がなく、まだ保存もないなど）は、開いているあいだだけここで覚える
  let weekStartHere = 1;

  // 週のはじまりを返す（1＝月曜・0＝日曜）
  function getWeekStart() {
    return window.QWeekStart ? window.QWeekStart.get(weekStartHere) : weekStartHere;
  }

  // 週のはじまりを変える（共通の設定にも残す）
  function setWeekStart(value) {
    weekStartHere = value === 0 ? 0 : 1;
    if (window.QWeekStart) window.QWeekStart.set(weekStartHere);
  }

  // 表示設定の「週のはじまり」（月曜・日曜のチップ）の HTML を返す
  function renderWeekStartField() {
    const now = getWeekStart();
    return [
      '<div class="week-start-field">',
      '  <p class="ls-label" id="week-start-label">週のはじまり</p>',
      '  <div class="ls-chips" role="group" aria-labelledby="week-start-label">',
      renderChip({ label: "月曜", action: "set-week-start", pressed: now === 1, attrs: { "data-week-start": "1" } }),
      renderChip({ label: "日曜", action: "set-week-start", pressed: now === 0, attrs: { "data-week-start": "0" } }),
      "  </div>",
      '  <p class="ls-hint">ほかの Q のツールにもそろいます。</p>',
      "</div>"
    ].join("");
  }

  // ---- 草グラフ（GitHub のように、記録した日のます目を塗る） ----
  // この端末の履歴（送った記録）から、日ごとのセット数で4段階に塗る。いちばん右の列が今週（週のはじまりは設定どおり）
  const GRASS_WEEKS = 18;
  const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

  // 草グラフ（日ごとのセット数を、週のはじまりから並べる）と、記録した週の連続の HTML を返す
  function renderGrass() {
    const weekStart = getWeekStart();
    const setsByDay = {};
    appState.history.forEach(function (workout) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(workout.date || ""))) return;
      const sets = (workout.exercises || []).reduce(function (sum, exercise) {
        return sum + (exercise.sets || []).length;
      }, 0);
      setsByDay[workout.date] = (setsByDay[workout.date] || 0) + sets;
    });
    // 日付を "2026-10-25" の形にして返す（この端末の時間で）
    const toKey = function (d) {
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = startOfWeek(today, weekStart);
    start.setDate(start.getDate() - (GRASS_WEEKS - 1) * 7); // GRASS_WEEKS 週前の週のはじまり
    // セット数から草の濃さ（0〜4）を返す
    const level = function (sets) {
      return sets <= 0 ? 0 : sets < 6 ? 1 : sets < 12 ? 2 : sets < 20 ? 3 : 4;
    };

    let days = 0;
    const columns = [];
    for (let week = 0; week < GRASS_WEEKS; week += 1) {
      const cells = [];
      let monthLabel = "";
      for (let row = 0; row < 7; row += 1) {
        const d = new Date(start);
        d.setDate(start.getDate() + week * 7 + row);
        // 月の1日がある列に月を書く。いちばん左の列は、次の週で月が変わらないときだけ（ラベルが重ならないように）
        if (d.getDate() === 1 || (week === 0 && row === 0 && d.getDate() <= 21)) monthLabel = String(d.getMonth() + 1) + "月";
        if (d > today) {
          cells.push('<span class="grass-cell is-future"></span>');
          continue;
        }
        const sets = setsByDay[toKey(d)] || 0;
        if (sets > 0) days += 1;
        const label = (d.getMonth() + 1) + "/" + d.getDate() + (sets ? " ・ " + sets + "セット" : " ・ 記録なし");
        cells.push('<span class="grass-cell is-level-' + level(sets) + '" title="' + escapeHtml(label) + '"></span>');
      }
      columns.push('<div class="grass-week"><span class="grass-month">' + escapeHtml(monthLabel) + "</span>" + cells.join("") + "</div>");
    }
    // 左の曜日：月・水・金だけ書く（週のはじまりが日曜なら1段下がる）
    const dayLabels = [0, 1, 2, 3, 4, 5, 6].map(function (row) {
      const name = DAY_NAMES[(weekStart + row) % 7];
      return "<span>" + (name === "月" || name === "水" || name === "金" ? name : "") + "</span>";
    });

    return [
      '<section class="grass" aria-label="記録した日（' + GRASS_WEEKS + '週）">',
      '  <div class="grass-grid">',
      '    <div class="grass-days" aria-hidden="true"><span></span>' + dayLabels.join("") + "</div>",
      columns.join(""),
      "  </div>",
      '  <div class="grass-foot">',
      '    <p class="grass-stats">' + GRASS_WEEKS + "週で <b>" + days + "日</b></p>",
      '    <p class="grass-legend" aria-hidden="true">少<span class="grass-cell is-level-0"></span><span class="grass-cell is-level-1"></span><span class="grass-cell is-level-2"></span><span class="grass-cell is-level-3"></span><span class="grass-cell is-level-4"></span>多</p>',
      "  </div>",
      renderStreak(weekStreak(Object.keys(setsByDay), weekStart)),
      '  <p class="ls-hint">この端末で送った記録から数えています（1日のセット数で色が濃くなります）。</p>',
      "</section>"
    ].join("");
  }

  // 草グラフは右が今週。狭い画面では横に動かせるので、はじめは右のはし（今週）を見せる
  function showLatestWeeks() {
    document.querySelectorAll(".grass-grid").forEach(function (grid) {
      grid.scrollLeft = grid.scrollWidth;
    });
  }

  // 記録した週の連続（いま・最長）の1行の HTML を返す。今週まだなら「今週やれば ◯週」
  function renderStreak(streak) {
    // 「最長 3週」は1かたまりで折り返す（320px で「最／長」と折れないように）
    const best = ' ・ <span class="ls-nowrap">最長 <b>' + streak.best + "週</b></span>";
    if (streak.thisWeek) {
      return '<p class="grass-streak">🔥 いま <b>' + streak.current + "週</b> 連続" + best + "</p>";
    }
    if (streak.current > 0) {
      return '<p class="grass-streak">🔥 <b>' + streak.current + '週</b> 連続中<span class="ls-nowrap">（今週やれば ' + (streak.current + 1) + "週）</span>" + best + "</p>";
    }
    return '<p class="grass-streak">今週やると、連続がはじまります' + (streak.best ? best : "") + "</p>";
  }

  // ---- トレーニングメニュー（テンプレート） ----

  // トレーニングメニューのシートを開く（名前の欄には、入力中のタイトルを入れておく）
  function openMenuModal() {
    appState.menus = MenuRepository.loadAll();
    // 名前の初期値はワークアウトのタイトル（自動で入る「キロっく」などはメニュー名にしない）
    const title = (appState.workout.title || "").trim();
    appState.ui.menuName = title && title !== getDefaultWorkoutTitle(appState.workout.user) ? title : "";
    appState.ui.menuModalOpen = true;
    renderInput();
  }

  // id のトレーニングメニュー（保存したもの・おすすめ）を探して返す
  function findMenu(menuId) {
    const saved = appState.menus.find(function (menu) {
      return menu.menuId === menuId;
    });
    if (saved) {
      return saved;
    }
    const preset = MENU_PRESETS.find(function (item) {
      return item.menuId === menuId;
    });
    return preset ? expandMenuPreset(preset) : null;
  }

  // 入力中の記録を、名前をつけてトレーニングメニューに保存する（同じ名前は上書き。「元に戻す」で戻せる）
  function saveCurrentAsMenu() {
    const name = (appState.ui.menuName || "").trim();
    if (!name) {
      notify("メニューの名前を入れると保存できます。", "warn");
      return;
    }
    if (countNamedExercises(appState.workout) === 0) {
      notify("種目を1つ以上選ぶと保存できます。", "warn");
      return;
    }
    const existing = MenuRepository.findByName(name);
    if (!existing && appState.menus.length >= MAX_MENUS) {
      notify("メニューは " + MAX_MENUS + " 件まで保存できます。使わないものを消すと保存できます。", "warn");
      return;
    }
    // 同じ名前があれば確かめずに上書きし、「元に戻す」で前のメニューに戻せるようにする
    const undo = existing ? undoMenuChange() : null;
    appState.menus = MenuRepository.save(buildMenuFromWorkout(appState.workout, name, existing && existing.menuId));
    renderInput();
    notify(seasonal("「" + name + "」をメニューに" + (existing ? "上書き" : "保存") + "しました。"), "info", undo);
  }

  // トレーニングメニューを入力に入れる（「元に戻す」で戻せる）
  function applyMenu(menuId) {
    const menu = findMenu(menuId);
    if (!menu) {
      notify("選んだメニューが見つかりませんでした。", "warn");
      return;
    }
    appState.ui.menuModalOpen = false;
    replaceWorkout(
      createWorkoutFromMenu(menu),
      "メニュー「" + menu.name + "」を入れました。重さ・回数を直して記録できます。"
    );
  }

  // トレーニングメニューを消す（「元に戻す」で戻せる）
  function deleteMenu(menuId) {
    const menu = findMenu(menuId);
    if (!menu) {
      return;
    }
    const undo = undoMenuChange();
    appState.menus = MenuRepository.deleteById(menuId);
    renderInput();
    notify("🗑 メニュー「" + menu.name + "」を消しました。", "info", undo);
  }

  // いまのメニューの一覧を覚えておき、「元に戻す」で戻す関数を返す
  function undoMenuChange() {
    const saved = appState.menus.slice();
    return function () {
      appState.menus = MenuRepository.replaceAll(saved);
      renderInput();
      notify("元に戻しました。", "info");
    };
  }

  // 1行が1つのメニュー（Q キットの一覧の行）。押すと入る。保存したものだけ右に 🗑（消す）
  function renderMenuRow(menu, deletable) {
    const names = (menu.exercises || [])
      .map(function (exercise) {
        return exercise.name;
      })
      .join("・");
    const menuId = escapeHtml(menu.menuId);
    return [
      '<div class="ls-list-row">',
      '  <button class="ls-list-item" data-action="apply-menu" data-menu-id="' + menuId + '" type="button" title="' + escapeHtml("「" + menu.name + "」を入れる") + '">',
      '    <span class="menu-name">' + escapeHtml(menu.name) + '<span class="menu-meta">' + escapeHtml(summarizeMenu(menu)) + "</span></span>",
      "    <small>" + escapeHtml(names) + "</small>",
      "  </button>",
      deletable
        ? '  <button class="ls-icon-button" data-action="delete-menu" data-menu-id="' + menuId + '" type="button" aria-label="' + escapeHtml("「" + menu.name + "」を消す") + '">🗑</button>'
        : "",
      "</div>"
    ].join("");
  }

  // トレーニングメニューのシート（保存・保存したもの・おすすめ）の HTML を返す。閉じているときは ""
  function renderMenuSheet() {
    if (!appState.ui.menuModalOpen) {
      return "";
    }
    const canSave = countNamedExercises(appState.workout) > 0;
    // 並び：今の入力を保存 → マイメニュー（保存したもの）→ おすすめ。押すとそのメニューが入る
    return renderSheet({
      label: "トレーニングメニュー",
      title: "📋 トレーニングメニュー",
      closeAction: "close-menu-modal",
      className: "menu-sheet",
      body: [
        '<p class="ls-hint">よくやるメニューを保存しておくと、種目とセット（重さ・回数）をまとめて入れられます。押すと入ります。</p>',
        '<div class="menu-save-row">',
        renderField({
          label: "今の入力をメニューに保存",
          input:
            '<input class="ls-input" data-menu-field="name" type="text" maxlength="30" placeholder="胸の日 など" value="' +
            escapeHtml(appState.ui.menuName || "") +
            '"' +
            (canSave ? "" : " disabled") +
            " />"
        }),
        renderButton({ label: "保存", title: "今の入力をメニューに保存", action: "save-menu", disabled: !canSave }),
        "</div>",
        canSave ? "" : '<p class="ls-hint">種目を選ぶと、今の入力をメニューとして保存できます。</p>',
        '<div class="menu-scroll">',
        '  <h4 class="menu-section-title">マイメニュー</h4>',
        appState.menus.length
          ? '  <div class="ls-list menu-list">' +
            appState.menus
              .map(function (menu) {
                return renderMenuRow(menu, true);
              })
              .join("") +
            "</div>"
          : '  <p class="ls-hint">まだありません。上から保存すると、ここに並びます。</p>',
        '  <h4 class="menu-section-title">おすすめ</h4>',
        '  <div class="ls-list menu-list">' +
          MENU_PRESETS.map(function (preset) {
            return renderMenuRow(expandMenuPreset(preset), false);
          }).join("") +
          "</div>",
        "</div>"
      ].join("")
    });
  }

  // 名前の頭文字（写真がないときに出す。名前がなければ「W」）を返す
  function getUserInitial(displayName) {
    const normalized = String(displayName || "").trim();
    if (!normalized) {
      return "W";
    }
    return normalized.slice(0, 1).toUpperCase();
  }

  // 入力中の帯（いま開いている種目の名前とまとめ）の HTML を返す
  function renderCurrentExerciseIndicator(exercises) {
    const currentExercise = findExpandedExercise(exercises);
    if (!currentExercise || !(currentExercise.catalogId || currentExercise.isCustom)) {
      return "";
    }

    const currentIndex = (exercises || []).findIndex(function (exercise) {
      return exercise.exerciseId === currentExercise.exerciseId;
    });

    // タップでその種目のカードへ移動する
    return [
      '<button class="current-exercise-indicator" data-action="jump-to-current-exercise" data-exercise-id="' +
        escapeHtml(currentExercise.exerciseId) +
        '" type="button" aria-label="入力中の種目へ移動">',
      '  <span class="current-exercise-copy">',
      '    <span class="current-exercise-label">入力中</span>',
      '    <strong class="current-exercise-name">エクササイズ ' +
        escapeHtml(String(currentIndex + 1)) +
        " ・ " +
        escapeHtml(currentExercise.name || "種目を選択") +
        "</strong>",
      "  </span>",
      '  <span class="current-exercise-jump" aria-hidden="true">›</span>',
      "</button>"
    ].join("");
  }

  // いま開いている種目を返す
  function findExpandedExercise(exercises) {
    return (exercises || []).find(function (exercise) {
      return exercise.exerciseId === appState.ui.expandedExerciseId;
    });
  }

  // 履歴の記録1つ（開くと種目ごとの集計・この内容で入力・消す）の HTML を返す
  function renderHistoryCard(workout) {
    const isOpen = Boolean(appState.ui.openHistoryIds[workout.workoutId]);
    const idAttrs = { "data-workout-id": workout.workoutId };
    return [
      '<article class="history-card">',
      '  <div class="history-card-head" data-disclosure-host>',
      '    <div class="history-card-copy">',
      '      <p class="history-meta">' +
        escapeHtml(workout.date || "-") +
        " ・ " +
        escapeHtml(String((workout.exercises || []).length)) +
        "種目</p>",
      "      <h4>" + escapeHtml(resolveWorkoutTitle(workout.title, workout.user)) + "</h4>",
      "    </div>",
      '    <div class="history-actions">',
      renderButton({ label: "この内容で入力", className: "history-action-button", action: "restore-history", attrs: idAttrs }),
      renderDisclosureToggle({ isOpen: isOpen, action: "toggle-history-card", title: "履歴", attrs: idAttrs }),
      "    </div>",
      "  </div>",
      '  <div class="history-card-body"' + (isOpen ? "" : " hidden") + ">",
      renderWorkoutExerciseStats(workout),
      '    <div class="history-actions history-actions-end">',
      renderButton({ label: "消す", className: "is-danger history-action-button", action: "delete-history", attrs: idAttrs }),
      "    </div>",
      "  </div>",
      "</article>"
    ].join("");
  }

  // 記録の種目ごとの集計の HTML を返す
  function renderWorkoutExerciseStats(workout) {
    const exercises = getNamedExercises(workout);
    return exercises.length ? '<div class="stats-grid">' + exercises.map(renderExerciseStatCard).join("") + "</div>" : "";
  }

  // 履歴の記録を開く・たたむ
  function toggleHistoryCard(workoutId) {
    appState.ui.openHistoryIds[workoutId] = !appState.ui.openHistoryIds[workoutId];
    renderHistory();
  }

  // 種目が多いと LINE ではカードが横に並ぶ（カルーセル）。プレビューも同じく横スクロールで見せる
  function renderBubbleCarousel(workout, bubbles) {
    const items = bubbles.map(function (bubble) {
      return renderBubblePreview(workout, bubble);
    });
    if (items.length <= 1) {
      return items.join("");
    }
    return [
      '<div class="talk-carousel" tabindex="0" aria-label="カード ' + items.length + '枚（横にスクロール）">',
      items
        .map(function (item) {
          return '<div class="talk-carousel-item">' + item + "</div>";
        })
        .join(""),
      "</div>"
    ].join("");
  }

  // 送るカード1枚の見本（見出し・種目・下の帯）の HTML を、カードの中身から作って返す
  function renderBubblePreview(workout, bubble) {
    const exerciseBoxes = bubble.body && bubble.body.contents ? bubble.body.contents : [];
    const headerContents = bubble.header && bubble.header.contents ? bubble.header.contents : [];
    const headerMetaBox = headerContents[0] && headerContents[0].contents ? headerContents[0] : null;
    const dateText = headerMetaBox && headerMetaBox.contents[0] ? headerMetaBox.contents[0].text : workout.date || "-";
    const userText =
      headerMetaBox && headerMetaBox.contents[1] ? headerMetaBox.contents[1].text : "";
    const titleText = headerContents[1] ? headerContents[1].text : resolveWorkoutTitle(workout.title, workout.user);
    // 下の帯のボタン（最後のカードの「同じメニューでやる」）も、送るカードと同じに出す
    const footerButtons = (bubble.footer && bubble.footer.contents ? bubble.footer.contents : []).filter(function (item) {
      return item.type === "button" && item.action && item.action.label;
    });
    return [
      '<section class="preview-bubble">',
      '  <div class="preview-bubble-header">',
      '    <div class="preview-header-meta">',
      "      <div>" + escapeHtml(dateText) + "</div>",
      userText ? '      <div class="preview-note-user">' + escapeHtml(userText) + "</div>" : "",
      "    </div>",
      '    <div class="preview-bubble-title">' + escapeHtml(titleText) + "</div>",
      "  </div>",
      exerciseBoxes
        .map(function (box) {
          // 「ほか N 種目」（カードに入らなかった種目）
          if (box.type !== "box") {
            return '<div class="preview-exercise-note">' + escapeHtml(box.text || "") + "</div>";
          }
          const headerBox = box.contents[0] || { contents: [] };
          const title = headerBox.contents[0] ? headerBox.contents[0].text : "";
          const summary = headerBox.contents[1] ? headerBox.contents[1].text : "";
          const bodyLines = box.contents.slice(1);
          return [
            '<article class="preview-exercise">',
            '  <div class="preview-exercise-head">',
            "    <h4>" + escapeHtml(title) + "</h4>",
            '    <span class="preview-exercise-rm">' + escapeHtml(summary) + "</span>",
            "  </div>",
            '  <div class="preview-sets">',
            bodyLines
              .map(function (line) {
                if (line.type === "box") {
                  const numberBox = line.contents[0] || {};
                  const left = numberBox.contents && numberBox.contents[0] ? numberBox.contents[0].text : numberBox.text || "";
                  const main = line.contents[1] ? line.contents[1].text : "";
                  const badge =
                    line.contents[2] && line.contents[2].contents && line.contents[2].contents[0]
                      ? line.contents[2].contents[0].text
                      : "";
                  return (
                    '<div class="preview-set-line"><span class="preview-set-number">' +
                    escapeHtml(left) +
                    '</span><span class="preview-set-main">' +
                    escapeHtml(main) +
                    "</span>" +
                    (badge ? '<strong class="preview-rm-badge">' + escapeHtml(badge) + "</strong>" : "") +
                    "</div>"
                  );
                }
                return '<div class="preview-exercise-note">' + escapeHtml(line.text || "") + "</div>";
              })
              .join(""),
            "  </div>",
            "</article>"
          ].join("");
        })
        .join(""),
      '  <div class="preview-bubble-footer">' +
      footerButtons
        .map(function (button) {
          return '<span class="preview-bubble-button">' + escapeHtml(button.action.label) + "</span>";
        })
        .join("") +
      escapeHtml(getCreditText()) +
      "</div>",
      "</section>"
    ].join("");
  }

  // ランキングのカード（デバッグ用）の HTML を返す
  function renderRankingCard(title, rows, unit) {
    return [
      '<article class="ranking-card">',
      "  <header>",
      "    <h4>" + escapeHtml(title) + "</h4>",
      "  </header>",
      rows && rows.length
        ? '  <div class="ranking-stack">' +
        rows
          .map(function (row, index) {
            return [
              '<div class="ranking-row">',
              '  <div><strong>#' +
              (index + 1) +
              "</strong> " +
              escapeHtml(row.name) +
              '<div class="ranking-meta">' +
              escapeHtml(row.label || "") +
              "</div></div>",
              '  <strong>' + escapeHtml(formatLocaleMetric(row.value, unit, 1)) + "</strong>",
              "</div>"
            ].join("");
          })
          .join("") +
        "  </div>"
        : '<p class="ls-hint">ランキングデータはまだありません。</p>',
      "</article>"
    ].join("");
  }

  // 種目1つの集計のカード（セット・ボリューム・推定1RM）の HTML を返す
  function renderExerciseStatCard(exercise) {
    const validSetCount = countValidSets(exercise);
    const caption = [String(validSetCount) + "セット"];

    if (exercise.primaryMuscle) {
      caption.push(exercise.primaryMuscle);
    }

    return [
      '<article class="summary-card">',
      '  <div class="summary-card-main">',
      '    <strong class="summary-name">' + escapeHtml(exercise.name || "未入力種目") + "</strong>",
      '    <span class="summary-inline-meta">' + escapeHtml(caption.join(" / ")) + "</span>",
      "  </div>",
      '  <strong class="summary-value">' +
        escapeHtml(exercise.maxEstimated1rm > 0 ? formatLocaleMetric(exercise.maxEstimated1rm, "kg", 1) : "-") +
        "</strong>",
      "</article>"
    ].join("");
  }

  // 種目を選ぶところ：1. 部位（チップ） → 2. その部位の種目（チップ）か、自由入力
  function renderExercisePicker(exercise) {
    const idAttrs = { "data-exercise-id": exercise.exerciseId };
    const muscleChips = MUSCLE_FILTERS.filter(function (muscle) {
      return muscle !== "all";
    })
      .map(function (muscle) {
        return renderChip({
          label: muscle,
          action: "set-exercise-muscle",
          pressed: exercise.selectionMuscle === muscle,
          attrs: Object.assign({ "data-muscle": muscle }, idAttrs)
        });
      })
      .join("");

    const muscle = exercise.selectionMuscle;
    const candidates =
      muscle && muscle !== "その他"
        ? EXERCISE_CATALOG.filter(function (item) {
            return item.muscle === muscle;
          })
        : [];

    const options = candidates.length
      ? '<div class="ls-chips">' +
        candidates
          .map(function (item) {
            return renderChip({
              label: item.name,
              action: "choose-exercise-card",
              attrs: Object.assign({ "data-catalog-id": item.id }, idAttrs)
            });
          })
          .join("") +
        "</div>"
      : '<p class="ls-hint">' +
        (muscle === "その他"
          ? "自由入力で種目を追加します。"
          : muscle
            ? "この部位には候補がまだありません。手入力で追加できます。"
            : "先に部位を選ぶと、候補の種目が表示されます。") +
        "</p>";

    return [
      '<div class="exercise-picker">',
      '  <div class="ls-field">',
      '    <span class="ls-label">1. 部位を選択</span>',
      '    <div class="ls-chips">' + muscleChips + "</div>",
      "  </div>",
      '  <div class="ls-field">',
      '    <span class="ls-label">2. 種目を選択</span>',
      options,
      muscle
        ? renderButton({ label: "＋自由入力", className: "custom-exercise-button", action: "start-custom-exercise", attrs: idAttrs })
        : "",
      "  </div>",
      "</div>"
    ].join("");
  }

  // その種目のカードが開いているかを返す
  function isExerciseExpanded(exerciseId) {
    if (!exerciseId) {
      return false;
    }
    return appState.ui.expandedExerciseId === exerciseId;
  }

  // はじめに開いておく種目（種目を選んだ最初のもの）の id を返す
  function getDefaultExpandedExerciseId(exercises) {
    const matchedExercise = (exercises || []).find(function (exercise) {
      return Boolean(exercise && (exercise.catalogId || exercise.isCustom));
    });
    return matchedExercise ? matchedExercise.exerciseId : "";
  }

  // その種目のメモの欄が開いているかを返す
  function isExerciseMemoOpen(exerciseId) {
    return Boolean(appState.ui.memoOpenExerciseIds[exerciseId]);
  }

  // 種目のまとめの文字（「3セット・RM 75kg」など）を返す
  function renderExerciseSummary(exercise) {
    const validSetCount = countValidSets(exercise);
    const summaryParts = [];

    if (validSetCount > 0) {
      summaryParts.push(validSetCount + "セット");
    }
    if (exercise.maxEstimated1rm > 0) {
      summaryParts.push("RM " + formatLocaleMetric(exercise.maxEstimated1rm, "kg", 1));
    }

    return summaryParts.join(" / ");
  }

  // メモのボタンの文字（「＋メモ追加」「メモ編集」「メモをたたむ」）を返す
  function getExerciseMemoButtonLabel(exercise) {
    const isOpen = isExerciseMemoOpen(exercise.exerciseId);
    const hasMemo = Boolean(String(exercise.memo || "").trim());

    if (isOpen) {
      return "メモをたたむ";
    }

    return hasMemo ? "メモ編集" : "＋メモ追加";
  }

  // メモの入力欄の HTML を返す。閉じているときは ""
  function renderExerciseMemoField(exercise) {
    const isOpen = isExerciseMemoOpen(exercise.exerciseId);
    if (!isOpen) {
      return "";
    }

    return renderField({
      label: "種目メモ",
      input:
        '<textarea class="ls-input memo-input" data-exercise-field="memo" data-exercise-id="' +
        escapeHtml(exercise.exerciseId) +
        '" maxlength="' +
        TEXT_LIMITS.memo +
        '" placeholder="フォームや調子のメモ">' +
        escapeHtml(exercise.memo || "") +
        "</textarea>"
    });
  }

  // 見本の記録を入力に入れる（「元に戻す」で戻せる）
  function applySampleWorkout() {
    replaceWorkout(
      hydrateWorkout(
        buildSampleWorkout({
          user: Object.assign({}, DEFAULT_USER, appState.liff.profile || {}),
          groupKey: resolveGroupKey()
        })
      ),
      "サンプル入力を反映しました。"
    );
  }

  // 入力をまっさらにする（「元に戻す」で戻せる）
  function resetWorkout() {
    replaceWorkout(createEmptyWorkout(), "入力内容をリセットしました。");
  }

  // 確かめずにすぐ消し、トーストの「元に戻す」で戻せるようにする
  function deleteHistory(workoutId) {
    const saved = appState.history.slice();
    appState.history = LocalStorageWorkoutRepository.deleteById(workoutId);
    renderHistory();
    renderShell();
    // 知らせて、「元に戻す」を押されたら消した履歴をもどす
    notify("🗑 履歴を消しました。", "info", function () {
      appState.history = LocalStorageWorkoutRepository.replaceAll(saved);
      renderHistory();
      renderShell();
      notify("元に戻しました。", "info");
    });
  }

  // ランキング（デバッグ用）の期間を変える
  function changeRankingPeriod(period) {
    if (!isRankingEnabled()) {
      return;
    }
    appState.rankingPeriod = period === "month" ? "month" : "week";
    renderRanking();
  }

  // いまの送るカードの JSON をコピーする（デバッグ用）
  async function copyCurrentFlexJson() {
    if (!isDebugModeEnabled()) {
      notify("Flex JSONコピーはデバッグモードでのみ利用できます。", "warn");
      return;
    }
    const validation = validateWorkout(appState.workout);
    if (!validation.valid) {
      notify(validation.errors.join(" "), "error");
      return;
    }

    const message = buildWorkoutFlexMessage(validation.workout);
    const copied = await copyText(JSON.stringify(message, null, 2));
    appState.activeTab = "preview";
    appState.ui.openJsonPreview = true;
    renderShell();
    renderPreview();

    if (copied) {
      notify("Flex JSON をコピーしました。", "info");
    } else {
      notify("クリップボードへコピーできなかったため、JSONプレビューを開いています。", "warn");
    }
  }

  // 文字をコピーする。できたら true
  async function copyText(text) {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (error) {
      console.warn("Clipboard copy failed:", error);
    }
    return false;
  }

})();
