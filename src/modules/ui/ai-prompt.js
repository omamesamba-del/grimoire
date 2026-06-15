/**
 * AI Prompt Generator — natural language → SD prompt
 * Supports: Ollama (local) / Claude API / OpenAI API
 */
import { IPC } from '../core/ipc.js';
import { saveAiHistory, renderAiHistory } from './ai-history.js';
import { openSettings } from './modals.js';
import { i18n } from '../core/i18n.js';

const LS_KEY = 'ai-selected-provider';
const LS_MODEL_KEY = (provider) => `ai-selected-model-${provider}`;

let _currentRequestId = null; // 生成キャンセル用

export function initAiPrompt() {
    const providerSelect = document.getElementById('ai-provider-select');
    const modelSelect    = document.getElementById('ai-model-select');
    const modelRow       = document.getElementById('ai-model-row');
    const generateBtn    = document.getElementById('btn-ai-generate');
    const applyBtn       = document.getElementById('btn-ai-apply');
    const appendBtn      = document.getElementById('btn-ai-append');
    const copyBtn        = document.getElementById('btn-ai-copy');
    const inputEl        = document.getElementById('ai-natural-input');
    const resultEl       = document.getElementById('ai-prompt-result');
    const resultText     = document.getElementById('ai-result-text');
    const statusEl       = document.getElementById('ai-status-msg');

    // SD Info / Tag count / Style elements
    const useSDInfoCb      = document.getElementById('ai-use-sdinfo');
    const sdInfoDetail     = document.getElementById('ai-sdinfo-detail');
    const checkpointSelect = document.getElementById('ai-checkpoint-select');
    const archBadge        = document.getElementById('ai-arch-badge');
    const tagMinInput      = document.getElementById('ai-tag-min');
    const tagMaxInput      = document.getElementById('ai-tag-max');
    const styleSelect      = document.getElementById('ai-style-select');
    const danbooruCb       = document.getElementById('ai-use-danbooru');

    if (!providerSelect || !generateBtn || !inputEl) return;

    // ── SD情報・タグ数・スタイルの設定を復元 ─────────────────
    const _lsBool = (key, def) => { const v = localStorage.getItem(key); return v === null ? def : v === 'true'; };
    if (useSDInfoCb) useSDInfoCb.checked = _lsBool('ai-use-sdinfo', true);
    if (tagMinInput) tagMinInput.value   = localStorage.getItem('ai-tag-min') || '20';
    if (tagMaxInput) tagMaxInput.value   = localStorage.getItem('ai-tag-max') || '40';
    if (styleSelect) styleSelect.value   = localStorage.getItem('ai-style') || '';
    if (danbooruCb)  danbooruCb.checked  = _lsBool('ai-use-danbooru', false);

    // SD情報チェックボックスで detail 表示切替
    const _toggleSDInfo = () => {
        if (sdInfoDetail) sdInfoDetail.style.display = useSDInfoCb?.checked ? '' : 'none';
    };
    _toggleSDInfo();
    useSDInfoCb?.addEventListener('change', () => {
        localStorage.setItem('ai-use-sdinfo', useSDInfoCb.checked);
        _toggleSDInfo();
    });
    tagMinInput?.addEventListener('change', () => localStorage.setItem('ai-tag-min', tagMinInput.value));
    tagMaxInput?.addEventListener('change', () => localStorage.setItem('ai-tag-max', tagMaxInput.value));
    styleSelect?.addEventListener('change',  () => localStorage.setItem('ai-style', styleSelect.value));
    danbooruCb?.addEventListener('change',   () => localStorage.setItem('ai-use-danbooru', danbooruCb.checked));

    // ── Checkpoint カスタムドロップダウン初期化 ───────────────
    _fetchCheckpoints(checkpointSelect, archBadge);

    // ── プロバイダー選択を復元 ─────────────────────────────────
    const savedProvider = localStorage.getItem(LS_KEY) || 'ollama';
    providerSelect.value = savedProvider;

    // 初回チェック＋モデル取得
    _checkProvider(providerSelect.value, statusEl, generateBtn);
    _fetchModels(providerSelect.value, modelSelect, modelRow);

    // ── プロバイダー変更 ──────────────────────────────────────
    providerSelect.addEventListener('change', () => {
        const val = providerSelect.value;
        localStorage.setItem(LS_KEY, val);
        if (resultEl) resultEl.hidden = true;
        _checkProvider(val, statusEl, generateBtn);
        _fetchModels(val, modelSelect, modelRow);
    });

    // ── モデル選択の保存 ──────────────────────────────────────
    modelSelect?.addEventListener('change', () => {
        localStorage.setItem(LS_MODEL_KEY(providerSelect.value), modelSelect.value);
    });

    // ── モデル一覧リフレッシュ ────────────────────────────────
    document.getElementById('btn-ai-refresh-models')?.addEventListener('click', () => {
        _fetchModels(providerSelect.value, modelSelect, modelRow);
    });

    // ── Civitai メタデータ取得ボタン ─────────────────────────
    const civitaiBtn = document.getElementById('btn-ai-fetch-civitai');
    civitaiBtn?.addEventListener('click', async () => {
        const ckpt = checkpointSelect?.value;
        if (!ckpt) { alert(i18n.t('ai_no_checkpoint')); return; }

        const cfg = await IPC.getConfig();
        const basePath = cfg.checkpointsPath;
        if (!basePath) { alert(i18n.t('ai_no_ckpt_path')); return; }

        const fullPath = basePath.replace(/[\\/]$/, '') + '\\' + ckpt.replace(/\//g, '\\');
        const apiKey = cfg.civitaiApiKey || '';

        const origText = civitaiBtn.textContent;
        civitaiBtn.textContent = i18n.t('ai_civitai_fetching');
        civitaiBtn.disabled = true;
        if (archBadge) { archBadge.hidden = true; }

        try {
            const result = await IPC.fetchCivitaiMetadata(fullPath, apiKey);
            if (result?.success) {
                const baseModel = result.info?.baseModel || null;
                _updateArchBadgeFromMeta(ckpt, baseModel, archBadge);
                civitaiBtn.textContent = i18n.t('ai_civitai_done');
                setTimeout(() => { civitaiBtn.textContent = origText; }, 2000);
            } else {
                civitaiBtn.textContent = i18n.t('ai_civitai_failed');
                setTimeout(() => { civitaiBtn.textContent = origText; }, 2000);
            }
        } catch (e) {
            civitaiBtn.textContent = i18n.t('ai_civitai_error');
            setTimeout(() => { civitaiBtn.textContent = origText; }, 2500);
            console.error('[Civitai]', e.message);
        } finally {
            civitaiBtn.disabled = false;
        }
    });

    // ── キャンセルボタン ──────────────────────────────────────
    const cancelBtn = document.getElementById('btn-ai-cancel');
    cancelBtn?.addEventListener('click', () => {
        if (_currentRequestId) {
            IPC.cancelAiPrompt({ requestId: _currentRequestId });
            _currentRequestId = null;
        }
    });

    // ── 変換ボタン ────────────────────────────────────────────
    generateBtn.addEventListener('click', async () => {
        const text = inputEl.value.trim();
        if (!text) { inputEl.focus(); return; }

        const provider = providerSelect.value;
        const cfg = await IPC.getConfig();
        const ollamaUrl = cfg.ollamaUrl || 'http://localhost:11434';
        const selectedModel = modelSelect?.value || '';
        const ollamaModel = provider === 'ollama'
            ? (selectedModel || cfg.ollamaModel || 'llama3')
            : (cfg.ollamaModel || 'llama3');
        const apiKey = provider === 'claude'  ? (cfg.claudeApiKey  || '')
                     : provider === 'openai' ? (cfg.openaiApiKey || '')
                     : '';
        const model = provider !== 'ollama' ? selectedModel : '';

        // ── SD情報・タグ数を収集 ─────────────────────────────────
        const tagMin = Math.max(5,  parseInt(tagMinInput?.value || '20'));
        const tagMax = Math.max(tagMin, parseInt(tagMaxInput?.value || '40'));

        let sdInfo = null;
        if (useSDInfoCb?.checked) {
            const checkpointName = checkpointSelect?.value || '';
            // メタデータからbaseModelを取得
            let baseModel = null;
            if (checkpointName) {
                const meta = await IPC.getCheckpointMeta({ checkpointName });
                baseModel = meta?.baseModel || null;
            }
                sdInfo = { checkpointName, baseModel };
        }

        // リクエストIDを生成してキャンセル用に保持
        _currentRequestId = `req-${Date.now()}`;

        generateBtn.disabled = true;
        generateBtn.textContent = i18n.t('ai_generating');
        if (cancelBtn) cancelBtn.hidden = false;
        if (resultEl) resultEl.hidden = true;

        try {
            const result = await IPC.generateAiPrompt({
                provider, apiKey, model, ollamaUrl, ollamaModel, text,
                requestId: _currentRequestId,
                sdInfo,
                tagRange: { min: tagMin, max: tagMax },
                style: styleSelect?.value || '',
                danbooru: danbooruCb?.checked ?? false
            });
            if (result?.success) {
                _setResult(resultEl, resultText, result.prompt, null);
                // 履歴に保存
                saveAiHistory({
                    timestamp: Date.now(),
                    provider,
                    model: provider === 'ollama' ? ollamaModel : model,
                    input: text,
                    output: result.prompt,
                });
                renderAiHistory();
            } else if (result?.cancelled) {
                // キャンセル時は何もしない
            } else {
                _setResult(resultEl, resultText, null, result?.error || i18n.t('ai_unknown_error'));
            }
        } catch (e) {
            _setResult(resultEl, resultText, null, e.message);
        } finally {
            _currentRequestId = null;
            generateBtn.disabled = false;
            generateBtn.textContent = i18n.t('ai_generate_btn');
            if (cancelBtn) cancelBtn.hidden = true;
        }
    });

    // ── 上書き ────────────────────────────────────────────────
    applyBtn?.addEventListener('click', () => {
        const prompt = resultText?.dataset.prompt;
        if (prompt) _writeToPrompt(prompt, false);
    });

    // ── 追記 ─────────────────────────────────────────────────
    appendBtn?.addEventListener('click', () => {
        const prompt = resultText?.dataset.prompt;
        if (prompt) _writeToPrompt(prompt, true);
    });

    // ── コピー ────────────────────────────────────────────────
    copyBtn?.addEventListener('click', () => {
        const prompt = resultText?.dataset.prompt;
        if (!prompt) return;
        navigator.clipboard.writeText(prompt).then(() => {
            const orig = copyBtn.textContent;
            copyBtn.textContent = i18n.t('ai_copy_done_btn');
            setTimeout(() => { copyBtn.textContent = orig; }, 1500);
        });
    });

    // ── Enter で変換（Shift+Enter で改行） ────────────────────
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            generateBtn.click();
        }
    });
}

