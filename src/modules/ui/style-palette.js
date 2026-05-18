/**
 * Style Palette — apply color / material / pattern modifiers to tags
 *
 * Mode A: pre-select options → click tag in library → auto-compose "red latex nurse"
 * Mode B: right-click chip  → "🎨 スタイルを適用" → prepend current prefix to that chip
 * Quick-Add: free-text custom prefix input
 */
import { State } from '../core/state.js';
import { IPC } from '../core/ipc.js';
import Sortable from 'sortablejs';
import { i18n } from '../core/i18n.js';

// ──────────────────────────────────────────────────────────────
// Default palette data
// ──────────────────────────────────────────────────────────────

const DEFAULT_COLOR_MODS = [
    { label: 'dark',        labelEn: 'dark',        value: 'dark' },
    { label: 'light',       labelEn: 'light',       value: 'light' },
    { label: 'two-tone',    labelEn: 'two-tone',    value: 'two-tone' },
    { label: 'gradient',    labelEn: 'gradient',    value: 'gradient' },
    { label: 'multicolor',  labelEn: 'multicolor',  value: 'multicolored' },
    { label: 'pastel',      labelEn: 'pastel',      value: 'pastel' },
    { label: 'neon',        labelEn: 'neon',        value: 'neon' },
    { label: 'metallic',    labelEn: 'metallic',    value: 'metallic' },
];

const DEFAULT_COLORS = [
    // ── 基本色 ──
    { label: '白',      labelEn: 'White',     value: 'white',           hex: '#ffffff' },
    { label: '黒',      labelEn: 'Black',     value: 'black',           hex: '#1a1a2e' },
    { label: '灰',      labelEn: 'Gray',      value: 'gray',            hex: '#9ca3af' },
    { label: '赤',      labelEn: 'Red',       value: 'red',             hex: '#ef4444' },
    { label: '青',      labelEn: 'Blue',      value: 'blue',            hex: '#3b82f6' },
    { label: '緑',      labelEn: 'Green',     value: 'green',           hex: '#22c55e' },
    { label: '黄',      labelEn: 'Yellow',    value: 'yellow',          hex: '#eab308' },
    { label: '橙',      labelEn: 'Orange',    value: 'orange',          hex: '#f97316' },
    { label: 'ピンク',  labelEn: 'Pink',      value: 'pink',            hex: '#ec4899' },
    { label: '紫',      labelEn: 'Purple',    value: 'purple',          hex: '#a855f7' },
    { label: '水色',    labelEn: 'Lt.Blue',   value: 'light blue',      hex: '#38bdf8' },
    { label: 'ベージュ',labelEn: 'Beige',     value: 'beige',           hex: '#d4b896' },
    { label: '茶',      labelEn: 'Brown',     value: 'brown',           hex: '#92400e' },
    { label: '金',      labelEn: 'Gold',      value: 'gold',            hex: '#ca8a04' },
    { label: '銀',      labelEn: 'Silver',    value: 'silver',          hex: '#a8a29e' },
    { label: '虹',      labelEn: 'Rainbow',   value: 'rainbow colored', hex: '#e040fb' },
    // ── ライト系 ──
    { label: 'L赤',     labelEn: 'L.Red',     value: 'light red',       hex: '#fca5a5' },
    { label: 'L青',     labelEn: 'L.Blue',    value: 'light blue',      hex: '#93c5fd' },
    { label: 'L緑',     labelEn: 'L.Green',   value: 'light green',     hex: '#86efac' },
    { label: 'L黄',     labelEn: 'L.Yellow',  value: 'light yellow',    hex: '#fde68a' },
    { label: 'L橙',     labelEn: 'L.Orange',  value: 'light orange',    hex: '#fdba74' },
    { label: 'Lピンク', labelEn: 'L.Pink',    value: 'light pink',      hex: '#fda4af' },
    { label: 'L紫',     labelEn: 'L.Purple',  value: 'light purple',    hex: '#c4b5fd' },
    { label: 'L茶',     labelEn: 'L.Brown',   value: 'light brown',     hex: '#d4a574' },
    // ── ダーク系 ──
    { label: 'D赤',     labelEn: 'D.Red',     value: 'dark red',        hex: '#991b1b' },
    { label: 'D青',     labelEn: 'D.Blue',    value: 'dark blue',       hex: '#1e40af' },
    { label: 'D緑',     labelEn: 'D.Green',   value: 'dark green',      hex: '#166534' },
    { label: 'D橙',     labelEn: 'D.Orange',  value: 'dark orange',     hex: '#c2410c' },
    { label: 'Dピンク', labelEn: 'D.Pink',    value: 'dark pink',       hex: '#be185d' },
    { label: 'D紫',     labelEn: 'D.Purple',  value: 'dark purple',     hex: '#6b21a8' },
    { label: 'D茶',     labelEn: 'D.Brown',   value: 'dark brown',      hex: '#7c2d12' },
    { label: 'D灰',     labelEn: 'D.Gray',    value: 'dark gray',       hex: '#374151' },
];

