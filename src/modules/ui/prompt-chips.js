/**
 * Prompt Chip UI Component for v4
 */
import { State, saveChipColorOverride } from '../core/state.js';
import { parsePrompt, stringifyPrompt, addToPrompt, resolveRandomChips } from '../prompt/engine.js';
import { openAddTagModal, showInputDialog } from './modals.js';
import { MarqueeSelector } from './selection.js';
import Sortable from 'sortablejs';
import { hasActiveStyle, applyStyleToValue, closeIfAutoClose } from './style-palette.js';
import { i18n } from '../core/i18n.js';

function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r}, ${g}, ${b}`;
}

/**
 * Returns selected chips as properly formatted strings (e.g. <lora:name:1.0>),
 * ordered by their DOM position across all chip containers.
 */
export function getSelectedChipsOrdered() {
    const selected = State.selectedChips;
    if (selected.size === 0) return [];
    return Array.from(document.querySelectorAll('.prompt-chip'))
        .filter(el => selected.has(el.dataset.name))
        .map(el => {
            try {
                const tag = JSON.parse(el.dataset.tagData);
                return stringifyPrompt([tag]).trim();
            } catch {
                return el.dataset.name;
            }
        });
}

const _containerToInputMap = {
    'positive-chips':        'positive-prompt',
    'negative-chips':        'negative-prompt',
    'positive-suffix-chips': 'positive-suffix-prompt',
};

export function renderPromptChips(containerId, inputId) {
    _containerToInputMap[containerId] = inputId;
    const container = document.getElementById(containerId);
    const input = document.getElementById(inputId);
    if (!container || !input) return;

    const isNeg = inputId === 'negative-prompt';
    const isSuffix = containerId === 'positive-suffix-chips';
    const currentDisabled = isNeg ? State.disabledTagsNegative : State.disabledTagsPositive;
    const tags = parsePrompt(input.value);
    
    container.innerHTML = '';

    tags.forEach((tag, index) => {
        if (tag.type === 'break') {
            const br = document.createElement('div');
            br.className = 'prompt-chip type-break';
            br.dataset.index = index;
            br.dataset.name = 'BR';
            br.dataset.tagData = JSON.stringify({ name: 'BR', type: 'break', weight: null });
            br.title = i18n.t('chip_break_title');
            br.innerHTML = '<span class="chip-text">↵</span>';
            br.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
            br.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); removeTagAtIndex(index, inputId); } });
            container.appendChild(br);
            const flexBreak = document.createElement('div');
            flexBreak.className = 'chip-flex-break';
            container.appendChild(flexBreak);
            return;
        }

        // ── セパレーター ────────────────────────────────────────
        if (tag.type === 'separator') {
            const sep = document.createElement('div');
            sep.className = 'chip-separator';
            sep.dataset.index = index;
            sep.dataset.tagData = JSON.stringify(tag);
            if (tag.name) {
                const lbl = document.createElement('span');
                lbl.className = 'chip-separator-label';
                lbl.textContent = tag.name;
                sep.appendChild(lbl);
            }
            sep.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
            sep.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); removeTagAtIndex(index, inputId); } });
            sep.addEventListener('dblclick', () => {
                const editEl = document.createElement('input');
                editEl.type = 'text';
                editEl.className = 'sep-label-edit';
                editEl.value = tag.name;
                sep.innerHTML = '';
                sep.appendChild(editEl);
                editEl.focus();
                editEl.select();
                const commit = () => {
                    const tagsList = parsePrompt(input.value);
                    if (tagsList[index]) { tagsList[index].name = editEl.value.trim(); input.value = stringifyPrompt(tagsList); }
                    input.dispatchEvent(new Event('input'));
                };
                editEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') input.dispatchEvent(new Event('input')); e.stopPropagation(); });
                editEl.addEventListener('blur', commit);
            });
            container.appendChild(sep);
            return;
        }

        // ── Wildcard チップ ─────────────────────────────────────
        if (tag.type === 'wildcard') {
            const chip = document.createElement('div');
            chip.className = 'prompt-chip type-wildcard';
            chip.dataset.index = index;
            chip.dataset.name = tag.name;
            chip.dataset.tagData = JSON.stringify(tag);
            chip.innerHTML = `<span class="chip-text">${tag.name}</span>`;
            chip.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
            chip.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); removeTagAtIndex(index, inputId); } });
            chip.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); removeTagAtIndex(index, inputId); };
            container.appendChild(chip);
            return;
        }

        // ── ランダムチップ ──────────────────────────────────────
        if (tag.type === 'random') {
            const chip = document.createElement('div');
            chip.className = 'prompt-chip type-random';
            chip.dataset.index = index;
            chip.dataset.name = tag.name;
            chip.dataset.tagData = JSON.stringify(tag);
            chip.title = i18n.t('chip_random_title');

            const scopeParts = tag.scope.split(':');
            const label = scopeParts[scopeParts.length - 1]; // 末尾だけ表示
            chip.innerHTML = `<span class="chip-text">🎲 ${label}</span>`;

            // クリック → その場で解決
            chip.addEventListener('click', () => {
                const resolved = resolveRandomChips([tag], State.allTags);
                const input = document.getElementById(inputId);
                const tagsList = parsePrompt(input.value);
                tagsList[index] = resolved[0];
                input.value = stringifyPrompt(tagsList);
                input.dispatchEvent(new Event('input'));
            });

            chip.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
            chip.addEventListener('auxclick', (e) => {
                if (e.button === 1) { e.preventDefault(); removeTagAtIndex(index, inputId); }
            });

            container.appendChild(chip);
            return;
        }

        const chip = document.createElement('div');
        const isDisabled = currentDisabled.has(tag.name);
        
        let catClass = '';
        if (State.allTags) {
            const tagName = tag.name;

            // Use recorded source category if available
            const recordedCatId = State.tagColorMap?.get(tagName);
            if (recordedCatId) {
                const recordedCat = State.allTags.find(c => c.id === recordedCatId);
                if (recordedCat) catClass = `cat-${recordedCat.color || recordedCat.id}`;
            }

            if (!catClass) {
                const nodeMatches = (n) => {
                    if (n.type !== 'tag') return false;
                    if (n.name === tagName) return true;
                    if (!n.value) return false;
                    return n.value.split(',').map(v => v.trim()).includes(tagName);
                };
                const findInTree = (nodes) => {
                    for (const n of nodes) {
                        if (nodeMatches(n)) return true;
                        if (n.children && findInTree(n.children)) return true;
                    }
                    return false;
                };
                for (const cat of State.allTags) {
                    if (cat.children && findInTree(cat.children)) {
                        catClass = `cat-${cat.color || cat.id}`;
                        break;
                    }
                }
            }
        }
        
        const isSelected = State.selectedChips.has(tag.name);
        const isEmbedding = tag.name.startsWith('embedding:') ||
            (State.allAssets?.embeddings?.some(e => e.name === tag.name));
        const isLoraType = tag.type === 'lora';
        const embClass = isEmbedding ? 'type-embedding' : (tag.type ? 'type-' + tag.type : '');
        const appliedCatClass = (isEmbedding || isLoraType) ? '' : catClass;
        chip.className = `prompt-chip ${embClass} ${isDisabled ? 'is-disabled' : ''} ${appliedCatClass} ${appliedCatClass ? 'cat-colored' : ''} ${isSelected ? 'selected' : ''}`;

        // Manual color override (highest priority)
        const overrideColor = State.chipColorOverride?.get(tag.name);
        if (overrideColor) {
            chip.style.setProperty('--cat-accent', overrideColor);
            chip.style.setProperty('--cat-accent-rgb', hexToRgb(overrideColor));
            chip.classList.add('cat-colored');
        }

        chip.dataset.index = index;
        chip.dataset.name = tag.name;
        chip.dataset.tagData = JSON.stringify(tag);

        // Content
        const text = document.createElement('span');
        text.className = 'chip-text';
        text.textContent = tag.name;
        chip.appendChild(text);

        if (tag.weight !== null) {
            const weight = document.createElement('span');
            weight.className = 'chip-weight';
            weight.textContent = parseFloat(tag.weight.toFixed(2)).toString();
            chip.appendChild(weight);
        }

        // Hover popup for LoRA / Embedding chips
        const isLoraChip = tag.type === 'lora';
        if (isLoraChip || isEmbedding) {
            let hoverTimer = null;
            let hideTimer = null;
            const assetType = isLoraChip ? 'lora' : 'embedding';

            const scheduleHide = () => {
                hideTimer = setTimeout(() => {
                    const popup = document.getElementById('chip-asset-popup');
                    if (popup && !popup.matches(':hover')) hideAssetPopup();
                }, 120);
            };

            const cancelHide = () => clearTimeout(hideTimer);

            let _lastChipMouseEvent = null;
            chip.addEventListener('mouseenter', (e) => {
                cancelHide();
                _lastChipMouseEvent = e;
                hoverTimer = setTimeout(() => showAssetPopup(_lastChipMouseEvent, tag, assetType), 400);
            });
            chip.addEventListener('mousemove', (e) => {
                // 表示前のみ追従、表示後は固定してポップアップ内をクリックしやすくする
                if (!document.getElementById('chip-asset-popup')?.classList.contains('visible')) {
                    _lastChipMouseEvent = e;
                }
            });
            chip.addEventListener('mouseleave', () => {
                clearTimeout(hoverTimer);
                scheduleHide();
            });

            // Keep popup open when mouse is over it
            chip._assetPopupCancelHide = cancelHide;
            chip._assetPopupScheduleHide = scheduleHide;
        }

        // Interaction: Ctrl+Wheel to change weight (bulk if chips are selected)
        chip.onwheel = (e) => {
            if (!e.ctrlKey) return;
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.1 : -0.1;
            const tagsList = parsePrompt(input.value);
            if (State.selectedChips.size > 0 && State.selectedChips.has(tag.name)) {
                tagsList.forEach(t => {
                    if (State.selectedChips.has(t.name)) {
                        const cur = t.weight !== null ? t.weight : 1.0;
                        t.weight = parseFloat(Math.max(0.1, Math.min(10.0, cur + delta)).toFixed(1));
                    }
                });
            } else if (tagsList[index]) {
                const cur = tagsList[index].weight !== null ? tagsList[index].weight : 1.0;
                tagsList[index].weight = parseFloat(Math.max(0.1, Math.min(10.0, cur + delta)).toFixed(1));
            }
            input.value = stringifyPrompt(tagsList);
            input.dispatchEvent(new Event('input'));
        };

        // Interaction: Single-click to edit inline, Ctrl+click to select, Double-click to toggle disabled
        let clickTimer = null;
        chip.onclick = (e) => {
            if (chip.classList.contains('editing')) return;
            // Ctrl/Cmd+click → 選択トグル（編集しない）
            if (e.ctrlKey || e.metaKey) {
                if (State.selectedChips.has(tag.name)) {
                    State.selectedChips.delete(tag.name);
                    chip.classList.remove('selected');
                } else {
                    State.selectedChips.add(tag.name);
                    chip.classList.add('selected');
                }
                window.dispatchEvent(new CustomEvent('selection-changed'));
                return;
            }
            clearTimeout(clickTimer);
            clickTimer = setTimeout(() => startInlineEdit(chip, tag, index, input), 220);
        };

        chip.ondblclick = (e) => {
            clearTimeout(clickTimer);
            toggleTagDisabled(tag.name, isNeg);
        };

        // Middle-click: Remove tag (preventDefault on mousedown suppresses Chromium autoscroll)
        chip.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
        chip.addEventListener('auxclick', (e) => {
            if (e.button === 1) { e.preventDefault(); hideAssetPopup(); removeTagAtIndex(index, inputId); }
        });

        // Right-click: Chip context menu
        chip.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            showChipMenu(e.clientX, e.clientY, { chip, tag, index, input, inputId, isNeg, isSuffix });
        };

        container.appendChild(chip);
    });

    // --- Initialize Marquee Selection ---
    if (!container.dataset.marqueeInitialized) {
        new MarqueeSelector(container, '.prompt-chip', (selection) => {
            // No action needed
        }, State.selectedChips);
        container.dataset.marqueeInitialized = 'true';

        // quick-add にフォーカスがある状態でチップエリアをクリックしたら blur する
        container.addEventListener('mousedown', () => {
            const active = document.activeElement;
            if (active && (active.id === 'quick-add-positive' || active.id === 'quick-add-negative' || active.id === 'quick-add-comfy')) {
                active.blur();
            }
        });
    }

    // --- Initialize Sortable for Chips ---
    if (!container.dataset.sortableInitialized) {
        let _dragStartSel = []; // onStart でスナップショット、onEnd で使用

        Sortable.create(container, {
            animation: 150,
            group: { name: 'prompt-chips', pull: true, put: ['prompt-chips', 'tags'] },
            ghostClass: 'sortable-ghost',
            filter: '.chip-edit-input',
            onStart: () => {
                // ドラッグ開始時点の選択チップを DOM 順で記録
                _dragStartSel = Array.from(container.querySelectorAll('.prompt-chip.selected'));
            },
            onAdd: (evt) => {
                // Library tag button dropped onto chip container
                if (!evt.item.classList.contains('tag-btn')) return;
                const tagValue = evt.item.dataset.tagValue;
                const tagName  = evt.item.dataset.tagName;
                const dropIdx  = evt.newIndex;
                evt.item.remove(); // remove the cloned button
                if (!tagValue) return;
                const tags = parsePrompt(input.value);
                const rawIncoming = tagValue.split(',').map(t => t.trim()).filter(Boolean);
                const incomingObjs = parsePrompt(rawIncoming.join(', '));
                const existingLower = tags.filter(t => t.type !== 'break').map(t => t.name.toLowerCase());
                const allPresent = incomingObjs.every(inc => existingLower.includes(inc.name.toLowerCase()));
                if (allPresent) {
                    const incomingLower = incomingObjs.map(inc => inc.name.toLowerCase());
                    input.value = stringifyPrompt(tags.filter(t => t.type === 'break' || !incomingLower.includes(t.name.toLowerCase())));
                } else {
                    const toInsert = incomingObjs.filter(inc => !existingLower.includes(inc.name.toLowerCase()));
                    tags.splice(dropIdx, 0, ...toInsert);
                    input.value = stringifyPrompt(tags);
                }
                input.dispatchEvent(new Event('input'));
            },
            onEnd: (evt) => {
                const isCrossPane = evt.from !== evt.to;

                // 複数選択中かつドラッグしたチップが選択中 → 残りも一括移動
                const others = _dragStartSel.filter(el => el !== evt.item && el.isConnected);
                if (others.length > 0 && _dragStartSel.includes(evt.item)) {
                    others.forEach(el => el.remove());
                    let ref = evt.item;
                    for (const el of others) {
                        ref.after(el);
                        ref = el;
                    }
                }
                _dragStartSel = [];

                if (isCrossPane) {
                    // Library drags are handled by onAdd — skip here
                    if (!_containerToInputMap[evt.from.id]) return;
                    const srcInput = document.getElementById(_containerToInputMap[evt.from.id]);
                    const dstInput = document.getElementById(_containerToInputMap[evt.to.id] || 'positive-prompt');
                    const readTags = (el) =>
                        Array.from(el.querySelectorAll('.prompt-chip, .chip-separator'))
                            .map(c => JSON.parse(c.dataset.tagData));
                    const srcTags = readTags(evt.from);
                    const dstTags = readTags(evt.to);
                    srcInput.value = stringifyPrompt(srcTags);
                    dstInput.value = stringifyPrompt(dstTags);
                    srcInput.dispatchEvent(new Event('input'));
                    dstInput.dispatchEvent(new Event('input'));
                } else {
                    const newTags = Array.from(container.querySelectorAll('.prompt-chip, .chip-separator'))
                        .map(el => JSON.parse(el.dataset.tagData));
                    input.value = stringifyPrompt(newTags);
                    input.dispatchEvent(new Event('input'));
                }
            },
        });
        container.dataset.sortableInitialized = 'true';
    }
}

function startInlineEdit(chip, tag, index, input) {
    chip.classList.add('editing');
    const textEl = chip.querySelector('.chip-text');

    const editInput = document.createElement('input');
    editInput.type = 'text';
    editInput.className = 'chip-edit-input';
    editInput.value = tag.name;
    // Prevent Sortable from initiating drag while typing
    editInput.onmousedown = (e) => e.stopPropagation();

    textEl.replaceWith(editInput);
    editInput.focus();
    editInput.select();

    const commit = () => {
        if (!chip.classList.contains('editing')) return;
        chip.classList.remove('editing');
        document.removeEventListener('mousedown', onDocMouseDown);
        const newName = editInput.value.trim();
        if (newName && newName !== tag.name) {
            const tagsList = parsePrompt(input.value);
            if (tagsList[index]) {
                tagsList[index].name = newName;
                input.value = stringifyPrompt(tagsList);
            }
        }
        input.dispatchEvent(new Event('input'));
    };

    const onDocMouseDown = (e) => {
        if (e.target !== editInput) commit();
    };
    document.addEventListener('mousedown', onDocMouseDown);

    editInput.onkeydown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') {
            e.preventDefault();
            if (!chip.classList.contains('editing')) return;
            chip.classList.remove('editing');
            document.removeEventListener('mousedown', onDocMouseDown);
            input.dispatchEvent(new Event('input'));
        }
        e.stopPropagation();
    };
}

function toggleTagDisabled(name, isNeg) {
    const set = isNeg ? State.disabledTagsNegative : State.disabledTagsPositive;
    if (set.has(name)) set.delete(name);
    else set.add(name);

    renderPromptChips(
        isNeg ? 'negative-chips' : 'positive-chips',
        isNeg ? 'negative-prompt' : 'positive-prompt'
    );
    if (!isNeg) renderPromptChips('positive-suffix-chips', 'positive-suffix-prompt');
}

function removeTagAtIndex(index, inputId) {
    const input = document.getElementById(inputId);
    const tags = parsePrompt(input.value);
    tags.splice(index, 1);
    input.value = stringifyPrompt(tags);
    input.dispatchEvent(new Event('input'));
}

function insertBreakAfter(index, input) {
    const tags = parsePrompt(input.value);
    tags.splice(index + 1, 0, { name: 'BR', type: 'break', weight: null });
    input.value = stringifyPrompt(tags);
    input.dispatchEvent(new Event('input'));
}

function showChipMenu(x, y, ctx) {
    closeChipMenu();
    hideAssetPopup();

    const menu = document.createElement('div');
    menu.id = 'chip-context-menu';
    menu.className = 'chip-ctx-menu';

    const isChipDisabled = (ctx.isNeg ? State.disabledTagsNegative : State.disabledTagsPositive).has(ctx.tag.name);
    const _moveChip = (fromInputId, toInputId, tag, index) => {
        const fromEl = document.getElementById(fromInputId);
        const toEl   = document.getElementById(toInputId);
        if (!fromEl || !toEl) return;
        const fromTags = parsePrompt(fromEl.value);
        fromTags.splice(index, 1);
        fromEl.value = stringifyPrompt(fromTags);
        toEl.value = toEl.value
            ? toEl.value.trimEnd() + ', ' + stringifyPrompt([tag]).trim()
            : stringifyPrompt([tag]).trim();
        fromEl.dispatchEvent(new Event('input'));
        toEl.dispatchEvent(new Event('input'));
    };
    const items = [
        { label: i18n.t('chip_menu_edit'), action: () => { startInlineEdit(ctx.chip, ctx.tag, ctx.index, ctx.input); } },
        { label: i18n.t('chip_menu_insert_break'), action: () => { insertBreakAfter(ctx.index, ctx.input); } },
        { label: i18n.t('chip_menu_delete'), action: () => { removeTagAtIndex(ctx.index, ctx.inputId); } },
        { label: isChipDisabled ? i18n.t('chip_menu_enable') : i18n.t('chip_menu_disable'), action: () => { toggleTagDisabled(ctx.tag.name, ctx.isNeg); } },
        ...(!ctx.isNeg && !ctx.isSuffix ? [{ label: i18n.t('chip_menu_move_to_suffix'), action: () => _moveChip('positive-prompt', 'positive-suffix-prompt', ctx.tag, ctx.index) }] : []),
        ...(ctx.isSuffix ? [{ label: i18n.t('chip_menu_move_to_main'), action: () => _moveChip('positive-suffix-prompt', 'positive-prompt', ctx.tag, ctx.index) }] : []),
        { label: i18n.t('chip_menu_register_tag'), action: () => {
            const catId = State.currentCategoryId || (State.allTags[0]?.id ?? '');
            openAddTagModal(catId, State.currentGroupName || '', null);
            const valField = document.getElementById('new-tag-val');
            if (valField) {
                const selected = getSelectedChipsOrdered();
                valField.value = selected.length > 0 ? selected.join(', ') : stringifyPrompt([ctx.tag]).trim();
            }
        }},
        { label: i18n.t('chip_menu_set_weight'), action: async () => {
            const current = ctx.tag.weight !== null ? ctx.tag.weight : 1.0;
            const result = await showInputDialog(i18n.t('chip_weight_dialog'), current.toFixed(2));
            if (result === null) return;
            const val = parseFloat(result);
            if (isNaN(val)) return;
            const clamped = parseFloat(Math.max(0.01, Math.min(10.0, val)).toFixed(2));
            const tagsList = parsePrompt(ctx.input.value);
            if (tagsList[ctx.index]) {
                tagsList[ctx.index].weight = clamped;
                ctx.input.value = stringifyPrompt(tagsList);
                ctx.input.dispatchEvent(new Event('input'));
            }
        }},
        { label: i18n.t('chip_menu_insert_sep'), action: async () => {
            const label = await showInputDialog('Separator label (optional)', '', { allowEmpty: true });
            if (label === null) return;
            const tagsList = parsePrompt(ctx.input.value);
            tagsList.splice(ctx.index + 1, 0, { name: label || '', type: 'separator', weight: null });
            ctx.input.value = stringifyPrompt(tagsList);
            ctx.input.dispatchEvent(new Event('input'));
        }},
    ];

    // Embedding notation toggle
    const isEmbChip = ctx.tag.name.startsWith('embedding:') ||
        (State.allAssets?.embeddings?.some(e => e.name === ctx.tag.name));
    if (isEmbChip) {
        const isComfyNotation = ctx.tag.name.startsWith('embedding:');
        items.push({
            label: isComfyNotation ? i18n.t('chip_menu_emb_webui') : i18n.t('chip_menu_emb_comfy'),
            action: () => {
                const tagsList = parsePrompt(ctx.input.value);
                if (!tagsList[ctx.index]) return;
                const cur = tagsList[ctx.index].name;
                tagsList[ctx.index].name = isComfyNotation
                    ? cur.slice('embedding:'.length)
                    : 'embedding:' + cur;
                ctx.input.value = stringifyPrompt(tagsList);
                ctx.input.dispatchEvent(new Event('input'));
            }
        });
    }

    // Mode B: inject "🎨 スタイルを適用" only when style palette has active selections
    if (hasActiveStyle()) {
        items.splice(1, 0, {
            label: i18n.t('chip_menu_apply_style'),
            action: () => {
                const tagsList = parsePrompt(ctx.input.value);
                if (!tagsList[ctx.index]) return;
                tagsList[ctx.index].name = applyStyleToValue(tagsList[ctx.index].name);
                ctx.input.value = stringifyPrompt(tagsList);
                ctx.input.dispatchEvent(new Event('input'));
                closeIfAutoClose();
            }
        });
    }

    items.forEach(({ label, action }) => {
        const item = document.createElement('div');
        item.className = 'chip-ctx-item';
        item.textContent = label;
        item.addEventListener('mousedown', (e) => { e.preventDefault(); closeChipMenu(); action(); });
        menu.appendChild(item);
    });

    // Color palette section
    const PALETTE_COLORS = [
        '#ef4444','#f97316','#eab308','#22c55e',
        '#14b8a6','#3b82f6','#8b5cf6','#ec4899',
        '#f43f5e','#64748b','#a16207','#ffffff',
    ];
    const applyColor = (color) => {
        const targets = (State.selectedChips.size > 0 && State.selectedChips.has(ctx.tag.name))
            ? [...State.selectedChips]
            : [ctx.tag.name];
        targets.forEach(name => State.chipColorOverride.set(name, color));
        saveChipColorOverride();
        ctx.input.dispatchEvent(new Event('input'));
    };
    const hasOverride = State.chipColorOverride.has(ctx.tag.name);

    const sep = document.createElement('div');
    sep.className = 'chip-ctx-sep';
    menu.appendChild(sep);

    const paletteRow = document.createElement('div');
    paletteRow.className = 'chip-ctx-palette';
    PALETTE_COLORS.forEach(color => {
        const swatch = document.createElement('div');
        swatch.className = 'chip-ctx-swatch';
        swatch.style.background = color;
        if (color === '#ffffff') swatch.style.border = '1px solid #475569';
        swatch.title = color;
        swatch.addEventListener('mousedown', (e) => { e.preventDefault(); closeChipMenu(); applyColor(color); });
        paletteRow.appendChild(swatch);
    });
    menu.appendChild(paletteRow);

    // Custom color picker — full-width button below palette
    const customBtn = document.createElement('div');
    customBtn.className = 'chip-ctx-custom-btn';
    customBtn.textContent = '+ Custom…';
    customBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        closeChipMenu();
        const picker = document.createElement('input');
        picker.type = 'color';
        picker.value = State.chipColorOverride.get(ctx.tag.name) || '#6366f1';
        picker.style.display = 'none';
        document.body.appendChild(picker);
        picker.addEventListener('change', () => { applyColor(picker.value); picker.remove(); });
        picker.addEventListener('blur', () => picker.remove());
        picker.click();
    });
    menu.appendChild(customBtn);

    if (hasOverride) {
        const resetItem = document.createElement('div');
        resetItem.className = 'chip-ctx-item';
        resetItem.textContent = i18n.t('chip_menu_reset_color');
        resetItem.addEventListener('mousedown', (e) => {
            e.preventDefault();
            closeChipMenu();
            const targets = (State.selectedChips.size > 0 && State.selectedChips.has(ctx.tag.name))
                ? [...State.selectedChips]
                : [ctx.tag.name];
            targets.forEach(name => State.chipColorOverride.delete(name));
            saveChipColorOverride();
            ctx.input.dispatchEvent(new Event('input'));
        });
        menu.appendChild(resetItem);
    }

    document.body.appendChild(menu);

    // Position (keep within viewport)
    const rect = menu.getBoundingClientRect();
    menu.style.left = Math.min(x, window.innerWidth - rect.width - 8) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - rect.height - 8) + 'px';

    setTimeout(() => document.addEventListener('mousedown', closeChipMenu, { once: true }), 0);
}

function closeChipMenu() {
    document.getElementById('chip-context-menu')?.remove();
}

// --- Asset Hover Popup (LoRA / Embedding) ---

function showAssetPopup(e, tag, assetType) {
    const assets = assetType === 'lora'
        ? (State.allAssets?.loras || [])
        : (State.allAssets?.embeddings || []);

    const assetName = tag.name.startsWith('embedding:') ? tag.name.slice('embedding:'.length) : tag.name;
    const asset = assets.find(a => a.name === assetName || a.name.endsWith('/' + assetName) || a.name.endsWith('\\' + assetName));

    const accentColor = assetType === 'lora' ? 'rgba(14,165,233,0.8)' : 'rgba(34,197,94,0.8)';

    let popup = document.getElementById('chip-asset-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'chip-asset-popup';
        document.body.appendChild(popup);
    }

    const displayName = assetName.split(/[/\\]/).pop();
    const triggerWords = asset?.triggerWords || [];

    popup.innerHTML = `
        ${asset?.thumbnail ? `<img class="popup-thumb" src="${asset.thumbnail}" alt="">` : ''}
        <div class="popup-content">
            <div class="popup-name">${displayName}</div>
            <div class="popup-meta" style="margin-top:0.3rem;">
                <span class="popup-badge" style="border-left:3px solid ${accentColor}">${assetType.toUpperCase()}</span>
            </div>
            ${triggerWords.length > 0 ? `
                <div class="popup-trigger-label">トリガーワード</div>
                <div class="popup-trigger-words">
                    ${triggerWords.map(w => `<span class="popup-trigger-pill" data-word="${w.replace(/"/g, '&quot;')}">${w}</span>`).join('')}
                </div>
            ` : `<div class="popup-trigger-label" style="color:var(--slate-500)">${i18n.t('chip_no_trigger_words')}</div>`}
        </div>
    `;

    popup.style.borderColor = accentColor;
    popup.style.boxShadow = `0 20px 50px rgba(0,0,0,0.5), 0 0 20px ${accentColor}44`;
    if (asset?.thumbnail) {
        popup.classList.add('has-image');
        popup.classList.remove('compact');
    } else {
        popup.classList.add('compact');
        popup.classList.remove('has-image');
    }

    // Trigger word click → add to prompt
    popup.querySelectorAll('.popup-trigger-pill').forEach(pill => {
        pill.addEventListener('mousedown', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            addToPrompt(pill.dataset.word);
        });
    });

    // Keep popup alive while hovering over it
    popup.onmouseenter = () => {
        document.querySelectorAll('.prompt-chip').forEach(c => c._assetPopupCancelHide?.());
    };
    popup.onmouseleave = () => {
        document.querySelectorAll('.prompt-chip').forEach(c => c._assetPopupScheduleHide?.());
    };

    popup.classList.add('visible');
    positionAssetPopup(e);
}

function positionAssetPopup(e) {
    const popup = document.getElementById('chip-asset-popup');
    if (!popup?.classList.contains('visible')) return;
    const margin = 16;
    let x = e.clientX + margin;
    let y = e.clientY + margin;
    const rect = popup.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) x = e.clientX - rect.width - margin;
    if (y + rect.height > window.innerHeight) y = e.clientY - rect.height - margin;
    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;
}

function hideAssetPopup() {
    const popup = document.getElementById('chip-asset-popup');
    if (popup) popup.classList.remove('visible');
}
