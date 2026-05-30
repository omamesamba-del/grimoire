/**
 * Slot Mode
 * Positive chips エリアをスロット化する。Negative / RAW / Preset はそのまま。
 * スロット設定は localStorage に保存。
 */
import Sortable from 'sortablejs';
import { renderPromptChips } from './prompt-chips.js';
import { i18n } from '../core/i18n.js';
import { parsePrompt, stringifyPrompt } from '../prompt/engine.js';

const STORAGE_KEY  = 'slotConfig';
const STORAGE_VALS = 'slotValues';

function getDefaultSlots() {
    return [
        { id: 'slot-quality',    name: i18n.t('slot_name_quality'),    area: 'positive' },
        { id: 'slot-camera',     name: i18n.t('slot_name_camera'),     area: 'positive' },
        { id: 'slot-background', name: i18n.t('slot_name_background'), area: 'positive' },
        { id: 'slot-character',  name: i18n.t('slot_name_character'),  area: 'positive' },
        { id: 'slot-outfit',     name: i18n.t('slot_name_outfit'),     area: 'positive' },
        { id: 'slot-expression', name: i18n.t('slot_name_expression'), area: 'positive' },
        { id: 'slot-pose',       name: i18n.t('slot_name_pose'),       area: 'positive' },
        { id: 'slot-negative',   name: i18n.t('slot_name_negative'),   area: 'negative' },
    ];
}

// ── State ──────────────────────────────────────────────────────
export let isSlotMode   = false;
export let activeSlotEl = null;

function loadConfig() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || getDefaultSlots(); }
    catch { return getDefaultSlots(); }
}

function saveConfig(slots) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slots));
}

function loadValues() {
    try { return JSON.parse(localStorage.getItem(STORAGE_VALS) || '{}'); }
    catch { return {}; }
}

function saveValues(vals) {
    localStorage.setItem(STORAGE_VALS, JSON.stringify(vals));
}

// ── Toggle ─────────────────────────────────────────────────────
export function toggleSlotMode() {
    isSlotMode ? exitSlotMode() : enterSlotMode();
}

// Positive エリアで隠す要素セレクタ
const POSITIVE_HIDE = [
    '#insert-newline-positive',
    '#clear-positive-inline',
    '#toggle-suffix-btn',
];

// Negative セクション（#quick-add-negativeを含む .prompt-section 2番目）を隠すヘルパー
function getNegativeSection() {
    return document.querySelector('#negative-chips')?.closest('.prompt-section') || null;
}

export function enterSlotMode() {
    isSlotMode = true;

    document.querySelector('.positive-chips-wrapper')?.style.setProperty('display', 'none');
    POSITIVE_HIDE.forEach(sel => document.querySelector(sel)?.style.setProperty('display', 'none'));

    getNegativeSection()?.style.setProperty('display', 'none');

    const slotArea = document.getElementById('slot-positive-area');
    if (slotArea) slotArea.style.display = 'flex';

    document.getElementById('btn-slot-settings')?.style.setProperty('display', '');
    document.getElementById('btn-slot-mode-toggle')?.classList.add('active');

    renderSlots();
}

export function exitSlotMode() {
    isSlotMode   = false;
    activeSlotEl = null;

    document.querySelector('.positive-chips-wrapper')?.style.removeProperty('display');
    POSITIVE_HIDE.forEach(sel => document.querySelector(sel)?.style.removeProperty('display'));

    getNegativeSection()?.style.removeProperty('display');

    const slotArea = document.getElementById('slot-positive-area');
    if (slotArea) { slotArea.style.display = 'none'; slotArea.innerHTML = ''; }

    document.getElementById('btn-slot-settings')?.style.setProperty('display', 'none');
    document.getElementById('btn-slot-mode-toggle')?.classList.remove('active');
}

