/**
 * Slot Mode
 * Grimoire カラムをスロット入力モードに切り替える。
 * スロット設定は localStorage に保存。
 */
import Sortable from 'sortablejs';

const STORAGE_KEY  = 'slotConfig';
const STORAGE_VALS = 'slotValues';

const DEFAULT_SLOTS = [
    { id: 'slot-quality',    name: '品質',   area: 'positive' },
    { id: 'slot-character',  name: 'キャラ', area: 'positive' },
    { id: 'slot-outfit',     name: '服装',   area: 'positive' },
    { id: 'slot-pose',       name: 'ポーズ', area: 'positive' },
    { id: 'slot-camera',     name: 'カメラ', area: 'positive' },
    { id: 'slot-background', name: '背景',   area: 'positive' },
    { id: 'slot-negative',   name: 'NG',     area: 'negative' },
];

// ── State ──────────────────────────────────────────────────────
export let isSlotMode   = false;
export let activeSlotEl = null;

function loadConfig() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || DEFAULT_SLOTS; }
    catch { return DEFAULT_SLOTS; }
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

export function enterSlotMode() {
    isSlotMode = true;
    const panel   = document.getElementById('slot-mode-panel');
    const builder = document.getElementById('builder-pane-content');
    if (panel)   panel.style.display   = 'flex';
    if (builder) builder.style.display = 'none';
    document.getElementById('btn-slot-mode-toggle')?.classList.add('active');
    renderSlots();
}

export function exitSlotMode() {
    isSlotMode  = false;
    activeSlotEl = null;
    const panel   = document.getElementById('slot-mode-panel');
    const builder = document.getElementById('builder-pane-content');
    if (panel)   panel.style.display   = 'none';
    if (builder) builder.style.display = '';
    document.getElementById('btn-slot-mode-toggle')?.classList.remove('active');
}

// ── Render slots ───────────────────────────────────────────────
function renderSlots() {
    const container = document.getElementById('slot-panel-slots');
    if (!container) return;
    container.innerHTML = '';

    const slots  = loadConfig();
    const values = loadValues();
    activeSlotEl = null;

    slots.forEach((slot, idx) => {
        const item = document.createElement('div');
        item.className = 'slot-item';

        const label = document.createElement('div');
        label.className = 'slot-item-label';
        label.textContent = slot.name;
        if (slot.area === 'negative') {
            const badge = document.createElement('span');
            badge.className = 'slot-neg-badge';
            badge.textContent = 'NEG';
            label.appendChild(badge);
        }

        const row = document.createElement('div');
        row.className = 'slot-item-row';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'slot-item-input';
        input.placeholder = `${slot.name} のタグを選択…`;
        input.value = values[slot.id] || '';
        input.addEventListener('focus', () => {
            activeSlotEl = input;
            container.querySelectorAll('.slot-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
        });
        input.addEventListener('input', () => {
            const v = loadValues();
            v[slot.id] = input.value;
            saveValues(v);
        });

        const clearBtn = document.createElement('button');
        clearBtn.className = 'slot-item-clear';
        clearBtn.textContent = '🗑';
        clearBtn.title = 'クリア';
        clearBtn.addEventListener('click', () => {
            input.value = '';
            const v = loadValues();
            v[slot.id] = '';
            saveValues(v);
            input.focus();
        });

        row.appendChild(input);
        row.appendChild(clearBtn);
        item.appendChild(label);
        item.appendChild(row);
        container.appendChild(item);

        if (idx === 0) setTimeout(() => input.focus(), 30);
    });
}

// ── Apply ──────────────────────────────────────────────────────
export function applySlots() {
    const slots  = loadConfig();
    const values = loadValues();

    // Sync current input values
    document.querySelectorAll('#slot-panel-slots .slot-item').forEach((item, idx) => {
        const slot = slots[idx];
        if (!slot) return;
        const val = item.querySelector('.slot-item-input')?.value || '';
        values[slot.id] = val;
    });
    saveValues(values);

    const mode = document.getElementById('slot-apply-mode')?.value || 'overwrite';

    const posSlots = slots.filter(s => s.area === 'positive');
    const negSlots = slots.filter(s => s.area === 'negative');
    const posText  = posSlots.map(s => values[s.id] || '').filter(Boolean).join(', ');
    const negText  = negSlots.map(s => values[s.id] || '').filter(Boolean).join(', ');

    const posEl = document.getElementById('positive-prompt');
    const negEl = document.getElementById('negative-prompt');

    if (mode === 'overwrite') {
        if (posEl) { posEl.value = posText; posEl.dispatchEvent(new Event('input')); }
        if (negEl && negText) { negEl.value = negText; negEl.dispatchEvent(new Event('input')); }
    } else {
        const append = (el, text) => {
            if (!el || !text) return;
            el.value = el.value ? el.value.trimEnd() + ', ' + text : text;
            el.dispatchEvent(new Event('input'));
        };
        append(posEl, posText);
        append(negEl, negText);
    }
}

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
                const ids  = [...list.querySelectorAll('.spe-row')].map(r => r.dataset.id);
                const cfg  = loadConfig();
                const sorted = ids.map(id => cfg.find(s => s.id === id)).filter(Boolean);
                saveConfig(sorted);
            },
        });
    };

    renderList();

    dialog.querySelector('#slot-settings-close').addEventListener('click', () => {
        dialog.close(); dialog.remove(); renderSlots();
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
    dialog.addEventListener('click', (e) => { if (e.target === dialog) { dialog.close(); dialog.remove(); renderSlots(); } });
}
