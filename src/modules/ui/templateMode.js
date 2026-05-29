/**
 * Template Mode UI
 * テンプレートの一覧・穴埋め・履歴管理
 */
import { IPC } from '../core/ipc.js';
import { i18n } from '../core/i18n.js';
import { addToPrompt } from '../prompt/engine.js';

let _templates = [];
let _selectedId = null;

// ── Template Input Mode state (exported for library.js) ────────
export let isTemplateInputMode = false;
export let activeSlotEl = null;

export function setActiveSlot(el) { activeSlotEl = el; }

// ── Slot extraction ────────────────────────────────────────────
function extractSlots(positive = '', negative = '') {
    const posSlots = [...(positive.matchAll(/\{(\w+)\}/g))].map(m => ({ key: m[1], area: 'positive' }));
    const negSlots = [...(negative.matchAll(/\{(\w+)\}/g))].map(m => ({ key: m[1], area: 'negative' }));
    const seen = new Set();
    const slots = [];
    for (const s of [...posSlots, ...negSlots]) {
        if (!seen.has(s.key)) { seen.add(s.key); slots.push(s); }
    }
    return slots;
}

function fillTemplate(text, values) {
    return text.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
}

// ── Load ───────────────────────────────────────────────────────
export async function loadTemplates() {
    _templates = (await IPC.loadTemplates()) || [];
    return _templates;
}

// ── Explorer: template card list ───────────────────────────────
export function renderTemplateExplorer() {
    const container = document.getElementById('template-explorer-list');
    if (!container) return;
    container.innerHTML = '';

    _templates.forEach(tmpl => {
        const card = document.createElement('div');
        card.className = `tmpl-card${tmpl.id === _selectedId ? ' active' : ''}`;
        card.dataset.id = tmpl.id;

        const thumb = document.createElement('div');
        thumb.className = 'tmpl-thumb';
        if (tmpl.thumbnail) thumb.style.backgroundImage = `url("file://${tmpl.thumbnail}?t=${Date.now()}")`;

        const name = document.createElement('span');
        name.className = 'tmpl-name';
        name.textContent = tmpl.name;

        card.appendChild(thumb);
        card.appendChild(name);

        card.addEventListener('click', () => selectTemplate(tmpl.id));
        card.addEventListener('contextmenu', (e) => { e.preventDefault(); showTemplateContextMenu(e, tmpl); });
        container.appendChild(card);
    });
}

function selectTemplate(id) {
    _selectedId = id;
    renderTemplateExplorer();
    renderTemplateFillPanel();
}