// ── Render slots ───────────────────────────────────────────────
function renderSlots() {
    const container = document.getElementById('slot-positive-area');
    if (!container) return;
    container.innerHTML = '';

    restoreSlotsFromPrompt();
    const slots  = loadConfig();
    const values = loadValues();
    activeSlotEl = null;

    slots.forEach((slot, idx) => {
        const details = document.createElement('details');
        details.className = 'slot-section';
        details.open = true;

        // ── summary（ヘッダー）─────────────────────
        const summary = document.createElement('summary');
        summary.className = 'slot-section-summary';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'slot-section-name';
        nameSpan.textContent = slot.name;

        if (slot.area === 'negative') {
            const badge = document.createElement('span');
            badge.className = 'slot-neg-badge';
            badge.textContent = 'NEG';
            nameSpan.appendChild(badge);
        }

        const clearBtn = document.createElement('button');
        clearBtn.className = 'slot-item-clear';
        clearBtn.textContent = '🗑';
        clearBtn.title = 'クリア';
        clearBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            textarea.value = '';
            textarea.dispatchEvent(new Event('input'));
            activateSlot();
        });

        summary.appendChild(nameSpan);
        summary.appendChild(clearBtn);

        // ── チップコンテナ + hidden textarea ──────
        const chipsId    = `slot-chips-${slot.id}`;
        const textareaId = `slot-textarea-${slot.id}`;

        const chipsContainer = document.createElement('div');
        chipsContainer.id        = chipsId;
        chipsContainer.className = 'chip-container slot-chips-container';

        const textarea = document.createElement('textarea');
        textarea.id        = textareaId;
        textarea.className = 'slot-item-input';
        textarea.style.display = 'none';
        textarea.value = values[slot.id] || '';

        const activateSlot = () => {
            activeSlotEl = textarea;
            container.querySelectorAll('.slot-section').forEach(el => el.classList.remove('slot-active'));
            details.classList.add('slot-active');
        };

        chipsContainer.addEventListener('mousedown', (e) => {
            if (e.button === 1) e.preventDefault();
            activateSlot();
        });

        textarea.addEventListener('input', () => {
            const v = loadValues();
            v[slot.id] = textarea.value;
            saveValues(v);
            renderPromptChips(chipsId, textareaId);
            syncSlotsToPrompt();
        });

        renderPromptChips(chipsId, textareaId);

        details.appendChild(summary);
        details.appendChild(chipsContainer);
        details.appendChild(textarea);
        container.appendChild(details);

        if (idx === 0) setTimeout(() => activateSlot(), 30);
    });

}

// ── Sync slots → raw prompt（セパレーター付きシリアライズ）──────
function syncSlotsToPrompt() {
    const slots  = loadConfig();
    const values = loadValues();

    const buildTags = (area) => {
        const tags = [];
        slots.filter(s => s.area === area).forEach(slot => {
            const val = (values[slot.id] || '').trim();
            if (!val) return;
            tags.push({ name: slot.name, type: 'separator' });
            tags.push(...parsePrompt(val));
        });
        return tags;
    };

    const posEl = document.getElementById('positive-prompt');
    const negEl = document.getElementById('negative-prompt');
    if (posEl) { posEl.value = stringifyPrompt(buildTags('positive')); posEl.dispatchEvent(new Event('input')); }
    if (negEl) { negEl.value = stringifyPrompt(buildTags('negative')); negEl.dispatchEvent(new Event('input')); }
}

// ── WebUI prompt → スロットへ復元 ─────────────────────────────
function restoreSlotsFromPrompt() {
    const slots  = loadConfig();
    const values = loadValues();

    const restore = (promptEl, areaSlots) => {
        if (!promptEl || !areaSlots.length) return;
        const tags = parsePrompt(promptEl.value);
        let currentId = null;
        const slotTags = {};

        for (const tag of tags) {
            if (tag.type === 'separator') {
                const matched = areaSlots.find(s => s.name === tag.name);
                if (matched) { currentId = matched.id; continue; }
            }
            if (currentId) {
                if (!slotTags[currentId]) slotTags[currentId] = [];
                slotTags[currentId].push(tag);
            }
        }

        for (const slot of areaSlots) {
            if (slotTags[slot.id] !== undefined) {
                values[slot.id] = stringifyPrompt(slotTags[slot.id]);
            }
        }
    };

    const posEl = document.getElementById('positive-prompt');
    const negEl = document.getElementById('negative-prompt');
    restore(posEl, slots.filter(s => s.area === 'positive'));
    restore(negEl, slots.filter(s => s.area === 'negative'));
    saveValues(values);
}