const DEFAULT_MATERIALS = [
    { label: 'レザー',    labelEn: 'Leather',   value: 'leather' },
    { label: 'ラテックス',labelEn: 'Latex',     value: 'latex' },
    { label: 'シルク',    labelEn: 'Silk',      value: 'silk' },
    { label: '綿',        labelEn: 'Cotton',    value: 'cotton' },
    { label: 'ニット',    labelEn: 'Knit',      value: 'knit' },
    { label: 'デニム',    labelEn: 'Denim',     value: 'denim' },
    { label: 'ベルベット',labelEn: 'Velvet',    value: 'velvet' },
    { label: '透明',      labelEn: 'Transp.',   value: 'transparent' },
    { label: 'メッシュ',  labelEn: 'Mesh',      value: 'mesh' },
    { label: 'サテン',    labelEn: 'Satin',     value: 'satin' },
    { label: 'レース',    labelEn: 'Lace',      value: 'lace' },
    { label: 'シアー',    labelEn: 'Sheer',     value: 'see-through' },
    { label: 'ウール',    labelEn: 'Wool',      value: 'wool' },
    { label: '光沢',      labelEn: 'Shiny',     value: 'shiny' },
    { label: 'マット',    labelEn: 'Matte',     value: 'matte' },
];

const DEFAULT_PATTERNS = [
    { label: 'チェック',   labelEn: 'Plaid',    value: 'plaid' },
    { label: 'ストライプ', labelEn: 'Stripe',   value: 'striped' },
    { label: '水玉',       labelEn: 'Polka Dot',value: 'polka dot' },
    { label: 'フローラル', labelEn: 'Floral',   value: 'floral print' },
    { label: 'アーガイル', labelEn: 'Argyle',   value: 'argyle' },
    { label: '迷彩',       labelEn: 'Camo',     value: 'camouflage print' },
    { label: 'アニマル',   labelEn: 'Animal',   value: 'animal print' },
    { label: 'ペイズリー', labelEn: 'Paisley',  value: 'paisley' },
    { label: 'ハート',     labelEn: 'Heart',    value: 'heart pattern' },
    { label: '星',         labelEn: 'Star',     value: 'star pattern' },
];

const DEFAULT_DECORATIONS = [
    { label: 'フリル',       labelEn: 'Frill',      value: 'frilled' },
    { label: 'レース飾り',   labelEn: 'Lace Trim',  value: 'lace-trimmed' },
    { label: 'リボン飾り',   labelEn: 'Ribbon',     value: 'ribbon-trimmed' },
    { label: 'ファー飾り',   labelEn: 'Fur Trim',   value: 'fur-trimmed' },
    { label: '花飾り',       labelEn: 'Floral',     value: 'flower-trimmed' },
    { label: 'バックレス',   labelEn: 'Backless',   value: 'backless' },
    { label: 'オフショル',   labelEn: 'Off-Shldr',  value: 'off-shoulder' },
    { label: 'ホルター',     labelEn: 'Halter',     value: 'halter' },
    { label: 'ストラップレス',labelEn: 'Strapless', value: 'strapless' },
    { label: 'シースルー',   labelEn: 'See-thru',   value: 'see-through' },
    { label: 'タイト',       labelEn: 'Tight',      value: 'skin-tight' },
    { label: 'ゆったり',     labelEn: 'Oversized',  value: 'oversized' },
    { label: 'クロップド',   labelEn: 'Cropped',    value: 'cropped' },
    { label: 'ウェット',     labelEn: 'Wet',        value: 'wet' },
    { label: '破れ',         labelEn: 'Torn',       value: 'torn' },
    { label: 'ハイレグ',     labelEn: 'High Leg',   value: 'highleg' },
    { label: 'サイドスリット',labelEn: 'Side Slit', value: 'side slit' },
    { label: 'ハイネック',   labelEn: 'High Neck',  value: 'high neck' },
];

// ──────────────────────────────────────────────────────────────
// Persistent palette data (localStorage)
// ──────────────────────────────────────────────────────────────

