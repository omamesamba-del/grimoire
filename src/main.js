/**
 * grimoire - Prompt Library & Builder for SD/ComfyUI
 */
import { i18n } from './modules/core/i18n.js';
import { State, initUiState, saveUiState } from './modules/core/state.js';
import { IPC, Win } from './modules/core/ipc.js';
import { loadTags, filterTagTree, saveTagOrder } from './modules/tags/service.js';
import { loadAssets } from './modules/assets/service.js';

import { initLayout, toggleLayout, resetLayoutToDefault, initExplorerAutoCollapse } from './modules/ui/layout.js';
import { initHeader, syncSliderToMode, refreshSearchCatFilter, syncCatFilterVisibility } from './modules/ui/header.js';
import { setupModals, openSettings, openAddTagModal, openAddGroupModal, openAddCategoryModal, showConfirmDialog, showInputDialog, openImportYamlModal, applyTheme, showAutocomplete, hideAutocomplete, showToast } from './modules/ui/modals.js';
import { setupContextMenu, findGroupParentContext } from './modules/ui/context-menu.js';
import { renderExplorer } from './modules/ui/explorer.js';
import { renderTagGrid, renderAssetGrid, pickRandomTags, initPopupHoverListeners } from './modules/ui/library.js';
import { renderPromptChips, getSelectedChipsOrdered } from './modules/ui/prompt-chips.js';
import { addToPrompt, parsePrompt, stringifyPrompt, resolveRandomChips, getActivePrompt } from './modules/prompt/engine.js';
import { initImageBrowser, renderImageExplorer, refreshImageBrowserView } from './modules/ui/image-browser.js';
import { initGeneration, getGenPayload, applyPreset, syncSamplerScheduleToMode } from './modules/ui/generation.js';
import { registerComfySlotsHandler, syncComfySlotsVisibility, loadComfySlots, getAllSlotTexts } from './modules/ui/comfySlots.js';
import { initAiPrompt } from './modules/ui/ai-prompt.js';
import { initCheckpointEdit } from './modules/ui/checkpointEdit.js';
import { initAssetEdit } from './modules/ui/assetEdit.js';
import { initGenPngDrop } from './modules/ui/genPngDrop.js';
import { renderAiHistory } from './modules/ui/ai-history.js';
import { initHistory, undo, redo } from './modules/prompt/history.js';
import { initStylePalette, hasActiveStyle, applyStyleToValue, closeIfAutoClose } from './modules/ui/style-palette.js';
import { recordTagUsage } from './modules/core/tagHistory.js';
import { initShortcuts, loadShortcutOverrides } from './modules/core/shortcuts.js';
import Sortable, { MultiDrag } from 'sortablejs';

Sortable.mount(new MultiDrag());

async function initApp() {

    
    try {
        // 1. Core Services + Layout (data不要 — await前に実行してFOUCを防ぐ)
        initUiState();
        applyTheme(localStorage.getItem('pb-theme') || 'gray');
        i18n.applyTranslations();
        initLayout();
        initHeader();
        initPopupHoverListeners();
        setupModals();
        setupContextMenu();

        // 2. Load Data
        const [tags, assets] = await Promise.all([
            loadTags(),
            loadAssets()
        ]);

        State.allTags = tags;
        State.allAssets = assets;
        
        // 4. Initial Render
        renderExplorer();
        refreshSearchCatFilter();
        if (State.allTags.length > 0) {
            State.currentCategoryId = State.allTags[0].id;
            State.currentTags = State.allTags[0].children || [];
            renderTagGrid();
        }
        
        setupEventListeners();
        initExplorerAutoCollapse();
        initHistory();
        initStylePalette();
        initAiPrompt();
        initCheckpointEdit();
        initAssetEdit();

        // 5. Keyboard Shortcuts
        const cfg0 = await IPC.getConfig();
        State.assetPaths = {
            lora:       cfg0.loraPath       || '',
            embedding:  cfg0.embeddingsPath || '',
            checkpoint: cfg0.checkpointsPath || '',
        };
        loadShortcutOverrides(cfg0.shortcuts || {});
        initShortcuts({
            'mode.tags':           () => window.dispatchEvent(new CustomEvent('app:switch-mode', { detail: 'tags' })),
            'mode.lora':           () => window.dispatchEvent(new CustomEvent('app:switch-mode', { detail: 'lora' })),
            'mode.embedding':      () => window.dispatchEvent(new CustomEvent('app:switch-mode', { detail: 'embedding' })),
            'mode.gen':            () => window.dispatchEvent(new CustomEvent('app:switch-mode', { detail: 'gen' })),
            'mode.images':         () => window.dispatchEvent(new CustomEvent('app:switch-mode', { detail: 'images' })),
            'mode.ai':             () => window.dispatchEvent(new CustomEvent('app:switch-mode', { detail: 'ai' })),
            'prompt.undo':         () => undo(),
            'prompt.redo':         () => redo(),
            'builder.send_webui':  () => window.dispatchEvent(new CustomEvent('builder:send', { detail: 'webui' })),
            'builder.send_comfy':  () => window.dispatchEvent(new CustomEvent('builder:send', { detail: 'comfy' })),
            'builder.save_preset': () => document.getElementById('btn-prompt-preset-save')?.click(),
            'builder.clear':       () => document.getElementById('clear-all')?.click(),
            'search.focus':        () => { const el = document.getElementById('library-search'); el?.focus(); el?.select(); },
            'settings.open':       () => openSettings(),
            'layout.toggle':       () => toggleLayout(),
            'random.pick':         () => document.getElementById('btn-random-pick')?.click(),
        });

        // 6. Global Event Listeners (UI Sync)
        window.addEventListener('tagsUpdated', () => {
            renderExplorer();
            refreshSearchCatFilter();
            renderTagGrid();
        });

        // Menu: File → Save Preset
        if (window.electronAPI?.onPresetRequestSave) {
            window.electronAPI.onPresetRequestSave(() => {
                const input = document.getElementById('prompt-preset-input');
                if (input) input.focus();
            });
        }

        // Menu: preset loaded from app menu
        if (window.electronAPI?.onPresetLoad) {
            window.electronAPI.onPresetLoad(({ name, data }) => {
                const posEl = document.getElementById('positive-prompt');
                const negEl = document.getElementById('negative-prompt');
                if (posEl) { posEl.value = data.positive || ''; posEl.dispatchEvent(new Event('input')); }
                if (negEl) { negEl.value = data.negative || ''; negEl.dispatchEvent(new Event('input')); }
                const input = document.getElementById('prompt-preset-input');
                if (input) input.value = name;
            });
        }

        // Menu: toggle / reset layout
        if (window.electronAPI?.onToggleLayout) {
            window.electronAPI.onToggleLayout(() => toggleLayout());
        }
        if (window.electronAPI?.onResetLayout) {
            window.electronAPI.onResetLayout(() => resetLayoutToDefault());
        }

        // Menu: File → Import YAML
        if (window.electronAPI?.onRequestImport) {
            window.electronAPI.onRequestImport(async () => {
                const files = await window.electronAPI.selectYAMLFiles();
                if (!files || files.length === 0) return;
                const parsed = await window.electronAPI.parseYAML(files);
                if (!parsed || parsed.length === 0) return;
                openImportYamlModal(parsed);
            });
        }

        // Reload tags when tagsPath changes in Settings
        // タグ再読み込み共通処理（electron IPC 経由 / カスタムイベント両方から呼ばれる）
        const _onTagsReloaded = async (reloadFromDisk = false) => {
            if (reloadFromDisk) State.allTags = await loadTags();
            State.currentCategoryId = State.allTags[0]?.id || null;
            State.currentTags = State.allTags[0]?.children || [];
            State.currentGroupName = null;
            renderExplorer();
            renderTagGrid();
        };

        if (window.electronAPI?.onTagsReloaded) {
            window.electronAPI.onTagsReloaded(() => _onTagsReloaded(true));
        }
        // tags-reloaded: dispatched by modals after import/reimport
        window.addEventListener('tags-reloaded', () => _onTagsReloaded(false));


        
        // Ensure UI elements are hidden/shown correctly on startup
        switchMode('tags');

        // データロード完了 — コンテンツを表示
        document.body.classList.remove('app-loading');

        // Default focus: positive section
        const posChips = document.getElementById('positive-chips');
        posChips?.closest('.prompt-section')?.classList.add('active-area');

        // Collapse toggle for prompt sections (with persistence)
        const restoreCollapsed = () => {
            document.querySelectorAll('.btn-toggle-section').forEach(btn => {
                const section = btn.closest('.prompt-section');
                if (!section) return;
                const key = `section-collapsed-${btn.id}`;
                const saved = localStorage.getItem(key) === 'true';
                section.classList.toggle('collapsed', saved);
                btn.textContent = saved ? '▷' : '▼';
            });
        };
        restoreCollapsed();

        document.querySelectorAll('.btn-toggle-section').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const section = btn.closest('.prompt-section');
                if (!section) return;
                const collapsed = section.classList.toggle('collapsed');
                btn.textContent = collapsed ? '▷' : '▼';
                localStorage.setItem(`section-collapsed-${btn.id}`, collapsed);
            });
        });

        // Central Event Bus for UI updates (Grid Refresh)
        window.addEventListener('renderGridReq', () => {
            if (State.currentMode === 'tags') renderTagGrid();
            else renderAssetGrid();
        });

        // image-browser からの switchMode 要求（循環参照回避）
        window.addEventListener('app:switch-mode', (e) => switchMode(e.detail));

        // Gen presets tree changed (after save/delete)
        window.addEventListener('genPresetsTreeChanged', () => {
            if (State.currentMode === 'gen') renderExplorer();
        });

        // Language changed — re-apply dynamic strings for current mode
        window.addEventListener('languageChanged', () => {
            // Library title
            const libTitle = document.getElementById('library-title');
            if (libTitle) {
                const titles = {
                    tags:      i18n.t('lib_title_tags'),
                    lora:      i18n.t('lib_title_lora'),
                    embedding: i18n.t('lib_title_embedding'),
                    gen:       i18n.t('lib_title_gen'),
                    images:    i18n.t('lib_title_images'),
                    ai:        i18n.t('lib_title_ai'),
                };
                libTitle.textContent = titles[State.currentMode] ?? State.currentMode;
            }
            // Search placeholder
            const searchEl = document.getElementById('library-search');
            if (searchEl) {
                const placeholders = {
                    tags:      i18n.t('search_placeholder_tags'),
                    lora:      i18n.t('search_placeholder_lora'),
                    embedding: i18n.t('search_placeholder_embedding'),
                    images:    i18n.t('search_placeholder_images'),
                    gen:       '',
                    ai:        '',
                };
                searchEl.placeholder = placeholders[State.currentMode] ?? '';
            }
            // Explorer pane title
            const explorerTitle = document.querySelector('#explorer .pane-title');
            if (explorerTitle) {
                explorerTitle.textContent = State.currentMode === 'ai'
                    ? i18n.t('explorer_ai_history_title')
                    : i18n.t('explorer_groups_title');
            }
            // Send button label
            const sendMainBtn = document.getElementById('btn-send-main');
            if (sendMainBtn) sendMainBtn.textContent = i18n.t('btn_generate');
        });
    } catch (err) {
        console.error('[PBv5] CRITICAL INIT ERROR:', err);
    }
}

