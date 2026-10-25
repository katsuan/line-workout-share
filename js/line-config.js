// キロっく：LINE 版のつなぎ先の設定（LIFF の ID など）と、機能の ON/OFF。index.html で app.js より先に読む（js/settings.js が window.APP_CONFIG を読む）
window.APP_CONFIG = {
  LIFF_ID: "2009927582-2isjfmkk",
  APP_NAME: "kiloQ",
  DEFAULT_GROUP_KEY: "default-group",
  FEATURE_FLAGS: {
    enableDebugMode: false,
    enableLocalHistory: true,
    enableStatsMock: false,
    enableApiAdapter: false,
    enableRanking: false
  }
};
