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
    { label: 'L赤',     labelEn: 'L.Red',     value: 'light red',       hex: '#fca5a5' },
    { label: 'L青',     labelEn: 'L.Blue',    value: 'light blue',      hex: '#93c5fd' },
    { label: 'L緑',     labelEn: 'L.Green',   value: 'light green',     hex: '#86efac' },
    { label: 'L黄',     labelEn: 'L.Yellow',  value: 'light yellow',    hex: '#fde68a' },
    { label: 'L橙',     labelEn: 'L.Orange',  value: 'light orange',    hex: '#fdba74' },
    { label: 'Lピンク', labelEn: 'L.Pink',    value: 'light pink',      hex: '#fda4af' },
    { label: 'L紫',     labelEn: 'L.Purple',  value: 'light purple',    hex: '#c4b5fd' },
    { label: 'L茶',     labelEn: 'L.Brown',   value: 'light brown',     hex: '#d4a574' },
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

function _buildDefaultCategories() {
    return [
        { id: 'colorMods',   label: 'Mod',      isColor: false, items: _clone(DEFAULT_COLOR_MODS) },
        { id: 'colors',      label: 'Color',    isColor: true,  items: _clone(DEFAULT_COLORS) },
        { id: 'materials',   label: 'Material', isColor: false, items: _clone(DEFAULT_MATERIALS) },
        { id: 'patterns',    label: 'Pattern',  isColor: false, items: _clone(DEFAULT_PATTERNS) },
        { id: 'decorations', label: 'Deco',     isColor: false, items: _clone(DEFAULT_DECORATIONS) },
    ];
}

// ──────────────────────────────────────────────────────────────
// Persistent palette data (localStorage)
// ──────────────────────────────────────────────────────────────

const LS_KEY = 'stylePaletteData';
let paletteData = { categories: [] };

function _loadPaletteData() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
            const p = JSON.parse(raw);
            if (Array.isArray(p.categories)) {
                paletteData.categories = p.categories;
                return;
            }
            // 旧フォーマット移行
            paletteData.categories = _buildDefaultCategories();
            if (p.colorMods)   paletteData.categories.find(c => c.id === 'colorMods').items   = p.colorMods;
            if (p.colors)      paletteData.categories.find(c => c.id === 'colors').items       = p.colors;
            if (p.materials)   paletteData.categories.find(c => c.id === 'materials').items    = p.materials;
            if (p.patterns)    paletteData.categories.find(c => c.id === 'patterns').items     = p.patterns;
            if (p.decorations) paletteData.categories.find(c => c.id === 'decorations').items  = p.decorations;
            return;
        }
    } catch (_) {}
    paletteData.categories = _buildDefaultCategories();
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

export function closeIfAutoClose() {
    if (localStorage.getItem('styleCloseOnApply') !== 'true') return;
    const dropdown = document.getElementById('style-palette-dropdown');
    if (dropdown && !dropdown.classList.contains('sp-hidden')) {
        dropdown.classList.add('sp-hidden');
        localStorage.setItem('stylePaletteCollapsed', '1');
        _setModeA(false);
    }
}

export function applyStyleToValue(tagValue) {
    const prefix = getStylePrefix();
    return prefix ? `${prefix} ${tagValue}` : tagValue;
}

function clearStyle() {
    State.pendingStyle.selections = {};
    State.pendingStyle.custom = '';
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
    _buildAllRows();

    document.getElementById('btn-style-palette-toggle')?.addEventListener('click', () => {
        const dropdown = document.getElementById('style-palette-dropdown');
        if (!dropdown) return;
        const hidden = dropdown.classList.toggle('sp-hidden');
        localStorage.setItem('stylePaletteCollapsed', hidden ? '1' : '0');
        _setModeA(!hidden);
    });

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

    document.getElementById('style-palette-edit-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        _openEditor();
    });

    document.getElementById('style-mode-a')?.addEventListener('change', (e) => {
        State.pendingStyle.modeAEnabled = e.target.checked;
    });

    const qaChk = document.getElementById('style-apply-quickadd');
    if (qaChk) {
        qaChk.checked = localStorage.getItem('styleApplyQuickAdd') !== 'false';
        qaChk.addEventListener('change', () => {
            localStorage.setItem('styleApplyQuickAdd', qaChk.checked ? 'true' : 'false');
        });
    }

    const cocChk = document.getElementById('style-close-on-apply');
    if (cocChk) {
        cocChk.checked = localStorage.getItem('styleCloseOnApply') === 'true';
        cocChk.addEventListener('change', () => {
            localStorage.setItem('styleCloseOnApply', cocChk.checked ? 'true' : 'false');
        });
    }

    document.getElementById('style-custom-input')?.addEventListener('input', (e) => {
        State.pendingStyle.custom = e.target.value;
        _updateBadge();
    });

    document.getElementById('style-clear-btn')?.addEventListener('click', clearStyle);

    _updateBadge();
    _buildEditorDialog();
    _initResizeHandle();

    window.addEventListener('languageChanged', _rebuildAllChips);
}