function setupEventListeners() {
    // 設定保存時に assetPaths を同期 → パスが変わった場合はアセットを再スキャン
    window.addEventListener('settings:saved', async (e) => {
        const cfg = e.detail || {};
        const prevLora      = State.assetPaths.lora;
        const prevEmbedding = State.assetPaths.embedding;
        const prevCheckpoint = State.assetPaths.checkpoint;
        State.assetPaths = {
            lora:       cfg.loraPath       || '',
            embedding:  cfg.embeddingsPath || '',
            checkpoint: cfg.checkpointsPath || '',
        };
        const pathChanged = prevLora !== State.assetPaths.lora
                         || prevEmbedding !== State.assetPaths.embedding
                         || prevCheckpoint !== State.assetPaths.checkpoint;
        if (pathChanged) {
            State.allAssets = await loadAssets();
            if (['lora', 'embedding', 'checkpoint'].includes(State.currentMode)) {
                window.dispatchEvent(new CustomEvent('renderGridReq'));
            }
        }
    });

    // Mode Tabs (v5)
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.addEventListener('click', () => switchMode(tab.dataset.mode));
    });

    // Titlebar buttons
    const navSettings = document.getElementById('btn-settings');
    if (navSettings) navSettings.onclick = () => openSettings();
    document.getElementById('btn-toggle-layout-titlebar')?.addEventListener('click', () => toggleLayout());

    // Hamburger menu toggle
    const btnMenuToggle = document.getElementById('btn-menu-toggle');
    const headerMenu = document.getElementById('header-menu');
    if (btnMenuToggle && headerMenu) {
        btnMenuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            headerMenu.classList.toggle('hidden');
        });
        document.addEventListener('pointerdown', (e) => {
            if (!e.target.closest('.menu-wrapper')) headerMenu.classList.add('hidden');
        });
    }

    // Menu item wiring
    document.getElementById('btn-import-yaml')?.addEventListener('click', async () => {
        headerMenu?.classList.add('hidden');
        const files = await window.electronAPI.selectYAMLFiles();
        if (!files || files.length === 0) return;
        const parsed = await window.electronAPI.parseYAML(files);
        if (!parsed || parsed.length === 0) return;
        openImportYamlModal(parsed);
    });
    document.getElementById('btn-reimport-yaml')?.addEventListener('click', async () => {
        headerMenu?.classList.add('hidden');
        await window.electronAPI.reimportYAML();
    });
    document.getElementById('btn-export-yaml')?.addEventListener('click', async () => {
        headerMenu?.classList.add('hidden');

        // 1. エクスポート先フォルダを選択
        const destPath = await IPC.browseFolder();
        if (!destPath) return;

        // 2. 既存 YAML ファイルの上書きチェック
        const { files: conflictFiles } = await IPC.checkExportConflicts(destPath);
        if (conflictFiles.length > 0) {
            const ok = await showConfirmDialog(
                i18n.t('confirm_yaml_overwrite').replace('{path}', destPath).replace('{n}', conflictFiles.length)
            );
            if (!ok) return;
        }

        // 3. エクスポート実行
        const btn = document.getElementById('btn-export-yaml');
        if (btn) btn.style.opacity = '0.5';
        try {
            const result = await IPC.exportToYAML(State.allTags, destPath);
            if (btn) btn.style.opacity = '';
            if (result?.success) {
                showToast(i18n.t('toast_yaml_exported').replace('{n}', result.count), 'success');
            }
        } catch (e) {
            if (btn) btn.style.opacity = '';
            showToast(i18n.t('toast_export_failed').replace('{msg}', e.message), 'error');
        }
    });
    document.getElementById('btn-add-category-menu')?.addEventListener('click', () => {
        headerMenu?.classList.add('hidden');
        openAddCategoryModal();
    });
    document.getElementById('btn-reload-data-menu')?.addEventListener('click', () => {
        headerMenu?.classList.add('hidden');
        document.getElementById('btn-reload-data')?.click();
    });
    document.getElementById('btn-toggle-layout-menu')?.addEventListener('click', () => {
        headerMenu?.classList.add('hidden');
        toggleLayout();
    });
    document.getElementById('btn-toggle-grid-list-menu')?.addEventListener('click', () => {
        headerMenu?.classList.add('hidden');
        State.viewMode = State.viewMode === 'grid' ? 'list' : 'grid';
        saveUiState();
        if (State.currentMode === 'tags') window.dispatchEvent(new CustomEvent('renderGridReq'));
        else window.dispatchEvent(new CustomEvent('renderGridReq'));
    });
    document.getElementById('btn-reset-layout-menu')?.addEventListener('click', () => {
        headerMenu?.classList.add('hidden');
        resetLayoutToDefault();
    });
    document.getElementById('btn-devtools-menu')?.addEventListener('click', () => {
        headerMenu?.classList.add('hidden');
        window.electronAPI?.openDevTools?.();
    });
    document.getElementById('btn-settings-menu')?.addEventListener('click', () => {
        headerMenu?.classList.add('hidden');
        openSettings();
    });
    document.getElementById('btn-restart-menu')?.addEventListener('click', () => {
        headerMenu?.classList.add('hidden');
        window.electronAPI?.restartApp?.();
    });
    document.getElementById('btn-quit-menu')?.addEventListener('click', () => {
        headerMenu?.classList.add('hidden');
        window.electronAPI?.quitApp?.();
    });

    // About dialog
    document.getElementById('btn-about-menu')?.addEventListener('click', async () => {
        headerMenu?.classList.add('hidden');
        const dlg = document.getElementById('about-dialog');
        if (!dlg) return;
        const version = await window.electronAPI?.getAppVersion?.() ?? '—';
        const versionEl = document.getElementById('about-version');
        if (versionEl) versionEl.textContent = `v${version}`;
        const githubLink = document.getElementById('about-link-github');
        if (githubLink) {
            githubLink.onclick = (e) => {
                e.preventDefault();
                window.electronAPI?.openExternal?.('https://github.com/omamesamba-del/grimoire');
            };
        }
        dlg.showModal();
    });
    document.getElementById('btn-about-close')?.addEventListener('click', () => {
        document.getElementById('about-dialog')?.close();
    });
    document.getElementById('btn-check-updates')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-check-updates');
        const statusEl = document.getElementById('about-update-status');
        if (!btn || !statusEl) return;
        btn.disabled = true;
        statusEl.style.color = '';
        statusEl.textContent = i18n.t('about_checking');
        const result = await window.electronAPI?.checkForUpdates?.();
        btn.disabled = false;
        if (!result || result.error) {
            statusEl.style.color = 'var(--color-warn, #f59e0b)';
            statusEl.textContent = i18n.t('about_update_error');
            return;
        }
        const current = (await window.electronAPI?.getAppVersion?.()) ?? '0.0.0';
        if (result.latestVersion === current) {
            statusEl.style.color = 'var(--color-ok, #22c55e)';
            statusEl.textContent = i18n.t('about_up_to_date');
        } else {
            statusEl.style.color = 'var(--accent)';
            statusEl.textContent = i18n.t('about_update_available').replace('{version}', `v${result.latestVersion}`);
            statusEl.style.cursor = 'pointer';
            statusEl.onclick = () => window.electronAPI?.openExternal?.('https://github.com/omamesamba-del/grimoire/releases');
        }
    });

    // Explorer collapse toggle
    const btnToggleExplorer = document.getElementById('btn-toggle-explorer');
    const btnToggleExplorerMenu = document.getElementById('btn-toggle-explorer-menu');
    const explorerPane = document.getElementById('explorer');
    const toggleExplorer = () => {
        if (!explorerPane) return;
        const collapsed = explorerPane.classList.toggle('collapsed');
        // Clear auto-collapse flag so user intent isn't overridden by ResizeObserver
        delete explorerPane.dataset.autoCollapsed;
        localStorage.setItem('explorer-collapsed', collapsed);
    };
    btnToggleExplorer?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleExplorer();
    });
    btnToggleExplorerMenu?.addEventListener('click', () => {
        headerMenu?.classList.add('hidden');
        toggleExplorer();
    });
    // Click on collapsed strip to re-expand
    explorerPane?.addEventListener('click', (e) => {
        if (explorerPane.classList.contains('collapsed')) {
            toggleExplorer();
        }
    });
    // Restore explorer collapsed state
    if (explorerPane && localStorage.getItem('explorer-collapsed') === 'true') {
        explorerPane.classList.add('collapsed');
    }

    // Reload button — re-fetches tags or assets from disk depending on current mode
    const btnReload = document.getElementById('btn-reload-data');
    if (btnReload) {
        btnReload.onclick = async () => {
            btnReload.style.opacity = '0.4';
            btnReload.style.pointerEvents = 'none';
            try {
                if (State.currentMode === 'tags') {
                    State.allTags = await loadTags();
                    State.currentCategoryId = State.allTags[0]?.id || null;
                    State.currentTags = State.allTags[0]?.children || [];
                    State.currentGroupName = null;
                    renderExplorer();
                    renderTagGrid();
                } else if (State.currentMode === 'images') {
                    await renderImageExplorer();
                } else {
                    State.allAssets = await loadAssets();
                    State.currentAssetFilter = null;
                    renderExplorer();
                    renderAssetGrid();
                }
            } finally {
                btnReload.style.opacity = '';
                btnReload.style.pointerEvents = '';
            }
        };
    }
    const btnRandomPick = document.getElementById('btn-random-pick');
    if (btnRandomPick) btnRandomPick.onclick = (e) => pickRandomTags(e.shiftKey ? 3 : 1);

    // CivitAI Fetch All
    const btnFetchAll = document.getElementById('btn-fetch-all-civitai');
    if (btnFetchAll) {
        btnFetchAll.onclick = async () => {
            if (btnFetchAll.disabled) return;
            const mode = State.currentMode;
            const assets = (mode === 'checkpoint' ? State.allAssets.checkpoints : mode === 'lora' ? State.allAssets.loras : State.allAssets.embeddings) || [];
            const missing = assets.filter(a => a.fullPath && !a.hasInfoFile);
            if (missing.length === 0) { alert('All assets already have metadata.'); return; }
            if (!await showConfirmDialog(`Fetch metadata for ${missing.length} asset(s) without metadata?`)) return;

            btnFetchAll.disabled = true;
            const origText = btnFetchAll.textContent;
            const cfg = await IPC.getConfig();
            let done = 0;
            for (const asset of missing) {
                btnFetchAll.textContent = `⬇ ${done}/${missing.length}`;
                try {
                    await IPC.fetchCivitaiMetadata(asset.fullPath, cfg.civitaiApiKey || '');
                } catch (_) {}
                done++;
            }
            btnFetchAll.textContent = origText;
            btnFetchAll.disabled = false;
            State.allAssets = await loadAssets();
            renderAssetGrid();
        };
    }

    // Prompt Presets
    const presetInput = document.getElementById('prompt-preset-input');
    const presetDropdown = document.getElementById('prompt-preset-dropdown');
    let allPresetNames = [];

    const renderDropdown = (names) => {
        if (!presetDropdown) return;
        presetDropdown.innerHTML = names.map(n =>
            `<li data-name="${n.replace(/"/g, '&quot;')}">${n}</li>`
        ).join('');
        presetDropdown.hidden = names.length === 0;
    };

    const openDropdown = () => {
        const q = presetInput?.value.trim().toLowerCase() || '';
        const filtered = q ? allPresetNames.filter(n => n.toLowerCase().includes(q)) : allPresetNames;
        renderDropdown(filtered);
    };

    const closeDropdown = () => {
        if (presetDropdown) presetDropdown.hidden = true;
    };

    presetDropdown?.addEventListener('click', (e) => {
        const li = e.target.closest('li');
        if (!li) return;
        presetInput.value = li.dataset.name;
        closeDropdown();
    });

    presetInput?.addEventListener('input', openDropdown);
    presetInput?.addEventListener('focus', openDropdown);
    presetInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { closeDropdown(); presetInput.blur(); }
        if (e.key === 'ArrowDown') {
            const items = presetDropdown?.querySelectorAll('li');
            if (items?.length) { e.preventDefault(); items[0].focus(); }
        }
    });

    presetDropdown?.addEventListener('keydown', (e) => {
        const items = [...presetDropdown.querySelectorAll('li')];
        const idx = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(idx + 1, items.length - 1)]?.focus(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); if (idx <= 0) presetInput.focus(); else items[idx - 1]?.focus(); }
        if (e.key === 'Enter' && idx >= 0) { presetInput.value = items[idx].dataset.name; closeDropdown(); }
        if (e.key === 'Escape') { closeDropdown(); presetInput.focus(); }
    });

    document.addEventListener('pointerdown', (e) => {
        if (!e.target.closest('.prompt-preset-combo')) closeDropdown();
    }, true);

    const refreshPresetList = async () => {
        allPresetNames = await IPC.getPromptPresetList();
        return allPresetNames;
    };
    refreshPresetList();

    document.getElementById('btn-prompt-preset-save')?.addEventListener('click', async () => {
        const name = presetInput?.value.trim();
        if (!name) { presetInput?.focus(); return; }
        const pos = document.getElementById('positive-prompt')?.value || '';
        const neg = document.getElementById('negative-prompt')?.value || '';
        // Gen 設定が初期化済みなら gen payload も一緒に保存
        const gen = State._genInitialized ? getGenPayload() : null;
        await IPC.savePromptPreset(name, pos, neg, gen);
        await refreshPresetList();
        presetInput.value = name;
    });

    document.getElementById('btn-prompt-preset-load')?.addEventListener('click', async () => {
        const name = presetInput?.value.trim();
        if (!name) { presetInput?.focus(); return; }
        const data = await IPC.loadPromptPreset(name);
        if (!data) { return; }
        const posEl = document.getElementById('positive-prompt');
        const negEl = document.getElementById('negative-prompt');
        if (posEl) { posEl.value = data.positive || ''; posEl.dispatchEvent(new Event('input')); }
        if (negEl) { negEl.value = data.negative || ''; negEl.dispatchEvent(new Event('input')); }
        // Gen 設定が含まれていれば適用
        if (data.gen && State._genInitialized) applyPreset(data.gen);
    });

    document.getElementById('btn-prompt-preset-delete')?.addEventListener('click', async () => {
        const name = presetInput?.value.trim();
        if (!name) return;
        if (!await showConfirmDialog(`Delete preset "${name}"?`)) return;
        await IPC.deletePromptPreset(name);
        presetInput.value = '';
        await refreshPresetList();
    });

    // ── WebUI Bridge ─────────────────────────────────────────────────────────
    // 送信モード・トリガー設定を localStorage で永続化
    let webuiSendMode        = localStorage.getItem('webuiSendMode')        || 'overwrite'; // 'overwrite'|'append'
    let webuiSendTrigger     = localStorage.getItem('webuiSendTrigger')     !== 'false';    // true=送信+生成, false=送信のみ
    let webuiGenerateOnly    = localStorage.getItem('webuiGenerateOnly')    === 'true';     // true=生成のみ
    let webuiSendGen         = localStorage.getItem('webuiSendGen')         === 'true';     // true=Gen設定も一緒に送信

    // ラベル・スタイルをまとめて更新
    const updateWebuiBtn = () => {
        const mainBtn  = document.getElementById('btn-send-main');
        const splitWrap = document.getElementById('send-split');
        if (!mainBtn) return;

        const modeLabel = webuiSendMode === 'append' ? i18n.t('mode_append') : i18n.t('mode_overwrite');
        const actionLabel = webuiSendTrigger ? i18n.t('action_send_generate') : i18n.t('action_send_only');
        mainBtn.textContent = i18n.t('btn_generate');
        mainBtn.title = `WebUI: ${modeLabel} / ${actionLabel}`;
        if (splitWrap) splitWrap.dataset.sendMode = webuiSendMode;
    };

    const setWebuiOpts = (opts) => {
        if (opts.mode         !== undefined) { webuiSendMode     = opts.mode;         localStorage.setItem('webuiSendMode',     opts.mode); }
        if (opts.trigger      !== undefined) { webuiSendTrigger  = opts.trigger;      localStorage.setItem('webuiSendTrigger',  String(opts.trigger)); }
        if (opts.generateOnly !== undefined) { webuiGenerateOnly = opts.generateOnly; localStorage.setItem('webuiGenerateOnly', String(opts.generateOnly)); }
        if (opts.sendGen      !== undefined) { webuiSendGen      = opts.sendGen;      localStorage.setItem('webuiSendGen',      String(opts.sendGen)); }
        updateWebuiBtn();
    };

    // ▾ ドロップダウンメニュー
    const showWebuiMenu = (anchorBtn) => {
        const existing = document.getElementById('webui-send-menu');
        if (existing) { existing.remove(); return; }

        const menu = document.createElement('ul');
        menu.id = 'webui-send-menu';
        menu.className = 'custom-context-menu';
        menu.style.cssText = 'position:fixed; z-index:9999; min-width:190px;';

        const items = [
            { label: `${!webuiGenerateOnly &&  webuiSendTrigger ? '✓ ' : '　'}${i18n.t('action_send_generate')}`,  action: () => setWebuiOpts({ generateOnly: false, trigger: true  }) },
            { label: `${!webuiGenerateOnly && !webuiSendTrigger ? '✓ ' : '　'}${i18n.t('action_send_only')}`,       action: () => setWebuiOpts({ generateOnly: false, trigger: false }) },
            { label: `${ webuiGenerateOnly                       ? '✓ ' : '　'}${i18n.t('action_generate_only')}`,   action: () => setWebuiOpts({ generateOnly: true }) },
            null,
            { label: `${webuiSendMode === 'overwrite' ? '✓ ' : '　'}${i18n.t('mode_overwrite')}`, action: () => setWebuiOpts({ mode: 'overwrite' }) },
            { label: `${webuiSendMode === 'append'    ? '✓ ' : '　'}${i18n.t('mode_append')}`,   action: () => setWebuiOpts({ mode: 'append' }) },
            null,
            { label: `${webuiSendGen ? '✓ ' : '　'}${i18n.t('webui_action_send_with_gen')}`, action: () => setWebuiOpts({ sendGen: !webuiSendGen }) },
            null,
            { label: i18n.t('webui_action_import'), action: () => importFromWebUI() },
            null,
            { label: i18n.t('action_test_connection'), action: async () => {
                const res = await IPC.checkWebuiBridge();
                if (res.connected) {
                    const backendKey = {
                        'a1111':     'webui_backend_a1111',
                        'forge':     'webui_backend_forge',
                        'forge-neo': 'webui_backend_forge_neo',
                        'sdnext':    'webui_backend_sdnext',
                    }[res.backend] || 'webui_backend_unknown';
                    const backendLabel = res.backend ? ` — ${i18n.t(backendKey)}` : '';
                    showToast(`${i18n.t('webui_connection_ok')} (v${res.version || '?'})${backendLabel}`, 'success');
                } else {
                    showToast(`${i18n.t('toast_connection_failed')}: ${res.error}`, 'error');
                }
            }},
        ];

        items.forEach(item => {
            if (!item) {
                const sep = document.createElement('li');
                sep.className = 'ctx-separator';
                menu.appendChild(sep);
                return;
            }
            const li = document.createElement('li');
            li.className = 'ctx-item';
            li.textContent = item.label;
            li.onclick = () => { menu.remove(); item.action(); };
            menu.appendChild(li);
        });

        const rect = anchorBtn.getBoundingClientRect();
        const rightEdgeWebui = window.innerWidth - rect.right;
        menu.style.right = `${rightEdgeWebui}px`;
        menu.style.top   = `${rect.bottom + 4}px`;
        document.body.appendChild(menu);

        const close = (e) => {
            if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', close); }
        };
        setTimeout(() => document.addEventListener('mousedown', close), 0);
    };

    const importFromWebUI = async () => {
        showToast(i18n.t('toast_webui_importing'), 'info');
        const result = await IPC.getWebuiState();
        if (!result?.success) {
            showToast(result?.error || i18n.t('toast_import_failed'), 'error');
            return;
        }
        const { state } = result;

        // プロンプトを流し込む
        const posEl = document.getElementById('positive-prompt');
        const negEl = document.getElementById('negative-prompt');
        if (posEl && state.positive !== undefined) {
            posEl.value = state.positive;
            posEl.dispatchEvent(new Event('input'));
        }
        if (negEl && state.negative !== undefined) {
            negEl.value = state.negative;
            negEl.dispatchEvent(new Event('input'));
        }

        // Gen パラメータを流し込む
        if (state.gen && Object.keys(state.gen).some(k => state.gen[k] !== undefined)) {
            applyPreset(state.gen);
        }

        showToast(i18n.t('toast_webui_imported'), 'success');
    };

    const sendToWebUI = async () => {
        const mainBtn = document.getElementById('btn-send-main');
        const arrowBtn = document.getElementById('btn-send-main-arrow');
        [mainBtn, arrowBtn].forEach(b => b && (b.disabled = true));
        if (mainBtn) mainBtn.textContent = '…';
        try {
            let result;
            if (webuiGenerateOnly) {
                result = await IPC.sendToWebUI({ mode: 'generate-only', trigger: true });
            } else {
                const pos = getActivePrompt('positive-prompt');
                const neg = getActivePrompt('negative-prompt');
                result = await IPC.sendToWebUI({ positive: pos, negative: neg, mode: webuiSendMode, trigger: webuiSendTrigger, gen: webuiSendGen ? getGenPayload() : null });
            }
            if (result?.success) {
                const msg = (webuiGenerateOnly || webuiSendTrigger)
                          ? i18n.t('toast_webui_generated')
                          : i18n.t('toast_webui_sent');
                showToast(msg, 'success');
            } else if (result?.busy) {
                await IPC.resetWebuiBusy();
                const retry = webuiGenerateOnly
                    ? await IPC.sendToWebUI({ mode: 'generate-only', trigger: true })
                    : await IPC.sendToWebUI({ positive: getActivePrompt('positive-prompt'), negative: getActivePrompt('negative-prompt'), mode: webuiSendMode, trigger: webuiSendTrigger, gen: webuiSendGen ? getGenPayload() : null });
                if (retry?.success) {
                    const msg = (webuiGenerateOnly || webuiSendTrigger)
                              ? i18n.t('toast_webui_generated')
                              : i18n.t('toast_webui_sent');
                    showToast(msg, 'success');
                } else {
                    showToast(i18n.t('toast_webui_busy'), 'warning');
                }
            } else {
                showToast(result?.error || 'Send failed', 'error');
                console.warn('[WebUI Send]', result?.error);
            }
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            [mainBtn, arrowBtn].forEach(b => b && (b.disabled = false));
            updateWebuiBtn();
        }
    };

    // ── ComfyUI Bridge ────────────────────────────────────────────────────────
    // 送信モード・トリガー・gen同時送信の設定を localStorage で永続化
    let comfySendMode     = localStorage.getItem('comfySendMode')     || 'overwrite'; // 'overwrite'|'append'
    let comfySendTrigger  = localStorage.getItem('comfySendTrigger')  !== 'false';   // true=送信+生成, false=送信のみ
    let comfySendGen      = localStorage.getItem('comfySendGen')      === 'true';    // false=プロンプトのみ
    let comfyGenerateOnly = localStorage.getItem('comfyGenerateOnly') === 'true';    // true=生成のみ

    const updateComfyBtn = () => {
        const mainBtn   = document.getElementById('btn-send-main');
        const splitWrap = document.getElementById('send-split');
        if (!mainBtn) return;
        mainBtn.textContent = i18n.t('btn_generate');
        const comfyModeLabel   = comfySendMode === 'append' ? i18n.t('mode_append') : i18n.t('mode_overwrite');
        const comfyActionLabel = comfySendTrigger ? i18n.t('action_send_generate') : i18n.t('action_send_only');
        mainBtn.title = `ComfyUI: ${comfyModeLabel} / ${comfyActionLabel}`;
        if (splitWrap) splitWrap.dataset.sendMode = comfySendMode;
    };

    const setComfyOpts = (opts = {}) => {
        if (opts.mode         !== undefined) { comfySendMode     = opts.mode;         localStorage.setItem('comfySendMode',     opts.mode); }
        if (opts.trigger      !== undefined) { comfySendTrigger  = opts.trigger;      localStorage.setItem('comfySendTrigger',  String(opts.trigger)); }
        if (opts.sendGen      !== undefined) { comfySendGen      = opts.sendGen;      localStorage.setItem('comfySendGen',      String(opts.sendGen)); }
        if (opts.generateOnly !== undefined) { comfyGenerateOnly = opts.generateOnly; localStorage.setItem('comfyGenerateOnly', String(opts.generateOnly)); }
        updateComfyBtn();
    };

    // ── スロットピッカーメニュー ───────────────────────────────────────────────
    const showComfyMenu = async (anchorBtn) => {
        const existing = document.getElementById('comfy-send-menu');
        if (existing) { existing.remove(); return; }

        // ── メニュー骨格を先に表示（スロット取得中のプレースホルダー付き）──
        const menu = document.createElement('ul');
        menu.id    = 'comfy-send-menu';
        menu.className = 'custom-context-menu';

        const rect      = anchorBtn.getBoundingClientRect();
        const rightEdge = window.innerWidth - rect.right;
        menu.style.cssText = `position:fixed; z-index:9999; min-width:220px; right:${rightEdge}px; top:${rect.bottom + 4}px;`;
        document.body.appendChild(menu);

        const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', close); } };
        setTimeout(() => document.addEventListener('mousedown', close), 0);

        // ── 静的オプション行を組み立てるヘルパー ──────────────────────────────
        const addSep = () => { const li = document.createElement('li'); li.className = 'ctx-sep'; menu.appendChild(li); };
        const addItem = (label, action, disabled = false) => {
            const li = document.createElement('li');
            li.className = disabled ? 'ctx-item ctx-disabled' : 'ctx-item';
            li.textContent = label;
            if (!disabled) li.onclick = () => { menu.remove(); document.removeEventListener('mousedown', close); action(); };
            menu.appendChild(li);
        };
        const addHeader = (text) => {
            const li = document.createElement('li');
            li.className = 'ctx-header';
            li.textContent = text;
            menu.appendChild(li);
        };

        // ── 送信オプション ────────────────────────────────────────────────────
        IPC.getConfig().then(cfg => {
            if (!document.body.contains(menu)) return;
            const posSlot = cfg.comfyPosSlot || 'positive';
            const negSlot = cfg.comfyNegSlot || 'negative';
            addItem(`${!comfyGenerateOnly &&  comfySendTrigger ? '✓ ' : '　'}${i18n.t('action_send_generate')}`, () => setComfyOpts({ generateOnly: false, trigger: true  }));
            addItem(`${!comfyGenerateOnly && !comfySendTrigger ? '✓ ' : '　'}${i18n.t('action_send_only')}`,      () => setComfyOpts({ generateOnly: false, trigger: false }));
            addItem(`${ comfyGenerateOnly                       ? '✓ ' : '　'}${i18n.t('action_generate_only')}`,  () => setComfyOpts({ generateOnly: true }));
            addSep();
            addItem(`${comfySendMode === 'overwrite' ? '✓ ' : '　'}${i18n.t('mode_overwrite')}`, () => setComfyOpts({ mode: 'overwrite' }));
            addItem(`${comfySendMode === 'append'    ? '✓ ' : '　'}${i18n.t('mode_append')}`,   () => setComfyOpts({ mode: 'append' }));
            addSep();
            addItem(`${comfySendGen ? '✓ ' : '　'}${i18n.t('comfy_action_send_with_gen')}`, () => setComfyOpts({ sendGen: !comfySendGen }));
            addSep();
            addItem(i18n.t('comfy_action_import_prompt'), () => importFromComfy());
            addItem(i18n.t('comfy_action_import_gen'),    () => importGenFromComfy());
            addSep();
            addItem(i18n.t('action_test_connection'), () => testComfyConnection());
        });
    };

    // ── 送信 ─────────────────────────────────────────────────────────────────
    // ComfyUI モード: スロットパネルの全スロットを一括送信
    // WebUI   モード: positive/negative を WebUI に送信（後述）
    const sendToComfy = async () => {
        const cfg     = await IPC.getConfig();
        const genSlot = cfg.comfyGenSlot || 'gen_1';
        const mainBtn  = document.getElementById('btn-send-main');
        const arrowBtn = document.getElementById('btn-send-main-arrow');
        [mainBtn, arrowBtn].forEach(b => b && (b.disabled = true));
        if (mainBtn) mainBtn.textContent = '…';
        try {
            // 生成のみ: スロットを更新せず queuePrompt だけ呼ぶ
            if (comfyGenerateOnly) {
                const result = await IPC.triggerComfy();
                showToast(result?.success ? i18n.t('toast_comfy_generating') : (result?.error || i18n.t('toast_gen_failed')), result?.success ? 'success' : 'error');
                return; // finally で後処理される
            }

            // gen 同時送信が ON なら先に gen を送る
            if (comfySendGen) {
                const raw = getGenPayload();
                const gen = {
                    checkpoint:   raw.checkpoint,
                    vae:          raw.vae,
                    sampler_name: raw.sampler,
                    scheduler:    raw.schedule,
                    steps:        raw.steps,
                    cfg:          raw.cfg,
                    seed:         raw.seed,
                    width:        raw.width,
                    height:       raw.height,
                    clip_skip:    raw.clipSkip,
                    batch_size:   raw.batchSize,
                    denoise:      raw.hiresDenoising,
                    upscale_by:   raw.hiresUpscaleBy,
                };
                await IPC.sendGenToComfy(genSlot, gen);
            }

            // スロットパネルの全スロットを順次送信（最後だけ trigger）
            const slotTexts = getAllSlotTexts();
            const entries   = Object.entries(slotTexts);
            if (entries.length === 0) {
                showToast(i18n.t('toast_no_slots'), 'error');
                return;
            }
            let lastResult;
            for (let i = 0; i < entries.length; i++) {
                const [slot, text] = entries[i];
                const isLast = i === entries.length - 1;
                lastResult = await IPC.sendToComfy({
                    slot, text,
                    mode:    comfySendMode,
                    trigger: isLast ? comfySendTrigger : false,
                });
            }
            if (lastResult?.success) {
                showToast(comfySendTrigger ? i18n.t('toast_comfy_generating') : i18n.t('toast_comfy_sent'), 'success');
            } else {
                showToast(lastResult?.error || 'Send failed', 'error');
            }
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            [mainBtn, arrowBtn].forEach(b => b && (b.disabled = false));
            updateComfyBtn();
        }
    };

    const importFromComfy = async () => {
        showToast(i18n.t('toast_comfy_importing'), 'info');

        // ComfyUI モード: スロットパネルの各テキストエリアに書き込む
        if (State.isComfyMode) {
            const rows = document.querySelectorAll('#comfy-slots-list .comfy-slot-row');
            if (rows.length === 0) {
                showToast(i18n.t('toast_comfy_no_slots_refresh'), 'error');
                return;
            }
            // スキャンを要求してノードの現在テキストをサーバに同期してから読む
            try {
                await IPC.requestComfyScan();
                await new Promise(r => setTimeout(r, 600));
            } catch { /* ComfyUI未起動時は無視 */ }
            const results = await Promise.all(
                Array.from(rows).map(row => {
                    const name = row.dataset.slot;
                    return IPC.getComfyState(name).then(r => ({ name, text: r?.text ?? '' }));
                })
            );
            let any = false;
            for (const { name, text } of results) {
                const ta = document.getElementById(`comfy-slot-${name}`);
                if (ta) {
                    ta.value = text;
                    ta.dispatchEvent(new Event('input')); // チップ再描画 + _savedSlotTexts 更新
                    any = true;
                }
            }
            showToast(any ? i18n.t('toast_comfy_imported') : i18n.t('toast_import_failed'), any ? 'success' : 'error');
            return;
        }

        // WebUI モード: positive/negative テキストエリアに書き込む
        const cfg     = await IPC.getConfig();
        const posSlot = cfg.comfyPosSlot || 'positive';
        const negSlot = cfg.comfyNegSlot || 'negative';
        const [posResult, negResult] = await Promise.all([
            IPC.getComfyState(posSlot),
            IPC.getComfyState(negSlot),
        ]);
        if (!posResult?.success && !negResult?.success) {
            showToast(posResult?.error || i18n.t('toast_import_failed'), 'error');
            return;
        }
        const posEl = document.getElementById('positive-prompt');
        const negEl = document.getElementById('negative-prompt');
        if (posEl && posResult?.text !== undefined) {
            posEl.value = posResult.text;
            posEl.dispatchEvent(new Event('input'));
        }
        if (negEl && negResult?.text !== undefined) {
            negEl.value = negResult.text;
            negEl.dispatchEvent(new Event('input'));
        }
        showToast(i18n.t('toast_comfy_imported'), 'success');
    };

    const importGenFromComfy = async () => {
        const cfg     = await IPC.getConfig();
        const genSlot = cfg.comfyGenSlot || 'gen_1';
        showToast(i18n.t('toast_comfy_gen_importing'), 'info');
        const result = await IPC.getComfyGen(genSlot);
        if (!result?.success) {
            showToast(result?.error || i18n.t('toast_import_failed'), 'error');
            return;
        }
        // generation.js の applyPreset() に渡す（checkpoint→sampler_name→sampler などキー変換）
        const preset = {
            checkpoint:     result.checkpoint,
            vae:            result.vae,
            sampler:        result.sampler_name,
            schedule:       result.scheduler,
            steps:          result.steps,
            cfg:            result.cfg,
            seed:           result.seed,
            width:          result.width,
            height:         result.height,
            clipSkip:       result.clip_skip,
            batchSize:      result.batch_size,
            hiresDenoising: result.denoise,
            hiresUpscaleBy: result.upscale_by,
        };
        applyPreset?.(preset);
        showToast(i18n.t('toast_comfy_gen_imported'), 'success');
    };

    const testComfyConnection = async () => {
        showToast(i18n.t('toast_comfy_checking'), 'info');
        try {
            const result = await IPC.checkComfyBridge();
            if (result?.ok) {
                showToast(i18n.t('toast_comfy_ok'), 'success');
            } else {
                showToast(`${i18n.t('toast_comfy_failed')}: ${result?.error || i18n.t('toast_comfy_no_response')}`, 'error');
            }
        } catch (e) {
            showToast(`${i18n.t('toast_comfy_error')}: ${e.message}`, 'error');
        }
    };

    // ── 統合送信ボタン初期化 ───────────────────────────────────────────────────
    // モードに応じてラベル・動作を切り替える
    const updateSendBtn = () => State.isComfyMode ? updateComfyBtn() : updateWebuiBtn();
    updateSendBtn();

    document.getElementById('btn-send-main')?.addEventListener('click', () => {
        State.isComfyMode ? sendToComfy() : sendToWebUI();
    });

    // Keyboard shortcuts: Ctrl+Enter → WebUI, Ctrl+Shift+Enter → ComfyUI (regardless of current toggle)
    window.addEventListener('builder:send', (e) => {
        if (e.detail === 'webui') sendToWebUI();
        else if (e.detail === 'comfy') sendToComfy();
    });
    const sendArrowBtn = document.getElementById('btn-send-main-arrow');
    if (sendArrowBtn) {
        sendArrowBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            State.isComfyMode ? showComfyMenu(sendArrowBtn) : showWebuiMenu(sendArrowBtn);
        });
    }
    document.getElementById('btn-send-main')?.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const anchor = document.getElementById('btn-send-main-arrow') || e.target;
        State.isComfyMode ? showComfyMenu(anchor) : showWebuiMenu(anchor);
    });

    // Window Controls
    ['win-min', 'win-max', 'win-close'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.onclick = () => {
                if (id === 'win-min') Win.minimize();
                if (id === 'win-max') Win.maximize();
                if (id === 'win-close') Win.close();
            };
        }
    });

    // Quick-Add inline inputs (Enter to add tag, Escape to clear)
    ['positive', 'negative'].forEach(p => {
        const qa = document.getElementById(`quick-add-${p}`);
        if (!qa) return;
        qa.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                const val = qa.value.trim();
                if (val) {
                    const qaChk = document.getElementById('style-apply-quickadd');
                    const spDropdown = document.getElementById('style-palette-dropdown');
                    const paletteOpen = spDropdown && !spDropdown.classList.contains('sp-hidden');
                    const applyStyle = paletteOpen && qaChk?.checked && hasActiveStyle();
                    addToPrompt(applyStyle ? applyStyleToValue(val) : val, `${p}-prompt`);
                    if (applyStyle) closeIfAutoClose();
                    qa.value = '';
                    hideAutocomplete();
                }
            } else if (e.key === 'Escape') {
                qa.value = '';
                hideAutocomplete();
            }
        });
    });

    // ComfyUI Slots quick-add (Enter → アクティブスロットへ挿入)
    const qaComfy = document.getElementById('quick-add-comfy');
    if (qaComfy) {
        qaComfy.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                const val = qaComfy.value.trim();
                if (val) {
                    addToPrompt(val); // State.lastFocusedAreaId = アクティブスロットのtextarea
                    qaComfy.value = '';
                    hideAutocomplete();
                }
            } else if (e.key === 'Escape') {
                qaComfy.value = '';
                hideAutocomplete();
            }
        });
    }

    // --- Global Danbooru Autocomplete (all text inputs) ---
    setupGlobalAutocomplete();

    // Prompt Section Toggling (Active Focus)
    ['positive', 'negative'].forEach(p => {
        const chipsContainer = document.getElementById(`${p}-chips`);
        const section = chipsContainer?.closest('.prompt-section');
        const input = document.getElementById(p + '-prompt');
        
        const updateFocus = () => {
            State.lastFocusedAreaId = p + '-prompt';
            document.querySelectorAll('.prompt-section').forEach(s => s.classList.toggle('active-area', s === section));
        };
        
        if (section) {
            section.addEventListener('mousedown', (e) => {
                if (e.target.closest('.prompt-chip, .btn-icon-action, .area-inline-input')) return;
                updateFocus();
            });
        }
        if (input) {
            input.addEventListener('input', () => renderPromptChips(`${p}-chips`, p + '-prompt'));
            input.addEventListener('focus', updateFocus);
            // 起動時に必ず一度レンダリング（Sortable を確実に初期化する）
            renderPromptChips(`${p}-chips`, p + '-prompt');
        }
    });


    // Global Key Events: F2 (Rename highlighted explorer item)
    document.addEventListener('keydown', async (e) => {
        if (e.key !== 'F2' || e.target.closest('input, textarea, [contenteditable]')) return;

        if (State.currentMode === 'tags') {
            if (State.currentGroupName) {
                const ctx = findGroupParentContext(State.allTags, State.currentGroupName);
                if (!ctx) return;
                const cat = State.allTags.find(c => c.id === ctx.catId);
                if (!cat) return;
                const findGroup = (nodes, name) => {
                    for (const n of nodes) {
                        if (n.type === 'group' && n.name === name) return n;
                        if (n.children) { const f = findGroup(n.children, name); if (f) return f; }
                    }
                    return null;
                };
                const groupNode = findGroup(cat.children || [], State.currentGroupName);
                if (groupNode) openAddGroupModal(ctx.catId, ctx.parentGroupName, groupNode);
            } else if (State.currentCategoryId) {
                const cat = State.allTags.find(c => c.id === State.currentCategoryId);
                if (cat) openAddCategoryModal(cat);
            }

        } else if (State.currentMode === 'lora' || State.currentMode === 'embedding' || State.currentMode === 'checkpoint') {
            const relPath = State.currentAssetFilter;
            if (!relPath || relPath === '__favorites__' || relPath === '__all__') return;
            const parts = relPath.split('/');
            const oldName = parts[parts.length - 1];
            const newName = await showInputDialog('Rename Folder', oldName);
            if (!newName || newName === oldName) return;
            const cfg = await IPC.getConfig();
            const basePath = State.currentMode === 'lora'       ? cfg.loraPath
                           : State.currentMode === 'embedding'  ? cfg.embeddingsPath
                           :                                       cfg.checkpointsPath;
            const newParts = [...parts];
            newParts[newParts.length - 1] = newName.trim();
            const oldFull = `${basePath}\\${relPath.replace(/\//g, '\\')}`;
            const newFull = `${basePath}\\${newParts.join('\\')}`;
            try {
                await IPC.moveAssetFolder(oldFull, newFull);
                State.allAssets = await loadAssets();
                State.currentAssetFilter = null;
                renderExplorer();
                renderAssetGrid();
            } catch (err) {
                alert(`Failed to rename folder: ${err.message}`);
            }
        }
    });

    // Global Key Events: Delete
    document.addEventListener('keydown', async (e) => {
        if (e.key !== 'Delete') return;
        const inPromptArea = e.target.id === 'positive-prompt' || e.target.id === 'negative-prompt';
        const inOtherInput = !inPromptArea && !!e.target.closest('input, textarea');
        if (inOtherInput) return;

        // Chip selection: handle even if focus is on prompt textarea
        if (State.selectedChips.size > 0) {
            e.preventDefault();
            performBatchRemoveFromPrompt(Array.from(State.selectedChips));
            return;
        }

        if (inPromptArea) return; // let textarea handle normal Delete

        // Library tag-grid selection takes priority (it's the destructive case)
        if (State.selectedTags.size > 0) {
            const ids = Array.from(State.selectedTags);
            const confirmed = await showConfirmDialog(`Delete ${ids.length} selected items?`);
            if (confirmed) await performBatchDelete(ids);
            return;
        }
    });

    // Selection HUD visibility — タググリッド選択 or チップ選択の両方に対応
    const updateSelectionHud = () => {
        const hud = document.getElementById('selection-hud');
        const countEl = document.getElementById('hud-count-val');
        const starBtn = document.getElementById('btn-hud-star');
        const disableBtn = document.getElementById('btn-hud-disable');
        const enableBtn = document.getElementById('btn-hud-enable');
        if (!hud) return;
        const tagCount = State.selectedTags.size;
        const chipCount = State.selectedChips.size;
        const isChipMode = chipCount > 0 && tagCount === 0;
        const count = tagCount > 0 ? tagCount : chipCount;
        hud.classList.toggle('active', count > 0);
        if (countEl) countEl.textContent = count;
        // チップモード時はスター非表示・無効/有効ボタンを表示
        if (starBtn) starBtn.style.display = isChipMode ? 'none' : '';
        if (disableBtn) disableBtn.style.display = isChipMode ? '' : 'none';
        if (enableBtn) enableBtn.style.display = isChipMode ? '' : 'none';
    };
    window.addEventListener('selection-changed', updateSelectionHud);

    // Selection HUD: Bulk Star（タググリッド選択のみ）
    document.getElementById('btn-hud-star')?.addEventListener('click', async () => {
        const ids = Array.from(State.selectedTags);
        if (ids.length === 0) return;

        const setFavorite = (nodes) => {
            for (const n of nodes) {
                if (ids.includes(n.id)) n.favorite = true;
                if (n.children) setFavorite(n.children);
            }
        };
        setFavorite(State.allTags);
        await saveTagOrder(State.allTags);
        State.selectedTags.clear();
        renderExplorer();
        renderTagGrid();
    });

    // Selection HUD: Register as Tag（タググリッド or チップ選択）
    document.getElementById('btn-hud-register')?.addEventListener('click', () => {
        const catId = State.currentCategoryId || (State.allTags[0]?.id ?? '');
        openAddTagModal(catId, State.currentGroupName || '', null);
        const valField = document.getElementById('new-tag-val');
        if (State.selectedChips.size > 0 && State.selectedTags.size === 0) {
            // チップ選択モード: チップ名を value に設定
            if (valField) valField.value = getSelectedChipsOrdered().join(', ');
        } else {
            const ids = Array.from(State.selectedTags);
            if (ids.length === 0) return;
            if (valField) valField.value = ids.join(', ');
        }
    });

    // Selection HUD: Bulk Delete（タググリッド or チップ選択）
    document.getElementById('btn-hud-delete')?.addEventListener('click', async () => {
        if (State.selectedChips.size > 0 && State.selectedTags.size === 0) {
            // チップ選択モード: プロンプトから削除
            performBatchRemoveFromPrompt(Array.from(State.selectedChips));
        } else {
            const ids = Array.from(State.selectedTags);
            if (ids.length === 0) return;
            const confirmed = await showConfirmDialog(i18n.t('confirm_delete_bulk').replace('{n}', ids.length));
            if (confirmed) await performBatchDelete(ids);
        }
    });

    // Selection HUD: Bulk Disable / Enable（チップ選択モード）
    const batchSetChipsDisabled = (disabled) => {
        document.querySelectorAll('.prompt-chip.selected').forEach(chipEl => {
            const name = chipEl.dataset.name;
            const isNeg = !!chipEl.closest('#negative-chips');
            const set = isNeg ? State.disabledTagsNegative : State.disabledTagsPositive;
            if (disabled) set.add(name); else set.delete(name);
        });
        renderPromptChips('positive-chips', 'positive-prompt');
        renderPromptChips('negative-chips', 'negative-prompt');
    };
    document.getElementById('btn-hud-disable')?.addEventListener('click', () => batchSetChipsDisabled(true));
    document.getElementById('btn-hud-enable')?.addEventListener('click', () => batchSetChipsDisabled(false));

    // Clear / Newline / Copy Actions
    const clearPrompt = (inputId) => {
        const el = document.getElementById(inputId);
        if (el) { el.value = ''; el.dispatchEvent(new Event('input')); }
    };

    document.getElementById('clear-all')?.addEventListener('click', () => {
        clearPrompt('positive-prompt');
        clearPrompt('negative-prompt');
    });
    document.getElementById('clear-positive-inline')?.addEventListener('click', () => clearPrompt('positive-prompt'));
    document.getElementById('clear-negative-inline')?.addEventListener('click', () => clearPrompt('negative-prompt'));

    document.getElementById('insert-newline-positive')?.addEventListener('click', () => {
        const el = document.getElementById('positive-prompt');
        if (el) { el.value += '\n'; el.dispatchEvent(new Event('input')); }
    });
    document.getElementById('insert-newline-negative')?.addEventListener('click', () => {
        const el = document.getElementById('negative-prompt');
        if (el) { el.value += '\n'; el.dispatchEvent(new Event('input')); }
    });

    const btnCopyPos = document.getElementById('copy-positive');
    if (btnCopyPos) {
        btnCopyPos.onclick = () => {
            navigator.clipboard.writeText(getActivePrompt('positive-prompt'));
        };
    }

    const btnCopyNeg = document.getElementById('copy-negative');
    if (btnCopyNeg) {
        btnCopyNeg.onclick = () => {
            navigator.clipboard.writeText(getActivePrompt('negative-prompt'));
        };
    }

    // Comfy Syntax Toggle Logic
    const comfyToggle = document.getElementById('btn-toggle-comfy');
    if (comfyToggle) {
        comfyToggle.onclick = () => {
            State.isComfyMode = !State.isComfyMode;
            comfyToggle.classList.toggle('is-comfy', State.isComfyMode);
            saveUiState();
            syncSamplerScheduleToMode();
            updateSendBtn();
            syncComfySlotsVisibility(State.isComfyMode);
            if (State.currentMode === 'lora' || State.currentMode === 'embedding' || State.currentMode === 'checkpoint') {
                renderAssetGrid();
            }
        };
        comfyToggle.classList.toggle('is-comfy', State.isComfyMode);
    }

    // ComfyUI Slots Panel
    // 個別スロット送信ハンドラを登録
    registerComfySlotsHandler(async (slotName, text, trigger) => {
        const mainBtn  = document.getElementById('btn-send-main');
        const arrowBtn = document.getElementById('btn-send-main-arrow');
        [mainBtn, arrowBtn].forEach(b => b && (b.disabled = true));
        try {
            const result = await IPC.sendToComfy({ slot: slotName, text, mode: comfySendMode, trigger });
            showToast(result?.success ? i18n.t('toast_slot_sent').replace('{name}', slotName) : (result?.error || 'Send failed'),
                      result?.success ? 'success' : 'error');
        } catch (e) { showToast(e.message, 'error'); }
        finally { [mainBtn, arrowBtn].forEach(b => b && (b.disabled = false)); updateComfyBtn(); }
    });

    // リフレッシュボタン
    document.getElementById('btn-comfy-slots-refresh')?.addEventListener('click', loadComfySlots);

    // 初期表示
    syncComfySlotsVisibility(State.isComfyMode);

    // Category management in Explorer
    const btnAddCat = document.getElementById('btn-add-category');
    if (btnAddCat) {
        btnAddCat.onclick = (e) => {
            e.stopPropagation();
            openAddCategoryModal();
        };
    }
}