// ── モデル一覧の取得・ドロップダウン更新 ──────────────────────
async function _fetchModels(provider, modelSelect, modelRow) {
    if (!modelSelect) return;

    modelSelect.innerHTML = `<option value="">${i18n.t('ai_models_loading')}</option>`;
    modelSelect.disabled = true;
    if (modelRow) modelRow.style.opacity = '0.5';

    const cfg = await IPC.getConfig();
    const apiKey = provider === 'claude'  ? (cfg.claudeApiKey  || '')
                 : provider === 'openai' ? (cfg.openaiApiKey || '')
                 : '';
    const ollamaUrl = cfg.ollamaUrl || 'http://localhost:11434';

    const result = await IPC.fetchAiModels({ provider, apiKey, ollamaUrl });

    if (!result.success || !result.models?.length) {
        modelSelect.innerHTML = `<option value="">${i18n.t('ai_models_none')}</option>`;
        modelSelect.disabled = true;
        if (modelRow) modelRow.style.opacity = '0.4';
        return;
    }

    // 保存済み選択を復元
    const savedModel = localStorage.getItem(`ai-selected-model-${provider}`) || '';

    modelSelect.innerHTML = '';
    result.models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        if (m === savedModel) opt.selected = true;
        modelSelect.appendChild(opt);
    });

    // 保存済みがなければ先頭を選択して保存
    if (!savedModel || !result.models.includes(savedModel)) {
        localStorage.setItem(`ai-selected-model-${provider}`, result.models[0]);
    }

    modelSelect.disabled = false;
    if (modelRow) modelRow.style.opacity = '1';
}