const LS_KEY = 'stylePaletteData';
let paletteData = { colorMods: [], colors: [], materials: [], patterns: [], decorations: [] };

function _loadPaletteData() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
            const p = JSON.parse(raw);
            paletteData.colorMods   = p.colorMods   || _clone(DEFAULT_COLOR_MODS);
            paletteData.colors      = p.colors      || _clone(DEFAULT_COLORS);
            paletteData.materials   = p.materials   || _clone(DEFAULT_MATERIALS);
            paletteData.patterns    = p.patterns    || _clone(DEFAULT_PATTERNS);
            paletteData.decorations = p.decorations || _clone(DEFAULT_DECORATIONS);
            return;
        }
    } catch (_) {}
    paletteData.colorMods   = _clone(DEFAULT_COLOR_MODS);
    paletteData.colors      = _clone(DEFAULT_COLORS);
    paletteData.materials   = _clone(DEFAULT_MATERIALS);
    paletteData.patterns    = _clone(DEFAULT_PATTERNS);
    paletteData.decorations = _clone(DEFAULT_DECORATIONS);
}

function _savePaletteData() {
    localStorage.setItem(LS_KEY, JSON.stringify(paletteData));
}

function _clone(arr) { return JSON.parse(JSON.stringify(arr)); }

function _getLabel(item) {
    if (i18n.currentLang !== 'ja' && item.labelEn) return item.labelEn;
    return item.label;
}

// ──────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────

function getStylePrefix() {
    return State.pendingStyle.custom.trim();
}

export function hasActiveStyle() {
    return State.pendingStyle.custom.trim() !== '';
}

export function applyStyleToValue(tagValue) {
    const prefix = getStylePrefix();
    return prefix ? `${prefix} ${tagValue}` : tagValue;
}

function clearStyle() {
    State.pendingStyle.colorMods   = [];
    State.pendingStyle.colors      = [];
    State.pendingStyle.materials   = [];
    State.pendingStyle.patterns    = [];
    State.pendingStyle.decorations = [];
    State.pendingStyle.custom      = '';
    const inp = document.getElementById('style-custom-input');
    if (inp) inp.value = '';
    _refreshChips();
    _updateBadge();
}

// ──────────────────────────────────────────────────────────────
// Init
// ──────────────────────────────────────────────────────────────

export function initStylePalette() {
    _loadPaletteData();
    ALL_KEYS.forEach(key => {
        _buildChips(CHIP_CONTAINER_MAP[key], paletteData[key], key);
        _attachChipSortable(key);
    });

    // Toggle button (v5: btn-style-palette-toggle in pane-header)
    document.getElementById('btn-style-palette-toggle')?.addEventListener('click', (e) => {
        const dropdown = document.getElementById('style-palette-dropdown');
        if (!dropdown) return;
        const hidden = dropdown.classList.toggle('sp-hidden');
        localStorage.setItem('stylePaletteCollapsed', hidden ? '1' : '0');
        _setModeA(!hidden);
    });

    // Restore: default = collapsed (hidden)
    const wasCollapsed = localStorage.getItem('stylePaletteCollapsed') !== '0';
    const dropdown = document.getElementById('style-palette-dropdown');
    if (dropdown) {
        if (wasCollapsed) {
            dropdown.classList.add('sp-hidden');
            _setModeA(false);
        } else {
            _setModeA(true);
        }
    }

    // Edit button
    document.getElementById('style-palette-edit-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        _openEditor();
    });

    // Mode A checkbox
    document.getElementById('style-mode-a')?.addEventListener('change', (e) => {
        State.pendingStyle.modeAEnabled = e.target.checked;
    });

    // Quick-add apply checkbox (persist in localStorage)
    const qaChk = document.getElementById('style-apply-quickadd');
    if (qaChk) {
        qaChk.checked = localStorage.getItem('styleApplyQuickAdd') !== 'false';
        qaChk.addEventListener('change', () => {
            localStorage.setItem('styleApplyQuickAdd', qaChk.checked ? 'true' : 'false');
        });
    }

    // Custom prefix input
    document.getElementById('style-custom-input')?.addEventListener('input', (e) => {
        State.pendingStyle.custom = e.target.value;
        _updateBadge();
    });

    // Clear button
    document.getElementById('style-clear-btn')?.addEventListener('click', clearStyle);

    _updateBadge();
    _buildEditorDialog();

    // 言語切替時にチップラベルを再描画
    window.addEventListener('languageChanged', _rebuildAllChips);
}

