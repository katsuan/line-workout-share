# 🏋️ キロっく（kiloQ）

筋トレの記録ツール。名前は「キロっく」（英字は kiloQ。おくるん＝OQRN・さくせん盤＝SAQSEN と同じ作り方で、「キロ」は重さの kg のキロ（kilo）、「っく」を Q にする。kilo は小文字、Q だけ大文字）。ふだん見せるのはカタカナ混じりの「キロっく」、英字は見出しの右のロゴに使う。送るカードの末尾は「Created by kiloQ ›」（おくるんの「Created by おくるん ›」と同じ形。タップでこのツールが開く）。

アイコン（`icon.svg`・`apple-touch-icon.png`・`icon-512.png`・`icon-maskable-512.png`・`icon-32.png`）と横長のロゴ（`logo.svg`）は `python3 tools/icon.py` で作る：おくるんと同じ角の丸い四角に、キロっくのオレンジ（`DEFAULT_THEME.baseColor` の #C96A2D）。白いウエイトのプレート（太い輪＋面の溝＋まん中の穴）の右下のふちに、小さなダンベルを斜めに重ね、プレート（輪）＋ダンベル（しっぽ）で Q に見せる（kiloQ の Q）。後ろにうっすらノートの罫線（記録）。ロゴは k・i・l・o をフォント（Jua）で並べ、Q だけアイコンと同じプレート＋ダンベル。共有したときの画像（`ogp.png`、1200×630）は `python3 tools/ogp.py` で作る。ホーム画面に追加したとき用に `manifest.webmanifest`。

おくるんのトップの「ほかのツール」（line-share の `data/hub-links.json`）には、このアイコン（`appIcon`）付きで「キロっく」として載せている。

公開URL: https://katsuan.github.io/line-workout-share/

GitHub Pages で配信する、静的なワークアウト共有アプリです。  
入力したトレーニング内容を LIFF 上でまとめ、LINE の `shareTargetPicker` を使って共有する前提で作っています。

## 現在の仕様

### 配信と構成

- 静的ホスティング前提です。
- サーバー、DB、GAS は未使用です。
- 現在は責務ごとに `js/` 配下へ分割しています。
  - `index.html`
  - `style.css`
    - CSS のエントリーポイント。`css/` 配下の partial を読み込みます。部品（見出しの行・タブ・カード・チップ・入力欄・ボタン・開閉・シート・送る帯・トースト）はおくるんの Q キット（`https://katsuan.github.io/line-share/shared/ui.css`・`ui.js`。使い方はおくるんの README の「Q キット」）を `index.html` で先に読み、`style.css` には、キロっくの色と字と、キロっくにしかない見た目だけを置く
  - `app.js`
    - 入口。UI 描画とイベント制御。押したときの処理は `CLICK_ACTIONS`（`data-action` の名前 → 処理）に並べる。入力の入れ替え（履歴・メニュー・サンプル・リセット）は `replaceWorkout` にまとめる。知らせは `notify`（Q キットのトースト）。消す・入れ替えるときは確かめのダイアログを出さず、すぐ変えてトーストの「元に戻す」で戻せるようにする（`undoInputChange`・`undoMenuChange`）
  - `css/base.css`
    - キロっくの色と字（`:root` の `--ls-accent` などを #C96A2D に。キロっくにしかない部品の色は `--kq-*`）、ページ全体・見出しの行・タブ・送る帯・トーストの位置・シートの見出し
  - `css/input.css`
    - 入力の画面（始め方・入力中の帯・種目カード・部位と種目えらび・セットの行と −／＋）
  - `css/preview.css`
    - 送信プレビュー（LINE のトーク画面に近い枠と、送るカードの見本）、種目ごとの集計
  - `css/history.css`
    - 履歴、「あなたの記録」のシート（草グラフ・連続）と「⚙️ 設定」（週のはじまり・色）、トレーニングメニューのシート、ランキング（デバッグ用）
  - `js/line-config.js`
    - LINE 版のつなぎ先の設定（LIFF の ID など）と、機能の ON/OFF（feature flag）。`index.html` で `app.js` より先に読む
  - `js/settings.js`
    - 設定値（端末に残すキー・数の上限・色）。`js/line-config.js` の中身を読む
  - `js/catalog.js`
    - 種目の一覧・部位の絞りこみ・おすすめメニュー
  - `js/workout.js`
    - 記録の形（種目・セット・推定1RM・ボリューム）と、トレーニングメニュー
  - `js/card.js`
    - 送るカード（Flex Message）を作る
  - `js/link.js`
    - URL の受け渡し（LINE 版を開く URL・「同じメニューでやる」の `?menu=`・作りかけの `?draft=`）
  - `js/store.js`
    - 端末に残すもの（履歴・トレーニングメニュー）の読み書き。履歴（`liff-workout-history`）はつづくも読むので形を変えない
  - `js/theme.js`
    - ベースカラー設定と CSS 変数反映（選んだ色から Q キットの `--ls-accent` などと `--kq-*` を作る）
  - `js/liff.js`
    - LIFF 初期化、プロフィール取得、 shareTargetPicker 利用可否
  - `js/components.js`
    - 画面の部品（Q キットのボタン・チップ・入力欄・シート・空のとき、開閉の ▾）。HTML 文字列を返すだけで状態は持たない
  - `js/format.js`
    - 数と文字の形（重さ・回数の表し方・長さの上限・HTML に入れるときの書きかえ）
  - `js/page.js`
    - ページ全体で使う小さな道具（季節の絵文字・ID・今日の日付・中身の写し）
  - `js/streak.js`
    - 週の数え方（週のはじまりの日・記録した週の連続（いま・最長））。草グラフの週の区切りと「◯週 連続」に使う
  - `js/fixtures.js`
    - 見本のデータ（「サンプルを入れる」の中身、ランキングのモック）
  - `config.js`・`js/main.js`
    - 前の名前のファイル。前の index.html・app.js を覚えているブラウザ（LINE の中など）のために、新しいファイルを読むだけ。**2026-11-25 ごろに消す**