function _setModeA(enabled) {
    State.pendingStyle.modeAEnabled = enabled;
    const cb = document.getElementById('style-mode-a');
    if (cb) cb.checked = enabled;
}

// ──────────────────────────────────────────────────────────────
// Palette row rendering (dynamic)
// ──────────────────────────────────────────────────────────────

const _chipSortables = {};

function _buildAllRows() {
    const body = document.getElementById('style-palette-body');
    if (!body) return;

    // 既存のカテゴリ行を削除（.style-footer は残す）
    body.querySelectorAll('.style-row').forEach(r => r.remove());

    // Sortable インスタンスを破棄
    for (const id of Object.keys(_chipSortables)) {
        try { _chipSortables[id].destroy(); } catch (_) {}
        delete _chipSortables[id];
    }

    const footer = body.querySelector('.style-footer');
    paletteData.categories.forEach(cat => {
        const row = document.createElement('div');
        row.className = 'style-row' + (cat.isColor ? ' style-row-colors' : '');
        row.dataset.catId = cat.id;

        const labelEl = document.createElement('span');
        labelEl.className = 'style-row-label';
        labelEl.textContent = cat.label;

        const chips = document.createElement('div');
        chips.className = 'style-chips';
        chips.id = `style-chips-${cat.id}`;

        row.appendChild(labelEl);
        row.appendChild(chips);
        body.insertBefore(row, footer || null);

        _buildChips(cat.id, cat.items, cat.isColor);
        _attachChipSortable(cat.id);
    });
}

function _buildChips(catId, items, isColor) {
    const container = document.getElementById(`style-chips-${catId}`);
    if (!container) return;
    container.innerHTML = '';
    items.forEach(item => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'style-chip';
        chip.dataset.value = item.value;
        chip.dataset.catId = catId;

        if (isColor) {
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
        chip.addEventListener('click', () => _toggleChip(chip, catId, item.value));
        container.appendChild(chip);
    });
}

function _attachChipSortable(catId) {
    const container = document.getElementById(`style-chips-${catId}`);
    if (!container) return;
    if (_chipSortables[catId]) {
        try { _chipSortables[catId].destroy(); } catch (_) {}
    }
    _chipSortables[catId] = new Sortable(container, {
        animation: 150,
        ghostClass: 'style-chip-ghost',
        onEnd: (evt) => {
            const { oldIndex, newIndex } = evt;
            if (oldIndex === newIndex) return;
            const cat = paletteData.categories.find(c => c.id === catId);
            if (!cat) return;
            const [moved] = cat.items.splice(oldIndex, 1);
            cat.items.splice(newIndex, 0, moved);
            _savePaletteData();
        },
    });
}