// ── プロバイダーチェック ───────────────────────────────────────
async function _checkProvider(provider, statusEl, generateBtn) {
    if (!statusEl) return;

    if (provider === 'ollama') {
        _showStatus(statusEl, 'checking', i18n.t('ai_ollama_checking'));
        const cfg = await IPC.getConfig();
        const ollamaUrl = cfg.ollamaUrl || 'http://localhost:11434';
        const result = await IPC.checkOllama({ ollamaUrl });

        if (result.running) {
            _showStatus(statusEl, 'ok', i18n.t('ai_ollama_ok'));
            if (generateBtn) generateBtn.disabled = false;
        } else {
            _showStatus(statusEl, 'error', _ollamaNotFoundHTML(ollamaUrl));
            _bindSettingsLink();
            if (generateBtn) generateBtn.disabled = true;
        }
    } else if (provider === 'claude') {
        const cfg = await IPC.getConfig();
        if (!cfg.claudeApiKey) {
            const link = `<a class="ai-status-link" id="ai-open-settings">${i18n.t('ai_settings_link_label')}</a>`;
            _showStatus(statusEl, 'warn', `${i18n.t('ai_claude_no_key')}${link}${i18n.t('ai_api_key_settings_hint')}`);
            _bindSettingsLink();
            if (generateBtn) generateBtn.disabled = true;
        } else {
            _showStatus(statusEl, 'ok', i18n.t('ai_claude_key_ok'));
            if (generateBtn) generateBtn.disabled = false;
        }
    } else if (provider === 'openai') {
        const cfg = await IPC.getConfig();
        if (!cfg.openaiApiKey) {
            const link = `<a class="ai-status-link" id="ai-open-settings">${i18n.t('ai_settings_link_label')}</a>`;
            _showStatus(statusEl, 'warn', `${i18n.t('ai_openai_no_key')}${link}${i18n.t('ai_api_key_settings_hint')}`);
            _bindSettingsLink();
            if (generateBtn) generateBtn.disabled = true;
        } else {
            _showStatus(statusEl, 'ok', i18n.t('ai_openai_key_ok'));
            if (generateBtn) generateBtn.disabled = false;
        }
    }
}

