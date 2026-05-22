/**
 * Prompt Chip UI Component for v4
 */
import { State } from '../core/state.js';
import { parsePrompt, stringifyPrompt, addToPrompt, resolveRandomChips } from '../prompt/engine.js';
import { openAddTagModal, showInputDialog } from './modals.js';
import { MarqueeSelector } from './selection.js';
import Sortable from 'sortablejs';
import { hasActiveStyle, applyStyleToValue, closeIfAutoClose } from './style-palette.js';
import { i18n } from '../core/i18n.js';

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

export function renderPromptChips(containerId, inputId) {
    const container = document.getElementById(containerId);
    const input = document.getElementById(inputId);
    if (!container || !input) return;

    const isNeg = inputId === 'negative-prompt';
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
            br.oncontextmenu = (e) => {
                e.preventDefault();
                e.stopPropagation();
                removeTagAtIndex(index, inputId);
            };
            container.appendChild(br);
            const flexBreak = document.createElement('div');
            flexBreak.className = 'chip-flex-break';
            container.appendChild(flexBreak);
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

            chip.oncontextmenu = (e) => {
                e.preventDefault();
                e.stopPropagation();
                removeTagAtIndex(index, inputId);
            };

            container.appendChild(chip);
            return;
        }

        const chip = document.createElement('div');
        const isDisabled = currentDisabled.has(tag.name);
        
        let catClass = '';
        if (State.allTags) {
            const tagName = tag.name;
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
        
        const isSelected = State.selectedChips.has(tag.name);
        const isEmbedding = tag.name.startsWith('embedding:') ||
            (State.allAssets?.embeddings?.some(e => e.name === tag.name));
        const isLoraType = tag.type === 'lora';
        const embClass = isEmbedding ? 'type-embedding' : (tag.type ? 'type-' + tag.type : '');
        const appliedCatClass = (isEmbedding || isLoraType) ? '' : catClass;
        chip.className = `prompt-chip ${embClass} ${isDisabled ? 'is-disabled' : ''} ${appliedCatClass} ${appliedCatClass ? 'cat-colored' : ''} ${isSelected ? 'selected' : ''}`;
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

            chip.addEventListener('mouseenter', (e) => {
                cancelHide();
                hoverTimer = setTimeout(() => showAssetPopup(e, tag, assetType), 400);
            });
            chip.addEventListener('mousemove', (e) => {
                if (document.getElementById('chip-asset-popup')?.classList.contains('visible')) {
                    positionAssetPopup(e);
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

        // Interaction: Wheel to change weight
        chip.onwheel = (e) => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.1 : -0.1;
            const currentWeight = tag.weight !== null ? tag.weight : 1.0;
            const newWeight = Math.max(0.1, Math.min(2.0, currentWeight + delta));

            const tagsList = parsePrompt(input.value);
            if (tagsList[index]) {
                tagsList[index].weight = parseFloat(newWeight.toFixed(1)); // 0.1 step
                input.value = stringifyPrompt(tagsList);
                // Trigger input event to sync and re-render
                input.dispatchEvent(new Event('input'));
            }
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

        // Middle-click: Remove tag
        chip.addEventListener('auxclick', (e) => {
            if (e.button === 1) { e.preventDefault(); hideAssetPopup(); removeTagAtIndex(index, inputId); }
        });

        // Right-click: Chip context menu
        chip.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            showChipMenu(e.clientX, e.clientY, { chip, tag, index, input, inputId, isNeg });
        };

        container.appendChild(chip);
    });

    // --- Initialize Marquee Selection ---
    if (!container.dataset.marqueeInitialized) {
        new MarqueeSelector(container, '.prompt-chip', (selection) => {
            // No action needed
        }, State.selectedChips);
        container.dataset.marqueeInitialized = 'true';
    }

    // --- Initialize Sortable for Chips ---
    if (!container.dataset.sortableInitialized) {
        let _dragStartSel = []; // onStart でスナップショット、onEnd で使用

        Sortable.create(container, {
            animation: 150,
            group: { name: 'prompt-chips', pull: true, put: true },
            ghostClass: 'sortable-ghost',
            filter: '.chip-edit-input',
            onStart: () => {
                // ドラッグ開始時点の選択チップを DOM 順で記録
                _dragStartSel = Array.from(container.querySelectorAll('.prompt-chip.selected'));
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
                    const srcInput = document.getElementById(
                        evt.from.id === 'positive-chips' ? 'positive-prompt' : 'negative-prompt'
                    );
                    const dstInput = document.getElementById(
                        evt.to.id === 'positive-chips' ? 'positive-prompt' : 'negative-prompt'
                    );
                    const readTags = (el) =>
                        Array.from(el.querySelectorAll('.prompt-chip'))
                            .map(c => JSON.parse(c.dataset.tagData));
                    const srcTags = readTags(evt.from);
                    const dstTags = readTags(evt.to);
                    srcInput.value = stringifyPrompt(srcTags);
                    dstInput.value = stringifyPrompt(dstTags);
                    srcInput.dispatchEvent(new Event('input'));
                    dstInput.dispatchEvent(new Event('input'));
                } else {
                    const newTags = Array.from(container.querySelectorAll('.prompt-chip'))
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
        const newName = editInput.value.trim();
        chip.classList.remove('editing');
        if (newName && newName !== tag.name) {
            const tagsList = parsePrompt(input.value);
            if (tagsList[index]) {
                tagsList[index].name = newName;
                input.value = stringifyPrompt(tagsList);
            }
        }
        input.dispatchEvent(new Event('input'));
    };

    editInput.onkeydown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); chip.classList.remove('editing'); input.dispatchEvent(new Event('input')); }
        e.stopPropagation();
    };

    editInput.onblur = commit;
}

function toggleTagDisabled(name, isNeg) {
    const set = isNeg ? State.disabledTagsNegative : State.disabledTagsPositive;
    if (set.has(name)) set.delete(name);
    else set.add(name);
    
    renderPromptChips(
        isNeg ? 'negative-chips' : 'positive-chips', 
        isNeg ? 'negative-prompt' : 'positive-prompt'
    );
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

    const items = [
        { label: i18n.t('chip_menu_edit'), action: () => { startInlineEdit(ctx.chip, ctx.tag, ctx.index, ctx.input); } },
        { label: i18n.t('chip_menu_insert_break'), action: () => { insertBreakAfter(ctx.index, ctx.input); } },
        { label: i18n.t('chip_menu_delete'), action: () => { removeTagAtIndex(ctx.index, ctx.inputId); } },
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
            const clamped = parseFloat(Math.max(0.01, Math.min(2.0, val)).toFixed(2));
            const tagsList = parsePrompt(ctx.input.value);
            if (tagsList[ctx.index]) {
                tagsList[ctx.index].weight = clamped;
                ctx.input.value = stringifyPrompt(tagsList);
                ctx.input.dispatchEvent(new Event('input'));
            }
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
