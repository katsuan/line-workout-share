import {
  APP_CONFIG,
  DEFAULT_THEME,
  DEFAULT_USER,
  EXERCISE_CATALOG,
  FEATURE_FLAGS,
  MUSCLE_FILTERS
} from "./constants.js";
import {
  applyTheme as applyThemeToDocument,
  getFlexTheme as buildFlexTheme,
  loadThemePreference as loadStoredThemePreference,
  normalizeHexColor as normalizeThemeHexColor,
  saveThemePreference as persistThemePreference
} from "./theme.js";
import {
  initLiff as initializeLiffState,
  isAnonymousProfile as checkAnonymousProfile,
  isLiffShareAvailable as checkLiffShareAvailable,
  loadCachedProfile as readCachedProfile,
  safelyGetLiffContext as readLiffContext
} from "./liff.js";
import {
  buildWorkoutFlexMessage as buildWorkoutFlexPayload,
  calculateWorkout as calculateWorkoutMetrics,
  countNamedExercises as countNamedExercisesValue,
  createEmptyExercise as createExerciseModel,
  createEmptySet as createSetModel,
  createEmptyWorkout as createWorkoutModel,
  getDefaultWorkoutTitle as buildDefaultWorkoutTitle,
  hydrateWorkout as hydrateWorkoutModel,
  resolveWorkoutTitle as resolveWorkoutTitleText,
  sanitizeWorkout as sanitizeWorkoutModel
} from "./workout.js";
import {
  createApiWorkoutRepository,
  createLocalStorageWorkoutRepository
} from "./repositories.js";

