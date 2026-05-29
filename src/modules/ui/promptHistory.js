/**
 * Prompt History — records prompt snapshots on each send and allows restore.
 */
import { i18n } from '../core/i18n.js';

const STORAGE_KEY = 'promptHistory';
const MAX_ENTRIES = 50;

function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function save(entries) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function recordHistory(positive, negative, target = 'webui') {
    if (!positive && !negative) return;
    const entries = load();
    const last = entries[0];
    if (last && last.positive === (positive || '') && last.negative === (negative || '')) return;
    entries.unshift({ ts: Date.now(), positive: positive || '', negative: negative || '', target });
    save(entries.slice(0, MAX_ENTRIES));
}

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

function restoreEntry(entry) {
    const posEl = document.getElementById('positive-prompt');
    const negEl = document.getElementById('negative-prompt');
    if (posEl) { posEl.value = entry.positive; posEl.dispatchEvent(new Event('input')); }
    if (negEl) { negEl.value = entry.negative; negEl.dispatchEvent(new Event('input')); }
    closeHistoryPanel();
}

function closeHistoryPanel() {
    document.getElementById('prompt-history-panel')?.remove();
    document.getElementById('prompt-history-backdrop')?.remove();
}

export function openHistoryPanel() {
    closeHistoryPanel();

    const backdrop = document.createElement('div');
    backdrop.id = 'prompt-history-backdrop';
    backdrop.className = 'ph-backdrop';
    backdrop.addEventListener('click', closeHistoryPanel);
    document.body.appendChild(backdrop);

    const panel = document.createElement('div');
    panel.id = 'prompt-history-panel';
    panel.className = 'ph-panel';

    const header = document.createElement('div');
    header.className = 'ph-header';
    header.innerHTML = `<span>${i18n.t('ph_title')}</span>`;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'ph-close-btn';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', closeHistoryPanel);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const entries = load();

    if (entries.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'ph-empty';
        empty.textContent = i18n.t('ph_empty');
        panel.appendChild(empty);
    } else {
        const clearBtn = document.createElement('button');
        clearBtn.className = 'ph-clear-all-btn';
        clearBtn.textContent = i18n.t('ph_clear_all');
        clearBtn.addEventListener('click', () => {
            save([]);
            openHistoryPanel();
        });
        panel.appendChild(clearBtn);

        const list = document.createElement('div');
        list.className = 'ph-list';
        entries.forEach((entry, idx) => {
            const item = document.createElement('div');
            item.className = 'ph-item';

            const meta = document.createElement('div');
            meta.className = 'ph-meta';
            const badge = document.createElement('span');
            badge.className = `ph-badge ph-badge-${entry.target}`;
            badge.textContent = entry.target === 'comfy' ? 'ComfyUI' : 'WebUI';
            const time = document.createElement('span');
            time.className = 'ph-time';
            time.textContent = relativeTime(entry.ts);
            meta.appendChild(badge);
            meta.appendChild(time);

            const preview = document.createElement('div');
            preview.className = 'ph-preview';
            preview.textContent = entry.positive
                ? (entry.positive.length > 120 ? entry.positive.slice(0, 120) + '…' : entry.positive)
                : '(empty)';

            const actions = document.createElement('div');
            actions.className = 'ph-actions';
            const restoreBtn = document.createElement('button');
            restoreBtn.className = 'ph-restore-btn';
            restoreBtn.textContent = i18n.t('ph_restore');
            restoreBtn.addEventListener('click', () => restoreEntry(entry));
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'ph-delete-btn';
            deleteBtn.textContent = '✕';
            deleteBtn.addEventListener('click', () => {
                const updated = load().filter((_, i) => i !== idx);
                save(updated);
                openHistoryPanel();
            });
            actions.appendChild(restoreBtn);
            actions.appendChild(deleteBtn);

            item.appendChild(meta);
            item.appendChild(preview);
            item.appendChild(actions);
            list.appendChild(item);
        });
        panel.appendChild(list);
    }

    document.body.appendChild(panel);
}