// --- Global Danbooru Autocomplete ---

function setupGlobalAutocomplete() {
    // Fields that have their own dropdowns or where Danbooru suggestions don't apply
    const SKIP_IDS = new Set(['tag-move-search', 'spe-add-value', 'new-tag-val']);

    let acDebounce = null;

    document.addEventListener('input', async (e) => {
        if (!e.isTrusted) return; // ignore programmatic changes
        const el = e.target;
        if (el.tagName !== 'INPUT') return;
        if (el.type && !['text', 'search', ''].includes(el.type)) return;
        if (SKIP_IDS.has(el.id)) return;

        clearTimeout(acDebounce);
        // Use last word (split by comma then space) as query
        const _commaToken = el.value.split(',').pop();
        const query = _commaToken.split(' ').pop().trim();
        if (query.length < 2) { hideAutocomplete(); return; }

        acDebounce = setTimeout(async () => {
            const results = await IPC.searchDanbooru(query);
            if (!results?.length) { hideAutocomplete(); return; }

            showAutocomplete(el, results.map(r => ({
                label: r.n,
                value: r.n,
                type: r.t,
                count: r.c
            })), (item) => {
                // quick-add inputs: add tag to prompt and clear
                if (el.id === 'quick-add-positive' || el.id === 'quick-add-negative') {
                    const p = el.id === 'quick-add-positive' ? 'positive' : 'negative';
                    const chk = document.getElementById('setting-danbooru-underscore');
                    const convert = chk ? chk.checked : true;
                    const tagVal = convert ? item.value.replaceAll('_', ' ') : item.value;
                    const qaChk = document.getElementById('style-apply-quickadd');
                    const spDropdown2 = document.getElementById('style-palette-dropdown');
                    const paletteOpen2 = spDropdown2 && !spDropdown2.classList.contains('sp-hidden');
                    // コンマ区切りの先行トークンは別チップ、スペース区切りの先行ワードはサジェストと結合して1チップ
                    // 例: "1girl, black pantyhose" で "pantyhose" を選択
                    //   → "1girl" チップ + "black pantyhose" チップ
                    const commaTokens = el.value.split(',');
                    const lastToken = commaTokens[commaTokens.length - 1];
                    const spaceWords = lastToken.split(' ');
                    spaceWords.pop(); // サジェスト対象の最後のワードを除去
                    // コンマ前のトークンを別チップとして追加
                    for (const token of commaTokens.slice(0, -1).map(s => s.trim()).filter(Boolean)) {
                        const tv = convert ? token.replaceAll('_', ' ') : token;
                        const tf = paletteOpen2 && qaChk?.checked && hasActiveStyle() ? applyStyleToValue(tv) : tv;
                        addToPrompt(tf, `${p}-prompt`);
                        recordTagUsage(token);
                    }
                    // スペース先行ワード + サジェストを結合して1チップ
                    const prefix = spaceWords.map(s => s.trim()).filter(Boolean).join(' ');
                    const combined = prefix ? `${prefix} ${tagVal}` : tagVal;
                    const styleApplied2 = paletteOpen2 && qaChk?.checked && hasActiveStyle();
                    const finalVal = styleApplied2 ? applyStyleToValue(combined) : combined;
                    addToPrompt(finalVal, `${p}-prompt`);
                    if (styleApplied2) closeIfAutoClose();
                    recordTagUsage(item.value);
                    el.value = '';
                    el.focus();
                    return;
                }
                // アンダースコア→スペース変換（setting-danbooru-underscore）
                const _chk = document.getElementById('setting-danbooru-underscore');
                const _val = (_chk ? _chk.checked : true) ? item.value.replaceAll('_', ' ') : item.value;
                // Replace the last word (after comma and/or space) with the selected tag
                if (el.value.includes(',')) {
                    const parts = el.value.split(',');
                    const lastPart = parts[parts.length - 1];
                    const words = lastPart.split(' ');
                    words[words.length - 1] = _val;
                    parts[parts.length - 1] = words.join(' ');
                    el.value = parts.join(',').replace(/^\s*,\s*/, '') + ', ';
                } else {
                    const words = el.value.split(' ');
                    words[words.length - 1] = _val;
                    el.value = words.join(' ');
                }
                // Notify any listeners (e.g. tag-search filter)
                el.dispatchEvent(new Event('input', { bubbles: true }));
            });
        }, 150);
    }, true);

    // Hide on blur (delayed to allow item click to register first)
    document.addEventListener('focusout', (e) => {
        if (e.target.tagName === 'INPUT') {
            setTimeout(hideAutocomplete, 150);
        }
    }, true);

    // Arrow / Enter / Escape navigation for autocomplete
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { hideAutocomplete(); return; }

        const list = document.getElementById('autocomplete-list');
        if (!list || list.classList.contains('hidden')) return;

        // dialog 内の input は専用ハンドラに任せる
        const focused = document.activeElement;
        if (!focused || focused.tagName !== 'INPUT' || focused.closest('dialog')) return;

        const items = list.querySelectorAll('.ac-item');
        if (!items.length) return;
        const active = list.querySelector('.ac-item.ac-active');

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const next = active ? active.nextElementSibling : items[0];
            active?.classList.remove('ac-active');
            next?.classList.add('ac-active');
            next?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prev = active ? active.previousElementSibling : items[items.length - 1];
            active?.classList.remove('ac-active');
            prev?.classList.add('ac-active');
            prev?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter' && active) {
            e.preventDefault();
            e.stopPropagation(); // quick-add の Enter ハンドラを抑制
            active.onmousedown(new MouseEvent('mousedown'));
        }
    }, true);
}

