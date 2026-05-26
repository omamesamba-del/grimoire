/**
 * Keyboard Shortcuts — definitions, matching, state management
 *
 * context:
 *   'anywhere' — fires even when an input/dialog is focused
 *   'noInput'  — fires only when no input/textarea/select is focused (and no dialog open)
 *   'prompt'   — fires only when a .prompt-textarea is focused, or when nothing is focused
 */

export const DEFAULT_SHORTCUTS = [
    // ── Mode switch ──────────────────────────────────────────────
    { id: 'mode.tags',           label: 'sc_label_tags_mode',      defaultKey: '1',                group: 'sc_group_mode',    context: 'noInput' },
    { id: 'mode.lora',           label: 'sc_label_lora_mode',      defaultKey: '2',                group: 'sc_group_mode',    context: 'noInput' },
    { id: 'mode.embedding',      label: 'sc_label_embedding_mode', defaultKey: '3',                group: 'sc_group_mode',    context: 'noInput' },
    { id: 'mode.gen',            label: 'sc_label_gen_mode',       defaultKey: '4',                group: 'sc_group_mode',    context: 'noInput' },
    { id: 'mode.images',         label: 'sc_label_images_mode',    defaultKey: '5',                group: 'sc_group_mode',    context: 'noInput' },
    { id: 'mode.ai',             label: 'sc_label_ai_mode',        defaultKey: '6',                group: 'sc_group_mode',    context: 'noInput' },
    // ── Builder ──────────────────────────────────────────────────
    { id: 'prompt.undo',         label: 'sc_label_undo',           defaultKey: 'Ctrl+Z',           group: 'sc_group_builder', context: 'prompt'  },
    { id: 'prompt.redo',         label: 'sc_label_redo',           defaultKey: 'Ctrl+Y',           group: 'sc_group_builder', context: 'prompt'  },
    { id: 'prompt.redo.alt',     label: 'sc_label_redo',           defaultKey: 'Ctrl+Shift+Z',     group: 'sc_group_builder', context: 'prompt'  },
    { id: 'builder.send_webui',  label: 'sc_label_send_webui',     defaultKey: 'Ctrl+Enter',       group: 'sc_group_builder', context: 'prompt'  },
    { id: 'builder.send_comfy',  label: 'sc_label_send_comfy',     defaultKey: 'Ctrl+Shift+Enter', group: 'sc_group_builder', context: 'prompt'  },
    { id: 'builder.save_preset', label: 'sc_label_save_preset',    defaultKey: 'Ctrl+S',           group: 'sc_group_builder', context: 'noInput' },
    { id: 'builder.clear',       label: 'sc_label_clear_builder',  defaultKey: 'Ctrl+Shift+Delete',group: 'sc_group_builder', context: 'noInput' },
    // ── General ──────────────────────────────────────────────────
    { id: 'search.focus',        label: 'sc_label_focus_search',   defaultKey: 'Ctrl+F',           group: 'sc_group_general', context: 'anywhere' },
    { id: 'settings.open',       label: 'sc_label_open_settings',  defaultKey: 'Ctrl+,',           group: 'sc_group_general', context: 'anywhere' },
    { id: 'layout.toggle',       label: 'sc_label_toggle_layout',  defaultKey: 'Ctrl+L',           group: 'sc_group_general', context: 'noInput' },
    { id: 'random.pick',         label: 'sc_label_random_pick',    defaultKey: 'Ctrl+Shift+R',     group: 'sc_group_general', context: 'noInput' },
];

// ── State ──────────────────────────────────────────────────────
// User overrides: { [id]: keyStr } — empty string = disabled
let _overrides = {};

export function loadShortcutOverrides(overrides) {
    _overrides = overrides || {};
}

export function getEffectiveKey(id) {
    return id in _overrides
        ? _overrides[id]
        : (DEFAULT_SHORTCUTS.find(s => s.id === id)?.defaultKey ?? '');
}

export function getAllEffective() {
    return DEFAULT_SHORTCUTS.map(s => ({ ...s, key: getEffectiveKey(s.id) }));
}

// ── Key utilities ──────────────────────────────────────────────

/** Convert a KeyboardEvent → shortcut string ("Ctrl+Shift+Enter", "1", …) */
export function eventToKey(e) {
    if (['Control', 'Meta', 'Shift', 'Alt'].includes(e.key)) return null;
    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey)   parts.push('Alt');
    parts.push(e.key);
    return parts.join('+');
}

/** Check if a KeyboardEvent matches a shortcut string */
export function matchesKey(e, keyStr) {
    if (!keyStr) return false;
    const parts   = keyStr.split('+');
    const defKey  = parts[parts.length - 1];
    // Case-insensitive single-char key match (e.g. 'Z' vs 'z' when Shift is held)
    const evKey   = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const defKeyN = defKey.length === 1 ? defKey.toLowerCase() : defKey;
    return evKey === defKeyN
        && !!(e.ctrlKey || e.metaKey) === parts.includes('Ctrl')
        && e.shiftKey                  === parts.includes('Shift')
        && e.altKey                    === parts.includes('Alt');
}

/** Format a shortcut string as an array of display parts (["Ctrl","Shift","Del"]) */
export function formatKey(keyStr) {
    if (!keyStr) return [];
    const parts = keyStr.split('+');
    // Normalize long key names
    const last = parts[parts.length - 1];
    const keyLabel = { Delete: 'Del', Escape: 'Esc', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ' ': 'Space' }[last] ?? last;
    return [...parts.slice(0, -1), keyLabel];
}

// ── Global handler ─────────────────────────────────────────────

/**
 * Register the global keydown handler.
 * handlers: { [shortcutId]: (e: KeyboardEvent) => void }
 */
export function initShortcuts(handlers) {
    document.addEventListener('keydown', (e) => {
        // Block all shortcuts while a non-settings dialog is open
        const openDialogs = [...document.querySelectorAll('dialog[open]')];
        const hasBlockingDialog = openDialogs.some(d => d.id !== 'settings-modal');
        if (hasBlockingDialog) return;

        // When settings is open, only 'anywhere' shortcuts are allowed
        const settingsOpen = openDialogs.some(d => d.id === 'settings-modal');

        const active      = document.activeElement;
        const inInput     = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');
        const inPrompt    = inInput && active.classList.contains('prompt-textarea');
        const inQuickAdd  = inInput && active.id && active.id.startsWith('quick-add');

        for (const sc of DEFAULT_SHORTCUTS) {
            const keyStr = getEffectiveKey(sc.id);
            if (!keyStr || !matchesKey(e, keyStr)) continue;

            const ctx = sc.context ?? 'noInput';

            // Settings is open → only 'anywhere' shortcuts pass
            if (settingsOpen && ctx !== 'anywhere') continue;

            // Context gating
            if (ctx === 'noInput' && inInput) continue;
            if (ctx === 'prompt'  && inInput && !inPrompt && !inQuickAdd) continue;
            // 'anywhere' always passes

            const handler = handlers[sc.id];
            if (handler) {
                e.preventDefault();
                handler(e);
                return;
            }
        }
    });
}
