// 画面の部品（HTML 文字列を返すだけ。状態は持たない）。見た目はおくるんの Q キット（ls-*）にそろえる
import { escapeHtml } from "./utils.js?v=202610241329";

function renderAttributes(attrs) {
  return Object.keys(attrs || {})
    .map(function (key) {
      return " " + key + '="' + escapeHtml(String(attrs[key])) + '"';
    })
    .join("");
}

// 開閉できるところ（送信プレビュー・種目・履歴のカード）は、この ▾ ボタンでそろえる（文字は読み上げ用）
export function renderDisclosureToggle(options) {
  const isOpen = Boolean(options.isOpen);
  return (
    '<button class="disclosure-toggle' +
    (isOpen ? " is-open" : "") +
    '" data-action="' +
    escapeHtml(options.action) +
    '"' +
    renderAttributes(options.attrs) +
    ' aria-expanded="' +
    String(isOpen) +
    '"' +
    ' aria-label="' +
    escapeHtml((options.title ? options.title + "を" : "") + (isOpen ? "たたむ" : "ひらく")) +
    '" type="button">' +
    '<span class="disclosure-chevron" aria-hidden="true">▾</span>' +
    "</button>"
  );
}

// Q キットのボタン。options: { label, action, className（"is-danger" など足すクラス）, title（読み上げ・長押しの説明）, disabled, attrs }
export function renderButton(options) {
  const title = options.title ? ' aria-label="' + escapeHtml(options.title) + '" title="' + escapeHtml(options.title) + '"' : "";
  return (
    '<button class="ls-button' +
    (options.className ? " " + escapeHtml(options.className) : "") +
    '" data-action="' +
    escapeHtml(options.action || "") +
    '"' +
    title +
    renderAttributes(options.attrs) +
    (options.disabled ? " disabled" : "") +
    ' type="button">' +
    escapeHtml(options.label || "") +
    "</button>"
  );
}

// Q キットのチップ（選ぶもの）。pressed を渡すと「選んでいる」（aria-pressed）になる
export function renderChip(options) {
  return (
    '<button class="ls-chip' +
    (options.className ? " " + escapeHtml(options.className) : "") +
    '" data-action="' +
    escapeHtml(options.action) +
    '"' +
    (options.pressed === undefined ? "" : ' aria-pressed="' + String(Boolean(options.pressed)) + '"') +
    renderAttributes(options.attrs) +
    ' type="button">' +
    escapeHtml(options.label) +
    "</button>"
  );
}

// まだ何もないとき（Q キットの ls-empty。白いカードの中に、絵文字と一言）
export function renderEmpty(icon, text) {
  return (
    '<div class="ls-panel"><div class="ls-empty"><span class="ls-empty-icon" aria-hidden="true">' +
    escapeHtml(icon) +
    "</span>" +
    escapeHtml(text) +
    "</div></div>"
  );
}

// 入力の始め方（メニュー・履歴から）のボタン：絵文字＋見出し＋ひとこと
export function renderStartButton(options) {
  return (
    '<button class="input-start-button" data-action="' +
    escapeHtml(options.action) +
    '" type="button">' +
    '<span class="input-start-icon" aria-hidden="true">' +
    escapeHtml(options.icon) +
    "</span>" +
    '<span class="input-start-copy"><span class="input-start-label">' +
    escapeHtml(options.label) +
    '</span><span class="input-start-sub">' +
    escapeHtml(options.sub) +
    "</span></span>" +
    "</button>"
  );
}

// Q キットの入力欄（見出し＋欄）。options.input は組み立て済みの HTML（エスケープは呼ぶ側）
export function renderField(options) {
  return [
    '<label class="ls-field' + (options.className ? " " + escapeHtml(options.className) : "") + '">',
    '  <span class="ls-label">' + escapeHtml(options.label) + "</span>",
    "  " + options.input,
    "</label>"
  ].join("");
}

// 画面下から出るシート（Q キットの ls-sheet。表示設定・トレーニングメニュー）。外側か「閉じる」で closeAction を送る
//   options: { label（読み上げ用の名前）, title（見出し）, closeAction, className, body（中身の HTML） }
export function renderSheet(options) {
  const closeAction = escapeHtml(options.closeAction);
  return [
    '<div class="ls-sheet" data-sheet-close="' + closeAction + '">',
    '  <section class="ls-sheet-card' +
      (options.className ? " " + escapeHtml(options.className) : "") +
      '" role="dialog" aria-modal="true" aria-label="' +
      escapeHtml(options.label) +
      '">',
    '    <div class="sheet-head">',
    '      <h3 class="ls-sheet-title">' + escapeHtml(options.title) + "</h3>",
    '      <button class="ls-button sheet-close" data-action="' + closeAction + '" type="button">閉じる</button>',
    "    </div>",
    options.body,
    "  </section>",
    "</div>"
  ].join("");
}