function _ollamaNotFoundHTML(ollamaUrl) {
    const notFound = i18n.t('ai_ollama_not_found').replace('{url}', ollamaUrl);
    const install  = i18n.t('ai_ollama_install_hint');
    const openLink = `<a class="ai-status-link" id="ai-link-ollama">${i18n.t('ai_ollama_open_link')}</a>`;
    const settingsLink = `<a class="ai-status-link" id="ai-open-settings">${i18n.t('ai_settings_link_label')}</a>`;
    return `${notFound}<br>${install}<br>${openLink} &nbsp;／&nbsp; ${settingsLink}`;
}

function _showStatus(statusEl, type, html) {
    statusEl.hidden = false;
    statusEl.className = `ai-status-msg ai-status-${type}`;
    statusEl.innerHTML = html;
}

function _bindSettingsLink() {
    // 少し遅らせて DOM に挿入された後にバインド
    setTimeout(() => {
        // ollama.com をデフォルトブラウザで開く
        document.getElementById('ai-link-ollama')?.addEventListener('click', (e) => {
            e.preventDefault();
            window.electronAPI?.openExternal('https://ollama.com');
        });

        // 設定モーダルを開いて AI タブへジャンプ
        document.getElementById('ai-open-settings')?.addEventListener('click', (e) => {
            e.preventDefault();
            openSettings();
            setTimeout(() => {
                document.querySelector('.settings-nav-item[data-tab="ai"]')?.click();
            }, 50);
        });
    }, 0);
}

// ── Checkpoint カスタムドロップダウン ────────────────────────

/** アーキテクチャラベルとバッジクラスを返す */
function _archInfo(checkpointName, baseModel) {
    const src = (baseModel || checkpointName || '').toLowerCase();
    if (src.includes('flux'))                                                         return { label: 'Flux',   cls: 'arch-flux'  };
    if (src.includes('xl') || src.includes('pony') ||
        src.includes('illustrious') || src.includes('noob') || src.includes('sdxl')) return { label: 'SDXL',   cls: 'arch-sdxl'  };
    if (src.includes('1.5') || src.includes('sd1') || src.includes('v1'))            return { label: 'SD 1.5', cls: 'arch-sd15'  };
    return { label: '?', cls: 'arch-unknown' };
}