function _rebuildAllChips() {
    // 消えたカテゴリの選択を削除
    const validIds = new Set(paletteData.categories.map(c => c.id));
    for (const id of Object.keys(State.pendingStyle.selections)) {
        if (!validIds.has(id)) {
            delete State.pendingStyle.selections[id];
        } else {
            const cat = paletteData.categories.find(c => c.id === id);
            const vals = new Set(cat.items.map(i => i.value));
            State.pendingStyle.selections[id] = (State.pendingStyle.selections[id] || []).filter(v => vals.has(v));
        }
    }
    _buildAllRows();
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

function _toggleChip(chip, catId, value) {
    if (!State.pendingStyle.selections[catId]) State.pendingStyle.selections[catId] = [];
    const arr = State.pendingStyle.selections[catId];
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
        const catId = chip.dataset.catId;
        const val   = chip.dataset.value;
        chip.classList.toggle('active', !!(State.pendingStyle.selections[catId]?.includes(val)));
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

let _activeEditorTab = 'colors';   // catId or '__new__'
let _acDebounce = null;
let _currentSortable = null;

function _buildEditorDialog() {
    if (document.getElementById('spe-dialog')) return;
    const dlg = document.createElement('dialog');
    dlg.id = 'spe-dialog';
    dlg.className = 'spe-dialog';
    dlg.innerHTML = `
        <div class="spe-content">
            <div class="spe-header">
                <span class="spe-title">${i18n.t('style_edit_title')}</span>
                <button class="spe-close-x" onclick="document.getElementById('spe-dialog').close()">✕</button>
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
    // アクティブタブが消えていたらリセット
    if (_activeEditorTab !== '__new__' && !paletteData.categories.find(c => c.id === _activeEditorTab)) {
        _activeEditorTab = paletteData.categories[0]?.id || '__new__';
    }
    _renderEditorTabs();
    _renderEditorBody(_activeEditorTab);
    dlg.showModal();
}

function _renderEditorTabs() {
    const tabBar = document.getElementById('spe-tabs');
    if (!tabBar) return;
    tabBar.innerHTML = '';

    paletteData.categories.forEach(({ id, label }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'spe-tab' + (id === _activeEditorTab ? ' active' : '');
        btn.textContent = label;
        btn.addEventListener('click', () => {
            _activeEditorTab = id;
            _renderEditorTabs();
            _renderEditorBody(id);
        });
        tabBar.appendChild(btn);
    });

    // ＋ カテゴリ追加タブ
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'spe-tab spe-tab-add' + (_activeEditorTab === '__new__' ? ' active' : '');
    addBtn.textContent = '＋';
    addBtn.title = 'カテゴリを追加';
    addBtn.addEventListener('click', () => {
        _activeEditorTab = '__new__';
        _renderEditorTabs();
        _renderEditorBody('__new__');
    });
    tabBar.appendChild(addBtn);
}

function _renderEditorBody(tabKey) {
    const body = document.getElementById('spe-body');
    if (!body) return;

    if (tabKey === '__new__') {
        _renderNewCategoryForm(body);
        return;
    }

    const cat = paletteData.categories.find(c => c.id === tabKey);
    if (!cat) return;
    const isColor = cat.isColor;

    body.innerHTML = `
        <div class="spe-cat-header">
            <input type="text" id="spe-cat-label" class="spe-input spe-input-catname"
                   value="${cat.label}" maxlength="20" placeholder="カテゴリ名">
            <label class="spe-color-check">
                <input type="checkbox" id="spe-cat-is-color" ${isColor ? 'checked' : ''}>
                <span>カラースウォッチ</span>
            </label>
            <button type="button" class="spe-cat-rename-btn" id="spe-cat-rename-btn">名前変更</button>
            <button type="button" class="spe-cat-del-btn" id="spe-cat-del-btn">🗑 カテゴリ削除</button>
        </div>
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
            <button type="button" class="spe-add-btn" id="spe-add-btn">${i18n.t('style_edit_add_btn')}</button>
        </div>`;

    // カテゴリ名変更
    document.getElementById('spe-cat-rename-btn').addEventListener('click', () => {
        const newLabel = document.getElementById('spe-cat-label').value.trim();
        if (!newLabel) return;
        cat.label = newLabel;
        cat.isColor = document.getElementById('spe-cat-is-color').checked;
        _savePaletteData();
        _rebuildAllChips();
        _renderEditorTabs();
        _renderEditorBody(tabKey);
    });

    // カテゴリ削除
    document.getElementById('spe-cat-del-btn').addEventListener('click', () => {
        if (!confirm(`「${cat.label}」カテゴリを削除しますか？`)) return;
        const idx = paletteData.categories.findIndex(c => c.id === tabKey);
        if (idx !== -1) paletteData.categories.splice(idx, 1);
        delete State.pendingStyle.selections[tabKey];
        _savePaletteData();
        _rebuildAllChips();
        _activeEditorTab = paletteData.categories[0]?.id || '__new__';
        _renderEditorTabs();
        _renderEditorBody(_activeEditorTab);
    });

    _renderEditorList(tabKey);
    _attachAddHandler(tabKey, isColor);
    _attachValueAutocomplete();
    _attachSortable(tabKey);
}

function _renderNewCategoryForm(body) {
    body.innerHTML = `
        <div class="spe-new-cat-form">
            <h3 class="spe-new-cat-title">新しいカテゴリを追加</h3>
            <div class="spe-new-cat-row">
                <label>カテゴリ名</label>
                <input type="text" id="spe-new-cat-label" class="spe-input" maxlength="20" placeholder="例: Hair Style">
            </div>
            <div class="spe-new-cat-row">
                <label class="spe-color-check">
                    <input type="checkbox" id="spe-new-cat-is-color">
                    <span>カラースウォッチ表示（hex カラー付きアイテム）</span>
                </label>
            </div>
            <button type="button" class="spe-add-btn" id="spe-new-cat-add-btn">追加</button>
        </div>`;

    document.getElementById('spe-new-cat-add-btn').addEventListener('click', () => {
        const label = document.getElementById('spe-new-cat-label').value.trim();
        if (!label) return;
        const isColor = document.getElementById('spe-new-cat-is-color').checked;
        const id = 'cat_' + Date.now();
        paletteData.categories.push({ id, label, isColor, items: [] });
        _savePaletteData();
        _rebuildAllChips();
        _activeEditorTab = id;
        _renderEditorTabs();
        _renderEditorBody(id);
    });

    document.getElementById('spe-new-cat-label')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('spe-new-cat-add-btn').click();
    });
}

function _renderEditorList(tabKey) {
    const list = document.getElementById('spe-list');
    if (!list) return;
    const cat = paletteData.categories.find(c => c.id === tabKey);
    if (!cat) return;
    const isColor = cat.isColor;
    const items = cat.items;

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
            <button type="button" class="spe-row-del" data-idx="${idx}" title="${i18n.t('style_edit_del_title')}">✕</button>`;

        row.querySelector('.spe-row-del').addEventListener('click', () => {
            cat.items.splice(idx, 1);
            _savePaletteData();
            _rebuildAllChips();
            _renderEditorList(tabKey);
            _attachSortable(tabKey);
        });
        list.appendChild(row);
    });
}