(function () {

  const appState = {
    activeTab: "input",
    workout: null,
    rankingPeriod: "week",
    rankingData: null,
    history: [],
    status: {
      message: "",
      type: "info"
    },
    ui: {
      openJsonPreview: false,
      catalogFilter: "all",
      catalogQuery: "",
      suppressScrollSpyUntil: 0,
      expandedExerciseId: null,
      memoOpenExerciseIds: {},
      settingsModalOpen: false,
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

  document.addEventListener("DOMContentLoaded", initApp);

  function isDebugModeEnabled() {
    return Boolean(FEATURE_FLAGS.enableDebugMode);
  }

  function isRankingEnabled() {
    return isDebugModeEnabled() && Boolean(FEATURE_FLAGS.enableRanking);
  }

  function getFilteredExerciseCatalog() {
    return EXERCISE_CATALOG.filter(function (exercise) {
      const matchesFilter =
        appState.ui.catalogFilter === "all" || exercise.muscle === appState.ui.catalogFilter;
      const query = appState.ui.catalogQuery.trim();
      const matchesQuery = !query || exercise.name.indexOf(query) !== -1;
      return matchesFilter && matchesQuery;
    });
  }

  function findCatalogExercise(catalogId) {
    return EXERCISE_CATALOG.find(function (item) {
      return item.id === catalogId;
    });
  }

  async function initApp() {
    cacheElements();
    bindEvents();
    document.title = APP_CONFIG.APP_NAME || "Workout Share";

    appState.theme = loadThemePreference();
    applyTheme(appState.theme.baseColor);
    appState.liff.profile = loadCachedProfile();
    appState.workout = createEmptyWorkout();
    appState.history = loadWorkoutHistory();
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
    if (!liffResult.ready) {
      setStatus(
        isDebugModeEnabled()
          ? "共有機能を使えないため、プレビュー中心で起動しました。デバッグ用のJSON確認は利用できます。"
          : "この環境では共有機能を使えないため、プレビュー中心で起動しました。",
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

  function loadCachedProfile() {
    return readCachedProfile();
  }

  function isAnonymousProfile(profile) {
    return checkAnonymousProfile(profile);
  }

  function loadThemePreference() {
    return loadStoredThemePreference();
  }

  function saveThemePreference() {
    persistThemePreference(appState.theme);
  }

  function updateTheme(baseColor) {
    const normalizedColor = normalizeHexColor(baseColor);
    if (!normalizedColor) {
      return;
    }
    appState.theme.baseColor = normalizedColor;
    applyTheme(normalizedColor);
    saveThemePreference();
  }

  function resetTheme() {
    appState.theme = Object.assign({}, DEFAULT_THEME);
    applyTheme(appState.theme.baseColor);
    saveThemePreference();
  }

  function applyTheme(baseColor) {
    applyThemeToDocument(baseColor);
  }

  function getFlexTheme() {
    const baseColor =
      appState.theme && appState.theme.baseColor ? appState.theme.baseColor : DEFAULT_THEME.baseColor;
    return buildFlexTheme(baseColor);
  }

  function normalizeHexColor(value) {
    return normalizeThemeHexColor(value);
  }

  function createEmptyWorkout() {
    return createWorkoutModel();
  }

  function createEmptyExercise() {
    return createExerciseModel();
  }

  function createEmptySet() {
    return createSetModel();
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
    renderInput();
    renderPreview();
    renderShell();
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
    renderInput();
    renderPreview();
    renderShell();
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
    renderInput();
    renderPreview();
    renderShell();
  }

  function addSet(exerciseId) {
    const exercise = appState.workout.exercises.find(function (item) {
      return item.exerciseId === exerciseId;
    });
    if (!exercise) {
      return;
    }
    exercise.sets.push(createEmptySet());
    appState.ui.expandedExerciseId = exerciseId;
    touchWorkout();
    renderInput();
    renderPreview();
  }

  function removeSet(exerciseId, setId) {
    const exercise = appState.workout.exercises.find(function (item) {
      return item.exerciseId === exerciseId;
    });
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
    const exercise = appState.workout.exercises.find(function (item) {
      return item.exerciseId === exerciseId;
    });
    if (!exercise) {
      return;
    }
    exercise.selectionMuscle = muscle;
    appState.ui.expandedExerciseId = exerciseId;
    renderInput();
  }

  function chooseExerciseCatalog(exerciseId, catalogId) {
    const exercise = appState.workout.exercises.find(function (item) {
      return item.exerciseId === exerciseId;
    });
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
    const exercise = appState.workout.exercises.find(function (item) {
      return item.exerciseId === exerciseId;
    });
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

  function resetExerciseChoice(exerciseId) {
    const exercise = appState.workout.exercises.find(function (item) {
      return item.exerciseId === exerciseId;
    });
    if (!exercise) {
      return;
    }
    exercise.catalogId = "";
    exercise.isCustom = false;
    exercise.primaryMuscle = "";
    exercise.selectionMuscle = "";
    exercise.name = "";
    exercise.memo = "";
    exercise.sets = [createEmptySet()];
    appState.ui.expandedExerciseId = exerciseId;
    delete appState.ui.memoOpenExerciseIds[exerciseId];
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

  function calculateWorkout(workout) {
    return calculateWorkoutMetrics(workout);
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
      const hasValidSet = (exercise.sets || []).some(function (set) {
        return isValidSetInput(toNullableNumber(set.weight), toNullableNumber(set.reps));
      });
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

  function restoreWorkout(workoutId) {
    const restored = LocalStorageWorkoutRepository.findById(workoutId);
    if (!restored) {
      setStatus("選択した履歴が見つかりませんでした。", "warn");
      return;
    }

    appState.workout = hydrateWorkout(restored);
    syncWorkoutUser();
    appState.ui.expandedExerciseId = appState.workout.exercises[0]
      ? appState.workout.exercises[0].exerciseId
      : "";
    appState.activeTab = "input";
    renderShell();
    renderInput();
    renderPreview();
    setStatus("履歴を入力フォームへ戻しました。", "info");
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
        setStatus("この環境では共有を実行できません。対応環境で開いてください。", "warn");
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
    const html = [
      '<div class="input-stack">',
      '  <section class="panel-card input-card">',
      '    <div class="panel-head">',
      '      <div class="input-head-row">',
      renderSettingsTrigger(),
      '        <h2 class="panel-title">記録入力</h2>',
      "      </div>",
      "    </div>",
      '    <div class="form-grid two-col">',
      fieldTemplate({
        label: "日付",
        className: "tile-field",
        input:
          '<input class="text-input date-input" aria-label="日付" data-field="date" type="date" value="' +
          escapeHtml(workout.date || "") +
          '" />'
      }),
      fieldTemplate({
        label: "ワークアウトタイトル",
        className: "tile-field",
        input:
          '<input class="text-input" aria-label="ワークアウトタイトル" data-field="title" type="text" placeholder="背中トレ など" value="' +
          escapeHtml(workout.title || "") +
          '" />'
      }),
      "    </div>",
      renderInputUtilityActions(),
      "  </section>",
      renderSettingsModal(),
      renderCurrentExerciseIndicator(workout.exercises),
      renderExerciseStack(workout.exercises),
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

    const html = [
      '<div class="preview-stack">',
      '  <section class="panel-card preview-host-card">',
      '    <div class="panel-head">',
      "      <div>",
      '        <h2 class="panel-title">送信内容</h2>',
      "        <p>LINEで共有される内容です。</p>",
      "      </div>",
      "    </div>",
      validation.valid
        ? '<p class="preview-note">入力内容がそのまま共有メッセージになります。</p>'
        : '<p class="preview-note">共有前に入力タブで不足項目を埋めてください。' +
        escapeHtml(validation.errors.join(" ")) +
        "</p>",
      bubbles
        .map(function (bubble, index) {
          return renderBubblePreview(shareableWorkout, bubble, index);
        })
        .join(""),
      "  </section>",
      renderExerciseMetrics(calculatedWorkout),
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

  const LocalStorageWorkoutRepository = {
    ...createLocalStorageWorkoutRepository(hydrateWorkout)
  };

  const ApiWorkoutRepository = createApiWorkoutRepository(resolveGroupKey, mockRanking);

  function handleClick(event) {
    const button = event.target.closest("button");
    if (!button) {
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

    const action = button.getAttribute("data-action");
    if (!action) {
      return;
    }

    switch (action) {
      case "close-status":
        clearStatus();
        break;
      case "open-history-input":
        setActiveTab("history");
        break;
      case "sample-workout":
        applySampleWorkout();
        break;
      case "reset-workout":
        resetWorkout();
        break;
      case "remove-exercise":
        removeExercise(button.getAttribute("data-exercise-id"));
        break;
      case "add-set":
        addSet(button.getAttribute("data-exercise-id"));
        break;
      case "remove-set":
        removeSet(button.getAttribute("data-exercise-id"), button.getAttribute("data-set-id"));
        break;
      case "restore-history":
        restoreWorkout(button.getAttribute("data-workout-id"));
        break;
      case "delete-history":
        deleteHistory(button.getAttribute("data-workout-id"));
        break;
      case "toggle-history-card":
        toggleHistoryCard(button.getAttribute("data-workout-id"));
        break;
      case "change-ranking-period":
        changeRankingPeriod(button.getAttribute("data-period"));
        break;
      case "change-muscle-filter":
        appState.ui.catalogFilter = button.getAttribute("data-muscle") || "all";
        renderInput();
        break;
      case "add-quick-exercise":
        addExercise(button.getAttribute("data-catalog-id"));
        break;
      case "insert-exercise-after":
        insertExerciseAfter(
          button.getAttribute("data-after-exercise-id"),
          button.getAttribute("data-catalog-id")
        );
        break;
      case "set-exercise-muscle":
        updateExerciseSelectionMuscle(
          button.getAttribute("data-exercise-id"),
          button.getAttribute("data-muscle") || ""
        );
        break;
      case "choose-exercise-card":
        chooseExerciseCatalog(
          button.getAttribute("data-exercise-id"),
          button.getAttribute("data-catalog-id")
        );
        break;
      case "start-custom-exercise":
        startCustomExercise(button.getAttribute("data-exercise-id"));
        break;
      case "change-exercise-choice":
        resetExerciseChoice(button.getAttribute("data-exercise-id"));
        break;
      case "toggle-exercise-panel":
        toggleExercisePanel(button.getAttribute("data-exercise-id"));
        break;
      case "toggle-exercise-memo":
        toggleExerciseMemo(button.getAttribute("data-exercise-id"));
        break;
      case "open-settings-modal":
        appState.ui.settingsModalOpen = true;
        renderInput();
        break;
      case "close-settings-modal":
        appState.ui.settingsModalOpen = false;
        renderInput();
        break;
      case "reset-theme":
        resetTheme();
        renderInput();
        renderPreview();
        break;
      default:
        break;
    }
  }

  function handleInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
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
      const exercise = appState.workout.exercises.find(function (item) {
        return item.exerciseId === exerciseId;
      });
      if (!exercise) {
        return;
      }
      exercise[field] = target.value;
      touchWorkout();
      renderPreview();
      return;
    }

    if (target.hasAttribute("data-exercise-select")) {
      const exerciseId = target.getAttribute("data-exercise-id");
      const exercise = appState.workout.exercises.find(function (item) {
        return item.exerciseId === exerciseId;
      });
      if (!exercise) {
        return;
      }
      if (target.value) {
        applyCatalogToExercise(exercise, target.value);
      } else {
        exercise.catalogId = "";
        exercise.primaryMuscle = "";
      }
      touchWorkout();
      renderInput();
      renderPreview();
      return;
    }

    if (target.hasAttribute("data-set-field")) {
      const exerciseId = target.getAttribute("data-exercise-id");
      const setId = target.getAttribute("data-set-id");
      const field = target.getAttribute("data-set-field");
      const exercise = appState.workout.exercises.find(function (item) {
        return item.exerciseId === exerciseId;
      });
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

    elements.tabButtons.forEach(function (button) {
      const isActive = button.getAttribute("data-tab") === appState.activeTab;
      button.classList.toggle("is-active", isActive);
    });

    if (elements.tabRankingButton) {
      elements.tabRankingButton.hidden = !isRankingEnabled();
      elements.tabRankingButton.style.display = isRankingEnabled() ? "" : "none";
    }
    if (elements.tabNav) {
      elements.tabNav.classList.toggle("has-ranking", isRankingEnabled());
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

    const previewCount = countNamedExercises(appState.workout);

    elements.tabButtons.forEach(function (button) {
      const tab = button.getAttribute("data-tab");
      if (tab === "input") {
        button.innerHTML = renderTabButtonLabel("入力", "");
      } else if (tab === "preview") {
        button.innerHTML = renderTabButtonLabel("プレビュー", String(previewCount) + "件");
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

  function renderActiveTab() {
    switch (appState.activeTab) {
      case "preview":
        renderPreview();
        break;
      case "history":
        renderHistory();
        break;
      case "ranking":
        if (isRankingEnabled()) {
          renderRanking();
        }
        break;
      case "input":
      default:
        renderInput();
        break;
    }
  }

  function getPanelElement(tab) {
    switch (tab) {
      case "preview":
        return elements.tabPreview;
      case "history":
        return elements.tabHistory;
      case "ranking":
        return elements.tabRanking;
      case "input":
      default:
        return elements.tabInput;
    }
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

    elements.actionBar.classList.toggle("has-debug-actions", isDebugModeEnabled());
    elements.copyJsonButton.hidden = !isDebugModeEnabled();
    elements.copyJsonButton.textContent = appState.liff.shareAvailable
      ? "Flex JSONコピー"
      : "デバッグコピー";
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
      { tab: "input", element: elements.tabInput },
      { tab: "preview", element: elements.tabPreview },
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

  function safelyGetLiffContext() {
    return readLiffContext();
  }

  function isLiffShareAvailable() {
    return checkLiffShareAvailable(appState.liff.ready);
  }

  function touchWorkout(renewWorkoutId) {
    appState.workout = calculateWorkout(appState.workout);
    if (renewWorkoutId !== false) {
      appState.workout.workoutId = appState.workout.workoutId || generateId("workout");
    }
    appState.workout.updatedAt = new Date().toISOString();
    appState.ui.openJsonPreview = false;
  }

  function hydrateWorkout(workout) {
    return hydrateWorkoutModel(workout);
  }

  function sanitizeWorkout(workout) {
    return sanitizeWorkoutModel(workout, resolveGroupKey);
  }

  function getDefaultWorkoutTitle(user) {
    return buildDefaultWorkoutTitle(user);
  }

  function resolveWorkoutTitle(title, user) {
    return resolveWorkoutTitleText(title, user);
  }

  function renderExerciseCard(exercise, exerciseIndex) {
    const showExerciseFields = Boolean(exercise.catalogId || exercise.isCustom);
    const exerciseTitle = exercise.isCustom
      ? "種目名を入力"
      : exercise.name || "種目を選択";
    const isExpanded = !showExerciseFields || isExerciseExpanded(exercise.exerciseId);
    const summary = showExerciseFields ? renderExerciseSummary(exercise) : "";
    const canRemoveExercise = appState.workout.exercises.length > 1;

    return [
      '<section class="exercise-card" data-exercise-card-id="' +
        escapeHtml(exercise.exerciseId) +
        '">',
      '  <div class="exercise-header">',
      "    <div>",
      '      <p class="section-label">エクササイズ ' + (exerciseIndex + 1) + "</p>",
      '      <h3 class="exercise-title">' +
        escapeHtml(exerciseTitle) +
        "</h3>",
      summary ? '      <p class="exercise-meta compact">' + summary + "</p>" : "",
      "    </div>",
      '    <div class="exercise-actions">' +
        (showExerciseFields
          ? renderActionButton({
              label: isExpanded ? "閉じる" : "開く",
              icon: isExpanded ? "▴" : "▾",
              variant: "outline-button compact-action-button exercise-toggle-button",
              action: "toggle-exercise-panel",
              title: isExpanded ? "種目をたたむ" : "種目を開く",
              attrs: {
                "data-exercise-id": exercise.exerciseId
              }
            })
          : "") +
        renderActionButton({
          label: "削除",
          icon: "🗑",
          variant: "danger-button compact-action-button",
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

  function renderSetRow(exerciseId, set, setIndex) {
    const hasValidSet = isValidSetInput(toNullableNumber(set.weight), toNullableNumber(set.reps));
    const exercise = appState.workout.exercises.find(function (item) {
      return item.exerciseId === exerciseId;
    });
    const canRemoveSet = exercise ? exercise.sets.length > 1 : false;
    const isMaxRmSet =
      Boolean(exercise && exercise.maxEstimated1rm) &&
      hasValidSet &&
      roundNumber(set.estimated1rm || 0, 1) === roundNumber(exercise.maxEstimated1rm || 0, 1);
    return [
      '<div class="set-row">',
      '  <div class="set-row-main">',
      '    <div class="set-side">',
      '      <span class="set-badge">Set ' +
        (setIndex + 1) +
        "</span>",
      renderActionButton({
        label: "削除",
        icon: "−",
        variant: "danger-button compact-action-button set-remove-button",
        action: "remove-set",
        title: "セット削除",
        disabled: !canRemoveSet,
        attrs: {
          "data-exercise-id": exerciseId,
          "data-set-id": set.setId
        }
      }),
      "    </div>",
      '    <label class="inline-field tile-field compact-tile-field">',
      "      <span>kg</span>",
      '      <input class="number-input" aria-label="kg" data-set-field="weight" data-exercise-id="' +
      escapeHtml(exerciseId) +
      '" data-set-id="' +
      escapeHtml(set.setId) +
      '" type="number" inputmode="decimal" step="0.5" min="0" placeholder="0" value="' +
      escapeHtml(String(set.weight ?? "")) +
      '" />',
      "    </label>",
      '    <label class="inline-field tile-field compact-tile-field">',
      "      <span>reps</span>",
      '      <input class="number-input" aria-label="reps" data-set-field="reps" data-exercise-id="' +
      escapeHtml(exerciseId) +
      '" data-set-id="' +
      escapeHtml(set.setId) +
      '" type="number" inputmode="numeric" step="1" min="0" placeholder="0" value="' +
      escapeHtml(String(set.reps ?? "")) +
      '" />',
      "    </label>",
      '    <div class="set-head-meta' +
        (isMaxRmSet ? " is-max-rm" : "") +
        '" data-set-meta="estimated1rm" data-exercise-id="' +
        escapeHtml(exerciseId) +
        '" data-set-id="' +
        escapeHtml(set.setId) +
        '"><small class="metric-label">RM</small><strong class="metric-value" data-set-summary="estimated1rm" data-exercise-id="' +
        escapeHtml(exerciseId) +
        '" data-set-id="' +
        escapeHtml(set.setId) +
        '">' +
        escapeHtml(hasValidSet ? formatMetric(set.estimated1rm || 0, "kg", 1) : "-") +
        "</strong></div>",
      "  </div>",
      "</div>"
    ].join("");
  }

  function syncRenderedSetSummary(exerciseId) {
    const exercise = appState.workout.exercises.find(function (item) {
      return item.exerciseId === exerciseId;
    });
    if (!exercise) {
      return;
    }

    const maxRm = roundNumber(exercise.maxEstimated1rm || 0, 1);
    (exercise.sets || []).forEach(function (set) {
      const summaryNode = document.querySelector(
        '[data-set-summary="estimated1rm"][data-exercise-id="' +
        cssEscape(exerciseId) +
        '"][data-set-id="' +
        cssEscape(set.setId) +
        '"]'
      );
      const metaNode = document.querySelector(
        '[data-set-meta="estimated1rm"][data-exercise-id="' +
        cssEscape(exerciseId) +
        '"][data-set-id="' +
        cssEscape(set.setId) +
        '"]'
      );
      if (!summaryNode || !metaNode) {
        return;
      }

      const hasValidSet = isValidSetInput(toNullableNumber(set.weight), toNullableNumber(set.reps));
      summaryNode.textContent = hasValidSet ? formatMetric(set.estimated1rm || 0, "kg", 1) : "-";
      metaNode.classList.toggle(
        "is-max-rm",
        Boolean(maxRm) && hasValidSet && roundNumber(set.estimated1rm || 0, 1) === maxRm
      );
    });
  }

  function renderExerciseMetrics(workout) {
    const previewExercises = (workout.exercises || []).filter(function (exercise) {
      return Boolean((exercise.name || "").trim());
    });

    if (!previewExercises.length) {
      return "";
    }

    return [
      '<section class="panel-card">',
      '  <div class="panel-head stats-head">',
      '    <h2 class="panel-title">STATS</h2>',
      '    <span class="badge">' + escapeHtml(String(previewExercises.length)) + "種目</span>",
      "  </div>",
      '  <div class="stats-list">',
      previewExercises
        .map(function (exercise) {
          return renderExerciseStatCard(exercise);
        })
        .join(""),
      "  </div>",
      "</section>"
    ].join("");
  }

  function renderInputUtilityActions() {
    return [
      '<div class="input-utility-card">',
      '  <div class="input-utility-title">入力操作</div>',
      '  <div class="button-row utility-button-row">',
      renderActionButton({
        label: "サンプル",
        variant: "outline-button utility-button",
        action: "sample-workout"
      }),
      renderActionButton({
        label: "履歴から",
        variant: "pill-button utility-button",
        action: "open-history-input"
      }),
      renderActionButton({
        label: "初期化",
        variant: "danger-button utility-button",
        action: "reset-workout"
      }),
      "  </div>",
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
    return [
      '<div class="settings-modal-backdrop">',
      '  <button class="settings-modal-scrim" data-action="close-settings-modal" type="button" aria-label="閉じる"></button>',
      '  <section class="settings-modal" role="dialog" aria-modal="true" aria-label="表示設定">',
      '    <div class="settings-modal-head">',
      '      <h3 class="panel-title">ベースカラー設定</h3>',
      '      <button class="ghost-button modal-close-button" data-action="close-settings-modal" type="button">閉じる</button>',
      "    </div>",
      '    <p class="settings-modal-copy">アプリと送信プレビューの基調色を変更できます。</p>',
      '    <div class="settings-color-row">',
      '      <label class="tile-field settings-color-field">',
      '        <span class="field-label">ベースカラー</span>',
      '        <input class="color-input" data-theme-field="baseColor" type="color" value="' +
        escapeHtml(appState.theme.baseColor || DEFAULT_THEME.baseColor) +
        '" />',
      "      </label>",
      '      <label class="tile-field settings-hex-field">',
      '        <span class="field-label">HEX</span>',
      '        <input class="text-input" data-theme-field="baseColor" type="text" inputmode="text" value="' +
        escapeHtml(appState.theme.baseColor || DEFAULT_THEME.baseColor) +
        '" placeholder="#C96A2D" />',
      "      </label>",
      "    </div>",
      '    <div class="settings-modal-actions">',
      '      <button class="danger-button" data-action="reset-theme" type="button">初期色に戻す</button>',
      "    </div>",
      "  </section>",
      "</div>"
    ].join("");
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

    return [
      '<div class="current-exercise-indicator">',
      '  <span class="current-exercise-label">入力中</span>',
      '  <strong class="current-exercise-name">エクササイズ ' +
        escapeHtml(String(currentIndex + 1)) +
        " ・ " +
        escapeHtml(currentExercise.name || "種目を選択") +
        "</strong>",
      "</div>"
    ].join("");
  }

  function findExpandedExercise(exercises) {
    return (exercises || []).find(function (exercise) {
      return exercise.exerciseId === appState.ui.expandedExerciseId;
    });
  }

  function countNamedExercises(workout) {
    return countNamedExercisesValue(workout);
  }

  function renderHistoryCard(workout) {
    const isOpen = Boolean(appState.ui.openHistoryIds[workout.workoutId]);
    return [
      '<article class="history-card history-card-accordion' +
        (isOpen ? " is-open" : "") +
        '">',
      '  <div class="history-card-head history-card-summary">',
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
        label: "適用",
        variant: "pill-button history-action-button",
        action: "restore-history",
        attrs: {
          "data-workout-id": workout.workoutId
        }
      }),
      renderActionButton({
        label: isOpen ? "閉じる" : "開く",
        variant: "outline-button history-action-button",
        action: "toggle-history-card",
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
    const exercises = (workout.exercises || []).filter(function (exercise) {
      return Boolean((exercise.name || "").trim());
    });

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
                  const left = line.contents[0] ? line.contents[0].text : "";
                  const main = line.contents[1] ? line.contents[1].text : "";
                  const badge =
                    line.contents[2] && line.contents[2].contents && line.contents[2].contents[0]
                      ? line.contents[2].contents[0].text
                      : "";
                  return (
                    '<div class="preview-set-line"><span>' +
                    escapeHtml(left + " " + main) +
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
      escapeHtml("Powered by " + (APP_CONFIG.APP_NAME || "Workout Share")) +
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
              '  <strong>' + escapeHtml(formatMetric(row.value, unit, 1)) + "</strong>",
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
    const validSetCount = (exercise.sets || []).filter(function (set) {
      return isValidSetInput(toNullableNumber(set.weight), toNullableNumber(set.reps));
    }).length;
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
        escapeHtml(formatMetric(exercise.maxEstimated1rm || 0, "kg", 1)) +
        "</strong>",
      "</article>"
    ].join("");
  }

  function renderActionButton(options) {
    const attrs = Object.assign({}, options.attrs || {});
    const attributeText = Object.keys(attrs)
      .map(function (key) {
        return " " + key + '="' + escapeHtml(String(attrs[key])) + '"';
      })
      .join("");
    const isDisabled = Boolean(options.disabled);

    return (
      '<button class="' +
      escapeHtml(options.variant || "outline-button") +
      (isDisabled ? " is-disabled" : "") +
      '" aria-label="' +
      escapeHtml(options.title || options.label) +
      '" title="' +
      escapeHtml(options.title || options.label) +
      '" data-action="' +
      escapeHtml(options.action || "") +
      '"' +
      attributeText +
      (isDisabled ? " disabled" : "") +
      ' type="button">' +
      '<span class="action-label">' +
      escapeHtml(options.label || "") +
      "</span>" +
      (options.icon
        ? '<span class="action-icon" aria-hidden="true">' + escapeHtml(options.icon) + "</span>"
        : "") +
      "</button>"
    );
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(String(value));
    }
    return String(value).replace(/["\\]/g, "\\$&");
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
          const isWide = item.name.length >= 9;
          return (
            '<button class="catalog-chip exercise-option-button' +
            (isWide ? " is-wide" : "") +
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
        escapeHtml(exercise.selectionMuscle === "その他" ? "＋自由入力" : "＋自由入力") +
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
    const validSetCount = (exercise.sets || []).filter(function (set) {
      return isValidSetInput(toNullableNumber(set.weight), toNullableNumber(set.reps));
    }).length;
    const summaryParts = [];

    if (validSetCount > 0) {
      summaryParts.push(validSetCount + "セット");
    }
    if (exercise.maxEstimated1rm > 0) {
      summaryParts.push("RM " + formatMetric(exercise.maxEstimated1rm, "kg", 1));
    }

    return summaryParts.join(" / ");
  }

  function getExerciseMemoButtonLabel(exercise) {
    const isOpen = isExerciseMemoOpen(exercise.exerciseId);
    const hasMemo = Boolean(String(exercise.memo || "").trim());

    if (isOpen) {
      return "メモを閉じる";
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

  function fieldTemplate(options) {
    return [
      '<label class="field-group' +
        (options.className ? " " + escapeHtml(options.className) : "") +
        '">',
      '  <span class="field-label">' + escapeHtml(options.label) + "</span>",
      "  " + options.input,
      "</label>"
    ].join("");
  }

  function applySampleWorkout() {
    const timestamp = new Date().toISOString();
    appState.workout = hydrateWorkout({
      workoutId: generateId("workout"),
      date: getTodayLocalDate(),
      title: "上半身ワークアウト",
      user: Object.assign({}, DEFAULT_USER, appState.liff.profile || {}),
      groupKey: resolveGroupKey(),
      exercises: [
        {
          exerciseId: generateId("exercise"),
          catalogId: "bench-press",
          primaryMuscle: "胸",
          name: "ベンチプレス",
          memo: "最後のセットはしっかり止めて挙上。",
          sets: [
            { setId: generateId("set"), weight: 60, reps: 8 },
            { setId: generateId("set"), weight: 65, reps: 6 },
            { setId: generateId("set"), weight: 67.5, reps: 5 }
          ]
        },
        {
          exerciseId: generateId("exercise"),
          catalogId: "lat-pulldown",
          primaryMuscle: "背中",
          name: "ラットプルダウン",
          memo: "肩をすくめずに広背筋に乗せる。",
          sets: [
            { setId: generateId("set"), weight: 45, reps: 12 },
            { setId: generateId("set"), weight: 50, reps: 10 }
          ]
        }
      ],
      createdAt: timestamp,
      updatedAt: timestamp
    });

    renderInput();
    renderPreview();
    renderShell();
    setStatus("サンプル入力を反映しました。", "info");
  }

  function resetWorkout() {
    const shouldReset = window.confirm("現在の入力内容をリセットしますか？");
    if (!shouldReset) {
      return;
    }
    appState.workout = createEmptyWorkout();
    syncWorkoutUser();
    renderInput();
    renderPreview();
    renderShell();
    setStatus("入力内容をリセットしました。", "info");
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

  function mockRanking() {
    return {
      week: {
        estimated1rm: [
          { name: "Katsu", value: 122.5, label: "Bench Press" },
          { name: "Mika", value: 118.0, label: "Squat" },
          { name: "Ren", value: 110.5, label: "Deadlift" }
        ],
        totalVolume: [
          { name: "Mika", value: 16420, label: "12 workouts" },
          { name: "Katsu", value: 14980, label: "10 workouts" },
          { name: "Ren", value: 13120, label: "9 workouts" }
        ]
      },
      month: {
        estimated1rm: [
          { name: "Mika", value: 130.0, label: "Squat" },
          { name: "Katsu", value: 125.5, label: "Bench Press" },
          { name: "Ren", value: 119.0, label: "Deadlift" }
        ],
        totalVolume: [
          { name: "Mika", value: 58240, label: "38 workouts" },
          { name: "Ren", value: 56320, label: "35 workouts" },
          { name: "Katsu", value: 54110, label: "34 workouts" }
        ]
      }
    };
  }

  function isValidSetInput(weight, reps) {
    return Number.isFinite(weight) && weight > 0 && Number.isFinite(reps) && reps > 0;
  }

  function toNullableNumber(value) {
    if (value === "" || value === null || typeof value === "undefined") {
      return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function formatMetric(value, unit, digits) {
    const normalized = Number(value || 0);
    const fractionDigits = typeof digits === "number" ? digits : 0;
    return normalized.toLocaleString("ja-JP", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits
    }) + (unit ? " " + unit : "");
  }

  function roundNumber(value, digits) {
    const factor = Math.pow(10, digits || 0);
    return Math.round(Number(value || 0) * factor) / factor;
  }

  function generateId(prefix) {
    return (prefix || "id") + "-" + Math.random().toString(36).slice(2, 10);
  }

  function getTodayLocalDate() {
    const date = new Date();
    const tzOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffset).toISOString().slice(0, 10);
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) {
      return text;
    }
    return text.slice(0, maxLength - 1) + "…";
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
