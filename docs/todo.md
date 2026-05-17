# grimoire — TODO リスト

最終更新: 2026-05-17（プロジェクト移行・ドキュメント整備）

ステータス凡例: `[ ]` 未着手 / `[~]` 進行中 / `[x]` 完了

---

## 🟡 残タスク

- [ ] **英語ロケールの未翻訳キー最終チェック**（i18n.js の `en` オブジェクト）
- [ ] **CLAUDE.md の作業パスを grimoire に更新**（完了）

---

## ✅ 完了済み（v5 から引き継ぎ）

### コアレイアウト・テーマ
- [x] 3カラムレイアウト（Explorer / Library / Builder）
- [x] ヘッダー統合（検索・サイズスライダー・モードタブ・設定ボタン）
- [x] テーマ切り替え（Navy / White / Black / Gray）
- [x] テーマ変更でネイティブウインドウボタン色も連動
- [x] Explorer 折りたたみ（20px strip）
- [x] カテゴリカラー設定（12色パレット）+ カスケード
- [x] スタイルパレット（🎨ボタン・Mod/Color/Material/Pattern/Deco・D&Dリオーダー）
- [x] サイズスライダー（モード別独立設定）
- [x] 多重起動制御（設定画面 Advanced タブ）

### タグ・Builder
- [x] Builder チップ表示・編集・削除
- [x] Builder チップのドラッグ&ドロップ並び替え（Positive/Negative 間移動含む）
- [x] Builder チップ複数選択（Ctrl+click）・一括削除・一括タグ登録
- [x] タグ使用回数バッジ
- [x] タグホバーポップアップ
- [x] ランダムプロンプト構文 `[@Cat:Group:Sub@]`
- [x] Danbooru サジェスト（タグ登録モーダル）
- [x] YAML エクスポート・インポート・自動保存
- [x] タグサムネイル
- [x] プリセット保存・ロード

### Gen モード
- [x] 生成設定パネル（checkpoint / VAE / sampler / steps / size / hires / refiner / seed 等）
- [x] AR・解像度プリセットボタン
- [x] Gen プリセット保存・ロード・Explorer ツリー
- [x] WebUI Bridge 拡張機能
- [x] ComfyUI 送信（スロット選択メニュー）
- [x] WebUI/Comfy 送信ボタン split
- [x] LoRA / Embedding の重み設定 UI

### Images モード
- [x] 出力画像ブラウザ（再帰フォルダツリー・サムネグリッド・PNG info）
- [x] lazy ロード + インクリメンタル描画
- [x] 矢印キーナビゲーション
- [x] 右クリックメニュー
- [x] タグ画像ピッカー刷新

### AI モード
- [x] 自然言語 → SD プロンプト変換（Ollama / Claude API / OpenAI）
- [x] SD 情報連携（Checkpoint ドロップダウン・アーキテクチャ判定・Civitai）
- [x] AI 生成履歴・お気に入り

### キーボードショートカット
- [x] モード切替・Builder 操作・全般の15ショートカット定義
- [x] コンテキスト制御・ダイアログ中ブロック
- [x] 設定画面「ショートカット」タブでキーバインド変更・クリア対応
- [x] ユーザーオーバーライドを `config.json` に永続化

### 多言語対応（i18n）
- [x] shortcuts.js ラベル・グループを i18n キーに変換
- [x] ai-history.js タブラベル
- [x] ai-prompt.js ステータスメッセージ・ドロップダウンラベル全件
- [x] image-browser.js コンテキストメニュー・情報パネルボタン
- [x] genPngDrop.js ドロップラベル
- [x] modals.js ダンボールリセットトースト
- [x] index.html — title属性・data-i18n 属性
