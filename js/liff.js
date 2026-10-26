// キロっく：LINE とつなぐところ（LIFF の準備・LINE の名前と写真・送り先選びが使えるか・ブラウザ版から LINE 版へ移る URL とログイン）。
// app.js から読む（import）
import {
  APP_CONFIG,
  DEFAULT_USER,
  STORAGE_KEYS
} from "./settings.js?v=202610261300";

// LIFF を準備して、使えるか・送れるか・LINE の名前を返す（使えないときも止めない）
export async function initLiff({ cachedProfile }) {
  const state = {
    initialized: true,
    ready: false,
    previewOnly: true,
    shareAvailable: false,
    profile: Object.assign({}, DEFAULT_USER, cachedProfile || {}),
    context: null,
    error: null
  };

  if (!window.liff || !APP_CONFIG.LIFF_ID || APP_CONFIG.LIFF_ID === "YOUR_LIFF_ID") {
    state.error = "LIFF_ID is not configured.";
    return state;
  }

  try {
    await window.liff.init({ liffId: APP_CONFIG.LIFF_ID });
    state.ready = true;
    state.previewOnly = false;
    state.context = safelyGetLiffContext();
    const liveProfile = await getLiffProfile(state.ready);
    state.profile =
      isAnonymousProfile(liveProfile) && !isAnonymousProfile(state.profile)
        ? Object.assign({}, state.profile)
        : liveProfile;
    state.shareAvailable = isLiffShareAvailable(state.ready);
    return state;
  } catch (error) {
    console.error("LIFF init failed:", error);
    state.error = error instanceof Error ? error.message : String(error);
    state.profile = isAnonymousProfile(state.profile)
      ? Object.assign({}, DEFAULT_USER)
      : Object.assign({}, state.profile);
    return state;
  }
}

// LINE の名前と写真を返す（使えないときは名前なし）
async function getLiffProfile(isReady) {
  if (!window.liff || !isReady) {
    return Object.assign({}, DEFAULT_USER);
  }

  try {
    if (window.liff.isLoggedIn && window.liff.isLoggedIn()) {
      const profile = await window.liff.getProfile();
      const normalizedProfile = {
        userId: profile.userId || null,
        displayName: profile.displayName || "anonymous",
        pictureUrl: profile.pictureUrl || null
      };
      saveCachedProfile(normalizedProfile);
      return normalizedProfile;
    }
  } catch (error) {
    console.warn("Failed to fetch LIFF profile:", error);
  }

  return Object.assign({}, DEFAULT_USER);
}

// 前に覚えた LINE の名前と写真を、端末から読んで返す（ユーザー ID は読まない）
export function loadCachedProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.profile);
    if (!raw) {
      return Object.assign({}, DEFAULT_USER);
    }
    // 表示に使う名前・写真だけを読む（写真は https のものだけ）
    const parsed = JSON.parse(raw) || {};
    const displayName = typeof parsed.displayName === "string" && parsed.displayName.trim() ? parsed.displayName.slice(0, 40) : DEFAULT_USER.displayName;
    const pictureUrl = typeof parsed.pictureUrl === "string" && /^https:\/\//.test(parsed.pictureUrl) ? parsed.pictureUrl : null;
    return Object.assign({}, DEFAULT_USER, { displayName: displayName, pictureUrl: pictureUrl });
  } catch (error) {
    console.warn("Failed to load cached profile:", error);
    return Object.assign({}, DEFAULT_USER);
  }
}

// LINE の名前と写真を端末に覚える（ユーザー ID は残さない。名前なしのときは残さない）
export function saveCachedProfile(profile) {
  if (!profile || !profile.displayName || String(profile.displayName).toLowerCase() === "anonymous") {
    return;
  }
  localStorage.setItem(
    STORAGE_KEYS.profile,
    // LINE のユーザー ID は使わないので端末に残さない（形は前と同じ）
    JSON.stringify({
      userId: null,
      displayName: profile.displayName || "anonymous",
      pictureUrl: profile.pictureUrl || null
    })
  );
}

// 名前なし（空・anonymous）かを返す
function isAnonymousProfile(profile) {
  const displayName = profile ? String(profile.displayName || "").trim().toLowerCase() : "";
  return !displayName || displayName === "anonymous";
}

// LIFF の開かれ方（トークの種類など）を返す。使えないときは null
export function safelyGetLiffContext() {
  try {
    if (window.liff && typeof window.liff.getContext === "function") {
      return window.liff.getContext();
    }
  } catch (error) {
    console.warn("Failed to get LIFF context:", error);
  }
  return null;
}

// 送り先選び（shareTargetPicker）が使えるかを返す
function isLiffShareAvailable(isReady) {
  if (!window.liff || !isReady) {
    return false;
  }

  if (typeof window.liff.shareTargetPicker !== "function") {
    return false;
  }

  if (typeof window.liff.isApiAvailable === "function") {
    try {
      return window.liff.isApiAvailable("shareTargetPicker");
    } catch (error) {
      console.warn("Failed to check shareTargetPicker availability:", error);
    }
  }

  return true;
}

// ---- ブラウザ版から、送れる環境へ移る ----

// LINE アプリの中か、ログインしているか（送り先選びが使えない理由を分けて案内する）
export function getLiffEnvironment() {
  const liff = window.liff;
  if (!liff) {
    return { inClient: false, loggedIn: false };
  }
  let inClient = false;
  let loggedIn = false;
  try {
    inClient = typeof liff.isInClient === "function" && liff.isInClient();
    loggedIn = typeof liff.isLoggedIn === "function" && liff.isLoggedIn();
  } catch (error) {
    console.warn("Failed to read LIFF environment:", error);
  }
  return { inClient, loggedIn };
}

// このブラウザのまま LINE でログインする（戻ってきたら送り先選びが使える）
export function loginWithLine() {
  if (!window.liff || typeof window.liff.login !== "function") {
    return false;
  }
  const url = new URL(window.location.href);
  url.searchParams.delete("draft");
  window.liff.login({ redirectUri: url.toString() });
  return true;
}

// LINE アプリで開く URL（入力中の記録を draft に入れて渡す）
export function buildLineAppUrl(draft) {
  if (!APP_CONFIG.LIFF_ID || APP_CONFIG.LIFF_ID === "YOUR_LIFF_ID") {
    return "";
  }
  const base = "https://liff.line.me/" + APP_CONFIG.LIFF_ID;
  return draft ? base + "?draft=" + draft : base;
}
