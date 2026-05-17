# grimoire

**Stable Diffusion / ComfyUI 向けプロンプトライブラリ & ビルダー**

タグを YAML ファイルで整理し、ドラッグ＆ドロップでプロンプトを組み立てて、AUTOMATIC1111・Forge・ComfyUI に直接送信できるデスクトップアプリです。

> English: [README.md](README.md)

---

![grimoire メイン画面](docs/screenshots/main.png)

---

## 機能

### ライブラリ & ビルダー
タグを YAML ファイルでカテゴリ・グループに整理。タグをクリックすると Builder にチップとして追加されます。チップはドラッグで並び替え、Positive / Negative 間の移動も可能です。

### スタイルパレット
Mod / Color / Material / Pattern / Deco のスタイル修飾子をワンクリックで適用。選択したスタイルはプロンプト先頭に自動で付与されます。

### AI アシスト
自然言語で説明を入力するだけで、SD 用プロンプトを AI が生成します。**Ollama**（ローカル）・**Claude API**・**OpenAI** に対応。

![AI アシスト](docs/screenshots/ai-assist.png)

### 生成設定
Checkpoint・VAE・サンプラー・ステップ数・解像度・Hires.fix・Refiner を設定して、WebUI または ComfyUI に直接送信できます。

![生成設定](docs/screenshots/generation.png)

### 画像ブラウザ
出力フォルダをサムネイルグリッドで閲覧。PNG メタデータ（プロンプト・シード・生成パラメータ）をアプリ内で確認できます。

![画像ブラウザ](docs/screenshots/images.png)

### テーマ
**Navy・White・Black・Gray** の 4 テーマを内蔵。

![テーマ比較](docs/screenshots/themes.png)

---

## 動作要件

- [Node.js](https://nodejs.org/) v18 以上
- [Git](https://git-scm.com/)

---

## セットアップ

```bash
git clone https://github.com/omamesamba-del/grimoire.git
cd grimoire
npm install
npm start
```

またはポータブル版 `.exe` を [Releases](../../releases) からダウンロードしてください。

---

## YAML ライブラリ形式

`tag/` フォルダに `.yml` ファイルを置くと起動時に自動で読み込まれます。

```yaml
- category: マイカテゴリ
  color: "#4a9eff"
  tags:
    - name: マイグループ
      tags:
        - masterpiece
        - best quality
        - name: サブセクション
          tags:
            - detailed background
            - cinematic lighting
```

---

## WebUI ブリッジ

**リポジトリ:** [sd-webui-grimoire-bridge](https://github.com/omamesamba-del/sd-webui-grimoire-bridge)

AUTOMATIC1111 / Forge / SD.Next に `/grimoire/v1/set-prompt` エンドポイントを追加し、grimoire からプロンプトと生成設定を直接送信できるようにします。

**インストール:**
```bash
cd extensions
git clone https://github.com/omamesamba-del/sd-webui-grimoire-bridge.git
```
WebUI を再起動後、grimoire の **設定 → 生成設定** で WebUI の URL を設定してください（デフォルト: `http://127.0.0.1:7860`）。

---

## ComfyUI ブリッジ

**リポジトリ:** [comfyui-grimoire-bridge](https://github.com/omamesamba-del/comfyui-grimoire-bridge)

ComfyUI に **Grimoire Slot** ノードを追加します。grimoire から名前付きスロットにプロンプトを送信し、ワークフロー内の任意の場所に接続できます。

**インストール:**
```bash
cd custom_nodes
git clone https://github.com/omamesamba-del/comfyui-grimoire-bridge.git
```
ComfyUI を再起動後、**Grimoire Slot** ノードをワークフローに追加してスロット名を付けます。grimoire の **設定 → 生成設定** で ComfyUI の URL とスロット名を設定してください（デフォルト: `http://127.0.0.1:8188`）。

---

## キーボードショートカット

| キー | 操作 |
|------|------|
| `T` | Tags モード |
| `L` | LoRA モード |
| `E` | Embedding モード |
| `G` | Generation モード |
| `I` | Images モード |
| `A` | AI Assist モード |
| `Ctrl+Z` / `Ctrl+Y` | プロンプトの Undo / Redo |
| `Ctrl+Enter` | WebUI / ComfyUI に送信 |
| `F2` | 選択項目のリネーム |

ショートカットは **設定 → ショートカット** から自由にカスタマイズできます。

---

## ライセンス

MIT

---

> **注意:** このアプリケーションは AI（Anthropic Claude）の支援を受けて開発されています。
