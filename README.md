# Workout Share

GitHub Pages で配信する、静的なワークアウト共有アプリです。  
入力したトレーニング内容を LIFF 上でまとめ、LINE の `shareTargetPicker` を使って共有する前提で作っています。

## 現在の仕様

### 配信と構成

- 静的ホスティング前提です。
- サーバー、DB、GAS は未使用です。
- 現在は責務ごとに `js/` 配下へ分割しています。
  - `index.html`
  - `style.css`
    - CSS のエントリーポイント。`css/` 配下の partial を読み込みます。
  - `config.js`
  - `app.js`
    - エントリーポイント。`js/main.js` を読み込みます。
  - `css/base.css`
    - 変数、リセット、全体ベース
  - `css/navigation.css`
    - タブ、パネル、ステータス表示
  - `css/forms.css`
    - 入力フォーム、種目カード、セットカード、モーダル
  - `css/content.css`
    - プレビュー、履歴、STATS、ランキング表示
  - `css/actions.css`
    - 固定アクションバー、バッジ
  - `css/responsive.css`
    - ブレークポイントごとの調整
  - `js/constants.js`
    - 設定値、種目カタログ、 feature flag
  - `js/theme.js`
    - ベースカラー設定と CSS 変数反映
  - `js/liff.js`
    - LIFF 初期化、プロフィール取得、 shareTargetPicker 利用可否
  - `js/workout.js`
    - ワークアウト生成、計算、整形、 Flex Message 生成
  - `js/repositories.js`
    - localStorage / API 保存アダプタ
  - `js/utils.js`
    - ID 生成、数値変換、エスケープなどの共通関数
  - `js/main.js`
    - UI 描画とイベント制御

### 現在の主な機能

- 入力タブ
  - 日付
  - ワークアウトタイトル
  - 種目の複数追加
  - 各エクササイズカード内で「部位 → 種目」の順に選択
  - 部位 `その他` からの自由入力
  - セットの複数追加
  - 重量、回数、メモ入力
  - ユーザーアイコンからベースカラー設定
- 種目候補
  - `js/constants.js` 内にローカルの種目カタログを保持
  - 日本語名で管理
  - 部位ごとの候補表示
  - ボタン形式で選択
- プレビュータブ
  - Flex Message の見た目確認
  - 種目ごとの推定 1RM
  - セット内容確認
  - ボリュームは送信表示に含めない
- 履歴タブ
  - `localStorage` に保存した履歴の表示
  - 初期状態はアコーディオンを閉じて表示
  - 適用、開閉、削除
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

- `config.js` の `FEATURE_FLAGS.enableDebugMode` で切り替えます。
- デバッグモード時のみ以下を表示します。
  - Flex JSON コピー
  - Flex JSON プレビュー
- ランキングタブは `enableDebugMode` と `enableRanking` の両方が有効なときだけ表示します。

## 設定

`config.js` の設定値:

- `LIFF_ID`
  - LIFF アプリ ID
- `APP_NAME`
  - 画面上のアプリ名
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
- タイトル未入力時は `displayName's Workout Share` または `Workout Share` を自動補完

## 現在の UI 方針

- スマホファースト
- 固定アクションバーあり
- 片手で押しやすい大きめ入力
- 種目カード / セットカード中心
- 種目ごとに開閉できる入力フロー
- ユーザー向け画面では LIFF や開発用語をできるだけ見せない

## 今後の想定

### 1. 種目マスタの外出し

現在は `js/constants.js` 内のローカル配列ですが、将来は次を想定しています。

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