function _updateArchBadgeFromMeta(checkpointName, baseModel, archBadge) {
    if (!archBadge) return;
    if (!checkpointName) { archBadge.hidden = true; return; }
    const { label, cls } = _archInfo(checkpointName, baseModel);
    archBadge.textContent = label;
    archBadge.className = `ai-arch-badge ${cls}`;
    archBadge.title = baseModel ? `Base Model: ${baseModel}` : i18n.t('ai_arch_no_meta');
    archBadge.hidden = false;
}

// ── ツールチップ（body に追加して fixed 配置） ────────────────
let _ckptTooltip = null;
function _getCkptTooltip() {
    if (!_ckptTooltip) {
        _ckptTooltip = document.createElement('div');
        _ckptTooltip.id = 'ai-ckpt-tooltip';
        _ckptTooltip.className = 'ai-ckpt-tooltip';
        _ckptTooltip.style.display = 'none';
        document.body.appendChild(_ckptTooltip);
    }
    return _ckptTooltip;
}

function _showCkptTooltip(item) {
    const { thumbnail, modelName, baseModel, description } = item.dataset;
    if (!thumbnail && !modelName && !baseModel && !description) return;

    const tt = _getCkptTooltip();
    tt.innerHTML = `
        ${thumbnail ? `<img src="${thumbnail}" class="ai-ckpt-tooltip-img" onerror="this.style.display='none'">` : ''}
        <div class="ai-ckpt-tooltip-body">
            ${modelName   ? `<div class="ai-ckpt-tooltip-name">${modelName}</div>` : ''}
            ${baseModel   ? `<div class="ai-ckpt-tooltip-base">${baseModel}</div>` : ''}
            ${description ? `<div class="ai-ckpt-tooltip-desc">${description.substring(0, 180)}</div>` : ''}
            ${!modelName && !baseModel && !description ? `<div class="ai-ckpt-tooltip-base">${i18n.t('ai_ckpt_no_meta_tooltip')}</div>` : ''}
        </div>
    `;

    // 一旦表示して幅・高さを取得
    tt.style.display = 'flex';
    const rect  = item.getBoundingClientRect();
    const ttW   = tt.offsetWidth;
    const ttH   = tt.offsetHeight;
    const margin = 6;

    let left = rect.right + margin;
    if (left + ttW > window.innerWidth - margin) left = rect.left - ttW - margin;
    let top  = rect.top;
    if (top  + ttH > window.innerHeight - margin) top = window.innerHeight - ttH - margin;

    tt.style.left = `${Math.max(margin, left)}px`;
    tt.style.top  = `${Math.max(margin, top)}px`;
}

function _hideCkptTooltip() {
    if (_ckptTooltip) _ckptTooltip.style.display = 'none';
}

// ── ドロップダウン本体 ────────────────────────────────────────
let _ckptCloseHandler = null;

function _selectCkptItem(value, label, baseModel, archBadge, hiddenInput) {
    const trigger = document.getElementById('ai-ckpt-trigger');
    if (trigger) trigger.textContent = label || i18n.t('ai_ckpt_no_select');
    if (hiddenInput) hiddenInput.value = value || '';
    localStorage.setItem('ai-checkpoint', value || '');
    _updateArchBadgeFromMeta(value, baseModel, archBadge);
    // change イベントを発火（外部リスナー用）
    hiddenInput?.dispatchEvent(new Event('change'));
}