function _setModeA(enabled) {
    State.pendingStyle.modeAEnabled = enabled;
    const cb = document.getElementById('style-mode-a');
    if (cb) cb.checked = enabled;
}

// ──────────────────────────────────────────────────────────────
// Chip rendering
// ──────────────────────────────────────────────────────────────

function _buildChips(containerId, data, stateKey) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    data.forEach(item => {
        const chip = document.createElement('button');
        chip.className = 'style-chip';
        chip.dataset.value = item.value;
        chip.dataset.key   = stateKey;

        if (stateKey === 'colors') {
            chip.classList.add('style-chip-color');
            chip.title = `${_getLabel(item)} (${item.value})`;
            chip.style.setProperty('--swatch-bg', item.hex || '#888');
            if (item.hex === '#ffffff') chip.style.setProperty('--swatch-border', '1px solid #475569');
        } else {
            const t = document.createElement('span');
            t.textContent = _getLabel(item);
            chip.appendChild(t);
            chip.title = item.value;
        }
        chip.addEventListener('click', () => _toggleChip(chip, stateKey, item.value));
        container.appendChild(chip);
    });
}

const ALL_KEYS = ['colorMods', 'colors', 'materials', 'patterns', 'decorations'];
const CHIP_CONTAINER_MAP = {
    colorMods:   'style-color-mods',
    colors:      'style-colors',
    materials:   'style-materials',
    patterns:    'style-patterns',
    decorations: 'style-decorations',
};

// Sortable instances for chip rows (keyed by stateKey)
const _chipSortables = {};

function _attachChipSortable(key) {
    const containerId = CHIP_CONTAINER_MAP[key];
    const container = document.getElementById(containerId);
    if (!container) return;

    if (_chipSortables[key]) {
        try { _chipSortables[key].destroy(); } catch (_) {}
    }

    _chipSortables[key] = new Sortable(container, {
        animation: 150,
        ghostClass: 'style-chip-ghost',
        onEnd: (evt) => {
            const { oldIndex, newIndex } = evt;
            if (oldIndex === newIndex) return;
            const [moved] = paletteData[key].splice(oldIndex, 1);
            paletteData[key].splice(newIndex, 0, moved);
            _savePaletteData();
        },
    });
}

function _rebuildAllChips() {
    // Drop selections that no longer exist in palette data
    ALL_KEYS.forEach(key => {
        const vals = new Set(paletteData[key].map(i => i.value));
        State.pendingStyle[key] = (State.pendingStyle[key] || []).filter(v => vals.has(v));
    });
    ALL_KEYS.forEach(key => {
        _buildChips(CHIP_CONTAINER_MAP[key], paletteData[key], key);
        _attachChipSortable(key);
    });
    _refreshChips();
    _updateBadge();
}

function _removeValueFromCustom(value) {
    const inp = document.getElementById('style-custom-input');
    if (!inp) return;
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    inp.value = inp.value
        .replace(new RegExp('(^|\\s)' + escaped + '(?=\\s|$)', 'gi'), '$1')
        .replace(/\s+/g, ' ')
        .trim();
    State.pendingStyle.custom = inp.value;
}

function _toggleChip(chip, stateKey, value) {
    const arr = State.pendingStyle[stateKey];
    const idx = arr.indexOf(value);
    const inp = document.getElementById('style-custom-input');

    if (idx === -1) {
        arr.push(value);
        chip.classList.add('active');
        if (inp) {
            const cur = inp.value.trimEnd();
            inp.value = cur ? cur + ' ' + value : value;
            State.pendingStyle.custom = inp.value;
        }
    } else {
        arr.splice(idx, 1);
        chip.classList.remove('active');
        _removeValueFromCustom(value);
    }
    _updateBadge();
}

function _refreshChips() {
    document.querySelectorAll('.style-chip').forEach(chip => {
        const key = chip.dataset.key;
        const val = chip.dataset.value;
        chip.classList.toggle('active', !!State.pendingStyle[key]?.includes(val));
    });
}

function _updateBadge() {
    const badge = document.getElementById('style-palette-badge');
    if (!badge) return;
    const prefix = getStylePrefix();
    badge.textContent = prefix || '';
    badge.style.display = prefix ? 'inline' : 'none';
}

// ──────────────────────────────────────────────────────────────
// Editor modal
// ──────────────────────────────────────────────────────────────