// --- Utility Functions for Batch Actions ---

async function performBatchDelete(ids) {
    const removeRecursively = (nodes) => {
        for (let i = nodes.length - 1; i >= 0; i--) {
            if (ids.includes(nodes[i].id)) nodes.splice(i, 1);
            else if (nodes[i].children) removeRecursively(nodes[i].children);
        }
    };
    removeRecursively(State.allTags);
    await saveTagOrder(State.allTags);
    State.selectedTags.clear();
    window.dispatchEvent(new CustomEvent('selection-changed'));
    renderExplorer();
    renderTagGrid();
}

function performBatchRemoveFromPrompt(names) {
    const area = document.getElementById(State.lastFocusedAreaId) || document.getElementById('positive-prompt');
    if (!area) return;
    const tags = parsePrompt(area.value);
    const filtered = tags.filter(t => !names.includes(t.name));
    area.value = stringifyPrompt(filtered);
    area.dispatchEvent(new Event('input'));
    State.selectedChips.clear();
    window.dispatchEvent(new CustomEvent('selection-changed'));
}

// ── Mode scroll preservation ───────────────────────────────────
const _modeScrolls = {};
let _assetRenderTimer = null;

function _libScrollEl(mode) {
    // Tags scroll via #tag-scroll-wrapper; others via the library pane-content
    if (mode === 'tags') return document.getElementById('tag-scroll-wrapper');
    return document.querySelector('#library .pane-content');
}