async function _fetchCheckpoints(hiddenInput, archBadge) {
    const trigger = document.getElementById('ai-ckpt-trigger');
    const panel   = document.getElementById('ai-ckpt-panel');
    if (!trigger || !panel) return;

    trigger.textContent = i18n.t('ai_ckpt_loading');
    trigger.disabled = true;

    const result = await IPC.getCheckpointsWithMeta();
    const checkpoints = result?.checkpoints || [];

    trigger.disabled = false;

    // パネルを構築
    panel.innerHTML = '';
    const makeItem = (value, label, meta = {}) => {
        const el = document.createElement('div');
        el.className = 'ai-ckpt-item';
        el.dataset.value       = value;
        el.dataset.thumbnail   = meta.thumbnail   || '';
        el.dataset.modelName   = meta.modelName   || '';
        el.dataset.baseModel   = meta.baseModel   || '';
        el.dataset.description = meta.description || '';
        el.textContent = label;
        return el;
    };

    panel.appendChild(makeItem('', i18n.t('ai_ckpt_no_select')));
    checkpoints.forEach(c => panel.appendChild(makeItem(c.name, c.name, c)));

    const saved = localStorage.getItem('ai-checkpoint') || '';
    const savedMeta = checkpoints.find(c => c.name === saved);
    if (saved && savedMeta !== undefined) {
        _selectCkptItem(saved, saved || i18n.t('ai_ckpt_no_select'), savedMeta?.baseModel, archBadge, hiddenInput);
    } else {
        trigger.textContent = i18n.t('ai_ckpt_no_select');
    }

    if (checkpoints.length === 0) trigger.textContent = i18n.t('ai_ckpt_no_models');

    // ── トリガーボタン click → パネル開閉 ────────────────────
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = panel.classList.contains('open');
        if (isOpen) {
            panel.classList.remove('open');
            _hideCkptTooltip();
            return;
        }
        // fixed 位置を計算
        const r = trigger.getBoundingClientRect();
        panel.style.left  = `${r.left}px`;
        panel.style.top   = `${r.bottom + 2}px`;
        panel.style.width = `${r.width}px`;
        panel.classList.add('open');

        // 外クリックで閉じる
        if (_ckptCloseHandler) document.removeEventListener('click', _ckptCloseHandler);
        _ckptCloseHandler = () => {
            panel.classList.remove('open');
            _hideCkptTooltip();
            document.removeEventListener('click', _ckptCloseHandler);
            _ckptCloseHandler = null;
        };
        requestAnimationFrame(() => document.addEventListener('click', _ckptCloseHandler));
    });

    // ── アイテム選択 ─────────────────────────────────────────
    panel.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = e.target.closest('.ai-ckpt-item');
        if (!item) return;
        _selectCkptItem(item.dataset.value, item.textContent, item.dataset.baseModel, archBadge, hiddenInput);
        panel.classList.remove('open');
        _hideCkptTooltip();
        if (_ckptCloseHandler) {
            document.removeEventListener('click', _ckptCloseHandler);
            _ckptCloseHandler = null;
        }
    });

    // ── ホバー → ツールチップ ────────────────────────────────
    panel.addEventListener('mouseover', (e) => {
        const item = e.target.closest('.ai-ckpt-item');
        if (item && item.dataset.value) _showCkptTooltip(item);
        else _hideCkptTooltip();
    });
    panel.addEventListener('mouseleave', () => _hideCkptTooltip());
}

// ── Helpers ───────────────────────────────────────────────────
function _setResult(resultEl, resultText, prompt, errorMsg) {
    if (!resultEl || !resultText) return;
    resultEl.hidden = false;
    resultEl.style.display = 'flex';

    if (errorMsg) {
        resultText.innerHTML = `⚠️ ${errorMsg}`;
        resultText.dataset.prompt = '';
        resultText.classList.add('ai-result-error');
    } else {
        resultText.textContent = prompt;
        resultText.dataset.prompt = prompt;
        resultText.classList.remove('ai-result-error');
    }
}

function _writeToPrompt(prompt, append) {
    const targetSelect = document.getElementById('ai-target-area');
    const targetId = targetSelect?.value === 'negative' ? 'negative-prompt' : 'positive-prompt';
    const el = document.getElementById(targetId);
    if (!el) return;

    if (append && el.value.trim()) {
        el.value = el.value.trimEnd() + ', ' + prompt;
    } else {
        el.value = prompt;
    }
    el.dispatchEvent(new Event('input'));
}

// ── AI mode inner tabs (Generate / Translate) ─────────────────

const LS_TAB_KEY        = 'ai-inner-tab';
const LS_TR_INPUT_KEY   = 'ai-translate-input';
const LS_TR_OUTPUT_KEY  = 'ai-translate-output';

