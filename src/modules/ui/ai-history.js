/**
 * AI 生成履歴 — localStorage CRUD + Explorer パネルへの描画
 * main.js からの循環参照を避けるため独立モジュールとして分離
 */

import { i18n } from '../core/i18n.js';

const AI_HISTORY_KEY = 'ai-prompt-history';
const AI_HISTORY_MAX = 50;

/** 現在のフィルター状態: 'all' | 'favorites' */
let _filterMode = 'all';

export function saveAiHistory(entry) {
    const history = getAiHistory();
    history.unshift({ ...entry, favorite: false });
    if (history.length > AI_HISTORY_MAX) history.length = AI_HISTORY_MAX;
    localStorage.setItem(AI_HISTORY_KEY, JSON.stringify(history));
}

export function getAiHistory() {
    try { return JSON.parse(localStorage.getItem(AI_HISTORY_KEY) || '[]'); } catch { return []; }
}

function _saveAiHistory(history) {
    localStorage.setItem(AI_HISTORY_KEY, JSON.stringify(history));
}

function _toggleFavorite(idx) {
    const history = getAiHistory();
    if (!history[idx]) return;
    history[idx].favorite = !history[idx].favorite;
    _saveAiHistory(history);
    renderAiHistory();
}

function _deleteEntry(idx) {
    const history = getAiHistory();
    history.splice(idx, 1);
    _saveAiHistory(history);
    renderAiHistory();
}

function _restoreEntry(item) {
    const inputEl  = document.getElementById('ai-natural-input');
    const resultEl = document.getElementById('ai-prompt-result');
    const resultText = document.getElementById('ai-result-text');
    if (inputEl) inputEl.value = item.input;
    if (resultText) {
        resultText.textContent = item.output;
        resultText.dataset.prompt = item.output;
        resultText.classList.remove('ai-result-error');
    }
    if (resultEl) { resultEl.hidden = false; resultEl.style.display = 'flex'; }
}

export function renderAiHistory() {
    const container = document.getElementById('explorer-content');
    if (!container) return;
    container.innerHTML = '';

    const allHistory = getAiHistory();

    // ── フィルタータブ ──────────────────────────────────────────
    const favCount = allHistory.filter(h => h.favorite).length;

    const tabs = document.createElement('div');
    tabs.className = 'ai-history-tabs';
    tabs.innerHTML = `
        <button class="ai-history-tab${_filterMode === 'all' ? ' active' : ''}" data-filter="all">${i18n.t('ai_history_tab_all')} (${allHistory.length})</button>
        <button class="ai-history-tab${_filterMode === 'favorites' ? ' active' : ''}" data-filter="favorites">${i18n.t('ai_history_tab_fav')} (${favCount})</button>
    `;
    tabs.addEventListener('click', (e) => {
        const btn = e.target.closest('.ai-history-tab');
        if (!btn) return;
        _filterMode = btn.dataset.filter;
        renderAiHistory();
    });
    container.appendChild(tabs);

    // ── 表示対象を絞り込み ──────────────────────────────────────
    const history = _filterMode === 'favorites'
        ? allHistory.map((item, origIdx) => ({ item, origIdx })).filter(({ item }) => item.favorite)
        : allHistory.map((item, origIdx) => ({ item, origIdx }));

    if (history.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'ai-history-empty';
        empty.textContent = _filterMode === 'favorites' ? i18n.t('ai_history_no_fav') : i18n.t('ai_history_empty');
        container.appendChild(empty);
        return;
    }

    history.forEach(({ item, origIdx }) => {
        const el = document.createElement('div');
        el.className = 'ai-history-item' + (item.favorite ? ' is-favorite' : '');

        const date = new Date(item.timestamp);
        const timeStr = `${date.getMonth()+1}/${date.getDate()} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;

        el.innerHTML = `
            <div class="ai-history-meta">${timeStr} · ${item.provider} · ${item.model || ''}</div>
            <div class="ai-history-input">${item.input}</div>
            <div class="ai-history-output">${item.output}</div>
        `;
        el.title = i18n.t('ai_history_restore');
        el.addEventListener('click', () => _restoreEntry(item));

        // ── ★ お気に入りボタン ──
        const favBtn = document.createElement('button');
        favBtn.className = 'ai-history-fav' + (item.favorite ? ' active' : '');
        favBtn.textContent = item.favorite ? '★' : '☆';
        favBtn.title = item.favorite ? i18n.t('ai_history_unfav') : i18n.t('ai_history_add_fav');
        favBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            _toggleFavorite(origIdx);
        });
        el.appendChild(favBtn);

        // ── ✕ 削除ボタン ──
        const delBtn = document.createElement('button');
        delBtn.className = 'ai-history-del';
        delBtn.textContent = '✕';
        delBtn.title = i18n.t('ai_history_delete');
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            _deleteEntry(origIdx);
        });
        el.appendChild(delBtn);

        container.appendChild(el);
    });
}
