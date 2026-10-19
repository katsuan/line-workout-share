// 画面の部品（HTML 文字列を返すだけ。状態は持たない）。どの画面でも同じ見た目・同じ書き方にそろえる
import { escapeHtml } from "./utils.js?v=202610191251";

export function renderAttributes(attrs) {
  return Object.keys(attrs || {})
    .map(function (key) {
      return " " + key + '="' + escapeHtml(String(attrs[key])) + '"';
    })
    .join("");
}

// 開閉できるところ（送信プレビュー・集計・種目・履歴）は、すべてこの ▾ ボタンでそろえる（文字は読み上げ用）
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

export function renderActionButton(options) {
  const isDisabled = Boolean(options.disabled);
  const title = escapeHtml(options.title || options.label);
  return (
    '<button class="' +
    escapeHtml(options.variant || "outline-button") +
    (isDisabled ? " is-disabled" : "") +
    '" aria-label="' +
    title +
    '" title="' +
    title +
    '" data-action="' +
    escapeHtml(options.action || "") +
    '"' +
    renderAttributes(options.attrs) +
    (isDisabled ? " disabled" : "") +
    ' type="button">' +
    '<span class="action-label">' +
    escapeHtml(options.label || "") +
    "</span>" +
    (options.icon ? '<span class="action-icon" aria-hidden="true">' + escapeHtml(options.icon) + "</span>" : "") +
    "</button>"
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

// options.input は組み立て済みの HTML（エスケープは呼ぶ側）
export function fieldTemplate(options) {
  return [
    '<label class="field-group' + (options.className ? " " + escapeHtml(options.className) : "") + '">',
    '  <span class="field-label">' + escapeHtml(options.label) + "</span>",
    "  " + options.input,
    "</label>"
  ].join("");
}

// 画面下から出るシート（表示設定・トレーニングメニュー）。外側か「閉じる」で closeAction を送る
//   options: { label（読み上げ用の名前）, title（見出し）, closeAction, className, body（中身の HTML） }
export function renderModal(options) {
  const closeAction = escapeHtml(options.closeAction);
  return [
    '<div class="settings-modal-backdrop">',
    '  <button class="settings-modal-scrim" data-action="' + closeAction + '" type="button" aria-label="閉じる"></button>',
    '  <section class="settings-modal' +
      (options.className ? " " + escapeHtml(options.className) : "") +
      '" role="dialog" aria-modal="true" aria-label="' +
      escapeHtml(options.label) +
      '">',
    '    <div class="settings-modal-head">',
    '      <h3 class="panel-title">' + escapeHtml(options.title) + "</h3>",
    '      <button class="ghost-button modal-close-button" data-action="' + closeAction + '" type="button">閉じる</button>',
    "    </div>",
    options.body,
    "  </section>",
    "</div>"
  ].join("");
}