export function initAiTabs() {
    // ── Tab switching ──────────────────────────────────────────
    const _switchTab = (tabName) => {
        document.querySelectorAll('.ai-inner-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.ai-panel').forEach(p => p.classList.remove('active'));
        const tabEl   = document.querySelector(`.ai-inner-tab[data-ai-tab="${tabName}"]`);
        const panelEl = document.getElementById(`ai-${tabName}-panel`);
        if (tabEl)   tabEl.classList.add('active');
        if (panelEl) panelEl.classList.add('active');
        localStorage.setItem(LS_TAB_KEY, tabName);
    };

    document.querySelectorAll('.ai-inner-tab').forEach(tab => {
        tab.addEventListener('click', () => _switchTab(tab.dataset.aiTab));
    });

    // Restore last active tab
    const savedTab = localStorage.getItem(LS_TAB_KEY);
    if (savedTab) _switchTab(savedTab);

    // ── Translate panel elements ───────────────────────────────
    const translateInput  = document.getElementById('ai-translate-input');
    const translateBtn    = document.getElementById('btn-ai-translate');
    const statusEl        = document.getElementById('ai-translate-status');
    const resultWrap      = document.getElementById('ai-translate-result');
    const resultTextarea  = document.getElementById('ai-translate-result-text');
    const applyBtn        = document.getElementById('btn-ai-translate-apply');
    const appendBtn       = document.getElementById('btn-ai-translate-append');
    const copyBtn         = document.getElementById('btn-ai-translate-copy');
    if (!translateInput || !translateBtn) return;

    // Restore saved input / output
    const savedInput  = localStorage.getItem(LS_TR_INPUT_KEY);
    const savedOutput = localStorage.getItem(LS_TR_OUTPUT_KEY);
    if (savedInput)  translateInput.value = savedInput;
    if (savedOutput && resultTextarea) {
        resultTextarea.value = savedOutput;
        if (resultWrap) resultWrap.hidden = false;
    }

    // Auto-save input as user types
    translateInput.addEventListener('input', () => {
        localStorage.setItem(LS_TR_INPUT_KEY, translateInput.value);
    });

    const _showStatus = (msg, isError = false) => {
        if (!statusEl) return;
        statusEl.textContent = msg;
        statusEl.className = 'ai-status-msg' + (isError ? ' ai-status-error' : '');
        statusEl.hidden = !msg;
    };

    const doTranslate = async () => {
        const text = translateInput.value.trim();
        if (!text) return;
        translateBtn.disabled = true;
        _showStatus('翻訳中...');
        if (resultWrap) resultWrap.hidden = true;

        try {
            const providerSelect = document.getElementById('ai-provider-select');
            const modelSelect    = document.getElementById('ai-model-select');
            const provider = providerSelect?.value || 'ollama';
            const model    = modelSelect?.value    || '';
            const cfg = await IPC.getConfig();
            const res = await IPC.runTranslate({
                provider,
                model,
                apiKey:      provider === 'claude' ? cfg.claudeApiKey : cfg.openaiApiKey,
                ollamaUrl:   cfg.ollamaUrl   || 'http://localhost:11434',
                ollamaModel: model || cfg.ollamaModel || 'llama3',
                libreUrl:    cfg.translateLibreUrl   || 'http://localhost:5000',
                libreApiKey: cfg.translateLibreApiKey || '',
                text
            });

            if (res.success) {
                _showStatus('');
                if (resultTextarea) {
                    resultTextarea.value = res.result;
                    localStorage.setItem(LS_TR_OUTPUT_KEY, res.result);
                }
                if (resultWrap) resultWrap.hidden = false;
                saveAiHistory({
                    timestamp: Date.now(),
                    type: 'translate',
                    provider,
                    model: provider === 'ollama' ? (model || cfg.ollamaModel || 'llama3') : model,
                    input: text,
                    output: res.result,
                });
                renderAiHistory();
            } else {
                _showStatus(res.error || '翻訳に失敗しました', true);
            }
        } catch (err) {
            _showStatus(`エラー: ${err.message}`, true);
        } finally {
            translateBtn.disabled = false;
        }
    };

    translateBtn.addEventListener('click', doTranslate);
    translateInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doTranslate(); }
    });

    const _insertTranslated = (append) => {
        const text = resultTextarea?.value.trim();
        if (!text) return;
        const targetSelect = document.getElementById('ai-translate-target');
        const targetId = targetSelect?.value === 'negative' ? 'negative-prompt' : 'positive-prompt';
        const el = document.getElementById(targetId);
        if (!el) return;
        if (append && el.value.trim()) {
            el.value = el.value.trimEnd() + ', ' + text;
        } else {
            el.value = text;
        }
        el.dispatchEvent(new Event('input'));
    };

    if (applyBtn)  applyBtn.addEventListener('click',  () => _insertTranslated(false));
    if (appendBtn) appendBtn.addEventListener('click', () => _insertTranslated(true));
    if (copyBtn)   copyBtn.addEventListener('click',   () => {
        navigator.clipboard.writeText(resultTextarea?.value || '');
    });
}
