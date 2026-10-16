import {
  APP_CONFIG,
  DEFAULT_THEME,
  DEFAULT_USER,
  EXERCISE_CATALOG,
  FEATURE_FLAGS,
  MAX_MENUS,
  MENU_PRESETS,
  MUSCLE_FILTERS,
  STORAGE_KEYS
} from "./constants.js";
import {
  applyTheme,
  getFlexTheme as buildFlexTheme,
  loadThemePreference,
  normalizeHexColor,
  saveThemePreference
} from "./theme.js";
import {
  buildLineAppUrl,
  getLiffEnvironment,
  initLiff as initializeLiffState,
  loadCachedProfile,
  loginWithLine,
  safelyGetLiffContext
} from "./liff.js";
import {
  buildMenuFromWorkout,
  buildWorkoutFlexMessage as buildWorkoutFlexPayload,
  calculateWorkout,
  countNamedExercises,
  countValidSets,
  createEmptyExercise,
  createEmptySet,
  createEmptyWorkout,
  createWorkoutFromMenu,
  expandMenuPreset,
  getCreditText,
  getDefaultWorkoutTitle,
  getNamedExercises,
  hydrateWorkout,
  hasEstimated1rm,
  isFilledSet,
  isMaxRmSet,
  packWorkoutDraft,
  resolveWorkoutTitle,
  sanitizeWorkout as sanitizeWorkoutModel,
  summarizeMenu,
  unpackWorkoutDraft
} from "./workout.js";
import {
  createApiWorkoutRepository,
  createLocalStorageMenuRepository,
  createLocalStorageWorkoutRepository
} from "./repositories.js";
import { cssEscape, decodeBase64Url, encodeBase64Url, escapeHtml, formatLocaleMetric, generateId, getTodayLocalDate } from "./utils.js";
import {
  fieldTemplate,
  renderActionButton,
  renderDisclosureToggle,
  renderModal,
  renderStartButton
} from "./components.js";
import { buildSampleWorkout, mockRanking } from "./fixtures.js";

