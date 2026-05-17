/**
 * Localization Framework for grimoire
 * Supports dynamic switching and data-i18n attribute-based DOM updates.
 *
 * context:
 *   'applyTranslations()' — sets textContent / placeholder for all [data-i18n] elements
 *   'setLanguage(lang)'   — switches lang, persists to localStorage, dispatches 'languageChanged'
 */
class I18n {
    constructor() {
        this.currentLang = localStorage.getItem('appLanguage') || (navigator.language.startsWith('ja') ? 'ja' : 'en');
        this.translations = {
            ja: {
                // ── ペインタイトル ─────────────────────────────────────────
                'explorer_title':           'エクスプローラー',
                'library_title':            'プロンプトライブラリ',
                'builder_title':            'ビルダー',

                // ── ナビゲーション ─────────────────────────────────────────
                'nav_tags':                 'タグ',
                'nav_gen':                  '生成設定',
                'nav_lora':                 'LoRA',
                'nav_embedding':            'Embedding',

                // ── Explorer ──────────────────────────────────────────────
                'explorer_add_category':    'カテゴリを追加',
                'explorer_groups_title':    'Groups',
                'explorer_ai_history_title':'生成履歴',

                // ── ライブラリタイトル（JS用） ──────────────────────────────
                'lib_title_tags':           'Prompt Library',
                'lib_title_lora':           'LoRA Library',
                'lib_title_embedding':      'Embedding Library',
                'lib_title_checkpoint':     'Checkpoint Library',
                'lib_title_gen':            '生成設定',
                'lib_title_images':         '画像ブラウザ',
                'lib_title_ai':             'AI プロンプト生成',

                // ── 検索プレースホルダー（JS用） ────────────────────────────
                'search_placeholder_tags':        'タグを検索…',
                'search_placeholder_lora':        'LoRA を検索…',
                'search_placeholder_embedding':   'Embedding を検索…',
                'search_placeholder_checkpoint':  'Checkpoint を検索…',
                'search_placeholder_images':      '画像・プロンプトを検索…',

                // ── アクション ─────────────────────────────────────────────
                'btn_save':                 '保存',
                'btn_cancel':               'キャンセル',
                'btn_delete':               '削除',
                'btn_close':                '閉じる',
                'btn_clear_all':            'Clear All',
                'btn_add_tag':              'タグを追加',
                'btn_add_group':            'グループを追加',
                'btn_rename':               '名前変更',
                'btn_edit':                 '編集',
                'btn_select_img':           '画像を選択',
                'btn_remove_img':           '画像を削除',
                'btn_browse':               '参照...',
                'btn_save_category':        'カテゴリを保存',
                'btn_change_image':         '画像を変更',
                'btn_reset_layout':         '🧹 レイアウトをリセット',
                'btn_bulk_star':            '★ まとめてお気に入り',
                'btn_bulk_delete':          '🗑 まとめて削除',
                'btn_hud_register':         '📌 タグを登録',

                // ── プレースホルダー ────────────────────────────────────────
                'quick_add_placeholder':        'Quick-Add...',
                'library_search_placeholder':   'ライブラリを検索...',
                'placeholder_category_name':    '例: キャラクター, 雰囲気',
                'placeholder_subgroup_name':    '例: 時間帯',
                'placeholder_tag_key':          '例: 朝',
                'placeholder_tag_val':          '例: morning, bright sunlight',
                'placeholder_search_categories':'カテゴリを検索...',
                'placeholder_preset_name':      '例: 傑作アニメスタイル',

                // ── ラベル（カテゴリ追加モーダル） ───────────────────────────
                'label_name':               '名前',

                // ── ラベル（タグ追加モーダル） ──────────────────────────────
                'label_subgroup_name':      'サブグループ名',
                'label_tag_key':            'タグ表示名 (キー)',
                'label_tag_val':            'タグ値 (プロンプト)',
                'tag_target_group':         '対象カテゴリ / グループ',
                'label_preview_image':      'プレビュー画像',
                'hint_drag_image':          'グリッドのタグボックスに画像をドラッグ&ドロップでも登録できます。',

                // ── ラベル（Builder） ──────────────────────────────────────
                'label_positive_prompt':    'ポジティブ',
                'label_negative_prompt':    'ネガティブ',
                'label_raw_prompt_editor':  'RAWプロンプト',
                'label_raw_positive':       'RAW ポジティブ',
                'label_raw_negative':       'RAW ネガティブ',
                'label_preset':             'プリセット',
                'placeholder_preset_name_bar': 'プリセット名...',

                // ── ラベル（プリセットモーダル） ────────────────────────────
                'modal_presets_title':      'プロンプトプリセット',
                'label_save_preset':        '現在のプロンプトをプリセットとして保存',
                'label_saved_presets':      '保存済みプリセット',

                // ── 設定タブ ────────────────────────────────────────────────
                'settings_title':           '設定',
                'tab_paths':                'パス',
                'tab_civitai':              'CivitAI',
                'tab_appearance':           '外観',
                'tab_generation':           '生成設定',
                'tab_advanced':             '詳細設定',
                'tab_design':               'デザイン',
                'tab_ai_settings':          'AI 生成',
                'tab_shortcuts':            'ショートカット',

                // ── 設定（パス） ─────────────────────────────────────────────
                'section_assets':           'アセット',
                'section_tags_path':        'タグ',
                'section_output_images':    'Output Images',
                'label_tags_folder':        'タグフォルダ',
                'label_checkpoints':        'チェックポイント',
                'label_upscalers':          'アップスケーラー (ESRGAN)',
                'label_output_images_folder':'生成画像フォルダ',
                'hint_output_images_folder':'🖼️ Images モードで表示する生成画像の保存先フォルダ',
                'label_yaml_autosave':      'YAML 自動保存',
                'hint_yaml_autosave':       'ON にすると、タグ・グループの変更のたびに YAML を自動で上書き保存します。',
                'btn_reimport_yaml':        'YAMLから再インポート',
                'hint_reimport_yaml':       'タグフォルダのYAMLを読み込み直し、現在のタグデータを上書きします。',

                // ── 設定（CivitAI） ──────────────────────────────────────────
                'label_api_key':            'APIキー',
                'label_optional':           '任意',
                'hint_civitai_key':         'civitai.com → アカウント設定 → API キー',

                // ── 設定（外観） ─────────────────────────────────────────────
                'setting_lang':             '表示言語（Language）',
                'section_cat_colors':       'カテゴリカラー',
                'label_theme':              'テーマ',

                // ── 設定（生成） ─────────────────────────────────────────────
                'label_webui_url':          'WebUI API URL',
                'hint_webui_url':           'Stable Diffusion WebUI のアドレス (--api フラグで起動が必要)',
                'label_send_webui':         'WebUI 送信ボタンの設定',
                'label_send_prompt':        'プロンプトを送信 (ポジ / ネガ)',
                'label_send_gen':           '生成設定を送信 (チェックポイント, ステップ数, サイズ...)',
                'label_comfy_url':          'ComfyUI URL',
                'hint_comfy_url':           'ComfyUI のアドレス（comfyui-grimoire-bridge カスタムノードが必要）',
                'label_comfy_default_slot': 'デフォルト送信スロット',
                'hint_comfy_default_slot':  'Comfy ボタンクリックで即送信する GrimoireSlot のスロット名（▾メニューから別スロットへの送信も可）',
                'label_comfy_gen_slot':     'Gen スロット名',
                'hint_comfy_gen_slot':      'gen設定を送信する GrimoireGenParams ノードのスロット名',
                'label_gen_presets_folder': '生成プリセットフォルダ',
                'hint_gen_presets_folder':  '生成プリセット (.json) の保存先フォルダ',
                'label_custom_ars':         'カスタムアスペクト比',
                'hint_custom_ars':          'カンマ区切り。例: 1:1, 4:3, 16:9',
                'label_custom_res':         'カスタム解像度',
                'hint_custom_res':          'カンマ区切り。例: 1024x1024, 1216x832',
                'label_layout':             'レイアウト',

                // ── 設定（詳細） ─────────────────────────────────────────────
                'label_multi_instance':         '多重起動',
                'label_allow_multi_instance':   '複数のウィンドウを同時に起動できるようにする',
                'hint_restart_required':        '変更後は再起動が必要です',

                // ── 設定（ショートカット） ──────────────────────────────────
                'sc_hint': 'バインディングをクリックして新しいキーを押すと変更できます。Backspace で無効化。',

                // ── 設定（AI） ────────────────────────────────────────────────
                'ai_badge_local':           'ローカル・無料',
                'ai_settings_url':          'URL',
                'ai_settings_model':        'モデル',
                'ai_settings_ollama_hint':  '（例: llama3, mistral）',
                'ai_settings_claude_hint':  '（空欄 = claude-haiku-4-5）',
                'ai_settings_openai_hint':  '（空欄 = gpt-4o-mini）',
                'ai_settings_api_key':      'API キー',

                // ── AI モード UI ────────────────────────────────────────────
                'ai_provider_label':        '使用する AI',
                'ai_model_label_ui':        '使用するモデル',
                'ai_sdinfo_label':          'SD情報',
                'ai_use_sdinfo_label':      'モデル情報を参照する',
                'ai_checkpoint_label':      'Checkpoint',
                'ai_tag_count_label':       'タグ数',
                'ai_tag_sep':               '〜',
                'ai_tag_unit':              'タグ',
                'ai_style_label':           'スタイル',
                'ai_style_none':            '指定なし',
                'ai_tag_format_label':      'タグ形式',
                'ai_danbooru_label':        'Danbooru準拠',
                'ai_danbooru_hint':         '※ Danbooruタグ精度はモデルにより異なります',
                'ai_input_section_label':   '💬 自然言語でプロンプトを生成',
                'ai_input_placeholder':     '日本語や英語で自由に描写してください\n例: 夕暮れの海辺で白いワンピースの女の子が波を眺めている、映画的な雰囲気で\n\nEnter で変換 / Shift+Enter で改行',
                'ai_result_label':          '生成結果',
                'ai_apply_overwrite':       '→ 上書き',
                'ai_append':                '＋ 追記',
                'ai_copy':                  '📋 コピー',
                'ai_target_positive':       '➕ Positive に追加',
                'ai_target_negative':       '➖ Negative に追加',
                'ai_generate_btn':          '✨ AI 変換',
                'ai_cancel_btn':            '✕ キャンセル',
                'btn_generate':             '▶ Send',

                // ── 画像情報パネル ───────────────────────────────────────────
                'image_info_placeholder':   '画像を選択すると生成情報が表示されます',

                // ── スタイルパレット ─────────────────────────────────────────
                'style_auto_apply':         '自動適用',
                'style_clear_btn':          'クリア',

                // ── YAMLインポート ───────────────────────────────────────────
                'yaml_import_title':        'YAMLインポート',
                'yaml_import_hint':         'インポートするカテゴリを選択してください。既存カテゴリは上書きされます。',
                'yaml_select_all':          '全選択',
                'yaml_uncheck_all':         '全解除',
                'yaml_import_btn':          'インポート',

                // ── メニュー ─────────────────────────────────────────────────
                'menu_file':                'ファイル',
                'menu_view':                '表示',
                'menu_app':                 'アプリ',
                'menu_import_yaml':         'YAML をインポート',
                'menu_reimport_yaml':       'YAML から再インポート',
                'menu_export_yaml':         'YAML へエクスポート',
                'menu_add_group':           'グループを追加',
                'menu_reload_data':         'データを再読み込み',
                'menu_toggle_grid_list':    'グリッド / リスト切替',
                'menu_toggle_explorer':     'Explorerを折りたたむ',
                'menu_toggle_layout':       'レイアウト切り替え',
                'menu_reset_layout':        'レイアウトをリセット',
                'menu_devtools':            '開発者ツール',
                'menu_settings':            '設定',
                'menu_restart':             'アプリを再起動',
                'menu_quit':                '終了',
                'menu_about':               'grimoire について',
                'about_description':        'Prompt library & builder for Stable Diffusion / ComfyUI',
                'about_license':            'MIT License',
                'about_check_updates':      'アップデートを確認',
                'about_checking':           '確認中...',
                'about_up_to_date':         '✅ 最新バージョンです',
                'about_update_available':   '🆕 {version} が公開されています',
                'about_update_error':       '⚠️ チェックに失敗しました',

                // ── 選択 HUD ─────────────────────────────────────────────────
                'hud_items_selected':       'アイテム選択中',

                // ── モーダルタイトル ─────────────────────────────────────────
                'modal_add_tag_title':      'タグを登録',
                'modal_edit_tag_title':     'タグを編集',
                'modal_add_category_title': 'カテゴリを追加',
                'modal_add_group_title':    'グループを追加',

                // ── メッセージ・ツールチップ ────────────────────────────────
                'confirm_delete':           '本当にこの項目を削除しますか？',
                'confirm_delete_bulk':      '{n} 件のタグを削除しますか？',
                'toast_saved':              '保存しました',
                'toast_copied':             'クリップボードにコピーしました',
                'toast_no_results':         'このセクションにタグが見つかりません...',
                'error_save_failed':        '保存に失敗しました',
                'tag_fields_req':           '表示名と値の両方を入力してください',
                'subgroup_name_req':        'サブグループ名を入力してください',
                'tooltip_add_tag':          'タグを追加',
                'tooltip_add_group':        'サブグループを追加',

                // ── YAML エクスポート ─────────────────────────────────────
                'confirm_yaml_overwrite':    '「{path}」に {n} 個の YAML ファイルが見つかりました。\n上書きしますか？',
                'toast_yaml_exported':       '✅ {n} 個のカテゴリを YAML へエクスポートしました',
                'toast_export_failed':       'エクスポートに失敗しました: {msg}',

                // ── WebUI ブリッジ ─────────────────────────────────────────
                'mode_append':               '追記',
                'mode_overwrite':            '上書き',
                'action_send_generate':      '送信して生成',
                'action_send_only':          '送信のみ',
                'action_generate_only':      '生成のみ',
                'webui_action_import':       '← WebUIからインポート',
                'webui_action_send_with_gen':'gen設定も一緒に送信',
                'action_test_connection':    '接続テスト',
                'webui_connection_ok':       'WebUI Bridge 接続OK',
                'webui_backend_a1111':       'AUTOMATIC1111',
                'webui_backend_forge':       'Forge',
                'webui_backend_forge_neo':   'Forge Neo',
                'webui_backend_sdnext':      'SD.Next',
                'webui_backend_unknown':     '不明',
                'toast_connection_failed':   '接続失敗',
                'toast_webui_importing':     'WebUIから取得中…',
                'toast_import_failed':       'インポート失敗',
                'toast_webui_imported':      'WebUIからインポートしました',
                'toast_webui_generated':     'WebUIで生成開始しました',
                'toast_webui_sent':          'WebUIにプロンプトを送信しました',
                'toast_webui_busy':          'WebUI は生成中です。',

                // ── ComfyUI ───────────────────────────────────────────────
                'comfy_action_send_with_gen':'gen設定も一緒に送信',
                'comfy_action_import_prompt':'プロンプトをインポート',
                'comfy_action_import_gen':   'gen設定をインポート',
                'toast_comfy_generating':    'ComfyUI 生成開始',
                'toast_gen_failed':          '生成失敗',
                'toast_no_slots':            '送信するスロットがありません',
                'toast_comfy_sent':          'ComfyUI 送信完了',
                'toast_comfy_importing':     'ComfyUIから取得中…',
                'toast_comfy_no_slots_refresh': 'スロットがありません（↺ で更新してください）',
                'toast_comfy_imported':      'プロンプトをインポートしました',
                'toast_comfy_gen_importing': 'ComfyUIからgen設定を取得中…',
                'toast_comfy_gen_imported':  'gen設定をインポートしました',
                'toast_comfy_checking':      'ComfyUI 接続確認中…',
                'toast_comfy_ok':            'ComfyUI 接続 OK ✓',
                'toast_comfy_failed':        'ComfyUI 接続失敗',
                'toast_comfy_no_response':   '応答なし',
                'toast_comfy_error':         'ComfyUI 接続エラー',
                'toast_slot_sent':           '"{name}" 送信完了',

                // ── ComfyUI スロットパネル ─────────────────────────────────
                'comfy_slots_loading':       '取得中…',
                'comfy_slots_error':         '取得失敗（ComfyUI に接続されていますか？）',
                'comfy_slots_empty':         'スロットが見つかりません。ワークフローに Grimoire Slot ノードを追加してください。',
                'comfy_slot_send_title':     '"{name}" に送信',
                'comfy_slot_placeholder':    '{name} のテキスト…',
                'drag_to_reorder':           'ドラッグして並べ替え',

                // ── プロンプトチップ ──────────────────────────────────────
                'chip_break_title':          '改行 (右クリックで削除)',
                'chip_random_title':         'クリックで今すぐランダム解決 / 右クリックで削除',
                'chip_menu_edit':            '✏️ 編集',
                'chip_menu_insert_break':    '↵ 改行を挿入',
                'chip_menu_delete':          '🗑️ 削除',
                'chip_menu_register_tag':    '📌 タグを登録',
                'chip_menu_set_weight':      '⚖️ 重量を設定',
                'chip_weight_dialog':        '重量を設定 (0.01 〜 2.0)',
                'chip_menu_apply_style':     '🎨 スタイルを適用',
                'chip_menu_emb_comfy':       '🔀 ComfyUI表記に変換 (embedding:name)',
                'chip_menu_emb_webui':       '🔀 WebUI表記に変換 (name)',
                'chip_no_trigger_words':     'トリガーワードなし',

                // ── ライブラリ ────────────────────────────────────────────
                'btn_clear_freq':            '🗑 よく使うをすべてクリア',
                'confirm_clear_freq':        'よく使うの履歴をすべて削除しますか？',
                'btn_remove_from_freq':      'よく使うから削除',
                'dice_insert_from':          '「{name}」からランダム挿入',

                // ── Explorer ──────────────────────────────────────────────
                'cat_frequent':              '🔥 よく使う',
                'filter_all':               'すべて',

                // ── 設定モーダル ───────────────────────────────────────────
                'reimport_loading':          '読み込み中...',
                'reimport_done':             '完了 ({n}カテゴリ)',
                'reimport_error':            'エラー: {msg}',
                'keybind_press_key':         'キーを押して…',
                'btn_random_colors':         '🎲 ランダム配色',
                'btn_reset_colors':          '✕ カラーをリセット',
                'category_exists':           '既存・上書き',

                // ── コンテキストメニュー ──────────────────────────────────
                'confirm_delete_asset':      '"{name}" とメタデータをすべて削除しますか？',
                'toast_delete_failed':       '削除に失敗しました: {msg}',

                // ── アセット（LoRA / Embedding / Checkpoint）──────────────
                'lora_no_path_hint':        '設定 → Paths → LoRA でフォルダを設定してください',
                'embedding_no_path_hint':   '設定 → Paths → Embeddings でフォルダを設定してください',
                'checkpoint_no_path_hint':  '設定 → Paths → Checkpoints でフォルダを設定してください',
                'lora_empty':               'LoRA が見つかりません',
                'embedding_empty':          'Embedding が見つかりません',
                'checkpoint_empty':         'Checkpoint が見つかりません',

                // ── 画像ブラウザ ───────────────────────────────────────────
                'images_no_folder_hint':     '設定 → Paths → Output Images でフォルダを設定してください',
                'images_loading':            '読み込み中…',
                'images_no_subfolders':      'サブフォルダが見つかりません',
                'images_folder_all':         'すべて',
                'images_empty':              '画像がありません',
                'images_no_results':         '一致する画像が見つかりません',
                'images_parsing':            '解析中…',
                'images_no_positive':        '（なし）',
                'images_no_meta':            'PNGメタデータなし',
                'toast_copy_done':           '✅ コピー完了',
                'toast_register_done':       '✅ 登録完了',
                'tag_picker_no_results':     '一致するタグがありません',
                'toast_tags_sent':           '✅ 送信完了！',
                'btn_send_to_tags':          '📤 Tags へ送る',
                'confirm_trash_file':        '「{name}」をゴミ箱に移動しますか？',

                // ── AI 履歴 ───────────────────────────────────────────────
                'ai_history_no_fav':         'お気に入りがありません',
                'ai_history_empty':          '生成履歴がありません',
                'ai_history_restore':        'クリックで結果を復元',
                'ai_history_unfav':          'お気に入りを解除',
                'ai_history_add_fav':        'お気に入りに追加',
                'ai_history_delete':         '履歴から削除',

                // ── AI プロンプト ─────────────────────────────────────────
                'ai_no_checkpoint':          'Checkpoint を選択してください。',

                // ── PNG ドロップ ───────────────────────────────────────────
                'png_no_value':              '（なし）',
                'png_no_meta':               '（PNGメタデータなし）',
                'png_loading':               '読み込み中…',

                // ── スタイルパレット エディター ──────────────────────────
                'style_edit_color_select':   '色を選択',
                'style_edit_name_ph':        '表示名 (例: ネイビー)',
                'style_edit_val_ph':         'タグ値 (例: navy blue)',
                'style_edit_mat_name_ph':    '表示名 (例: シフォン)',
                'style_edit_mat_val_ph':     'タグ値 (例: chiffon)',
                'style_edit_no_items':       'アイテムなし',

                // ── title属性 ─────────────────────────────────────────────
                'title_search_cat_filter':   'カテゴリ絞り込み',
                'title_search_clear':        'クリア',
                'title_asset_size_slider':   'サムネイルサイズ',
                'title_random_pick_btn':     'ランダムピック (Shift: 3個)',
                'title_style_palette_btn':   'スタイルパレット',
                'title_style_palette_edit':  'パレットを編集',
                'title_refresh_models':      'モデル一覧を更新',
                'title_search_model':        '「{name}」で検索',

                // ── 設定（詳細）追加 ─────────────────────────────────────
                'label_danbooru_suggest':        'Danbooruサジェスト',
                'danbooru_underscore_convert':   '選択時にアンダースコアをスペースに変換する',
                'btn_reset_danbooru_history':    '🗑️ 使用回数をリセット',
                'toast_danbooru_reset':          '使用回数をリセットしました',
                'civitai_domain_hint':           'Auto: civitai.com を試して失敗したら civitai.red にフォールバック',

                // ── スタイルパレット追加 ─────────────────────────────────
                'style_apply_quickadd':          'Quick-Add にも適用',
                'style_edit_title':              'Style Palette 編集',
                'style_edit_add_btn':            '＋ 追加',
                'style_edit_drag_title':         'ドラッグで並べ替え',
                'style_edit_del_title':          '削除',

                // ── コンテキストメニュー（アセットカード） ─────────────────
                'menu_asset_edit_settings':      '✏️ 推奨設定を編集',
                'menu_asset_fetch_civitai':      '🔍 情報を取得 (CivitAI)',
                'menu_asset_open_civitai_page':  '🌐 CivitAIのページを開く',
                'menu_asset_delete_file':        '🗑 ファイルを削除',

                // ── ショートカット ─────────────────────────────────────────
                'sc_group_mode':             'モード切り替え',
                'sc_group_builder':          'Builder',
                'sc_group_general':          '全般',
                'sc_label_tags_mode':        'Tags モードへ切り替え',
                'sc_label_lora_mode':        'LoRA モードへ切り替え',
                'sc_label_embedding_mode':   'Embedding モードへ切り替え',
                'sc_label_gen_mode':         'Gen モードへ切り替え',
                'sc_label_images_mode':      'Images モードへ切り替え',
                'sc_label_ai_mode':          'AI モードへ切り替え',
                'sc_label_undo':             'アンドゥ',
                'sc_label_redo':             'リドゥ',
                'sc_label_send_webui':       'WebUI に送信して生成',
                'sc_label_send_comfy':       'ComfyUI に送信して生成',
                'sc_label_save_preset':      'プリセットを保存',
                'sc_label_clear_builder':    'Builder をクリア',
                'sc_label_focus_search':     '検索欄にフォーカス',
                'sc_label_open_settings':    '設定を開く',
                'sc_label_toggle_layout':    'レイアウト切り替え',
                'sc_label_random_pick':      'ランダムピック',

                // ── AI 履歴タブ ─────────────────────────────────────────────
                'ai_history_tab_all':        'すべて',
                'ai_history_tab_fav':        '★ お気に入り',

                // ── AI プロンプト追加 ─────────────────────────────────────
                'ai_ckpt_loading':           '取得中…',
                'ai_ckpt_no_select':         '— 選択しない —',
                'ai_ckpt_no_models':         '— モデルなし —',
                'ai_civitai_fetching':       '⏳ 取得中…',
                'ai_civitai_done':           '✅ 取得完了',
                'ai_civitai_failed':         '❌ 取得失敗',
                'ai_civitai_error':          '❌ エラー',
                'ai_generating':             '⏳ 生成中…',
                'ai_unknown_error':          '不明なエラー',
                'ai_copy_done_btn':          '✅ コピー完了',
                'ai_models_loading':         '取得中…',
                'ai_models_none':            'モデルが見つかりません',
                'ai_ollama_checking':        '⏳ Ollama への接続を確認中…',
                'ai_ollama_ok':              '✅ Ollama に接続しました。',
                'ai_no_ckpt_path':           '設定 → Checkpoints パスを設定してください。',
                'ai_arch_no_meta':           '（メタデータなし — モデル名から推定）',
                'ai_ckpt_no_meta_tooltip':   'メタデータなし',
                'ai_claude_no_key':          '⚠️ Claude の API キーが設定されていません。',
                'ai_claude_key_ok':          '✅ Claude API キーが設定されています。',
                'ai_openai_no_key':          '⚠️ OpenAI の API キーが設定されていません。',
                'ai_openai_key_ok':          '✅ OpenAI API キーが設定されています。',
                'ai_ollama_not_found':       '⚠️ Ollama が見つかりません（{url}）',
                'ai_ollama_install_hint':    'Ollama をインストール・起動してください。',
                'ai_ollama_open_link':       '🔗 ollama.com をひらく',
                'ai_settings_link_label':    '設定 → AI 生成',
                'ai_api_key_settings_hint':  ' で入力してください。',

                // ── 画像ブラウザ追加 ─────────────────────────────────────
                'btn_copy_positive':         '📋 コピー',
                'btn_register_to_tag_img':   '🏷️ タグに登録',
                'btn_add_favorite_img':      '★ お気に入り',
                'btn_already_favorite':      '✅ お気に入り済み',
                'btn_fav_added':             '✅ 追加しました',
                'img_ctx_copy_positive':     '📋 Positive をコピー',
                'img_ctx_copy_pnginfo':      '📋 PNGinfo をコピー',
                'img_ctx_register_tag':      '🏷️ タグに画像を登録',
                'img_ctx_show_in_explorer':  '📁 エクスプローラーで表示',
                'img_ctx_delete':            '🗑️ ゴミ箱に移動',

                // ── PNG ドロップ追加 ─────────────────────────────────────
                'gen_png_drop_label':        '画像をドロップ / Drop image here',
            },

            en: {
                // ── Pane titles ─────────────────────────────────────────────
                'explorer_title':           'Explorer',
                'library_title':            'Prompt Library',
                'builder_title':            'Builder',

                // ── Navigation ──────────────────────────────────────────────
                'nav_tags':                 'Tags',
                'nav_gen':                  'Generation',
                'nav_lora':                 'LoRA',
                'nav_embedding':            'Embedding',

                // ── Explorer ────────────────────────────────────────────────
                'explorer_add_category':    'Add Category',
                'explorer_groups_title':    'Groups',
                'explorer_ai_history_title':'Generation History',

                // ── Library titles (JS) ──────────────────────────────────────
                'lib_title_tags':           'Prompt Library',
                'lib_title_lora':           'LoRA Library',
                'lib_title_embedding':      'Embedding Library',
                'lib_title_checkpoint':     'Checkpoint Library',
                'lib_title_gen':            'Generation Settings',
                'lib_title_images':         'Image Browser',
                'lib_title_ai':             'AI Prompt Generator',

                // ── Search placeholders (JS) ────────────────────────────────
                'search_placeholder_tags':        'Search tags…',
                'search_placeholder_lora':        'Search LoRA…',
                'search_placeholder_embedding':   'Search Embeddings…',
                'search_placeholder_checkpoint':  'Search Checkpoints…',
                'search_placeholder_images':      'Search images & prompts…',

                // ── Actions ──────────────────────────────────────────────────
                'btn_save':                 'Save',
                'btn_cancel':               'Cancel',
                'btn_delete':               'Delete',
                'btn_close':                'Close',
                'btn_clear_all':            'Clear All',
                'btn_add_tag':              'Add Tag',
                'btn_add_group':            'Add Group',
                'btn_rename':               'Rename',
                'btn_edit':                 'Edit',
                'btn_select_img':           'Select Image',
                'btn_remove_img':           'Remove Image',
                'btn_browse':               'Browse…',
                'btn_save_category':        'Save Group',
                'btn_change_image':         'Change Image',
                'btn_reset_layout':         '🧹 Reset Layout to Default',
                'btn_bulk_star':            '★ Bulk Star',
                'btn_bulk_delete':          '🗑 Bulk Delete',
                'btn_hud_register':         '📌 Register as Tag',

                // ── Placeholders ─────────────────────────────────────────────
                'quick_add_placeholder':        'Quick-Add...',
                'library_search_placeholder':   'Search library...',
                'placeholder_category_name':    'e.g. Character, Atmosphere',
                'placeholder_subgroup_name':    'e.g. Time of Day',
                'placeholder_tag_key':          'e.g. morning',
                'placeholder_tag_val':          'e.g. morning, bright sunlight',
                'placeholder_search_categories':'Search categories...',
                'placeholder_preset_name':      'e.g. Masterpiece Anime Style',

                // ── Labels — Add Category Modal ──────────────────────────────
                'label_name':               'Name',

                // ── Labels — Add Tag Modal ───────────────────────────────────
                'label_subgroup_name':      'Subgroup Name',
                'label_tag_key':            'Tag Display Name (Key)',
                'label_tag_val':            'Tag Value (Prompt)',
                'tag_target_group':         'Target Category / Group',
                'label_preview_image':      'Preview Image',
                'hint_drag_image':          'You can also drag an image file onto the tag box in the grid.',

                // ── Labels — Builder ─────────────────────────────────────────
                'label_positive_prompt':    'Positive Prompt',
                'label_negative_prompt':    'Negative Prompt',
                'label_raw_prompt_editor':  'Raw Prompt Editor',
                'label_raw_positive':       'Raw Positive',
                'label_raw_negative':       'Raw Negative',
                'label_preset':             'Preset',
                'placeholder_preset_name_bar': 'Preset name…',

                // ── Labels — Preset Modal ────────────────────────────────────
                'modal_presets_title':      'Prompt Presets',
                'label_save_preset':        'Save Current Prompt as New Preset',
                'label_saved_presets':      'Saved Presets',

                // ── Settings tabs ────────────────────────────────────────────
                'settings_title':           'Settings',
                'tab_paths':                'Paths',
                'tab_civitai':              'CivitAI',
                'tab_appearance':           'Appearance',
                'tab_generation':           'Generation',
                'tab_advanced':             'Advanced',
                'tab_design':               'Design',
                'tab_ai_settings':          'AI Generation',
                'tab_shortcuts':            'Shortcuts',

                // ── Settings (Paths) ─────────────────────────────────────────
                'section_assets':           'Assets',
                'section_tags_path':        'Tags',
                'section_output_images':    'Output Images',
                'label_tags_folder':        'Tags Folder',
                'label_checkpoints':        'Checkpoints',
                'label_upscalers':          'Upscalers (ESRGAN)',
                'label_output_images_folder':'Output Images Folder',
                'hint_output_images_folder':'🖼️ Folder containing generated images to show in Images mode',
                'label_yaml_autosave':      'Auto-save YAML',
                'hint_yaml_autosave':       'When ON, automatically saves YAML whenever tags or groups are modified.',
                'btn_reimport_yaml':        'Reimport from YAML',
                'hint_reimport_yaml':       'Re-reads YAML files from the tag folder and overwrites current tag data.',

                // ── Settings (CivitAI) ───────────────────────────────────────
                'label_api_key':            'API Key',
                'label_optional':           'optional',
                'hint_civitai_key':         'civitai.com → Account Settings → API Keys',

                // ── Settings (Appearance) ────────────────────────────────────
                'setting_lang':             'App Language',
                'section_cat_colors':       'Category Colors',
                'label_theme':              'Theme',

                // ── Settings (Generation) ────────────────────────────────────
                'label_webui_url':          'WebUI API URL',
                'hint_webui_url':           'Stable Diffusion WebUI address (must be started with --api flag)',
                'label_send_webui':         'Send on WebUI button',
                'label_send_prompt':        'Send Prompt (positive / negative)',
                'label_send_gen':           'Send Generation Settings (checkpoint, steps, size…)',
                'label_comfy_url':          'ComfyUI URL',
                'hint_comfy_url':           'ComfyUI address (comfyui-grimoire-bridge custom node required)',
                'label_comfy_default_slot': 'Default Send Slot',
                'hint_comfy_default_slot':  'GrimoireSlot slot name for the Comfy button (use ▾ menu to send to a different slot)',
                'label_comfy_gen_slot':     'Gen Slot Name',
                'hint_comfy_gen_slot':      'Slot name of the GrimoireGenParams node to receive gen settings',
                'label_gen_presets_folder': 'Generation Presets Folder',
                'hint_gen_presets_folder':  'Folder where generation presets (.json) are stored',
                'label_custom_ars':         'Custom Aspect Ratios',
                'hint_custom_ars':          'Comma separated, e.g. 1:1, 4:3, 16:9',
                'label_custom_res':         'Custom Resolutions',
                'hint_custom_res':          'Comma separated, e.g. 1024x1024, 1216x832',
                'label_layout':             'Layout',

                // ── Settings (Advanced) ──────────────────────────────────────
                'label_multi_instance':         'Multiple Instances',
                'label_allow_multi_instance':   'Allow multiple windows to run simultaneously',
                'hint_restart_required':        'Restart required after this change',

                // ── Settings (Shortcuts) ─────────────────────────────────────
                'sc_hint': 'Click a binding and press a new key to change it. Backspace to disable.',

                // ── Settings (AI) ────────────────────────────────────────────
                'ai_badge_local':           'Local & Free',
                'ai_settings_url':          'URL',
                'ai_settings_model':        'Model',
                'ai_settings_ollama_hint':  '(e.g. llama3, mistral)',
                'ai_settings_claude_hint':  '(leave blank for claude-haiku-4-5)',
                'ai_settings_openai_hint':  '(leave blank for gpt-4o-mini)',
                'ai_settings_api_key':      'API Key',

                // ── AI Mode UI ───────────────────────────────────────────────
                'ai_provider_label':        'AI Provider',
                'ai_model_label_ui':        'Model',
                'ai_sdinfo_label':          'SD Info',
                'ai_use_sdinfo_label':      'Include model info',
                'ai_checkpoint_label':      'Checkpoint',
                'ai_tag_count_label':       'Tag Count',
                'ai_tag_sep':               '–',
                'ai_tag_unit':              'tags',
                'ai_style_label':           'Style',
                'ai_style_none':            'None',
                'ai_tag_format_label':      'Tag Format',
                'ai_danbooru_label':        'Danbooru-style',
                'ai_danbooru_hint':         '※ Danbooru tag accuracy varies by model',
                'ai_input_section_label':   '💬 Generate prompt from natural language',
                'ai_input_placeholder':     'Describe freely in any language\ne.g. A girl in a white dress gazing at waves on a sunset beach, cinematic atmosphere\n\nEnter to convert / Shift+Enter for newline',
                'ai_result_label':          'Generation Result',
                'ai_apply_overwrite':       '→ Overwrite',
                'ai_append':               '＋ Append',
                'ai_copy':                  '📋 Copy',
                'ai_target_positive':       '➕ Add to Positive',
                'ai_target_negative':       '➖ Add to Negative',
                'ai_generate_btn':          '✨ AI Convert',
                'ai_cancel_btn':            '✕ Cancel',
                'btn_generate':             '▶ Send',

                // ── Image Info Panel ─────────────────────────────────────────
                'image_info_placeholder':   'Select an image to view its generation info',

                // ── Style Palette ────────────────────────────────────────────
                'style_auto_apply':         'Auto-apply',
                'style_clear_btn':          'Clear',

                // ── YAML Import ──────────────────────────────────────────────
                'yaml_import_title':        'YAML Import',
                'yaml_import_hint':         'Select categories to import. Existing categories will be overwritten.',
                'yaml_select_all':          'Select All',
                'yaml_uncheck_all':         'Deselect All',
                'yaml_import_btn':          'Import',

                // ── Menu ─────────────────────────────────────────────────────
                'menu_file':                'File',
                'menu_view':                'View',
                'menu_app':                 'App',
                'menu_import_yaml':         'Import YAML',
                'menu_reimport_yaml':       'Reimport from YAML',
                'menu_export_yaml':         'Export to YAML',
                'menu_add_group':           'Add Group',
                'menu_reload_data':         'Reload Data',
                'menu_toggle_grid_list':    'Toggle Grid / List',
                'menu_toggle_explorer':     'Collapse Explorer',
                'menu_toggle_layout':       'Toggle Layout',
                'menu_reset_layout':        'Reset Layout',
                'menu_devtools':            'Developer Tools',
                'menu_settings':            'Settings',
                'menu_restart':             'Restart App',
                'menu_quit':                'Quit',
                'menu_about':               'About grimoire',
                'about_description':        'Prompt library & builder for Stable Diffusion / ComfyUI',
                'about_license':            'MIT License',
                'about_check_updates':      'Check for Updates',
                'about_checking':           'Checking...',
                'about_up_to_date':         '✅ You\'re up to date',
                'about_update_available':   '🆕 {version} is available',
                'about_update_error':       '⚠️ Could not check for updates',

                // ── Selection HUD ────────────────────────────────────────────
                'hud_items_selected':       'items selected',

                // ── Modal titles ─────────────────────────────────────────────
                'modal_add_tag_title':      'Register Tag',
                'modal_edit_tag_title':     'Edit Tag',
                'modal_add_category_title': 'Add Category',
                'modal_add_group_title':    'Add Group',

                // ── Messages & Tooltips ──────────────────────────────────────
                'confirm_delete':           'Are you sure you want to delete this item?',
                'confirm_delete_bulk':      'Delete {n} tags?',
                'toast_saved':              'Saved!',
                'toast_copied':             'Copied to clipboard!',
                'toast_no_results':         'No tags found in this section...',
                'error_save_failed':        'Save failed',
                'tag_fields_req':           'Both name and value required.',
                'subgroup_name_req':        'Subgroup name required.',
                'tooltip_add_tag':          'Add Tag',
                'tooltip_add_group':        'Add Subgroup',

                // ── YAML Export ──────────────────────────────────────────
                'confirm_yaml_overwrite':    'Found {n} YAML file(s) in "{path}".\nOverwrite?',
                'toast_yaml_exported':       '✅ Exported {n} categories to YAML',
                'toast_export_failed':       'Export failed: {msg}',

                // ── WebUI Bridge ─────────────────────────────────────────
                'mode_append':               'Append',
                'mode_overwrite':            'Overwrite',
                'action_send_generate':      'Send & Generate',
                'action_send_only':          'Send Only',
                'action_generate_only':      'Generate Only',
                'webui_action_import':       '← Import from WebUI',
                'webui_action_send_with_gen':'Send with Gen Settings',
                'action_test_connection':    'Test Connection',
                'webui_connection_ok':       'WebUI Bridge OK',
                'webui_backend_a1111':       'AUTOMATIC1111',
                'webui_backend_forge':       'Forge',
                'webui_backend_forge_neo':   'Forge Neo',
                'webui_backend_sdnext':      'SD.Next',
                'webui_backend_unknown':     'Unknown',
                'toast_connection_failed':   'Connection Failed',
                'toast_webui_importing':     'Fetching from WebUI…',
                'toast_import_failed':       'Import Failed',
                'toast_webui_imported':      'Imported from WebUI',
                'toast_webui_generated':     'Generation started in WebUI',
                'toast_webui_sent':          'Sent prompt to WebUI',
                'toast_webui_busy':          'WebUI is busy generating.',

                // ── ComfyUI ──────────────────────────────────────────────
                'comfy_action_send_with_gen':'Send with Gen Settings',
                'comfy_action_import_prompt':'Import Prompt',
                'comfy_action_import_gen':   'Import Gen Settings',
                'toast_comfy_generating':    'ComfyUI Generating',
                'toast_gen_failed':          'Generation Failed',
                'toast_no_slots':            'No slots available',
                'toast_comfy_sent':          'Sent to ComfyUI',
                'toast_comfy_importing':     'Fetching from ComfyUI…',
                'toast_comfy_no_slots_refresh': 'No slots found (click ↺ to refresh)',
                'toast_comfy_imported':      'Prompt imported',
                'toast_comfy_gen_importing': 'Fetching gen settings from ComfyUI…',
                'toast_comfy_gen_imported':  'Gen settings imported',
                'toast_comfy_checking':      'Checking ComfyUI connection…',
                'toast_comfy_ok':            'ComfyUI Connected ✓',
                'toast_comfy_failed':        'ComfyUI Connection Failed',
                'toast_comfy_no_response':   'No response',
                'toast_comfy_error':         'ComfyUI Connection Error',
                'toast_slot_sent':           '"{name}" sent',

                // ── ComfyUI Slots Panel ──────────────────────────────────
                'comfy_slots_loading':       'Loading…',
                'comfy_slots_error':         'Failed to fetch (is ComfyUI connected?)',
                'comfy_slots_empty':         'No slots found. Add a Grimoire Slot node to your workflow.',
                'comfy_slot_send_title':     'Send to "{name}"',
                'comfy_slot_placeholder':    '{name} text…',
                'drag_to_reorder':           'Drag to reorder',

                // ── Prompt Chips ─────────────────────────────────────────
                'chip_break_title':          'Line break (right-click to delete)',
                'chip_random_title':         'Click to resolve now / Right-click to delete',
                'chip_menu_edit':            '✏️ Edit',
                'chip_menu_insert_break':    '↵ Insert Line Break',
                'chip_menu_delete':          '🗑️ Delete',
                'chip_menu_register_tag':    '📌 Register as Tag',
                'chip_menu_set_weight':      '⚖️ Set Weight',
                'chip_weight_dialog':        'Set Weight (0.01 – 2.0)',
                'chip_menu_apply_style':     '🎨 Apply Style',
                'chip_menu_emb_comfy':       '🔀 Convert to ComfyUI notation (embedding:name)',
                'chip_menu_emb_webui':       '🔀 Convert to WebUI notation (name)',
                'chip_no_trigger_words':     'No trigger words',

                // ── Library ──────────────────────────────────────────────
                'btn_clear_freq':            '🗑 Clear All Frequent Tags',
                'confirm_clear_freq':        'Delete all frequent tag history?',
                'btn_remove_from_freq':      'Remove from Frequent',
                'dice_insert_from':          'Random insert from "{name}"',

                // ── Explorer ─────────────────────────────────────────────
                'cat_frequent':              '🔥 Frequent',
                'filter_all':               'All',

                // ── Settings Modal ────────────────────────────────────────
                'reimport_loading':          'Loading...',
                'reimport_done':             'Done ({n} categories)',
                'reimport_error':            'Error: {msg}',
                'keybind_press_key':         'Press a key…',
                'btn_random_colors':         '🎲 Random Colors',
                'btn_reset_colors':          '✕ Reset Colors',
                'category_exists':           'Exists (will overwrite)',

                // ── Context Menu ─────────────────────────────────────────
                'confirm_delete_asset':      'Delete "{name}" and all its metadata?',
                'toast_delete_failed':       'Delete failed: {msg}',

                // ── Assets (LoRA / Embedding / Checkpoint) ────────────────
                'lora_no_path_hint':        'Set a folder in Settings → Paths → LoRA',
                'embedding_no_path_hint':   'Set a folder in Settings → Paths → Embeddings',
                'checkpoint_no_path_hint':  'Set a folder in Settings → Paths → Checkpoints',
                'lora_empty':               'No LoRA found',
                'embedding_empty':          'No Embeddings found',
                'checkpoint_empty':         'No Checkpoints found',

                // ── Image Browser ─────────────────────────────────────────
                'images_no_folder_hint':     'Set a folder in Settings → Paths → Output Images',
                'images_loading':            'Loading…',
                'images_no_subfolders':      'No subfolders found',
                'images_folder_all':         'All',
                'images_empty':              'No images',
                'images_no_results':         'No images match your search',
                'images_parsing':            'Parsing…',
                'images_no_positive':        '(none)',
                'images_no_meta':            'No PNG metadata',
                'toast_copy_done':           '✅ Copied',
                'toast_register_done':       '✅ Registered',
                'tag_picker_no_results':     'No tags match your search',
                'toast_tags_sent':           '✅ Sent!',
                'btn_send_to_tags':          '📤 Send to Tags',
                'confirm_trash_file':        'Move "{name}" to Trash?',

                // ── AI History ────────────────────────────────────────────
                'ai_history_no_fav':         'No favorites',
                'ai_history_empty':          'No generation history',
                'ai_history_restore':        'Click to restore result',
                'ai_history_unfav':          'Remove from favorites',
                'ai_history_add_fav':        'Add to favorites',
                'ai_history_delete':         'Remove from history',

                // ── AI Prompt ─────────────────────────────────────────────
                'ai_no_checkpoint':          'Please select a Checkpoint.',

                // ── PNG Drop ──────────────────────────────────────────────
                'png_no_value':              '(none)',
                'png_no_meta':               '(No PNG metadata)',
                'png_loading':               'Loading…',

                // ── Style Palette Editor ──────────────────────────────────
                'style_edit_color_select':   'Select color',
                'style_edit_name_ph':        'Display name (e.g. Navy)',
                'style_edit_val_ph':         'Tag value (e.g. navy blue)',
                'style_edit_mat_name_ph':    'Display name (e.g. Chiffon)',
                'style_edit_mat_val_ph':     'Tag value (e.g. chiffon)',
                'style_edit_no_items':       'No items',

                // ── title attributes ─────────────────────────────────────
                'title_search_cat_filter':   'Filter by Category',
                'title_search_clear':        'Clear',
                'title_asset_size_slider':   'Thumbnail Size',
                'title_random_pick_btn':     'Random Pick (Shift: 3 items)',
                'title_style_palette_btn':   'Style Palette',
                'title_style_palette_edit':  'Edit Palette',
                'title_refresh_models':      'Refresh Model List',
                'title_search_model':        'Search for "{name}"',

                // ── Settings (Advanced) additions ────────────────────────
                'label_danbooru_suggest':        'Danbooru Suggestions',
                'danbooru_underscore_convert':   'Convert underscores to spaces on selection',
                'btn_reset_danbooru_history':    '🗑️ Reset Usage Counts',
                'toast_danbooru_reset':          'Usage counts reset',
                'civitai_domain_hint':           'Auto: tries civitai.com, falls back to civitai.red',

                // ── Style Palette additions ──────────────────────────────
                'style_apply_quickadd':          'Apply to Quick-Add',
                'style_edit_title':              'Edit Style Palette',
                'style_edit_add_btn':            '＋ Add',
                'style_edit_drag_title':         'Drag to reorder',
                'style_edit_del_title':          'Delete',

                // ── Context Menu (Asset Card) ────────────────────────────
                'menu_asset_edit_settings':      '✏️ Edit Recommended Settings',
                'menu_asset_fetch_civitai':      '🔍 Fetch Info (CivitAI)',
                'menu_asset_open_civitai_page':  '🌐 Open CivitAI Page',
                'menu_asset_delete_file':        '🗑 Delete File',

                // ── Shortcuts ────────────────────────────────────────────
                'sc_group_mode':             'Mode Switch',
                'sc_group_builder':          'Builder',
                'sc_group_general':          'General',
                'sc_label_tags_mode':        'Switch to Tags mode',
                'sc_label_lora_mode':        'Switch to LoRA mode',
                'sc_label_embedding_mode':   'Switch to Embedding mode',
                'sc_label_gen_mode':         'Switch to Gen mode',
                'sc_label_images_mode':      'Switch to Images mode',
                'sc_label_ai_mode':          'Switch to AI mode',
                'sc_label_undo':             'Undo',
                'sc_label_redo':             'Redo',
                'sc_label_send_webui':       'Send to WebUI & Generate',
                'sc_label_send_comfy':       'Send to ComfyUI & Generate',
                'sc_label_save_preset':      'Save Preset',
                'sc_label_clear_builder':    'Clear Builder',
                'sc_label_focus_search':     'Focus Search Bar',
                'sc_label_open_settings':    'Open Settings',
                'sc_label_toggle_layout':    'Toggle Layout',
                'sc_label_random_pick':      'Random Pick',

                // ── AI History tabs ──────────────────────────────────────
                'ai_history_tab_all':        'All',
                'ai_history_tab_fav':        '★ Favorites',

                // ── AI Prompt additions ──────────────────────────────────
                'ai_ckpt_loading':           'Loading…',
                'ai_ckpt_no_select':         '— None —',
                'ai_ckpt_no_models':         '— No Models —',
                'ai_civitai_fetching':       '⏳ Fetching…',
                'ai_civitai_done':           '✅ Fetch Complete',
                'ai_civitai_failed':         '❌ Fetch Failed',
                'ai_civitai_error':          '❌ Error',
                'ai_generating':             '⏳ Generating…',
                'ai_unknown_error':          'Unknown error',
                'ai_copy_done_btn':          '✅ Copied',
                'ai_models_loading':         'Loading…',
                'ai_models_none':            'No models found',
                'ai_ollama_checking':        '⏳ Checking Ollama connection…',
                'ai_ollama_ok':              '✅ Connected to Ollama.',
                'ai_no_ckpt_path':           'Please configure the Checkpoints path in Settings.',
                'ai_arch_no_meta':           '(No metadata — estimated from filename)',
                'ai_ckpt_no_meta_tooltip':   'No metadata',
                'ai_claude_no_key':          '⚠️ Claude API key is not configured.',
                'ai_claude_key_ok':          '✅ Claude API key is configured.',
                'ai_openai_no_key':          '⚠️ OpenAI API key is not configured.',
                'ai_openai_key_ok':          '✅ OpenAI API key is configured.',
                'ai_ollama_not_found':       '⚠️ Ollama not found ({url})',
                'ai_ollama_install_hint':    'Please install and start Ollama.',
                'ai_ollama_open_link':       '🔗 Open ollama.com',
                'ai_settings_link_label':    'Settings → AI Generation',
                'ai_api_key_settings_hint':  '.',

                // ── Image Browser additions ──────────────────────────────
                'btn_copy_positive':         '📋 Copy',
                'btn_register_to_tag_img':   '🏷️ Register to Tag',
                'btn_add_favorite_img':      '★ Favorite',
                'btn_already_favorite':      '✅ Already Favorited',
                'btn_fav_added':             '✅ Added',
                'img_ctx_copy_positive':     '📋 Copy Positive',
                'img_ctx_copy_pnginfo':      '📋 Copy PNGinfo',
                'img_ctx_register_tag':      '🏷️ Register Image to Tag',
                'img_ctx_show_in_explorer':  '📁 Show in Explorer',
                'img_ctx_delete':            '🗑️ Move to Trash',

                // ── PNG Drop additions ────────────────────────────────────
                'gen_png_drop_label':        'Drop image here',
            }
        };
    }

    t(key) {
        const lang = this.translations[this.currentLang] || this.translations['en'];
        return lang[key] ?? key;
    }

    setLanguage(lang) {
        if (this.translations[lang]) {
            this.currentLang = lang;
            localStorage.setItem('appLanguage', lang);
            this.applyTranslations();
            window.dispatchEvent(new CustomEvent('languageChanged', { detail: lang }));
        }
    }

    applyTranslations() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.dataset.i18n;
            const translation = this.t(key);
            if (translation === key) return;

            const isTextInput = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') &&
                (el.type === 'text' || el.type === 'search' || el.type === 'password' || el.tagName === 'TEXTAREA');

            if (isTextInput) {
                el.placeholder = translation;
            } else if (['SUMMARY', 'SPAN', 'DIV', 'BUTTON', 'LABEL', 'H2', 'H3', 'P', 'OPTION'].includes(el.tagName)) {
                el.textContent = translation;
            }
        });

        // data-i18n-title support
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            const translation = this.t(key);
            if (translation !== key) el.title = translation;
        });

        // Update document title
        document.title = `grimoire`;

        // Sync language selector
        const langSelect = document.getElementById('setting-language');
        if (langSelect) langSelect.value = this.currentLang;
    }
}

export const i18n = new I18n();