// 後方互換のためexport維持（main.jsから参照されているが実質不使用）
export function applySlots() { syncSlotsToPrompt(); }

// ── Settings dialog ────────────────────────────────────────────
export function openSlotSettings() {
    document.getElementById('slot-settings-dialog')?.remove();

    const dialog = document.createElement('dialog');
    dialog.id = 'slot-settings-dialog';
    dialog.className = 'spe-dialog';

    dialog.innerHTML = `
        <div class="spe-content">
            <div class="spe-header">
                <span class="spe-title">スロット設定</span>
                <button class="spe-close-x" id="slot-settings-close">✕</button>
            </div>
            <div class="spe-body">
                <div class="spe-list" id="slot-settings-list"></div>
                <div class="slot-settings-add-row">
                    <input type="text" id="slot-settings-new-name" class="slot-settings-new-input" placeholder="スロット名">
                    <select id="slot-settings-new-area" class="slot-settings-new-area">
                        <option value="positive">Positive</option>
                        <option value="negative">Negative</option>
                    </select>
                    <button id="slot-settings-add-btn" class="slot-settings-add-btn">＋ 追加</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);
    dialog.showModal();

    const renderList = () => {
        const list  = dialog.querySelector('#slot-settings-list');
        const slots = loadConfig();
        list.innerHTML = '';

        slots.forEach(slot => {
            const row = document.createElement('div');
            row.className = 'spe-row';
            row.dataset.id = slot.id;

            const drag = document.createElement('span');
            drag.className = 'spe-row-drag';
            drag.textContent = '⠿';

            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.className = 'spe-row-label slot-settings-name-input';
            nameInput.value = slot.name;
            nameInput.addEventListener('change', () => {
                const cfg = loadConfig();
                const s = cfg.find(s => s.id === slot.id);
                if (s) { s.name = nameInput.value.trim() || s.name; saveConfig(cfg); }
            });

            const areaSel = document.createElement('select');
            areaSel.className = 'slot-settings-area-sel';
            ['positive', 'negative'].forEach(a => {
                const opt = document.createElement('option');
                opt.value = a; opt.textContent = a === 'positive' ? 'Pos' : 'Neg';
                opt.selected = slot.area === a;
                areaSel.appendChild(opt);
            });
            areaSel.addEventListener('change', () => {
                const cfg = loadConfig();
                const s = cfg.find(s => s.id === slot.id);
                if (s) { s.area = areaSel.value; saveConfig(cfg); }
            });

            const delBtn = document.createElement('button');
            delBtn.className = 'spe-row-del';
            delBtn.textContent = '✕';
            delBtn.addEventListener('click', () => {
                const cfg = loadConfig().filter(s => s.id !== slot.id);
                saveConfig(cfg);
                renderList();
            });

            row.appendChild(drag);
            row.appendChild(nameInput);
            row.appendChild(areaSel);
            row.appendChild(delBtn);
            list.appendChild(row);
        });

        Sortable.create(list, {
            animation: 150,
            handle: '.spe-row-drag',
            ghostClass: 'spe-row-ghost',
            onEnd: () => {
                const ids    = [...list.querySelectorAll('.spe-row')].map(r => r.dataset.id);
                const cfg    = loadConfig();
                const sorted = ids.map(id => cfg.find(s => s.id === id)).filter(Boolean);
                saveConfig(sorted);
            },
        });
    };

    renderList();

    dialog.querySelector('#slot-settings-close').addEventListener('click', () => {
        dialog.close(); dialog.remove();
        if (isSlotMode) renderSlots();
    });
    dialog.querySelector('#slot-settings-add-btn').addEventListener('click', () => {
        const name = dialog.querySelector('#slot-settings-new-name').value.trim();
        if (!name) return;
        const area = dialog.querySelector('#slot-settings-new-area').value;
        const cfg  = loadConfig();
        cfg.push({ id: `slot-${Date.now()}`, name, area });
        saveConfig(cfg);
        dialog.querySelector('#slot-settings-new-name').value = '';
        renderList();
    });
    dialog.querySelector('#slot-settings-new-name').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') dialog.querySelector('#slot-settings-add-btn').click();
    });
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) { dialog.close(); dialog.remove(); if (isSlotMode) renderSlots(); }
    });
}