// ── Fill panel ─────────────────────────────────────────────────
export function renderTemplateFillPanel() {
    const panel = document.getElementById('template-fill-panel');
    if (!panel) return;
    panel.innerHTML = '';

    const tmpl = _templates.find(t => t.id === _selectedId);
    if (!tmpl) {
        panel.innerHTML = `<div class="tmpl-empty">${i18n.t('tmpl_select_hint')}</div>`;
        return;
    }

    const slots = extractSlots(tmpl.positive, tmpl.negative);

    // Header
    const header = document.createElement('div');
    header.className = 'tmpl-panel-header';
    header.innerHTML = `<span class="tmpl-panel-title">${tmpl.name}</span>`;
    panel.appendChild(header);

    // Template preview
    const preview = document.createElement('div');
    preview.className = 'tmpl-preview-wrap';
    preview.innerHTML = `
        <div class="tmpl-preview-label">Positive</div>
        <div class="tmpl-preview-text">${tmpl.positive || '—'}</div>
        ${tmpl.negative ? `<div class="tmpl-preview-label" style="margin-top:0.5rem">Negative</div><div class="tmpl-preview-text">${tmpl.negative}</div>` : ''}
    `;
    panel.appendChild(preview);

    // Slot inputs
    const form = document.createElement('div');
    form.className = 'tmpl-form';
    const values = {};

    // Pre-fill from latest history
    const lastHistory = tmpl.history?.[0]?.values || {};

    slots.forEach(({ key, area }) => {
        const row = document.createElement('div');
        row.className = 'tmpl-field';

        const label = document.createElement('label');
        label.className = 'tmpl-field-label';
        label.textContent = key;
        if (area === 'negative') {
            const badge = document.createElement('span');
            badge.className = 'tmpl-neg-badge';
            badge.textContent = 'NEG';
            label.appendChild(badge);
        }

        const inputRow = document.createElement('div');
        inputRow.className = 'tmpl-field-input-row';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'tmpl-field-input';
        input.placeholder = key;
        input.value = lastHistory[key] || '';
        input.addEventListener('input', () => { values[key] = input.value; });
        values[key] = input.value;

        const clearBtn = document.createElement('button');
        clearBtn.className = 'tmpl-field-clear';
        clearBtn.textContent = '🗑';
        clearBtn.title = 'クリア';
        clearBtn.addEventListener('click', () => { input.value = ''; values[key] = ''; input.focus(); });

        inputRow.appendChild(input);
        inputRow.appendChild(clearBtn);
        row.appendChild(label);
        row.appendChild(inputRow);
        form.appendChild(row);
    });
    panel.appendChild(form);

    // Apply mode + button
    // Enter input mode button
    const inputModeBtn = document.createElement('button');
    inputModeBtn.className = 'tmpl-input-mode-btn';
    inputModeBtn.textContent = '✏️ 入力モード';
    inputModeBtn.addEventListener('click', () => enterInputMode(tmpl, slots));
    panel.appendChild(inputModeBtn);

    const footer = document.createElement('div');
    footer.className = 'tmpl-footer';

    const modeSelect = document.createElement('select');
    modeSelect.className = 'tmpl-mode-select';
    modeSelect.innerHTML = `
        <option value="overwrite">${i18n.t('tmpl_mode_overwrite')}</option>
        <option value="append">${i18n.t('tmpl_mode_append')}</option>
    `;
    modeSelect.value = localStorage.getItem('templateApplyMode') || 'overwrite';
    modeSelect.addEventListener('change', () => localStorage.setItem('templateApplyMode', modeSelect.value));

    const applyBtn = document.createElement('button');
    applyBtn.className = 'tmpl-apply-btn';
    applyBtn.textContent = i18n.t('tmpl_apply');
    applyBtn.addEventListener('click', () => applyTemplate(tmpl, values, modeSelect.value));

    footer.appendChild(modeSelect);
    footer.appendChild(applyBtn);
    panel.appendChild(footer);

    // History
    if (tmpl.history?.length > 0) {
        const histSection = document.createElement('div');
        histSection.className = 'tmpl-history';
        const histTitle = document.createElement('div');
        histTitle.className = 'tmpl-history-title';
        histTitle.textContent = i18n.t('tmpl_history');
        histSection.appendChild(histTitle);

        tmpl.history.slice(0, 10).forEach(entry => {
            const row = document.createElement('div');
            row.className = 'tmpl-history-row';
            const time = document.createElement('span');
            time.className = 'tmpl-history-time';
            time.textContent = relativeTime(entry.ts);
            const preview = document.createElement('span');
            preview.className = 'tmpl-history-preview';
            preview.textContent = Object.values(entry.values).filter(Boolean).join(', ');
            row.appendChild(time);
            row.appendChild(preview);
            row.addEventListener('click', () => {
                // Fill inputs from history
                form.querySelectorAll('.tmpl-field-input').forEach(inp => {
                    const key = inp.closest('.tmpl-field')?.querySelector('.tmpl-field-label')?.textContent.replace('NEG', '').trim();
                    if (key && entry.values[key] !== undefined) {
                        inp.value = entry.values[key];
                        values[key] = entry.values[key];
                    }
                });
            });
            histSection.appendChild(row);
        });
        panel.appendChild(histSection);
    }
}