function _attachAddHandler(tabKey, isColor) {
    const cat = paletteData.categories.find(c => c.id === tabKey);
    if (!cat) return;
    const doAdd = () => {
        const label = document.getElementById('spe-add-label')?.value.trim();
        const value = document.getElementById('spe-add-value')?.value.trim();
        if (!label || !value) return;
        const item = { label, value };
        if (isColor) item.hex = document.getElementById('spe-add-hex')?.value || '#888888';
        cat.items.push(item);
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

// ── Autocomplete for tag value input ──────────────────────────

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
            acList.querySelector('.spe-ac-item')?.focus();
            e.preventDefault();
        }
    });

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

    if (_currentSortable) {
        try { _currentSortable.destroy(); } catch (_) {}
        _currentSortable = null;
    }

    _currentSortable = new Sortable(list, {
        handle: '.spe-row-drag',
        filter: '.spe-row-del',
        preventOnFilter: false,
        animation: 150,
        ghostClass: 'spe-row-ghost',
        onEnd: (evt) => {
            const { oldIndex, newIndex } = evt;
            if (oldIndex === newIndex) return;
            const cat = paletteData.categories.find(c => c.id === tabKey);
            if (!cat) return;
            const [moved] = cat.items.splice(oldIndex, 1);
            cat.items.splice(newIndex, 0, moved);
            _savePaletteData();
            _rebuildAllChips();
            _renderEditorList(tabKey);
            _attachSortable(tabKey);
        }
    });
}

// ──────────────────────────────────────────────────────────────
// Resize handle
// ──────────────────────────────────────────────────────────────

const SP_HEIGHT_KEY = 'stylePaletteHeight';
const SP_MIN_HEIGHT = 80;
const SP_MAX_HEIGHT = 600;

function _initResizeHandle() {
    const body = document.getElementById('style-palette-body');
    const handle = document.getElementById('style-palette-resize-handle');
    if (!body || !handle) return;

    const saved = parseInt(localStorage.getItem(SP_HEIGHT_KEY), 10);
    if (saved && saved >= SP_MIN_HEIGHT && saved <= SP_MAX_HEIGHT) {
        body.style.maxHeight = saved + 'px';
    }

    let startY = 0;
    let startH = 0;

    function onPointerMove(e) {
        const delta = e.clientY - startY;
        const newH = Math.min(SP_MAX_HEIGHT, Math.max(SP_MIN_HEIGHT, startH + delta));
        body.style.maxHeight = newH + 'px';
    }

    function onPointerUp(e) {
        handle.classList.remove('dragging');
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        handle.releasePointerCapture(e.pointerId);
        const h = parseInt(body.style.maxHeight, 10);
        if (h) localStorage.setItem(SP_HEIGHT_KEY, String(h));
    }

    handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        handle.setPointerCapture(e.pointerId);
        handle.classList.add('dragging');
        startY = e.clientY;
        startH = body.getBoundingClientRect().height;
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
    });
}
