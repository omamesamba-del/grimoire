# grimoire — Claude ルール

## ビルド
変更後は必ず `npm run build` を実行すること。アプリは `dist/` + `dist-electron/` を読む。

```bash
cd "L:\atelier\grimoire"
npm run build
```

`npm start` = `npm run build && electron .` なので再起動時は自動ビルドされる。

## Git コミット
**機能の実装・修正・削除が完了するたびに、必ず git コミットすること。**

```bash
cd "L:\atelier\grimoire"
git add .
git commit -m "変更内容を日本語で簡潔に"
```

- ビルド成功後にコミットする
- コミットメッセージは日本語・体言止め（例: 「AI履歴にお気に入り機能を追加」）
- ユーザーへの報告の中にコミット完了を明記すること

## プロジェクト情報
- パス: `L:\atelier\grimoire\`
- 詳細ドキュメント: `docs/todo.md` / `docs/notes.md`
- テーマ内部値: Navy=`dark` / White=`light` / Black=`black` / Gray=`gray`（デフォルト）

## アーキテクチャ

Electron 34 + Vite 6 のデスクトップアプリ。

### プロセス構成
```
electron/main.js         ← Electron メインプロセス（IPC・ファイルI/O・API）
preload-bridge.js        ← window.electronAPI を注入
src/main.js              ← レンダラーエントリー
src/modules/             ← UI + ロジック（ES modules）
```

### UI 構成（3カラム）
```
.app-header              ← ヘッダー（検索・サイズスライダー・モードタブ・設定）
.workspace-container
  ├── .explorer-pane     ← カテゴリ/フォルダツリー（explorer.js）
  ├── .library-pane      ← タグ/アセットグリッド（library.js）
  └── .inspector-pane    ← Builderペイン（prompt-chips.js）
```

### ファイル責務
| ファイル | 役割 |
|---------|------|
| `src/modules/core/state.js` | グローバル状態（唯一の真実源） |
| `src/modules/core/ipc.js` | IPC ラッパー |
| `src/modules/core/i18n.js` | 多言語対応 |
| `src/modules/core/shortcuts.js` | キーボードショートカット |
| `src/modules/core/palette.js` | カテゴリカラー定義 |
| `src/modules/tags/service.js` | タグデータ操作 |
| `src/modules/prompt/engine.js` | プロンプト生成ロジック |
| `src/modules/prompt/history.js` | Undo/Redo |
| `src/modules/ui/explorer.js` | Explorerペイン |
| `src/modules/ui/library.js` | ライブラリグリッド |
| `src/modules/ui/modals.js` | 設定・モーダル全般 |
| `src/modules/ui/prompt-chips.js` | Builderチップ |
| `src/modules/ui/generation.js` | Gen モード |
| `src/modules/ui/image-browser.js` | Images モード |
| `src/modules/ui/ai-prompt.js` | AI モード |
| `src/modules/ui/style-palette.js` | スタイルパレット |
| `src/modules/ui/header.js` | ヘッダーUI |
| `electron/main.js` | IPCハンドラ全般 |
| `electron/services/configService.js` | 設定ファイル読み書き |

### タグデータフロー
```
tag/*.yml  →（インポート時）→  data/tags.json  →  State.allTags  →（saveTagOrder）→  data/tags.json
```
`data/tags.json` を直接編集しない。

### IPC パターン
```javascript
// renderer
const result = await IPC.saveTags(data);  // src/modules/core/ipc.js を使う
// main
ipcMain.handle('tags:save', async (event, data) => { ... });
```

## ローカライズ（i18n）
- `src/modules/core/i18n.js` 内の `ja` / `en` オブジェクトにキーを追加
- HTML: `data-i18n="key_name"` 属性
- JS: `i18n.t('key_name')`

## スタイルパレット
`State.pendingStyle.ordered` に選択中スタイルを保持。`getStylePrefix()` でプロンプト先頭文字列を返す。

## Vite 警告の回避
dynamic import と static import を同一モジュールに混在させない。常に static import にまとめる。