async function applyTemplate(tmpl, values, mode) {
    // Sync values from inputs
    const panel = document.getElementById('template-fill-panel');
    panel?.querySelectorAll('.tmpl-field').forEach(row => {
        const key = row.querySelector('.tmpl-field-label')?.textContent.replace('NEG', '').trim();
        const val = row.querySelector('.tmpl-field-input')?.value || '';
        if (key) values[key] = val;
    });

    const filledPositive = fillTemplate(tmpl.positive || '', values);
    const filledNegative = fillTemplate(tmpl.negative || '', values);

    const posEl = document.getElementById('positive-prompt');
    const negEl = document.getElementById('negative-prompt');

    if (mode === 'overwrite') {
        if (posEl) { posEl.value = filledPositive; posEl.dispatchEvent(new Event('input')); }
        if (negEl && filledNegative) { negEl.value = filledNegative; negEl.dispatchEvent(new Event('input')); }
    } else {
        if (posEl && filledPositive) addToPrompt(filledPositive, 'positive-prompt');
        if (negEl && filledNegative) addToPrompt(filledNegative, 'negative-prompt');
    }

    // Save history
    const nonEmpty = Object.fromEntries(Object.entries(values).filter(([, v]) => v));
    if (Object.keys(nonEmpty).length > 0) {
        const updated = await IPC.addTemplateHistory(tmpl.id, nonEmpty);
        const idx = _templates.findIndex(t => t.id === tmpl.id);
        if (idx >= 0) _templates[idx].history = updated;
    }
}

// ── Context menu ───────────────────────────────────────────────
function showTemplateContextMenu(e, tmpl) {
    document.getElementById('tmpl-ctx-menu')?.remove();
    const menu = document.createElement('div');
    menu.id = 'tmpl-ctx-menu';
    menu.className = 'tmpl-ctx-menu';
    const items = [
        { label: i18n.t('tmpl_ctx_edit'),      action: () => openTemplateModal(tmpl) },
        { label: i18n.t('tmpl_ctx_thumb'),      action: () => setThumbnail(tmpl) },
        { label: i18n.t('tmpl_ctx_delete'),     action: () => deleteTemplate(tmpl.id) },
    ];
    items.forEach(({ label, action }) => {
        const item = document.createElement('div');
        item.className = 'tmpl-ctx-item';
        item.textContent = label;
        item.addEventListener('mousedown', (ev) => { ev.preventDefault(); menu.remove(); action(); });
        menu.appendChild(item);
    });
    document.body.appendChild(menu);
    menu.style.left = Math.min(e.clientX, window.innerWidth - menu.offsetWidth - 8) + 'px';
    menu.style.top  = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 8) + 'px';
    setTimeout(() => document.addEventListener('mousedown', () => menu.remove(), { once: true }), 0);
}

