# grimoire — 開発メモ

最終更新: 2026-05-17（プロジェクト移行）

AIが忘れてしまいがちなポイント・ハマりやすい落とし穴をまとめたメモ。

---

## ⚠️ 必ず守ること

### ビルドを忘れずに
```bash
cd "L:\AI\grimoire"
npm run build
```
- `src/` を変更しても、ビルドしないとアプリに反映されない
- アプリは `dist/` + `dist-electron/` を読む（Viteによるプロダクションビルド）

### テーマ名の内部値と表示名は別
| 表示名 | 内部値（コード・localStorage） |
|--------|-------------------------------|
| Navy   | `dark` |
| White  | `light` |
| Black  | `black` |
| Gray   | `gray` |

`body.theme-dark` / `body.theme-light` 等がCSSクラス名になる。

---

## カラーカスケードの実装

- `CAT_COLOR_MAP`（explorer.js 先頭）で hex 変換して `labelEl.style.color` に直接付与
- 優先順位: `parentColor || node.color`（親カテゴリ色が優先）
- ライブラリ側: `PALETTE_CSS_VAR`（library.js 先頭）で同じ値を定義

---

## テーマ適用の仕組み

```js
// modals.js
export function applyTheme(theme) {
    document.body.classList.remove('theme-dark', 'theme-light', 'theme-black', 'theme-gray');
    document.body.classList.add(`theme-${theme}`);
    window.electronAPI?.setTitlebarOverlay?.(THEME_TITLEBAR[theme] || THEME_TITLEBAR.dark);
}
```
デフォルトテーマ: `main.js` で `localStorage.getItem('pb-theme') || 'gray'`

---

## サイズスライダー（header.js）

- `SIZE_CONFIG` オブジェクトでサイズ段階を定義
- `localStorage` キー: `size-index-tags` / `size-index-lora` / `size-index-embedding` / `size-index-images`
- Images モード: `--img-thumb-height` を制御（120〜360px、7段階）

---

## Images モード アーキテクチャ

- `.image-grid` は自分でスクロールしない。`.pane-content`（`overflow-y: auto`）に任せる
- NG: `overflow-y: auto` + `flex:1` をグリッドに付けると全コンテンツを圧縮するバグが出る

---

## AI モード 重要事項

### Electronメインプロセスでの HTTP 通信
```js
// ❌ 動かない場合がある
const res = await fetch('https://...')
// ✅ 正しい
const res = await net.fetch('https://...')
```
外部API（Ollama/Claude/OpenAI/Civitai）への全リクエストに `net.fetch` を使う。

### 循環依存の回避パターン
```js
// 他モジュール → main.js の関数を呼びたい場合はカスタムイベント経由
window.dispatchEvent(new CustomEvent('app:switch-mode', { detail: 'tags' }));
// main.js 側でリッスン
window.addEventListener('app:switch-mode', (e) => switchMode(e.detail));
```

---

## Vite 警告の回避ルール

dynamic import と static import を同一モジュールに混在させない。常に static import にまとめる。

```js
// ❌ 警告が出る
import { foo } from './bar.js';
const { baz } = await import('./bar.js');
// ✅ 正しい
import { foo, baz } from './bar.js';
```

---

## タグデータフロー

```
tag/*.yml  →（インポート時）→  data/tags.json  →  State.allTags  →  data/tags.json
```
`data/tags.json` を直接編集しない。

---

## スタイルパレット（style-palette.js）

- `State.pendingStyle.ordered` — 選択順を保持する配列
- `getStylePrefix()` — プロンプト先頭に付けるスタイル文字列を返す
- 設定は `localStorage('stylePaletteData')` に保存

---

## セッション記録

| 日付 | 作業内容 |
|------|---------|
| 2026-05-17 | Prompt Builder v5 から grimoire へ移行。CLAUDE.md / docs/todo.md / docs/notes.md を整備。 |