function _saveScrollPositions(mode) {
    if (!mode) return;
    const ex = document.getElementById('explorer-content');
    const lib = _libScrollEl(mode);
    if (ex)  _modeScrolls[`${mode}_ex`]  = ex.scrollTop;
    if (lib) _modeScrolls[`${mode}_lib`] = lib.scrollTop;
}

function _restoreScrollPositions(mode) {
    requestAnimationFrame(() => {
        const ex = document.getElementById('explorer-content');
        const lib = _libScrollEl(mode);
        if (ex)  ex.scrollTop  = _modeScrolls[`${mode}_ex`]  ?? 0;
        if (lib) lib.scrollTop = _modeScrolls[`${mode}_lib`] ?? 0;
    });
}

export function switchMode(mode) {
    _saveScrollPositions(State.currentMode);
    State.currentMode = mode;
    syncSliderToMode(mode);
    syncCatFilterVisibility(mode);


    // v5: Update mode tab UI
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.mode === mode);
    });

    // Update workspace container class
    const container = document.getElementById('workspace-container');
    const explorer = document.getElementById('explorer');
    const tagsContainer = document.getElementById('tags-container');
    const assetsContainer = document.getElementById('assets-container');

    if (container) {
        container.classList.remove('tags-mode', 'lora-mode', 'embedding-mode', 'checkpoint-mode', 'gen-mode', 'images-mode', 'ai-mode');
        container.classList.add(`${mode}-mode`);
    }
    
    // Dynamically update Library Title (i18n aware)
    const libraryTitle = document.getElementById('library-title');
    if (libraryTitle) {
        const titles = {
            tags:      i18n.t('lib_title_tags'),
            lora:       i18n.t('lib_title_lora'),
            embedding:  i18n.t('lib_title_embedding'),
            checkpoint: i18n.t('lib_title_checkpoint'),
            gen:        i18n.t('lib_title_gen'),
            images:    i18n.t('lib_title_images'),
            ai:        i18n.t('lib_title_ai'),
        };
        libraryTitle.textContent = titles[mode] ?? mode;
    }

    // Update search placeholder based on mode, and clear when leaving a search mode
    const searchInput = document.getElementById('library-search');
    if (searchInput) {
        const placeholders = {
            tags:      i18n.t('search_placeholder_tags'),
            lora:       i18n.t('search_placeholder_lora'),
            embedding:  i18n.t('search_placeholder_embedding'),
            checkpoint: i18n.t('search_placeholder_checkpoint'),
            images:     i18n.t('search_placeholder_images'),
            gen:        '',
            ai:         '',
        };
        searchInput.placeholder = placeholders[mode] ?? 'Search…';
        // Clear search value when switching modes
        const prev = State._prevSearchMode;
        if (prev !== mode && (prev === 'images' || prev === 'lora' || prev === 'embedding' || prev === 'checkpoint' || prev === 'tags')) {
            searchInput.value = '';
            const clearBtn = document.getElementById('btn-search-clear');
            if (clearBtn) clearBtn.hidden = true;
        }
    }
    State._prevSearchMode = mode;

    // Reset filters — asset modes default to favorites if any exist, otherwise show all
    if (mode === 'lora' || mode === 'embedding' || mode === 'checkpoint') {
        const favSet = mode === 'lora'       ? State.loraFavorites
                     : mode === 'embedding'  ? State.embeddingFavorites
                     :                         State.checkpointFavorites;
        State.currentAssetFilter = favSet.size > 0 ? '__favorites__' : null;
    } else {
        State.currentAssetFilter = null;
    }
    
    // Manage tab classes for CSS consistency
    const genContainer = document.getElementById('generation-container');
    const imagesContainer = document.getElementById('images-container');
    const aiContainer = document.getElementById('ai-container');
    if (tagsContainer) tagsContainer.classList.toggle('active', mode === 'tags');
    if (assetsContainer) assetsContainer.classList.toggle('active', mode === 'lora' || mode === 'embedding' || mode === 'checkpoint');
    if (genContainer) genContainer.classList.toggle('active', mode === 'gen');
    if (imagesContainer) imagesContainer.classList.toggle('active', mode === 'images');
    if (aiContainer) aiContainer.classList.toggle('active', mode === 'ai');

    // Mode-Specific Element Visibility
    const sliderGroup = document.querySelector('.slider-group');
    const fetchAllBtn = document.getElementById('btn-fetch-all-civitai');

    // Builder pane: show normal content or image info panel
    const builderContent = document.getElementById('builder-pane-content');
    const imageInfoPanel = document.getElementById('image-info-panel');
    if (builderContent) builderContent.style.display = mode === 'images' ? 'none' : '';
    if (imageInfoPanel) imageInfoPanel.style.display = mode === 'images' ? 'flex' : 'none';

    if (mode === 'tags') {
        if (sliderGroup) sliderGroup.style.display = 'none';
        if (fetchAllBtn) fetchAllBtn.style.display = 'none';
        renderTagGrid();
    } else if (mode === 'gen') {
        if (sliderGroup) sliderGroup.style.display = 'none';
        if (fetchAllBtn) fetchAllBtn.style.display = 'none';
        if (!State._genInitialized) {
            State._genInitialized = true;
            initGeneration();
            initGenPngDrop();
        }
    } else if (mode === 'images') {
        if (sliderGroup) sliderGroup.style.display = 'flex';
        if (fetchAllBtn) fetchAllBtn.style.display = 'none';
        if (!State._imageBrowserInitialized) {
            State._imageBrowserInitialized = true;
            initImageBrowser();
        } else {
            refreshImageBrowserView(_modeScrolls['images_lib'] ?? 0);
            requestAnimationFrame(() => {
                const ex = document.getElementById('explorer-content');
                if (ex) ex.scrollTop = _modeScrolls['images_ex'] ?? 0;
            });
        }
    } else if (mode === 'ai') {
        if (sliderGroup) sliderGroup.style.display = 'none';
        if (fetchAllBtn) fetchAllBtn.style.display = 'none';
        // AI モードはExplorerを履歴パネルとして表示
        if (explorer) explorer.style.display = 'flex';
        const aiPaneTitle = document.querySelector('#explorer .pane-title');
        if (aiPaneTitle) aiPaneTitle.textContent = i18n.t('explorer_ai_history_title');
        const aiReloadBtn = document.getElementById('btn-reload-data');
        if (aiReloadBtn) aiReloadBtn.style.display = 'none';
        const aiAddCatBtn = document.getElementById('btn-add-category');
        if (aiAddCatBtn) aiAddCatBtn.style.display = 'none';
        renderAiHistory();
        return;
    } else {
        if (sliderGroup) sliderGroup.style.display = 'flex';
        if (fetchAllBtn) fetchAllBtn.style.display = 'flex';
        clearTimeout(_assetRenderTimer);
        _assetRenderTimer = setTimeout(() => {
            renderAssetGrid();
            _restoreScrollPositions(mode);
        }, 10);
    }

    // Restore explorer header when leaving AI mode
    const paneTitle = document.querySelector('#explorer .pane-title');
    if (paneTitle) paneTitle.textContent = i18n.t('explorer_groups_title');
    const reloadBtn = document.getElementById('btn-reload-data');
    if (reloadBtn) reloadBtn.style.display = '';
    const addCatBtn = document.getElementById('btn-add-category');
    if (addCatBtn) addCatBtn.style.display = '';
    // Always refresh explorer to show correct folder tree for the mode
    if (explorer) explorer.style.display = 'flex';
    if (mode !== 'images') renderExplorer();

    // Restore scroll positions after render (lora/embedding restore inside their setTimeout)
    if (mode !== 'lora' && mode !== 'embedding' && mode !== 'images') {
        _restoreScrollPositions(mode);
    }
}


// Start the app
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