- ファイルの名前は Q のツール共通の決まり（q-oqrn の docs/structure.md）にそろえている

### 現在の主な機能

- 入力タブ
  - 送信プレビュー（入力欄の上。開閉できる）と、この記録の集計
  - ワークアウトタイトル（日付は入力した日を自動で使う）
  - 種目の複数追加
  - 各エクササイズカード内で「部位 → 種目」の順に選択
  - 部位 `その他` からの自由入力
  - セットの複数追加（直前のセットの重さ・回数を引き継ぎ、−／＋で調整）
  - 重量、回数、メモ入力
  - 入力の始め方は3つ：「✏️ 新しく」（空から）・「📋 メニュー」（保存したもの）・「🕘 履歴から」（前に送った記録。履歴があるときだけ）
  - 履歴は10件まで。9件のときは「あと1件でいっぱい」、10件のときは送る前に「送ると、いちばん古い記録（日付・タイトル）が消えます」と控えのダウンロードを、送信プレビューの下に出す。9件からは履歴タブの件数（「10/10件」）と履歴の画面の件数をオレンジに。送って古い記録が消えたときは「消しました」と「控えを保存」（消えた記録だけの CSV）を知らせる
  - 種目・セットを消す・「✏️ 新しく」は、すぐ変えて、下に出る知らせ（トースト）の「元に戻す」で戻せる
  - 作りかけ（送る前の記録）は端末に残し（`kiloq:draft`）、次に開いたら「前回の続きから開きました［新しく作る］」。送り終えた記録は残さない
  - セットを入れたのに種目名がないときは、名前の欄のすぐ下に赤い字で知らせる
  - 送り終えたら、Q キットのシート（続けて別のトークにも送る・閉じる・もう少し作る）
  - 下の送る帯（Q キットの `ls-sendbar`）は、文字の入力中はキーボードと重ならないよう隠れる
  - 「入力中」の帯をタップすると、その種目へ移動
  - ユーザーアイコンから「あなたの記録」のシート：草グラフ（18週。1日のセット数で4段階）・記録した週の連続（「🔥 いま 3週 連続 ・ 最長 5週」。1週に1回でも記録があればその週は○。今週まだなら「🔥 3週 連続中（今週やれば 4週）」）・週のはじまり（月曜／日曜。Q 共通の設定 `qlove:weekStart`（q-oqrn の shared/week-start.js）なので、つづく・くるかな・BabyQ とそろう。はじめは月曜）・ベースカラー設定
- 種目候補
  - `js/catalog.js` 内にローカルの種目カタログを保持
  - 日本語名で管理
  - 部位ごとの候補表示
  - ボタン形式で選択
- 送信プレビュー
  - Flex Message の見た目確認
  - 種目ごとの推定 1RM（O'Conner 式：重さ ＋ 重さ × 回数 ÷ 40）
  - セット内容確認
  - ボリュームは送信表示に含めない
- トレーニングメニュー（テンプレート）
  - 記録入力の見出しの下の「📋 メニュー」からシートを開く（履歴があるときは隣に「🕘 履歴から」。2つは等幅で並べ、スマホでも見出しの行が詰まらないようにする）
  - 今の入力（種目・セットの重さと回数・メモ）に名前を付けて保存（名前の初期値はワークアウトタイトル。同じ名前は上書きし、トーストの「元に戻す」で戻せる。20件まで。localStorage の `liff-workout-menus`）
  - メニューを押すと、タイトルをメニュー名にした新しい入力にする（入力中の内容があったときは、トーストの「元に戻す」で前の入力に戻せる）。マイメニューは 🗑 ですぐ消す（「元に戻す」で戻せる）
  - おすすめ（胸の日・背中の日・脚の日・肩・腕の日・全身）は `js/catalog.js` の `MENU_PRESETS`。回数とセット数だけ入り、重さは空
- 履歴タブ
  - `localStorage` に保存した履歴の表示
  - 初期状態はアコーディオンを閉じて表示（見出しの行をタップで開閉）
  - 「この内容で入力」（入力中の内容があったときは、トーストの「元に戻す」で前の入力に戻せる）、消す（すぐ消して「元に戻す」で戻せる）