(function () {

  const appState = {
    activeTab: "input",
    workout: null,
    rankingPeriod: "week",
    rankingData: null,
    history: [],
    menus: [],
    status: {
      message: "",
      type: "info"
    },
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
      openHistoryIds: {}
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

  let statusTimerId = 0;

  const elements = {};

  const LocalStorageWorkoutRepository = createLocalStorageWorkoutRepository(hydrateWorkout);
  const ApiWorkoutRepository = createApiWorkoutRepository(resolveGroupKey, mockRanking);
  const MenuRepository = createLocalStorageMenuRepository();

  document.addEventListener("DOMContentLoaded", initApp);

  function isDebugModeEnabled() {
    return Boolean(FEATURE_FLAGS.enableDebugMode);
  }

  function isRankingEnabled() {
    return isDebugModeEnabled() && Boolean(FEATURE_FLAGS.enableRanking);
  }

  function findCatalogExercise(catalogId) {
    return EXERCISE_CATALOG.find(function (item) {
      return item.id === catalogId;
    });
  }

  async function initApp() {
    cacheElements();
    bindEvents();
    document.title = document.title || APP_CONFIG.APP_NAME || "kiloQ";

    appState.theme = loadThemePreference();
    applyTheme(appState.theme.baseColor);
    appState.liff.profile = loadCachedProfile();
    appState.workout = createEmptyWorkout();
    appState.history = loadWorkoutHistory();
    appState.menus = MenuRepository.loadAll();
    syncWorkoutUser();
    if (isRankingEnabled()) {
      appState.rankingData = await getRanking();
    }

    renderShell();
    renderInput();
    renderPreview();
    renderHistory();
    if (isRankingEnabled()) {
      renderRanking();
    }

    const liffResult = await initLiff();
    // ログインの行き来・LINE アプリへ移る前に入れていた記録を戻す
    restoreCarriedDraft();
    if (!liffResult.ready) {
      setStatus(
        isDebugModeEnabled()
          ? "共有機能を使えないため、プレビュー中心で起動しました。デバッグ用のJSON確認は利用できます。"
          : "LINE とつながらないため、送る前の確認だけできます。",
        "warn"
      );
    }

    syncWorkoutUser();
    renderInput();
    renderShell();
    renderPreview();
  }

  function cacheElements() {
    elements.statusPanel = document.getElementById("status-panel");
    elements.tabNav = document.getElementById("tab-nav");
    elements.tabButtons = Array.from(document.querySelectorAll(".tab-button"));
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

  function bindEvents() {
    document.addEventListener("click", handleClick);
    document.addEventListener("input", handleInput);
    document.addEventListener("change", handleInput);
    window.addEventListener("scroll", syncActiveTabToScroll, { passive: true });
    window.addEventListener("resize", syncActiveTabToScroll);
  }

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

  function savePreviewOpen(isOpen) {
    try {
      window.localStorage.setItem(STORAGE_KEYS.previewOpen, String(isOpen));
    } catch (error) {
      // 保存できなくても表示はそのまま切り替わる
    }
  }

  function updateTheme(baseColor) {
    const normalizedColor = normalizeHexColor(baseColor);
    if (!normalizedColor) {
      return;
    }
    appState.theme.baseColor = normalizedColor;
    applyTheme(normalizedColor);
    saveThemePreference(appState.theme);
  }

  function resetTheme() {
    appState.theme = Object.assign({}, DEFAULT_THEME);
    applyTheme(appState.theme.baseColor);
    saveThemePreference(appState.theme);
  }

  function getFlexTheme() {
    const baseColor =
      appState.theme && appState.theme.baseColor ? appState.theme.baseColor : DEFAULT_THEME.baseColor;
    return buildFlexTheme(baseColor);
  }

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

  function removeExercise(exerciseId) {
    if (appState.workout.exercises.length > 1) {
      const shouldRemove = window.confirm("この種目を削除しますか？");
      if (!shouldRemove) {
        return;
      }
    }
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
  }

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

  function removeSet(exerciseId, setId) {
    const exercise = findExercise(exerciseId);
    if (!exercise) {
      return;
    }

    if (exercise.sets.length > 1) {
      const shouldRemove = window.confirm("このセットを削除しますか？");
      if (!shouldRemove) {
        return;
      }
    }

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
  }

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

  function updateExerciseSelectionMuscle(exerciseId, muscle) {
    const exercise = findExercise(exerciseId);
    if (!exercise) {
      return;
    }
    exercise.selectionMuscle = muscle;
    appState.ui.expandedExerciseId = exerciseId;
    renderInput();
  }

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

  function toggleExercisePanel(exerciseId) {
    appState.ui.expandedExerciseId =
      appState.ui.expandedExerciseId === exerciseId ? "" : exerciseId;
    renderInput();
  }

  function toggleExerciseMemo(exerciseId) {
    appState.ui.memoOpenExerciseIds[exerciseId] = !isExerciseMemoOpen(exerciseId);
    appState.ui.expandedExerciseId = exerciseId;
    renderInput();
  }

  function buildWorkoutFlexMessage(workout) {
    return buildWorkoutFlexPayload(workout, getFlexTheme(), resolveGroupKey);
  }

  function validateWorkout(workout) {
    const errors = [];
    const calculatedWorkout = calculateWorkout(workout);
    const sanitizedWorkout = sanitizeWorkout(workout);

    if (!sanitizedWorkout.date) {
      errors.push("日付を入力してください。");
    }

    if (!sanitizedWorkout.exercises.length) {
      errors.push("共有対象になる種目とセットを1つ以上入力してください。");
    }

    calculatedWorkout.exercises.forEach(function (exercise, index) {
      const hasValidSet = (exercise.sets || []).some(isFilledSet);
      if (hasValidSet && !(exercise.name || "").trim()) {
        errors.push("種目" + (index + 1) + "の名前を入力してください。");
      }
    });

    return {
      valid: errors.length === 0,
      errors: errors,
      workout: sanitizedWorkout
    };
  }

  async function saveWorkout(workout) {
    const repository = getWorkoutRepository();
    return repository.save(workout);
  }

  function getWorkoutRepository() {
    if (FEATURE_FLAGS.enableApiAdapter) {
      return ApiWorkoutRepository;
    }
    return LocalStorageWorkoutRepository;
  }

  function loadWorkoutHistory() {
    return LocalStorageWorkoutRepository.loadAll();
  }

  // 入力中の内容を別のもの（履歴・メニュー・サンプル・空）に入れ替える。最初の種目を開いて入力タブへ
  function replaceWorkout(workout, message) {
    appState.workout = workout;
    syncWorkoutUser();
    appState.ui.expandedExerciseId = workout.exercises[0] ? workout.exercises[0].exerciseId : "";
    appState.activeTab = "input";
    renderWorkoutViews();
    setStatus(message, "info");
  }

  // 種目を入力しているときだけ、置き換えてよいか確かめる
  function confirmReplaceInput(question) {
    return countNamedExercises(appState.workout) === 0 || window.confirm(question);
  }

  function restoreWorkout(workoutId) {
    const restored = LocalStorageWorkoutRepository.findById(workoutId);
    if (!restored) {
      setStatus("選択した履歴が見つかりませんでした。", "warn");
      return;
    }
    if (!confirmReplaceInput("今の入力内容を、この履歴で置き換えますか？")) {
      return;
    }
    replaceWorkout(hydrateWorkout(restored), "履歴を入力フォームへ戻しました。");
  }

  async function shareWorkout(workout) {
    const validation = validateWorkout(workout);
    if (!validation.valid) {
      setStatus(validation.errors.join(" "), "error");
      appState.activeTab = "input";
      renderShell();
      return;
    }

    const shareableWorkout = createShareSnapshot(validation.workout);
    const message = buildWorkoutFlexMessage(shareableWorkout);

    await saveWorkout(shareableWorkout);
    appState.history = loadWorkoutHistory();
    renderHistory();

    if (!appState.liff.ready || !appState.liff.shareAvailable) {
      appState.activeTab = "preview";
      appState.ui.openJsonPreview = isDebugModeEnabled();
      renderShell();
      renderPreview();
      if (isDebugModeEnabled()) {
        const copied = await copyText(JSON.stringify(message, null, 2));
        if (copied) {
          setStatus(
            "shareTargetPicker が使えないため、デバッグ用に Flex JSON をコピーしました。",
            "warn"
          );
        } else {
          setStatus(
            "shareTargetPicker が使えないため、デバッグ用に Flex JSON プレビューを表示しています。",
            "warn"
          );
        }
      } else {
        setStatus("LINE の外では送れません。下の「ログインして送る」か「LINE アプリで開く」から送ってください。", "warn");
      }
      return;
    }

    try {
      const result = await window.liff.shareTargetPicker([message]);
      if (result) {
        setStatus("共有しました。", "info");
      } else {
        setStatus("共有はキャンセルされました。入力内容と履歴は保持しています。", "warn");
      }
    } catch (error) {
      console.error("shareTargetPicker failed:", error);
      appState.activeTab = "preview";
      appState.ui.openJsonPreview = isDebugModeEnabled();
      renderShell();
      renderPreview();
      setStatus(
        isDebugModeEnabled()
          ? "共有でエラーが発生しました。デバッグ用にFlex JSONプレビューへ切り替えています。"
          : "共有でエラーが発生しました。時間をおいて再度お試しください。",
        "error"
      );
    }
  }

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
      renderSettingsTrigger(),
      '    <h2 class="panel-title">記録入力</h2>',
      "  </div>",
      renderInputStartActions(),
      renderSettingsModal(),
      renderMenuModal(),
      '  <section class="panel-card input-card workout-meta-card" aria-label="ワークアウトタイトル">',
      fieldTemplate({
        label: "ワークアウトタイトル",
        className: "tile-field",
        input:
          '<input class="text-input" aria-label="ワークアウトタイトル" data-field="title" type="text" placeholder="背中トレ など" value="' +
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

  function renderPreview() {
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
      "  </section>",
      isOpen ? renderExerciseMetrics(calculatedWorkout) : "",
      isDebugModeEnabled()
        ? '<section class="panel-card">' +
        '  <details class="json-accordion" ' +
        (appState.ui.openJsonPreview ? "open" : "") +
        ">" +
        "    <summary>Flex JSON プレビュー</summary>" +
        '    <p class="json-hint">デバッグ用のFlex JSON確認です。</p>' +
        '    <pre class="json-preview">' +
        escapeHtml(JSON.stringify(flexMessage, null, 2)) +
        "</pre>" +
        "  </details>" +
        "</section>"
        : "",
      "</div>"
    ].join("");

    elements.tabPreview.innerHTML = html;
    updateActionBar();
  }

  function renderHistory() {
    if (!FEATURE_FLAGS.enableLocalHistory) {
      elements.tabHistory.innerHTML =
        '<div class="empty-state">localStorage 履歴は無効化されています。config.js の feature flag で切り替えできます。</div>';
      return;
    }

    if (!appState.history.length) {
      elements.tabHistory.innerHTML =
        '<div class="empty-state">まだ履歴がありません。共有後にここへ表示されます。</div>';
      return;
    }

    const html = [
      '<div class="history-stack">',
      appState.history
        .map(function (workout) {
          return renderHistoryCard(workout);
        })
        .join(""),
      "</div>"
    ].join("");

    elements.tabHistory.innerHTML = html;
  }

  function renderRanking() {
    if (!isRankingEnabled() || !elements.tabRanking) {
      return;
    }

    if (!appState.rankingData) {
      elements.tabRanking.innerHTML = '<div class="empty-state">ランキングを読み込み中です。</div>';
      return;
    }

    const periodData = appState.rankingData[appState.rankingPeriod];
    const html = [
      '<section class="panel-card">',
      '  <div class="panel-head stats-head">',
      "    <div>",
      '      <p class="section-label">Ranking Mock</p>',
      '      <h2 class="panel-title">ランキングタブ</h2>',
      "      <p>初期実装はモック表示です。将来は API アダプタへ差し替えできます。</p>",
      "    </div>",
      '    <span class="badge">' +
      escapeHtml(appState.rankingPeriod === "week" ? "今週" : "今月") +
      "</span>",
      "  </div>",
      '  <div class="ranking-tabs">',
      '    <button class="ranking-period-button ' +
      (appState.rankingPeriod === "week" ? "is-active" : "") +
      '" data-action="change-ranking-period" data-period="week" type="button">今週</button>',
      '    <button class="ranking-period-button ' +
      (appState.rankingPeriod === "month" ? "is-active" : "") +
      '" data-action="change-ranking-period" data-period="month" type="button">今月</button>',
      "  </div>",
      '  <div class="ranking-grid">',
      renderRankingCard("推定1RMランキング", periodData.estimated1rm, "kg"),
      renderRankingCard("総ボリュームランキング", periodData.totalVolume, "kg"),
      "  </div>",
      "</section>"
    ].join("");

    elements.tabRanking.innerHTML = html;
  }

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

  function handleClick(event) {
    const button = event.target.closest("button");
    if (!button) {
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

    if (button.matches(".tab-button")) {
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
    "close-status": function () {
      clearStatus();
    },
    "step-set": function (data, button) {
      stepSetValue(button);
    },
    "toggle-metrics": function () {
      appState.ui.metricsOpen = !appState.ui.metricsOpen;
      renderPreview();
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
    "remove-exercise": function (data) {
      removeExercise(data.exerciseId);
    },
    "add-set": function (data) {
      addSet(data.exerciseId);
    },
    "remove-set": function (data) {
      removeSet(data.exerciseId, data.setId);
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
      appState.ui.settingsModalOpen = true;
      renderInput();
    },
    "close-settings-modal": function () {
      appState.ui.settingsModalOpen = false;
      renderInput();
    },
    "reset-theme": function () {
      resetTheme();
      renderInput();
      renderPreview();
    }
  };

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

  function renderShell() {
    if (!isRankingEnabled() && appState.activeTab === "ranking") {
      appState.activeTab = "input";
    }

    renderStatus();
    renderTabButtonLabels();

    // 送信プレビューは「入力」の一部として扱う
    const navTab = appState.activeTab === "preview" ? "input" : appState.activeTab;
    elements.tabButtons.forEach(function (button) {
      const isActive = button.getAttribute("data-tab") === navTab;
      button.classList.toggle("is-active", isActive);
    });

    if (elements.tabRankingButton) {
      elements.tabRankingButton.hidden = !isRankingEnabled();
      elements.tabRankingButton.style.display = isRankingEnabled() ? "" : "none";
    }
    if (elements.actionBar) {
      elements.actionBar.classList.toggle("has-debug-actions", isDebugModeEnabled());
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

  function renderTabButtonLabels() {
    if (!elements.tabButtons || !elements.tabButtons.length) {
      return;
    }

    elements.tabButtons.forEach(function (button) {
      const tab = button.getAttribute("data-tab");
      if (tab === "input") {
        button.innerHTML = renderTabButtonLabel("入力", "");
      } else if (tab === "history") {
        button.innerHTML = renderTabButtonLabel("履歴", String(appState.history.length) + "件");
      } else if (tab === "ranking") {
        button.innerHTML = renderTabButtonLabel("ランキング", "");
      }
    });
  }

  function renderTabButtonLabel(main, sub) {
    return (
      '<span class="tab-button-main">' +
      escapeHtml(main) +
      "</span>" +
      '<span class="tab-button-sub' +
      (sub ? "" : " is-empty") +
      '">' +
      escapeHtml(sub || "") +
      "</span>"
    );
  }

  // タブ → 描く関数・パネルの要素（知らないタブは入力）
  const TAB_RENDERERS = {
    input: renderInput,
    preview: renderPreview,
    history: renderHistory,
    ranking: renderRanking
  };

  function renderActiveTab() {
    (TAB_RENDERERS[appState.activeTab] || renderInput)();
  }

  function getPanelElement(tab) {
    const panels = {
      input: elements.tabInput,
      preview: elements.tabPreview,
      history: elements.tabHistory,
      ranking: elements.tabRanking
    };
    return panels[tab] || elements.tabInput;
  }

  function renderStatus() {
    if (!appState.status.message) {
      elements.statusPanel.className = "status-panel";
      elements.statusPanel.innerHTML = "";
      return;
    }

    elements.statusPanel.className = "status-panel is-visible " + appState.status.type;
    elements.statusPanel.innerHTML = [
      '<div class="status-panel-inner">',
      '  <div class="status-panel-text">' + escapeHtml(appState.status.message) + "</div>",
      '  <button class="status-close-button" data-action="close-status" type="button" aria-label="閉じる">×</button>',
      "</div>"
    ].join("");
  }

  function setStatus(message, type) {
    clearStatusTimer();
    appState.status.message = message;
    appState.status.type = type || "info";
    renderStatus();

    if (appState.status.type === "info") {
      statusTimerId = window.setTimeout(function () {
        clearStatus();
      }, 1800);
    }
  }

  function clearStatus() {
    clearStatusTimer();
    appState.status.message = "";
    appState.status.type = "info";
    renderStatus();
  }

  function clearStatusTimer() {
    if (statusTimerId) {
      window.clearTimeout(statusTimerId);
      statusTimerId = 0;
    }
  }

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

  function setPanelVisibility(tabName, element) {
    if (!element) {
      return;
    }
    const shouldShow = tabName === "ranking" ? isRankingEnabled() : true;
    element.hidden = !shouldShow;
    element.classList.toggle("is-active", appState.activeTab === tabName);
  }

  function updateActionBar() {
    if (!elements.actionBar || !elements.shareButton || !elements.copyJsonButton) {
      return;
    }

    renderLineHelp();

    elements.actionBar.classList.toggle("has-debug-actions", isDebugModeEnabled());
    elements.copyJsonButton.hidden = !isDebugModeEnabled();
    elements.copyJsonButton.textContent = appState.liff.shareAvailable
      ? "Flex JSONコピー"
      : "デバッグコピー";
  }

  // ---- LINE の外で開いたとき：送れる環境（ログイン・LINE アプリ）へ移る導線 ----
  const DRAFT_KEY = "kiloq:carry-draft";

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

  function startLineLogin() {
    // ログインの行き来で入力が消えないよう、このブラウザに一時的に残す
    try {
      const draft = encodedDraft();
      if (draft) sessionStorage.setItem(DRAFT_KEY, draft);
    } catch (error) {
      console.warn("Failed to keep draft:", error);
    }
    if (!loginWithLine()) {
      setStatus("LINE のログインを始められませんでした。時間をおいてもう一度お試しください。", "warn");
    }
  }

  // ?draft=（LINE アプリで開いたとき）か、ログイン前に残した記録があれば、入力に戻す
  function restoreCarriedDraft() {
    let raw = "";
    try {
      raw = new URLSearchParams(window.location.search).get("draft") || sessionStorage.getItem(DRAFT_KEY) || "";
      sessionStorage.removeItem(DRAFT_KEY);
    } catch (error) {
      raw = new URLSearchParams(window.location.search).get("draft") || "";
    }
    const url = new URL(window.location.href);
    if (url.searchParams.has("draft")) {
      url.searchParams.delete("draft");
      history.replaceState(null, "", url);
    }
    if (!raw) {
      return;
    }
    try {
      const workout = unpackWorkoutDraft(JSON.parse(decodeBase64Url(raw)));
      if (!workout) {
        return;
      }
      appState.workout = workout;
      appState.ui.expandedExerciseId = workout.exercises[0] ? workout.exercises[0].exerciseId : "";
      setStatus("入力していた記録を戻しました。", "info");
    } catch (error) {
      console.warn("Failed to restore draft:", error);
    }
  }

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

  function syncWorkoutUser() {
    appState.workout.user = Object.assign({}, DEFAULT_USER, appState.liff.profile || {});
    if (!String(appState.workout.title || "").trim()) {
      appState.workout.title = getDefaultWorkoutTitle(appState.workout.user);
    }
    appState.workout.groupKey = resolveGroupKey();
    touchWorkout(false);
  }

  function resolveGroupKey() {
    const context = appState.liff.context || safelyGetLiffContext() || {};
    return context.groupId || context.roomId || APP_CONFIG.DEFAULT_GROUP_KEY || null;
  }

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

  function sanitizeWorkout(workout) {
    return sanitizeWorkoutModel(workout, resolveGroupKey);
  }

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
      "    <div>",
      '      <p class="section-label">エクササイズ ' + (exerciseIndex + 1) + "</p>",
      '      <h3 class="exercise-title">' +
        escapeHtml(exerciseTitle) +
        "</h3>",
      summary ? '      <p class="exercise-meta compact">' + summary + "</p>" : "",
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
        renderActionButton({
          label: "削除",
          icon: "🗑",
          variant: "danger-button compact-action-button delete-pill",
          action: "remove-exercise",
          title: "種目削除",
          disabled: !canRemoveExercise,
          attrs: {
            "data-exercise-id": exercise.exerciseId
          }
        }) +
        "</div>",
      "  </div>",
      '  <div class="form-grid">',
      !showExerciseFields
        ? renderExercisePicker(exercise)
        : renderSelectedExerciseFields(exercise, isExpanded),
      "  </div>",
      "</section>"
    ].join("");
  }

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

  function renderExerciseTailAddButton() {
    return [
      '<div class="between-exercise-action tail-add-action">',
      '  <button class="outline-button between-exercise-button" data-action="insert-exercise-after" data-after-exercise-id="' +
        escapeHtml(
          appState.workout.exercises.length
            ? appState.workout.exercises[appState.workout.exercises.length - 1].exerciseId
            : ""
        ) +
        '" type="button">+ 種目追加</button>',
      "</div>"
    ].join("");
  }

  function renderSelectedExerciseFields(exercise, isExpanded) {
    if (!isExpanded) {
      return "";
    }

    return [
      '<div class="exercise-content-shell">',
      exercise.isCustom
        ? fieldTemplate({
            label: "種目名",
            className: "tile-field",
            input:
              '<input class="text-input" aria-label="種目名" data-exercise-field="name" data-exercise-id="' +
              escapeHtml(exercise.exerciseId) +
              '" type="text" placeholder="ベンチプレス / スクワット など" value="' +
              escapeHtml(exercise.name || "") +
              '" />'
          })
        : "",
      '    <div class="sets-stack">',
      (exercise.sets || [])
        .map(function (set, setIndex) {
          return renderSetRow(exercise.exerciseId, set, setIndex);
        })
        .join(""),
      "    </div>",
      '    <div class="button-row exercise-inline-actions">',
      '      <button class="outline-button add-set-button" data-action="add-set" data-exercise-id="' +
      escapeHtml(exercise.exerciseId) +
      '" type="button">+ セット追加</button>',
      renderActionButton({
        label: getExerciseMemoButtonLabel(exercise),
        variant: "ghost-button memo-toggle-button",
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
  //   上段: 何セット目・推定RM・削除  下段: kg と回数
  function renderSetRow(exerciseId, set, setIndex) {
    const exercise = findExercise(exerciseId);
    const canRemoveSet = exercise ? exercise.sets.length > 1 : false;
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
      renderActionButton({
        label: "削除",
        variant: "danger-button compact-action-button set-remove-button delete-pill",
        action: "remove-set",
        title: "このセットを削除",
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
      '    <input class="number-input stepper-input" aria-label="' +
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

  function renderExerciseMetrics(workout) {
    const previewExercises = getNamedExercises(workout);

    if (!previewExercises.length) {
      return "";
    }

    // 入力欄までの距離が伸びないよう、集計はボタンで開く（ふだんは閉じておく）
    const isOpen = appState.ui.metricsOpen;
    return [
      '<section class="panel-card metrics-card">',
      '  <div class="metrics-head" data-disclosure-host>',
      '    <span class="metrics-title">📊 この記録の集計</span>',
      '    <span class="badge">' + escapeHtml(String(previewExercises.length)) + "種目</span>",
      renderDisclosureToggle({ isOpen: isOpen, action: "toggle-metrics", title: "この記録の集計" }),
      "  </div>",
      isOpen
        ? '  <div class="stats-list">' +
        previewExercises
          .map(function (exercise) {
            return renderExerciseStatCard(exercise);
          })
          .join("") +
        "  </div>"
        : "",
      "</section>"
    ].join("");
  }

  // 始め方：保存したメニュー（とおすすめ）か、履歴から入れる。スマホでも詰まらないよう見出しとは別の行に、等幅で並べる
  // （履歴がなければメニューだけを1列で）
  function renderInputStartActions() {
    const buttons = [
      renderStartButton({ icon: "📋", label: "メニュー", sub: "保存・呼び出し", action: "open-menu-modal" })
    ];
    if (appState.history.length) {
      buttons.push(renderStartButton({ icon: "🕘", label: "履歴から", sub: "前の記録を使う", action: "open-history-input" }));
    }
    return '<div class="input-start-row" role="group" aria-label="入力の始め方">' + buttons.join("") + "</div>";
  }

  function renderInputUtilityActions() {
    return [
      // 補助的な操作は一番下に小さく（「履歴から始める」は見出しの横へ移した）
      '<div class="input-utility-row">',
      renderActionButton({
        label: "サンプルを入れる",
        variant: "text-link-button",
        action: "sample-workout"
      }),
      renderActionButton({
        label: "入力をリセット",
        variant: "text-link-button is-danger",
        action: "reset-workout"
      }),
      "</div>"
    ].join("");
  }

  function renderSettingsTrigger() {
    const profile = appState.liff.profile || DEFAULT_USER;
    const avatar = profile.pictureUrl
      ? '<img class="user-avatar-image" src="' + escapeHtml(profile.pictureUrl) + '" alt="" />'
      : '<span class="user-avatar-fallback">' + escapeHtml(getUserInitial(profile.displayName)) + "</span>";
    return [
      '<button class="user-avatar-button" data-action="open-settings-modal" type="button" aria-label="表示設定を開く" title="表示設定">',
      '  <span class="user-avatar">' + avatar + "</span>",
      "</button>"
    ].join("");
  }

  function renderSettingsModal() {
    if (!appState.ui.settingsModalOpen) {
      return "";
    }
    const color = escapeHtml(appState.theme.baseColor || DEFAULT_THEME.baseColor);
    return renderModal({
      label: "表示設定",
      title: "ベースカラー設定",
      closeAction: "close-settings-modal",
      body: [
      '    <p class="settings-modal-copy">アプリと送信プレビューの基調色を変更できます。</p>',
      '    <div class="settings-color-row">',
      '      <label class="tile-field settings-color-field">',
      '        <span class="field-label">ベースカラー</span>',
      '        <input class="color-input" data-theme-field="baseColor" type="color" value="' + color + '" />',
      "      </label>",
      '      <label class="tile-field settings-hex-field">',
      '        <span class="field-label">HEX</span>',
      '        <input class="text-input" data-theme-field="baseColor" type="text" inputmode="text" value="' +
        color +
        '" placeholder="#C96A2D" />',
      "      </label>",
      "    </div>",
      '    <div class="settings-modal-actions">',
      '      <button class="danger-button" data-action="reset-theme" type="button">初期色に戻す</button>',
      "    </div>"
      ].join("")
    });
  }

  // ---- トレーニングメニュー（テンプレート） ----

  function openMenuModal() {
    appState.menus = MenuRepository.loadAll();
    // 名前の初期値はワークアウトのタイトル（自動で入る「キロっく」などはメニュー名にしない）
    const title = (appState.workout.title || "").trim();
    appState.ui.menuName = title && title !== getDefaultWorkoutTitle(appState.workout.user) ? title : "";
    appState.ui.menuModalOpen = true;
    renderInput();
  }

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

  function saveCurrentAsMenu() {
    const name = (appState.ui.menuName || "").trim();
    if (!name) {
      setStatus("メニューの名前を入れてください。", "warn");
      return;
    }
    if (countNamedExercises(appState.workout) === 0) {
      setStatus("種目を1つ以上選んでから保存してください。", "warn");
      return;
    }
    const existing = MenuRepository.findByName(name);
    if (existing && !window.confirm("「" + name + "」はもうあります。今の入力で上書きしますか？")) {
      return;
    }
    if (!existing && appState.menus.length >= MAX_MENUS) {
      setStatus("メニューは " + MAX_MENUS + " 件まで保存できます。使わないものを削除してください。", "warn");
      return;
    }
    appState.menus = MenuRepository.save(buildMenuFromWorkout(appState.workout, name, existing && existing.menuId));
    renderInput();
    setStatus("「" + name + "」をメニューに保存しました。", "info");
  }

  function applyMenu(menuId) {
    const menu = findMenu(menuId);
    if (!menu) {
      setStatus("選んだメニューが見つかりませんでした。", "warn");
      return;
    }
    if (!confirmReplaceInput("今の入力内容を、メニュー「" + menu.name + "」で置き換えますか？")) {
      return;
    }
    appState.ui.menuModalOpen = false;
    replaceWorkout(
      createWorkoutFromMenu(menu),
      "メニュー「" + menu.name + "」を入れました。重さ・回数を直して記録してください。"
    );
  }

  function deleteMenu(menuId) {
    const menu = findMenu(menuId);
    if (!menu || !window.confirm("メニュー「" + menu.name + "」を削除しますか？")) {
      return;
    }
    appState.menus = MenuRepository.deleteById(menuId);
    renderInput();
    setStatus("メニューを削除しました。", "info");
  }

  function renderMenuRow(menu, deletable) {
    const names = (menu.exercises || [])
      .map(function (exercise) {
        return exercise.name;
      })
      .join("・");
    return [
      '<li class="menu-row">',
      '  <div class="menu-row-copy">',
      '    <p class="menu-row-name">' + escapeHtml(menu.name) + '<span class="menu-row-meta">' + escapeHtml(summarizeMenu(menu)) + "</span></p>",
      '    <p class="menu-row-exercises">' + escapeHtml(names) + "</p>",
      "  </div>",
      '  <div class="menu-row-actions">',
      renderActionButton({
        label: "入れる",
        title: "「" + menu.name + "」を入れる",
        variant: "pill-button menu-row-button",
        action: "apply-menu",
        attrs: { "data-menu-id": menu.menuId }
      }),
      deletable
        ? renderActionButton({
          label: "削除",
          title: "「" + menu.name + "」を削除",
          variant: "danger-button menu-row-button",
          action: "delete-menu",
          attrs: { "data-menu-id": menu.menuId }
        })
        : "",
      "  </div>",
      "</li>"
    ].join("");
  }

  function renderMenuModal() {
    if (!appState.ui.menuModalOpen) {
      return "";
    }
    const canSave = countNamedExercises(appState.workout) > 0;
    // 並び：今の入力を保存 → マイメニュー（保存したもの）→ おすすめ
    return renderModal({
      label: "トレーニングメニュー",
      title: "📋 トレーニングメニュー",
      closeAction: "close-menu-modal",
      className: "menu-modal",
      body: [
      '    <p class="settings-modal-copy">よくやるメニューを保存しておくと、種目とセット（重さ・回数）をまとめて入れられます。</p>',
      '    <div class="menu-save-row">',
      '      <label class="tile-field menu-name-field">',
      '        <span class="field-label">今の入力をメニューに保存</span>',
      '        <input class="text-input" data-menu-field="name" type="text" maxlength="30" placeholder="胸の日 など" value="' +
        escapeHtml(appState.ui.menuName || "") +
        '"' +
        (canSave ? "" : " disabled") +
        " />",
      "      </label>",
      renderActionButton({
        label: "保存",
        title: "今の入力をメニューに保存",
        variant: "pill-button menu-save-button",
        action: "save-menu",
        disabled: !canSave
      }),
      "    </div>",
      canSave ? "" : '    <p class="menu-hint">種目を選ぶと、今の入力をメニューとして保存できます。</p>',
      '    <div class="menu-scroll">',
      '      <h4 class="menu-section-title">マイメニュー</h4>',
      appState.menus.length
        ? '      <ul class="menu-list">' +
          appState.menus
            .map(function (menu) {
              return renderMenuRow(menu, true);
            })
            .join("") +
          "</ul>"
        : '      <p class="menu-hint">まだありません。上から保存すると、ここに並びます。</p>',
      '      <h4 class="menu-section-title">おすすめ</h4>',
      '      <ul class="menu-list">' +
        MENU_PRESETS.map(function (preset) {
          return renderMenuRow(expandMenuPreset(preset), false);
        }).join("") +
        "</ul>",
      "    </div>"
      ].join("")
    });
  }

  function getUserInitial(displayName) {
    const normalized = String(displayName || "").trim();
    if (!normalized) {
      return "W";
    }
    return normalized.slice(0, 1).toUpperCase();
  }

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

  function findExpandedExercise(exercises) {
    return (exercises || []).find(function (exercise) {
      return exercise.exerciseId === appState.ui.expandedExerciseId;
    });
  }

  function renderHistoryCard(workout) {
    const isOpen = Boolean(appState.ui.openHistoryIds[workout.workoutId]);
    return [
      '<article class="history-card history-card-accordion' +
        (isOpen ? " is-open" : "") +
        '">',
      '  <div class="history-card-head history-card-summary" data-disclosure-host>',
      '    <div class="history-card-copy">',
      '      <p class="history-meta history-meta-inline">' +
        escapeHtml(workout.date || "-") +
        " ・ " +
        escapeHtml(String((workout.exercises || []).length)) +
        "種目</p>",
      "      <h4>" + escapeHtml(resolveWorkoutTitle(workout.title, workout.user)) + "</h4>",
      "    </div>",
      '    <div class="history-actions history-actions-inline">',
      renderActionButton({
        label: "この内容で入力",
        variant: "pill-button history-action-button",
        action: "restore-history",
        attrs: {
          "data-workout-id": workout.workoutId
        }
      }),
      renderDisclosureToggle({
        isOpen: isOpen,
        action: "toggle-history-card",
        title: "履歴",
        attrs: {
          "data-workout-id": workout.workoutId
        }
      }),
      "    </div>",
      "  </div>",
      '  <div class="history-card-body' + (isOpen ? "" : ' is-hidden') + '">',
      renderWorkoutExerciseStats(workout),
      '    <div class="history-actions history-actions-end">',
      renderActionButton({
        label: "削除",
        variant: "danger-button history-action-button",
        action: "delete-history",
        attrs: {
          "data-workout-id": workout.workoutId
        }
      }),
      "    </div>",
      "  </div>",
      "</article>"
    ].join("");
  }

  function renderWorkoutExerciseStats(workout) {
    const exercises = getNamedExercises(workout);

    if (!exercises.length) {
      return "";
    }

    return [
      '<section class="workout-stats-section">',
      '  <div class="preview-grid">',
      exercises
        .map(function (exercise) {
          return renderExerciseStatCard(exercise);
        })
        .join(""),
      "  </div>",
      "</section>"
    ].join("");
  }

  function toggleHistoryCard(workoutId) {
    appState.ui.openHistoryIds[workoutId] = !appState.ui.openHistoryIds[workoutId];
    renderHistory();
  }

  // 種目が多いと LINE ではカードが横に並ぶ（カルーセル）。プレビューも同じく横スクロールで見せる
  function renderBubbleCarousel(workout, bubbles) {
    const items = bubbles.map(function (bubble, index) {
      return renderBubblePreview(workout, bubble, index);
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

  function renderBubblePreview(workout, bubble, index) {
    const exerciseBoxes = bubble.body && bubble.body.contents ? bubble.body.contents : [];
    const headerContents = bubble.header && bubble.header.contents ? bubble.header.contents : [];
    const headerMetaBox = headerContents[0] && headerContents[0].contents ? headerContents[0] : null;
    const dateText = headerMetaBox && headerMetaBox.contents[0] ? headerMetaBox.contents[0].text : workout.date || "-";
    const userText =
      headerMetaBox && headerMetaBox.contents[1] ? headerMetaBox.contents[1].text : "";
    const titleText = headerContents[1] ? headerContents[1].text : resolveWorkoutTitle(workout.title, workout.user);
    return [
      '<section class="preview-bubble">',
      '  <div class="preview-bubble-header preview-bubble-header-themed">',
      '    <div class="preview-header-meta">',
      '      <div class="preview-note">' + escapeHtml(dateText) + "</div>",
      userText ? '      <div class="preview-note preview-note-user">' + escapeHtml(userText) + "</div>" : "",
      "    </div>",
      '    <div class="preview-bubble-title">' + escapeHtml(titleText) + "</div>",
      "  </div>",
      exerciseBoxes
        .map(function (box) {
          const headerBox = box.contents[0] || { contents: [] };
          const title = headerBox.contents[0] ? headerBox.contents[0].text : "";
          const summary = headerBox.contents[1] ? headerBox.contents[1].text : "";
          const bodyLines = box.contents.slice(1);
          return [
            '<article class="preview-exercise preview-exercise-card">',
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
      escapeHtml(getCreditText()) +
      "</div>",
      "</section>"
    ].join("");
  }

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
        : '<div class="empty-state">ランキングデータはまだありません。</div>',
      "</article>"
    ].join("");
  }

  function renderExerciseStatCard(exercise) {
    const validSetCount = countValidSets(exercise);
    const caption = [String(validSetCount) + "セット"];

    if (exercise.primaryMuscle) {
      caption.push(exercise.primaryMuscle);
    }

    return [
      '<article class="summary-card summary-card-inline">',
      '  <div class="summary-card-main">',
      '    <strong class="summary-name">' + escapeHtml(exercise.name || "未入力種目") + "</strong>",
      '    <span class="summary-inline-meta">' + escapeHtml(caption.join(" / ")) + "</span>",
      "  </div>",
      '  <strong class="summary-value summary-value-inline">' +
        escapeHtml(exercise.maxEstimated1rm > 0 ? formatLocaleMetric(exercise.maxEstimated1rm, "kg", 1) : "-") +
        "</strong>",
      "</article>"
    ].join("");
  }

  function renderExercisePicker(exercise) {
    const muscleButtons = MUSCLE_FILTERS.filter(function (muscle) {
      return muscle !== "all";
    })
      .map(function (muscle) {
        const isActive = exercise.selectionMuscle === muscle;
        return (
          '<button class="catalog-chip' +
          (isActive ? " is-active" : "") +
          '" data-action="set-exercise-muscle" data-exercise-id="' +
          escapeHtml(exercise.exerciseId) +
          '" data-muscle="' +
          escapeHtml(muscle) +
          '" type="button">' +
          escapeHtml(muscle) +
          "</button>"
        );
      })
      .join("");

    const candidateExercises = exercise.selectionMuscle
      ? exercise.selectionMuscle === "その他"
        ? []
        : EXERCISE_CATALOG.filter(function (item) {
          return item.muscle === exercise.selectionMuscle;
        })
      : [];

    const exerciseCards = candidateExercises.length
      ? candidateExercises
        .map(function (item) {
          return (
            '<button class="catalog-chip exercise-option-button' +
            '" data-action="choose-exercise-card" data-exercise-id="' +
            escapeHtml(exercise.exerciseId) +
            '" data-catalog-id="' +
            escapeHtml(item.id) +
            '" type="button">' +
            escapeHtml(item.name) +
            "</button>"
          );
        })
        .join("")
      : exercise.selectionMuscle === "その他"
        ? '<div class="empty-state compact">自由入力で種目を追加します。</div>'
      : exercise.selectionMuscle
        ? '<div class="empty-state compact">この部位には候補がまだありません。手入力で追加できます。</div>'
        : '<div class="empty-state compact">先に部位を選ぶと、候補の種目が表示されます。</div>';

    return [
      '<div class="exercise-picker selection-shell">',
      '  <div class="field-group">',
      '    <span class="field-label">1. 部位を選択</span>',
      '    <div class="catalog-filter-row">' + muscleButtons + "</div>",
      "  </div>",
      '  <div class="field-group">',
      '    <span class="field-label">2. 種目を選択</span>',
      '    <div class="exercise-option-list">' + exerciseCards + "</div>",
      exercise.selectionMuscle
        ? '    <div class="between-exercise-action"><button class="outline-button between-exercise-button" data-action="start-custom-exercise" data-exercise-id="' +
        escapeHtml(exercise.exerciseId) +
        '" type="button">' +
        "＋自由入力" +
        "</button></div>"
        : "",
      "  </div>",
      "</div>"
    ].join("");
  }

  function isExerciseExpanded(exerciseId) {
    if (!exerciseId) {
      return false;
    }
    return appState.ui.expandedExerciseId === exerciseId;
  }

  function getDefaultExpandedExerciseId(exercises) {
    const matchedExercise = (exercises || []).find(function (exercise) {
      return Boolean(exercise && (exercise.catalogId || exercise.isCustom));
    });
    return matchedExercise ? matchedExercise.exerciseId : "";
  }

  function isExerciseMemoOpen(exerciseId) {
    return Boolean(appState.ui.memoOpenExerciseIds[exerciseId]);
  }

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

  function getExerciseMemoButtonLabel(exercise) {
    const isOpen = isExerciseMemoOpen(exercise.exerciseId);
    const hasMemo = Boolean(String(exercise.memo || "").trim());

    if (isOpen) {
      return "メモをたたむ";
    }

    return hasMemo ? "メモ編集" : "＋メモ追加";
  }

  function renderExerciseMemoField(exercise) {
    const isOpen = isExerciseMemoOpen(exercise.exerciseId);
    if (!isOpen) {
      return "";
    }

    return fieldTemplate({
      label: "種目メモ",
      className: "memo-field",
      input:
        '<textarea class="textarea-input compact-textarea" data-exercise-field="memo" data-exercise-id="' +
        escapeHtml(exercise.exerciseId) +
        '" placeholder="フォームや調子のメモ">' +
        escapeHtml(exercise.memo || "") +
        "</textarea>"
    });
  }

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

  function resetWorkout() {
    if (!window.confirm("現在の入力内容をリセットしますか？")) {
      return;
    }
    replaceWorkout(createEmptyWorkout(), "入力内容をリセットしました。");
  }

  function deleteHistory(workoutId) {
    const shouldDelete = window.confirm("この履歴を削除しますか？");
    if (!shouldDelete) {
      return;
    }
    appState.history = LocalStorageWorkoutRepository.deleteById(workoutId);
    renderHistory();
    renderShell();
    setStatus("履歴を削除しました。", "info");
  }

  function changeRankingPeriod(period) {
    if (!isRankingEnabled()) {
      return;
    }
    appState.rankingPeriod = period === "month" ? "month" : "week";
    renderRanking();
  }

  async function copyCurrentFlexJson() {
    if (!isDebugModeEnabled()) {
      setStatus("Flex JSONコピーはデバッグモードでのみ利用できます。", "warn");
      return;
    }
    const validation = validateWorkout(appState.workout);
    if (!validation.valid) {
      setStatus(validation.errors.join(" "), "error");
      return;
    }

    const message = buildWorkoutFlexMessage(validation.workout);
    const copied = await copyText(JSON.stringify(message, null, 2));
    appState.activeTab = "preview";
    appState.ui.openJsonPreview = true;
    renderShell();
    renderPreview();

    if (copied) {
      setStatus("Flex JSON をコピーしました。", "info");
    } else {
      setStatus("クリップボードへコピーできなかったため、JSONプレビューを開いています。", "warn");
    }
  }

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
