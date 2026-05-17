/**
 * ComfyUI Slots Panel
 * ComfyUI モード時に Builder ペインをスロット別テキストエリアに切り替える。
 * addToPrompt は State.lastFocusedAreaId を参照するため、
 * スロット textarea を focus したときに lastFocusedAreaId を更新するだけで
 * 既存のチップ挿入ロジックがそのまま動く。
 */

import { IPC } from '../core/ipc.js';
import { State } from '../core/state.js';
import { renderPromptChips } from './prompt-chips.js';
import { i18n } from '../core/i18n.js';
import Sortable from 'sortablejs';

const SCAN_WAIT_MS = 500;   // ms to wait after request-scan before fetching slots

const PANEL_ID    = 'comfy-slots-panel';
const LIST_ID     = 'comfy-slots-list';
const SLOT_ID_PFX = 'comfy-slot-';   // textarea の id = "comfy-slot-{name}"

const SLOT_ORDER_KEY = 'comfySlotOrder';

let _onSendSlot = null;   // (slotName, text, trigger) => void  呼び出し元から注入
let _savedSlotTexts = {}; // スロットテキストの永続キャッシュ（モード切替・リフレッシュで復元用）
let _sortable = null;

/** 外部から送信ハンドラを登録 */
export function registerComfySlotsHandler(fn) {
    _onSendSlot = fn;
}

/** ComfyUI からスロット名一覧を取得してパネルを再描画 */
export async function loadComfySlots() {
    const list = document.getElementById(LIST_ID);
    if (!list) return;

    // DOM が既にある場合はキャッシュを最新化（念のため）
    list.querySelectorAll('.comfy-slot-row').forEach(row => {
        const n = row.dataset.slot;
        const t = row.querySelector('.comfy-slot-text')?.value ?? '';
        if (t) _savedSlotTexts[n] = t;
    });

    list.innerHTML = `<div class="comfy-slots-empty">${i18n.t('comfy_slots_loading')}</div>`;

    // Ask ComfyUI JS extension to re-scan nodes, then wait for it to register.
    try {
        await IPC.requestComfyScan();
        await new Promise(r => setTimeout(r, SCAN_WAIT_MS));
    } catch { /* ignore — ComfyUI may not be running */ }

    let slots = [];
    try {
        const data = await IPC.getComfySlots();
        slots = data?.slots ?? [];
    } catch {
        list.innerHTML = `<div class="comfy-slots-empty">${i18n.t('comfy_slots_error')}</div>`;
        return;
    }

    if (slots.length === 0) {
        list.innerHTML = `<div class="comfy-slots-empty">${i18n.t('comfy_slots_empty')}</div>`;
        return;
    }

    // 保存済み順序に従って並べ替え（未知のスロットは末尾に追加）
    const savedOrder = JSON.parse(localStorage.getItem(SLOT_ORDER_KEY) || '[]');
    const ordered = [
        ...savedOrder.filter(n => slots.includes(n)),
        ...slots.filter(n => !savedOrder.includes(n)),
    ];

    list.innerHTML = '';
    ordered.forEach((name, i) => {
        const row = buildSlotRow(name);
        list.appendChild(row);
        if (_savedSlotTexts[name]) {
            const ta = row.querySelector('.comfy-slot-text');
            if (ta) {
                ta.value = _savedSlotTexts[name];
                ta.dispatchEvent(new Event('input'));
            }
        } else {
            renderPromptChips(SLOT_ID_PFX + 'chips-' + name, SLOT_ID_PFX + name);
        }
        if (i === 0) activateSlot(name);
    });

    // Sortable を初期化（既存インスタンスを破棄してから）
    if (_sortable) { try { _sortable.destroy(); } catch (_) {} }
    _sortable = new Sortable(list, {
        handle: '.comfy-slot-drag',
        draggable: '.comfy-slot-row',
        group: { name: 'comfy-slots', pull: false, put: false },
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: () => {
            const order = Array.from(list.querySelectorAll('.comfy-slot-row'))
                .map(r => r.dataset.slot);
            localStorage.setItem(SLOT_ORDER_KEY, JSON.stringify(order));
        },
    });
}