const TAB_DEFS = [
    { key: 'colorMods',   label: 'Mod' },
    { key: 'colors',      label: '🎨 Color' },
    { key: 'materials',   label: 'Material' },
    { key: 'patterns',    label: 'Pattern' },
    { key: 'decorations', label: 'Deco' },
];

let _activeEditorTab = 'colors';
let _acDebounce = null;
let _currentSortable = null;  // 重複インスタンス防止

function _buildEditorDialog() {
    if (document.getElementById('spe-dialog')) return;
    const dlg = document.createElement('dialog');
    dlg.id = 'spe-dialog';
    dlg.className = 'spe-dialog';
    dlg.innerHTML = `
        <div class="spe-content">
            <div class="spe-header">
                <span class="spe-title">${i18n.t('style_edit_title')}</span>
                <button class="spe-close-x" id="spe-close-x" onclick="document.getElementById('spe-dialog').close()">✕</button>
            </div>
            <div class="spe-tabs" id="spe-tabs"></div>
            <div class="spe-body" id="spe-body"></div>
        </div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
}

function _openEditor() {
    const dlg = document.getElementById('spe-dialog');
    if (!dlg) return;
    _renderEditorTabs();
    _renderEditorBody(_activeEditorTab);
    dlg.showModal();
}

function _renderEditorTabs() {
    const tabBar = document.getElementById('spe-tabs');
    if (!tabBar) return;
    tabBar.innerHTML = '';
    TAB_DEFS.forEach(({ key, label }) => {
        const btn = document.createElement('button');
        btn.className = 'spe-tab' + (key === _activeEditorTab ? ' active' : '');
        btn.textContent = label;
        btn.addEventListener('click', () => {
            _activeEditorTab = key;
            _renderEditorTabs();
            _renderEditorBody(key);
        });
        tabBar.appendChild(btn);
    });
}

function _renderEditorBody(tabKey) {
    const body = document.getElementById('spe-body');
    if (!body) return;
    const isColor = tabKey === 'colors';

    body.innerHTML = `
        <div class="spe-list" id="spe-list"></div>
        <div class="spe-add-form">
            ${isColor
                ? `<input type="color" id="spe-add-hex" class="spe-color-picker" value="#6366f1" title="${i18n.t('style_edit_color_select')}">`
                : ''}
            <input type="text" id="spe-add-label" class="spe-input"
                   placeholder="${isColor ? i18n.t('style_edit_name_ph') : i18n.t('style_edit_mat_name_ph')}" maxlength="12">
            <div class="spe-ac-wrapper">
                <input type="text" id="spe-add-value" class="spe-input spe-input-wide"
                       placeholder="${isColor ? i18n.t('style_edit_val_ph') : i18n.t('style_edit_mat_val_ph')}" autocomplete="off">
                <div id="spe-ac-list" class="spe-ac-list hidden"></div>
            </div>
            <button class="spe-add-btn" id="spe-add-btn">${i18n.t('style_edit_add_btn')}</button>
        </div>`;

    _renderEditorList(tabKey);
    _attachAddHandler(tabKey, isColor);
    _attachValueAutocomplete();
    _attachSortable(tabKey);
}

function _renderEditorList(tabKey) {
    const list = document.getElementById('spe-list');
    if (!list) return;
    const isColor = tabKey === 'colors';
    const items = paletteData[tabKey];

    list.innerHTML = '';
    if (!items.length) {
        list.innerHTML = `<div class="spe-empty">${i18n.t('style_edit_no_items')}</div>`;
        return;
    }

    items.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = 'spe-row';
        row.dataset.idx = idx;
        row.innerHTML = `
            <span class="spe-row-drag" title="${i18n.t('style_edit_drag_title')}">⠿</span>
            ${isColor
                ? `<span class="spe-row-swatch" style="background:${item.hex || '#888'};${item.hex === '#ffffff' ? 'border:1px solid #475569;' : ''}"></span>`
                : ''}
            <span class="spe-row-label">${item.label}</span>
            <span class="spe-row-value">${item.value}</span>
            <button class="spe-row-del" data-idx="${idx}" title="${i18n.t('style_edit_del_title')}">✕</button>`;

        row.querySelector('.spe-row-del').addEventListener('click', () => {
            paletteData[tabKey].splice(idx, 1);
            _savePaletteData();
            _rebuildAllChips();
            _renderEditorList(tabKey);
            _attachSortable(tabKey);
        });
        list.appendChild(row);
    });
}

function _attachAddHandler(tabKey, isColor) {
    const doAdd = () => {
        const label = document.getElementById('spe-add-label')?.value.trim();
        const value = document.getElementById('spe-add-value')?.value.trim();
        if (!label || !value) return;
        const item = { label, value };
        if (isColor) item.hex = document.getElementById('spe-add-hex')?.value || '#888888';
        paletteData[tabKey].push(item);
        _savePaletteData();
        _rebuildAllChips();
        _renderEditorList(tabKey);
        _attachSortable(tabKey);
        document.getElementById('spe-add-label').value = '';
        document.getElementById('spe-add-value').value = '';
        document.getElementById('spe-add-label')?.focus();
    };

    document.getElementById('spe-add-btn')?.addEventListener('click', doAdd);
    ['spe-add-label', 'spe-add-value'].forEach(id => {
        document.getElementById(id)?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doAdd();
        });
    });
}

// ── Autocomplete for tag value input (dialog-scoped dropdown) ──

const AC_BADGE = { 0: 'GEN', 1: 'ART', 3: 'CPY', 4: 'CHR', 5: 'META' };

function _speAcHide() {
    document.getElementById('spe-ac-list')?.classList.add('hidden');
}

function _attachValueAutocomplete() {
    const valInput = document.getElementById('spe-add-value');
    const acList   = document.getElementById('spe-ac-list');
    if (!valInput || !acList) return;

    valInput.addEventListener('input', () => {
        clearTimeout(_acDebounce);
        const query = valInput.value.trim();
        if (query.length < 2) { _speAcHide(); return; }

        _acDebounce = setTimeout(async () => {
            const results = await IPC.searchDanbooru(query);
            if (!results?.length) { _speAcHide(); return; }

            acList.innerHTML = '';
            results.slice(0, 15).forEach(r => {
                const div = document.createElement('div');
                div.className = 'spe-ac-item';
                const badge = AC_BADGE[r.t] ?? 'GEN';
                const count = r.c != null
                    ? (r.c >= 1000 ? `${(r.c / 1000).toFixed(1)}k` : r.c) : '';
                div.innerHTML = `
                    <span class="spe-ac-name color-${r.t}">${r.n}</span>
                    <span class="ac-badge-inline ac-badge-${r.t}">${badge}</span>
                    ${count ? `<span class="ac-item-count">${count}</span>` : ''}`;
                div.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    valInput.value = r.n;
                    const labelInput = document.getElementById('spe-add-label');
                    if (labelInput && !labelInput.value.trim()) labelInput.value = r.n;
                    _speAcHide();
                    valInput.focus();
                });
                acList.appendChild(div);
            });
            acList.classList.remove('hidden');
        }, 150);
    });

    valInput.addEventListener('blur', () => setTimeout(_speAcHide, 150));
    valInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') _speAcHide();
        if (e.key === 'ArrowDown') {
            const first = acList.querySelector('.spe-ac-item');
            first?.focus();
            e.preventDefault();
        }
    });

    // Keyboard navigation within dropdown
    acList.addEventListener('keydown', (e) => {
        const items = [...acList.querySelectorAll('.spe-ac-item')];
        const idx   = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { items[idx + 1]?.focus(); e.preventDefault(); }
        if (e.key === 'ArrowUp')   { idx > 0 ? items[idx - 1].focus() : valInput.focus(); e.preventDefault(); }
        if (e.key === 'Enter' && idx >= 0) { items[idx].dispatchEvent(new MouseEvent('mousedown')); }
        if (e.key === 'Escape')    { _speAcHide(); valInput.focus(); }
    });
}

// ── Sortable drag-to-reorder ───────────────────────────────────

function _attachSortable(tabKey) {
    const list = document.getElementById('spe-list');
    if (!list || !list.children.length) return;

    // 既存インスタンスを破棄してから新規作成（重複防止）
    if (_currentSortable) {
        try { _currentSortable.destroy(); } catch (_) {}
        _currentSortable = null;
    }

    _currentSortable = new Sortable(list, {
        handle: '.spe-row-drag',
        filter: '.spe-row-del',   // ✕ボタンはドラッグ対象から除外
        preventOnFilter: false,   // filter要素のクリックイベントは通す
        animation: 150,
        ghostClass: 'spe-row-ghost',
        onEnd: (evt) => {
            const { oldIndex, newIndex } = evt;
            if (oldIndex === newIndex) return;
            const items = paletteData[tabKey];
            const [moved] = items.splice(oldIndex, 1);
            items.splice(newIndex, 0, moved);
            _savePaletteData();
            _rebuildAllChips();
            _renderEditorList(tabKey);
            _attachSortable(tabKey);
        }
    });
}