// ── Add/Edit modal ─────────────────────────────────────────────
export function openTemplateModal(existing = null) {
    document.getElementById('tmpl-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'tmpl-modal';
    modal.className = 'tmpl-modal-overlay';
    modal.innerHTML = `
        <div class="tmpl-modal">
            <div class="tmpl-modal-header">
                <span>${existing ? i18n.t('tmpl_modal_edit') : i18n.t('tmpl_modal_add')}</span>
                <button class="tmpl-modal-close">✕</button>
            </div>
            <div class="tmpl-modal-body">
                <label class="tmpl-modal-label">${i18n.t('tmpl_modal_name')}</label>
                <input id="tmpl-modal-name" class="tmpl-modal-input" type="text" value="${existing?.name || ''}" placeholder="Template name">
                <label class="tmpl-modal-label">Positive <span class="tmpl-hint">{key} でスロット定義</span></label>
                <textarea id="tmpl-modal-positive" class="tmpl-modal-textarea" placeholder="{character}, {outfit}, masterpiece">${existing?.positive || ''}</textarea>
                <label class="tmpl-modal-label">Negative <span class="tmpl-hint">（省略可）</span></label>
                <textarea id="tmpl-modal-negative" class="tmpl-modal-textarea" placeholder="{negative}, worst quality, low quality">${existing?.negative || ''}</textarea>
                <div class="tmpl-snippet-row" id="tmpl-snippets"></div>
            </div>
            <div class="tmpl-modal-footer">
                <button class="tmpl-modal-cancel">${i18n.t('tmpl_modal_cancel')}</button>
                <button class="tmpl-modal-save">${i18n.t('tmpl_modal_save')}</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('.tmpl-modal-close').addEventListener('click', () => modal.remove());
    modal.querySelector('.tmpl-modal-cancel').addEventListener('click', () => modal.remove());

    // Snippet buttons — insert {key} at cursor into focused textarea
    const SNIPPETS = [
        { label: '品質',   key: 'quality' },
        { label: 'カメラ', key: 'camera' },
        { label: 'キャラ', key: 'character' },
        { label: '服装',   key: 'outfit' },
        { label: 'ポーズ', key: 'pose' },
        { label: '背景',   key: 'background' },
        { label: 'NG',     key: 'negative' },
    ];
    let _lastFocusedTextarea = modal.querySelector('#tmpl-modal-positive');
    ['#tmpl-modal-positive', '#tmpl-modal-negative'].forEach(sel => {
        modal.querySelector(sel)?.addEventListener('focus', (e) => { _lastFocusedTextarea = e.target; });
    });
    const snippetRow = modal.querySelector('#tmpl-snippets');
    SNIPPETS.forEach(({ label, key }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tmpl-snippet-btn';
        btn.textContent = label;
        btn.title = `{${key}}`;
        btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const ta = _lastFocusedTextarea;
            if (!ta) return;
            const insert = `{${key}}`;
            const start = ta.selectionStart;
            const end   = ta.selectionEnd;
            ta.value = ta.value.slice(0, start) + insert + ta.value.slice(end);
            ta.selectionStart = ta.selectionEnd = start + insert.length;
            ta.focus();
        });
        snippetRow.appendChild(btn);
    });
    modal.querySelector('.tmpl-modal-save').addEventListener('click', async () => {
        const name     = modal.querySelector('#tmpl-modal-name').value.trim();
        const positive = modal.querySelector('#tmpl-modal-positive').value.trim();
        const negative = modal.querySelector('#tmpl-modal-negative').value.trim();
        if (!name) return;
        const tmpl = {
            id:       existing?.id || crypto.randomUUID(),
            name, positive, negative,
            thumbnail: existing?.thumbnail || null,
            history:   existing?.history || [],
        };
        _templates = await IPC.upsertTemplate(tmpl);
        modal.remove();
        renderTemplateExplorer();
        if (_selectedId === tmpl.id) renderTemplateFillPanel();
    });
    modal.querySelector('.tmpl-modal-overlay')?.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

async function deleteTemplate(id) {
    if (!confirm(i18n.t('tmpl_confirm_delete'))) return;
    _templates = await IPC.removeTemplate(id);
    if (_selectedId === id) _selectedId = null;
    renderTemplateExplorer();
    renderTemplateFillPanel();
}

async function setThumbnail(tmpl) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) { input.remove(); return; }
        const buf = await file.arrayBuffer();
        const result = await IPC.setTemplateThumbnail(tmpl.id, buf);
        if (result?.success) {
            const idx = _templates.findIndex(t => t.id === tmpl.id);
            if (idx >= 0) _templates[idx].thumbnail = result.path;
            renderTemplateExplorer();
        }
        input.remove();
    });
    input.click();
}

// ── Helpers ────────────────────────────────────────────────────
function relativeTime(ts) {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    return `${d}d ago`;
}

// ── Template Input Mode ────────────────────────────────────────
// Slot values shared between fill panel and input mode
let _inputModeValues = {};
let _inputModeTmpl   = null;
let _inputModeSlots  = [];

export function enterInputMode(tmpl, slots) {
    isTemplateInputMode = true;
    _inputModeTmpl  = tmpl;
    _inputModeSlots = slots;

    // Collect current values from fill panel
    document.querySelectorAll('#template-fill-panel .tmpl-field').forEach(row => {
        const key = row.querySelector('.tmpl-field-label')?.textContent.replace('NEG', '').trim();
        const val = row.querySelector('.tmpl-field-input')?.value || '';
        if (key) _inputModeValues[key] = val;
    });

    // Hide normal builder, show template input panel
    const builderContent = document.getElementById('builder-pane-content');
    const inputPanel     = document.getElementById('template-input-panel');
    if (builderContent) builderContent.style.display = 'none';
    if (inputPanel)     inputPanel.style.display = 'flex';

    // Set title
    const titleEl = document.getElementById('tmpl-inp-title');
    if (titleEl) titleEl.textContent = tmpl.name;

    // Render slot inputs
    const slotsContainer = document.getElementById('tmpl-inp-slots');
    if (!slotsContainer) return;
    slotsContainer.innerHTML = '';
    activeSlotEl = null;

    slots.forEach(({ key, area }, idx) => {
        const item = document.createElement('div');
        item.className = 'tmpl-inp-slot-item';

        const label = document.createElement('div');
        label.className = 'tmpl-inp-slot-label';
        label.textContent = key;
        if (area === 'negative') {
            const badge = document.createElement('span');
            badge.className = 'tmpl-neg-badge';
            badge.textContent = 'NEG';
            label.appendChild(badge);
        }

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'tmpl-inp-slot-input';
        input.placeholder = `${key} のタグを選択...`;
        input.value = _inputModeValues[key] || '';
        input.addEventListener('focus', () => {
            activeSlotEl = input;
            slotsContainer.querySelectorAll('.tmpl-inp-slot-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
        });
        input.addEventListener('input', () => { _inputModeValues[key] = input.value; });

        const inputRow = document.createElement('div');
        inputRow.className = 'tmpl-inp-slot-row';
        inputRow.appendChild(input);

        const clearBtn = document.createElement('button');
        clearBtn.className = 'tmpl-inp-slot-clear';
        clearBtn.textContent = '🗑';
        clearBtn.title = 'クリア';
        clearBtn.addEventListener('click', () => {
            input.value = '';
            _inputModeValues[key] = '';
            input.focus();
        });
        inputRow.appendChild(clearBtn);

        item.appendChild(label);
        item.appendChild(inputRow);
        slotsContainer.appendChild(item);

        // Auto-focus first slot
        if (idx === 0) setTimeout(() => { input.focus(); }, 50);
    });

    // Switch Explorer+Library to tag mode
    window.dispatchEvent(new CustomEvent('app:switch-mode', { detail: 'tags' }));
    // But keep template input panel visible after mode switch
    setTimeout(() => {
        const b = document.getElementById('builder-pane-content');
        const p = document.getElementById('template-input-panel');
        if (b) b.style.display = 'none';
        if (p) p.style.display = 'flex';
    }, 0);

    // Wire done button
    const doneBtn = document.getElementById('btn-tmpl-input-done');
    if (doneBtn) {
        doneBtn.onclick = () => exitInputMode();
    }
}

export function exitInputMode() {
    isTemplateInputMode = false;
    activeSlotEl = null;

    // Restore builder
    const builderContent = document.getElementById('builder-pane-content');
    const inputPanel     = document.getElementById('template-input-panel');
    if (builderContent) builderContent.style.display = '';
    if (inputPanel)     inputPanel.style.display = 'none';

    // Return to template mode
    window.dispatchEvent(new CustomEvent('app:switch-mode', { detail: 'template' }));

    // Re-render fill panel with updated values and sync inputs
    setTimeout(() => {
        const panel = document.getElementById('template-fill-panel');
        panel?.querySelectorAll('.tmpl-field').forEach(row => {
            const key = row.querySelector('.tmpl-field-label')?.textContent.replace('NEG', '').trim();
            const inp = row.querySelector('.tmpl-field-input');
            if (key && inp && _inputModeValues[key] !== undefined) inp.value = _inputModeValues[key];
        });
    }, 50);
}