/** スロット行を構築 */
function buildSlotRow(name) {
    const textareaId = SLOT_ID_PFX + name;
    const chipsId    = SLOT_ID_PFX + 'chips-' + name;

    const row = document.createElement('div');
    row.className = 'comfy-slot-row';
    row.dataset.slot = name;

    // ── ヘッダー ─────────────────────────────────
    const header = document.createElement('div');
    header.className = 'comfy-slot-header';

    const dragHandle = document.createElement('span');
    dragHandle.className = 'comfy-slot-drag';
    dragHandle.textContent = '⠿';
    dragHandle.title = i18n.t('drag_to_reorder');

    const label = document.createElement('span');
    label.className = 'comfy-slot-name';
    label.textContent = name;

    const sendBtn = document.createElement('button');
    sendBtn.className = 'comfy-slot-send';
    sendBtn.textContent = '▶';
    sendBtn.title = i18n.t('comfy_slot_send_title').replace('{name}', name);
    sendBtn.addEventListener('click', () => {
        _onSendSlot?.(name, textarea.value, false);
    });

    header.appendChild(dragHandle);
    header.appendChild(label);
    header.appendChild(sendBtn);

    // ── チップコンテナ ───────────────────────────
    const chips = document.createElement('div');
    chips.id        = chipsId;
    chips.className = 'chip-container comfy-slot-chips';
    chips.addEventListener('mousedown', (e) => {
        if (e.button === 1) e.preventDefault();
        activateSlot(name);
    });

    // ── Raw テキストエリア (折りたたみ) ──────────
    const details = document.createElement('details');
    details.className = 'comfy-slot-raw-details';

    const summary = document.createElement('summary');
    summary.className = 'comfy-slot-raw-summary';
    summary.textContent = 'Raw';

    const textarea = document.createElement('textarea');
    textarea.className = 'comfy-slot-text';
    textarea.id        = textareaId;
    textarea.placeholder = i18n.t('comfy_slot_placeholder').replace('{name}', name);
    textarea.rows = 3;

    // テキスト変更 → チップ再描画 + 永続キャッシュ更新
    textarea.addEventListener('input', () => {
        _savedSlotTexts[name] = textarea.value;
        renderPromptChips(chipsId, textareaId);
    });
    textarea.addEventListener('focus', () => activateSlot(name));
    textarea.addEventListener('mousedown', () => activateSlot(name));

    details.appendChild(summary);
    details.appendChild(textarea);

    row.appendChild(header);
    row.appendChild(chips);
    row.appendChild(details);
    return row;
}

/** 指定スロットをアクティブ（チップ挿入先）に設定 */
export function activateSlot(name) {
    State.lastFocusedAreaId = SLOT_ID_PFX + name;

    // active-area スタイルを付け替え
    document.querySelectorAll('#comfy-slots-list .comfy-slot-row').forEach(row => {
        row.classList.toggle('active-area', row.dataset.slot === name);
    });
}

/** パネルの表示/非表示 + 通常のプロンプトセクションと排他切り替え */
export function syncComfySlotsVisibility(isComfyMode) {
    const panel = document.getElementById(PANEL_ID);
    const normalSections = document.querySelectorAll('#builder-pane-content .prompt-section');

    const rawDetails = document.querySelector('.raw-prompt-details');
    if (panel)          panel.style.display = isComfyMode ? 'flex' : 'none';
    if (rawDetails)     rawDetails.style.display = isComfyMode ? 'none' : '';
    normalSections.forEach(s => { s.style.display = isComfyMode ? 'none' : ''; });

    if (isComfyMode) {
        // Comfy 非表示中は textarea の input イベントが来ないのでここでキャッシュ更新
        document.querySelectorAll(`#${LIST_ID} .comfy-slot-row`).forEach(row => {
            const n = row.dataset.slot;
            const t = row.querySelector('.comfy-slot-text')?.value ?? '';
            if (t) _savedSlotTexts[n] = t;
        });
        // スロット行が既にあれば再フェッチしない（↺ ボタンのみ再取得）
        const hasSlots = !!document.querySelector(`#${LIST_ID} .comfy-slot-row`);
        if (!hasSlots) loadComfySlots();
    }
}

/** 全スロットの {name: text} マップを返す */
export function getAllSlotTexts() {
    const result = {};
    document.querySelectorAll('#comfy-slots-list .comfy-slot-row').forEach(row => {
        const name = row.dataset.slot;
        const text = row.querySelector('.comfy-slot-text')?.value ?? '';
        result[name] = text;
    });
    return result;
}