- ブラウザ版（送り先選びが使えないとき）
  - 送るボタンの上に「🔑 ログインして送る」（このブラウザのまま LINE でログイン。`liff.login`）と「📱 LINE 版で開く」（`https://liff.line.me/<LIFF ID>`）を出す。案内は「ブラウザ版です。送るには：」（Q キットの shared/liff.js）
  - どちらも入力中の記録を持っていく：ログインは sessionStorage（`kiloq:carry-draft`）、LINE アプリは `?draft=<base64url(JSON)>`。開いたら入力に戻して、URL からは消す
- 共有
  - `liff.shareTargetPicker()` を使用
  - LIFF 利用不可時は共有実行は行わず、プレビュー中心で動作

### LIFF / プロフィール取得

- `liff.init({ liffId: LIFF_ID })` 実行後に LIFF 機能を使用します。
- ログイン済みかつ `liff.getProfile()` が成功した場合のみ表示名を使います。
- 取得できない場合は内部的に `anonymous` を使います。
- 取得したプロフィールは `localStorage` にキャッシュします。
- 外部ブラウザや LIFF 初期化失敗時でも、プレビュー専用モードとして使える設計です。

### 保存まわり

- 現在の保存先は `LocalStorageWorkoutRepository` です。
- `saveWorkout()` は adapter 風に切ってあり、将来 `ApiWorkoutRepository` へ差し替え可能です。

### デバッグモード

- `js/line-config.js` の `FEATURE_FLAGS.enableDebugMode` で切り替えます。
- デバッグモード時のみ以下を表示します。
  - Flex JSON コピー
  - Flex JSON プレビュー
- ランキングタブは `enableDebugMode` と `enableRanking` の両方が有効なときだけ表示します。

## 設定

`js/line-config.js` の設定値:

- `LIFF_ID`
  - LIFF アプリ ID
- `APP_NAME`
  - 英字の名前（「kiloQ」。送るカード末尾の「Created by kiloQ ›」に使う）
- `DEFAULT_GROUP_KEY`
  - LIFF コンテキストが取れない場合のフォールバック
- `FEATURE_FLAGS.enableDebugMode`
  - デバッグ UI の表示
- `FEATURE_FLAGS.enableLocalHistory`
  - ローカル履歴の有効化
- `FEATURE_FLAGS.enableStatsMock`
  - モックランキングの有効化
- `FEATURE_FLAGS.enableApiAdapter`
  - 将来の API 保存 / API 取得の切り替え口
- `FEATURE_FLAGS.enableRanking`
  - ランキングタブの有効化

## データ構造

現在のワークアウトオブジェクトは次の形をベースにしています。

```js
{
  workoutId: string,
  date: string,
  title: string,
  user: {
    userId: string | null,
    displayName: string,
    pictureUrl: string | null
  },
  groupKey: string | null,
  exercises: [
    {
      exerciseId: string,
      catalogId: string,
      isCustom: boolean,
      primaryMuscle: string,
      selectionMuscle: string,
      name: string,
      memo: string,
      sets: [
        {
          setId: string,
          weight: number | "",
          reps: number | "",
          volume: number,
          estimated1rm: number
        }
      ],
      totalVolume: number,
      maxEstimated1rm: number
    }
  ],
  totalVolume: number,
  createdAt: string,
  updatedAt: string
}
```

## 現在の計算仕様

- `volume = weight * reps`
- `estimated1rm = weight + (weight * reps) / 40`
- 空セット、重量未入力、回数未入力は共有対象外
- `volume` は内部計算には残すが、現在の送信表示では使わない
- タイトル未入力時は `displayName のキロっく` または `キロっく` を自動補完

## 現在の UI 方針

- スマホファースト
- 固定アクションバーあり
- 片手で押しやすい大きめ入力
- 種目カード / セットカード中心
- 種目ごとに開閉できる入力フロー
- ユーザー向け画面では LIFF や開発用語をできるだけ見せない

## 今後の想定

### 1. 種目マスタの外出し

現在は `js/catalog.js` 内のローカル配列ですが、将来は次を想定しています。

- JSON ファイル化
- API / DB から取得
- グループ別の種目候補
- よく使う種目の並び替え

### 2. 保存先の拡張

- GAS / Spreadsheet 保存
- API 経由の保存
- ユーザー別 / グループ別の履歴集約

### 3. ランキング / 統計

- 現在はデバッグ用のモック前提
- 将来は API 取得へ差し替え
- 期間別、部位別、種目別などを想定

### 4. UX 改善の候補

- ボリューム表示はノイジーなので縮小または除外の再検討
- 種目選択 UI の改善
- 日本語種目名の拡充
- LINE 共有文面の簡素化

## メモ

- API キーや秘密情報は置かない前提です。
- GitHub Pages に配置すればそのまま動く構成を維持します。

## 紹介の窓口

「📤 キロっくを紹介する」（入力・履歴の下）は、おくるんの `shared/tool-share.js`（`data-tool="kiloq"`）。押すとおくるんでオレンジの紹介カードを作って LINE に送れる（リンクのシェアも選べる）。中身は line-share の `data/hub-links.json` の `key: "kiloq"`。
