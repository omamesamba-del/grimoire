/**
 * UI Library Component for v4 - Robust Tag and Group Rendering
 */
import { State, toggleAssetFavorite, removeTagUsage, resetTagUsage } from '../core/state.js';
import { saveTagOrder } from '../tags/service.js';
import { addToPrompt } from '../prompt/engine.js';
import { searchAssets, loadAssets } from '../assets/service.js';
import { openAddTagModal, openAddGroupModal } from './modals.js';
import { findNodeContext, renderExplorer, getFrequentTree, getFavoriteTree } from './explorer.js';
import { MarqueeSelector } from './selection.js';
import { i18n } from '../core/i18n.js';
import { IPC } from '../core/ipc.js';
import Sortable, { MultiDrag } from 'sortablejs';
import { hasActiveStyle, applyStyleToValue, closeIfAutoClose } from './style-palette.js';
import { PALETTE_CSS_VAR } from '../core/palette.js';
import { applyPbSettingsFromAsset } from './checkpointEdit.js';

// Track Sortable instances to destroy them before re-rendering
const tagGridSortables = [];

/**
 * Renders a list of nodes (Tags and Groups) into the Grid
 */
export function renderTagGrid(nodes = State.currentTags, targetContainer = null, color = null, parentPath = '', scopePath = '') {
    const grid = targetContainer || document.getElementById('tag-grid');
    if (!grid) return;

    // If we're at the root, find the current category color if not provided.
    // Skip during tag search — each flat section carries its own color.
    if (!targetContainer && !color && State.currentCategoryId && !State.isTagSearch) {
        const cat = State.allTags.find(c => c.id === State.currentCategoryId);
        if (cat) {
            color = cat.color;
            // Initialize scopePath from category name when entering at root level
            if (!scopePath) scopePath = cat.name;
        }
    }

    if (!targetContainer) {
        // Clean up frequent-view clear button
        document.getElementById('freq-clear-all-btn')?.remove();

        grid.classList.toggle('is-favorite-view', !!State.isFavoriteView);
        // Destroy existing Sortable instances before clearing DOM
        tagGridSortables.forEach(s => { try { s.destroy(); } catch (_) {} });
        tagGridSortables.length = 0;
        grid.innerHTML = '';

        // --- Initialize Marquee Selection ---
        if (!grid.dataset.marqueeInitialized) {
            new MarqueeSelector(grid, '.tag-btn', () => {
                // Refresh selection view if needed
            });
            grid.dataset.marqueeInitialized = 'true';
        }
    }

    // Separate items
    const tags = nodes.filter(n => n.type === 'tag');
    const sections = nodes.filter(n => n.type === 'group' || n.type === 'category' || (n.id && n.children)); // Groups or Categories

    // Root toolbar: show at the leaf-group level so +tag/+group never disappears
    // Suppressed during search (isTagSearch) because results span multiple categories
    if (!targetContainer && !State.isFavoriteView && !State.isFrequentView && !State.isTagSearch && State.currentMode === 'tags' && State.currentCategoryId) {
        grid.appendChild(createRootToolbar(State.currentCategoryId, State.currentGroupName || ''));
    }

    if (!targetContainer && (!nodes || nodes.length === 0)) {
        const noRes = document.createElement('div');
        noRes.className = 'no-results';
        noRes.setAttribute('data-i18n', 'toast_no_results');
        noRes.textContent = 'No tags found in this section...';
        grid.appendChild(noRes);
        return;
    }

    // 1. Render direct tags in a grid
    if (tags.length > 0) {
        const tagGrid = document.createElement('div');
        tagGrid.className = State.viewMode === 'list' ? 'btn-grid list-view' : 'btn-grid';
        if (!targetContainer && State.currentGroupName) {
            tagGrid.dataset.groupId = State.currentGroupName;
        }
        tags.forEach(tag => tagGrid.appendChild(createTagButton(tag, color || tag.color)));
        grid.appendChild(tagGrid);

        // Initialize Sortable for root direct-tag view (deepest group level has no sections)
        if (!targetContainer && !State.isFavoriteView && !State.isFrequentView) {
            const sortableInst = Sortable.create(tagGrid, {
                group: 'tags',
                animation: 150,
                multiDrag: true,
                selectedClass: 'selected',
                multiDragKey: 'ctrl',
                ghostClass: 'sortable-ghost',
                onEnd: async (evt) => {
                    const { from, to, newIndex, items } = evt;
                    const movedItems = items.length > 0 ? items : [evt.item];
                    const movedTagIds = movedItems.map(el => el.dataset.id);
                    updateStateAfterDrag(movedTagIds, from.dataset.groupId, to.dataset.groupId, newIndex);
                    await saveTagOrder(State.allTags);
                    renderExplorer();
                }
            });
            tagGridSortables.push(sortableInst);
        }
    }

    // 2. Render nested groups or categories as indented sections
    sections.forEach(node => {
        const isCat = !node.type || node.type === 'category';
        const section = document.createElement('div');
        section.className = 'tag-group-section';
        if (isCat) section.classList.add('category-section');
        
        // Header with Title and Add Button
        const header = document.createElement('div');
        header.className = 'tag-section-header tag-section-title-wrap';

        // Breadcrumb path for Favorites flattening
        const currentPath = parentPath ? `${parentPath} / ${node.name}` : node.name;
        
        if (State.isFavoriteView) {
            section.classList.add('flat-section');
        } else {
            const effectiveColor = color || node.color;
            if (effectiveColor) {
                header.style.borderLeftColor = PALETTE_CSS_VAR[effectiveColor] || 'var(--glow-primary)';
            }
        }
        
        const title = document.createElement('h3');
        title.className = 'tag-section-title';

        const titleText = document.createElement('span');
        titleText.textContent = State.isFavoriteView ? currentPath : node.name;
        title.appendChild(titleText);

        // 🎲 ランダムチップ挿入ボタン（検索中・お気に入りビューは非表示）
        if (!State.isFavoriteView && !State.isTagSearch && scopePath) {
            const nodeScopePath = scopePath ? `${scopePath}:${node.name}` : node.name;
            const diceBtn = document.createElement('button');
            diceBtn.className = 'btn-random-chip';
            diceBtn.textContent = '🎲';
            diceBtn.title = i18n.t('dice_insert_from').replace('{name}', node.name);
            diceBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                addToPrompt(`[@${nodeScopePath}@]`);
            });
            title.appendChild(diceBtn);
        }

        header.appendChild(title);

        const actionContainer = document.createElement('div');
        actionContainer.className = 'header-actions';
        
        // Context determination
        const targetCatId = isCat ? node.id : (node.targetCatId || State.currentCategoryId);
        const targetGroupName = isCat ? '' : node.name;

        // Button 1: Add Tag
        const addTagBtn = document.createElement('div');
        addTagBtn.className = 'btn-add-inline';
        addTagBtn.innerHTML = '＋';
        addTagBtn.title = i18n.t('tooltip_add_tag');
        addTagBtn.onclick = (e) => {
            e.stopPropagation();
            if (targetCatId) openAddTagModal(targetCatId, targetGroupName);
        };
        
        // Button 2: Add Subgroup
        const addGroupBtn = document.createElement('div');
        addGroupBtn.className = 'btn-add-inline btn-add-group-inline';
        addGroupBtn.innerHTML = '⊞';
        addGroupBtn.title = i18n.t('tooltip_add_group');
        addGroupBtn.onclick = (e) => {
            e.stopPropagation();
            if (targetCatId) openAddGroupModal(targetCatId, targetGroupName);
        };

        actionContainer.appendChild(addTagBtn);
        actionContainer.appendChild(addGroupBtn);
        header.appendChild(actionContainer);
        
        section.appendChild(header);
        
        const nodeGrid = document.createElement('div');
        nodeGrid.className = State.viewMode === 'list' ? 'btn-grid list-view' : 'btn-grid';
        nodeGrid.dataset.groupId = node.id || node.name;
        
        // Render tags within this node
        const nodeTags = (node.children || []).filter(n => n.type === 'tag');
        nodeTags.forEach(tag => nodeGrid.appendChild(createTagButton(tag, color || node.color || tag.color)));
        
        // If we're in favorite view and this node HAS tags, add them to the section
        if (nodeTags.length > 0) {
            section.appendChild(nodeGrid);
            grid.appendChild(section);
        } else if (!State.isFavoriteView) {
            // In normal view, always show sections even if empty of immediate tags
            section.appendChild(nodeGrid);
            grid.appendChild(section);
        }

        // Recursive rendering for nested children
        const nestedChildren = (node.children || []).filter(n => n.type === 'group' || (n.children && !n.type));
        if (nestedChildren.length > 0) {
            // Tag them with parent context for addition
            nestedChildren.forEach(c => { c.targetCatId = targetCatId; });
            
            if (State.isFavoriteView) {
                // In Favorite view, flatten! Just call recursively on the SAME grid with path
                renderTagGrid(nestedChildren, grid, color || node.color, currentPath, '');
            } else {
                const nestedContainer = document.createElement('div');
                nestedContainer.className = 'nested-groups-container';
                nestedContainer.style.paddingLeft = '1.2rem';
                nestedContainer.style.borderLeft = '1px solid var(--border-color)';
                const nodeScopePath = scopePath ? `${scopePath}:${node.name}` : node.name;
                renderTagGrid(nestedChildren, nestedContainer, color || node.color, '', nodeScopePath);
                grid.appendChild(nestedContainer);
            }
        }
        
        // --- Initialize Sortable for this grid ---
        if (!State.isFavoriteView) {
            const sortableInst = Sortable.create(nodeGrid, {
                group: 'tags',
                animation: 150,
                multiDrag: true,
                selectedClass: 'selected',
                multiDragKey: 'ctrl', // Require CTRL to select multiple
                ghostClass: 'sortable-ghost',
                onEnd: async (evt) => {
                    const { from, to, newIndex, items } = evt;
                    // Handle multi-drag or single drag
                    const movedItems = items.length > 0 ? items : [evt.item];
                    const movedTagIds = movedItems.map(el => el.dataset.id);
                    
                    // Simple logic for reordering within or across groups in State.allTags
                    updateStateAfterDrag(movedTagIds, from.dataset.groupId, to.dataset.groupId, newIndex);
                    
                    await saveTagOrder(State.allTags);
                    renderExplorer();
                }
            });
            tagGridSortables.push(sortableInst);
        }
    });

    // 3. Show "Clear All" button pinned to bottom of tags-container when in frequent view
    if (!targetContainer && State.isFrequentView) {
        const clearBtn = document.createElement('button');
        clearBtn.id = 'freq-clear-all-btn';
        clearBtn.className = 'freq-clear-all-btn';
        clearBtn.textContent = i18n.t('btn_clear_freq');
        clearBtn.onclick = () => {
            if (confirm(i18n.t('confirm_clear_freq'))) {
                resetTagUsage();
                State.currentTags = getFrequentTree(State.allTags);
                window.dispatchEvent(new CustomEvent('renderGridReq'));
            }
        };
        // Append to #tags-container (outside #tag-scroll-wrapper) → always visible at bottom
        const tagsContainer = document.getElementById('tags-container');
        if (tagsContainer) tagsContainer.appendChild(clearBtn);
    }

}

/**
 * Creates a minimal toolbar with +tag and +group buttons for leaf-level grids
 * (used when there are no section headers to host these buttons)
 */
function createRootToolbar(catId, groupName) {
    const toolbar = document.createElement('div');
    toolbar.className = 'tag-section-header tag-section-title-wrap';

    // Show current category / group name
    const cat = State.allTags.find(c => c.id === catId);

    // Apply category color to left border
    if (cat?.color) {
        toolbar.style.borderLeftColor = PALETTE_CSS_VAR[cat.color] || 'var(--glow-primary)';
    }
    const nameEl = document.createElement('span');
    nameEl.className = 'root-toolbar-name';
    nameEl.textContent = groupName
        ? `${cat?.name || ''} › ${groupName}`
        : (cat?.name || '');

    // 🎲 ランダムチップ挿入ボタン
    const scopePath = groupName
        ? `${cat?.name || ''}:${groupName}`
        : (cat?.name || '');
    if (scopePath) {
        const diceBtn = document.createElement('button');
        diceBtn.className = 'btn-random-chip';
        diceBtn.textContent = '🎲';
        diceBtn.title = i18n.t('dice_insert_from').replace('{name}', groupName || cat?.name || '');
        diceBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            addToPrompt(`[@${scopePath}@]`);
        });
        nameEl.appendChild(diceBtn);
    }

    toolbar.appendChild(nameEl);

    const actions = document.createElement('div');
    actions.className = 'header-actions';

    const addTagBtn = document.createElement('div');
    addTagBtn.className = 'btn-add-inline';
    addTagBtn.innerHTML = '＋';
    addTagBtn.title = i18n.t('tooltip_add_tag');
    addTagBtn.onclick = (e) => { e.stopPropagation(); openAddTagModal(catId, groupName); };

    const addGroupBtn = document.createElement('div');
    addGroupBtn.className = 'btn-add-inline btn-add-group-inline';
    addGroupBtn.innerHTML = '⊞';
    addGroupBtn.title = i18n.t('tooltip_add_group');
    addGroupBtn.onclick = (e) => { e.stopPropagation(); openAddGroupModal(catId, groupName); };

    actions.appendChild(addTagBtn);
    actions.appendChild(addGroupBtn);
    toolbar.appendChild(actions);
    return toolbar;
}

function createTagButton(tag, color = null) {
    // YAMLインポートタグはidなし → セッション内で一意なIDを付与し、次回saveで永続化
    if (!tag.id) tag.id = `tag-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const btn = document.createElement('div');
    const colorClass = color ? `cat-${color}` : '';
    btn.className = `tag-btn ${colorClass}`;

    const listThumb = document.createElement('div');
    listThumb.className = 'tag-list-thumb';
    if (tag.thumbnail) listThumb.style.backgroundImage = `url("${tag.thumbnail}")`;
    btn.appendChild(listThumb);

    btn.appendChild(Object.assign(document.createElement('span'), { className: 'tag-name', textContent: tag.name }));
    
    // Attach Premium Popup
    attachPopupEvents(btn, {
        name: tag.name,
        value: tag.value,
        thumbnail: tag.thumbnail,
        type: 'tag'
    }, color);
    
    // Favorite Star Button
    const star = document.createElement('div');
    star.className = `star-btn ${tag.favorite ? 'active' : ''}`;
    star.innerHTML = '★';
    star.onclick = async (e) => {
        e.stopPropagation();
        tag.favorite = !tag.favorite;
        star.classList.toggle('active', tag.favorite);
        
        // Persist
        await saveTagOrder(State.allTags);
        
        // Refresh explorer (for counts/view)
        renderExplorer();
        
        // If we are IN favorite view, we must recalculate the tree to reflect the removal
        if (State.isFavoriteView) {
            State.currentTags = getFavoriteTree(State.allTags);
            window.dispatchEvent(new CustomEvent('renderGridReq'));
        }
    };
    btn.appendChild(star);

    // Frequent Remove Button (only in isFrequentView)
    if (State.isFrequentView) {
        const removeBtn = document.createElement('div');
        removeBtn.className = 'freq-remove-btn';
        removeBtn.innerHTML = '✕';
        removeBtn.title = i18n.t('btn_remove_from_freq');
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            removeTagUsage(tag.name);
            State.currentTags = getFrequentTree(State.allTags);
            window.dispatchEvent(new CustomEvent('renderGridReq'));
        };
        btn.appendChild(removeBtn);
    }

    // Usage count badge (shown when count > 0)
    const usageCount = State.tagUsageCount.get(tag.name) || 0;
    if (usageCount > 0) {
        const badge = document.createElement('span');
        badge.className = 'tag-usage-badge';
        badge.textContent = usageCount > 99 ? '99+' : String(usageCount);
        btn.appendChild(badge);
    }

    // Support for weight hints if available
    if (tag.value && tag.value !== tag.name) {
        const hint = document.createElement('span');
        hint.className = 'tag-hint';
        hint.textContent = tag.value.length > 20 ? tag.value.substring(0, 20) + '...' : tag.value;
        btn.appendChild(hint);
    }

    btn.dataset.id = tag.id;
    
    // Initial selection state
    if (State.selectedTags.has(tag.id)) {
        btn.classList.add('selected');
    }

    btn.onclick = (e) => {
        handleTagClick(e, tag, btn);
    };
    
    // Support for Context Menu -> Direct Edit for Tags
    btn.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Find context for editing
        const context = findNodeContext(State.allTags, tag.id);
        if (context) {
            openAddTagModal(context.catId, context.groupName, tag, context.groupPath);
        }
    };

    // --- Image Drag & Drop Support ---
    btn.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.add('drag-over');
    });

    btn.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.remove('drag-over');
    });

    btn.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            const file = files[0];
            if (file.type.startsWith('image/')) {
                try {
                    const buffer = await file.arrayBuffer();
                    const ext = file.name.split('.').pop().toLowerCase() || 'png';
                    const result = await IPC.registerTagImageBuffer(tag.value, buffer, ext);
                    if (result && result.success) {
                        tag.thumbnail = result.path;
                        await saveTagOrder(State.allTags);
                        window.dispatchEvent(new CustomEvent('renderGridReq'));
                    } else if (result && result.error) {
                        alert(`Failed to register image: ${result.error}`);
                    }
                } catch (err) {
                    console.error('[PBv4] D&D image registration failed:', err);
                    alert(`Image registration error: ${err.message}`);
                }
            }
        }
    });

    return btn;
}

/**
 * Advanced selection handler (Multi/Range)
 */
function handleTagClick(e, tag, el) {
    if (e.ctrlKey || e.metaKey) {
        // Toggle individual
        if (State.selectedTags.has(tag.id)) {
            State.selectedTags.delete(tag.id);
            el.classList.remove('selected');
        } else {
            State.selectedTags.add(tag.id);
            el.classList.add('selected');
            State.lastSelectedTagId = tag.id;
        }
    } else if (e.shiftKey && State.lastSelectedTagId) {
        // Range Selection
        const allTagElements = Array.from(document.querySelectorAll('.tag-btn'));
        const ids = allTagElements.map(btn => btn.dataset.id);
        const startIdx = ids.indexOf(State.lastSelectedTagId);
        const endIdx = ids.indexOf(tag.id);
        
        if (startIdx !== -1 && endIdx !== -1) {
            const min = Math.min(startIdx, endIdx);
            const max = Math.max(startIdx, endIdx);
            for (let i = min; i <= max; i++) {
                const id = ids[i];
                State.selectedTags.add(id);
                allTagElements[i].classList.add('selected');
            }
        }
    } else {
        if (State.selectedTags.size > 0 && !State.selectedTags.has(tag.id)) {
            State.selectedTags.clear();
            document.querySelectorAll('.tag-btn.selected').forEach(b => b.classList.remove('selected'));
        }
        // Mode A: if style palette has active selections and auto-apply is on, compose prefix + tag
        let finalValue = tag.value;
        let finalName = tag.name;
        if (hasActiveStyle() && State.pendingStyle.modeAEnabled) {
            finalValue = applyStyleToValue(tag.value);
            finalName = finalValue;
            closeIfAutoClose();
        }
        addToPrompt(finalValue, null, finalName);
        State.lastSelectedTagId = tag.id;

        // Update usage badge live
        const newCount = State.tagUsageCount.get(tag.name) || 0;
        let badge = el.querySelector('.tag-usage-badge');
        if (newCount > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'tag-usage-badge';
                el.appendChild(badge);
            }
            badge.textContent = newCount > 99 ? '99+' : String(newCount);
        } else if (badge) {
            badge.remove();
        }
    }
    window.dispatchEvent(new CustomEvent('selection-changed'));
}

/**
 * Updates State.allTags after SortableJS drag & drop
 */
function updateStateAfterDrag(movedIds, fromGroupId, toGroupId, insertIndex) {
    // 1. Find and remove nodes from source
    const movedNodes = [];
    
    // Helper to find and remove
    const removeNodes = (nodes) => {
        for (let i = nodes.length - 1; i >= 0; i--) {
            const node = nodes[i];
            if (movedIds.includes(node.id)) {
                movedNodes.unshift(nodes.splice(i, 1)[0]);
            } else if (node.children) {
                removeNodes(node.children);
            }
        }
    };
    
    removeNodes(State.allTags);
    
    // 2. Insert into target
    // Find target group array
    const findGroupAndInsert = (nodes) => {
        for (const node of nodes) {
            if (node.name === toGroupId || node.id === toGroupId) {
                node.children = node.children || [];
                node.children.splice(insertIndex, 0, ...movedNodes);
                return true;
            }
            if (node.children && findGroupAndInsert(node.children)) return true;
        }
        return false;
    };
    
    if (toGroupId === 'root' || !toGroupId) {
        State.allTags.splice(insertIndex, 0, ...movedNodes);
    } else {
        findGroupAndInsert(State.allTags);
    }
}

export function renderAssetGrid(query = '') {
    const grid = document.getElementById('asset-grid');
    if (!grid) return;

    grid.classList.toggle('list-view', State.viewMode === 'list');
    grid.style.display = State.viewMode === 'list' ? 'flex' : 'grid';

    const mode = State.currentMode || 'lora';

    
    // Clear selection when re-rendering
    State.selectedAssets.clear();
    State.lastSelectedAssetIndex = -1;

    // Safely clear DOM
    while (grid.firstChild) {
        grid.removeChild(grid.firstChild);
    }

    // Retrieve actual assets matching mode & query
    const assets = searchAssets(query, mode);
    grid._assets = assets; // store for Shift-click range selection
    

    if (assets.length === 0) {
        grid.style.display = 'flex';
        grid.style.flexDirection = 'column';
        grid.style.alignItems = 'center';
        grid.style.justifyContent = 'center';
        const noRes = document.createElement('div');
        noRes.className = 'no-results';
        const configuredPath = State.assetPaths?.[mode] || '';
        if (!configuredPath) {
            noRes.innerHTML = `<span style="font-size:2.5rem">📁</span><p>${i18n.t(`${mode}_no_path_hint`)}</p>`;
            noRes.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:0.75rem;opacity:0.5;text-align:center;padding:1rem;';
        } else {
            noRes.innerText = i18n.t(`${mode}_empty`);
        }
        grid.appendChild(noRes);
        return;
    }
    grid.style.display = State.viewMode === 'list' ? 'flex' : 'grid';
    grid.style.flexDirection = State.viewMode === 'list' ? 'column' : '';
    grid.style.alignItems = '';
    grid.style.justifyContent = '';

    // Safely iterate over the collection, supporting both real arrays and C# proxy objects
    for (let i = 0; i < assets.length; i++) {
        let asset = assets[i];
        
        // Ensure asset is an object even if backend sent strings
        if (typeof asset === 'string') {
            asset = { name: asset, thumbnail: null };
        }

        try {
            const assetIndex = i;
            const card = document.createElement('div');
            card.className = 'asset-card';
            if (asset.fullPath && State.selectedAssets.has(asset.fullPath)) {
                card.classList.add('asset-selected');
            }
            
            // Clean display name: Strip the current filter prefix from the relative path
            let displayName = asset.name || 'Unnamed';
            if (asset.relPath) {
                const filter = State.currentAssetFilter;
                if (filter && filter !== '__favorites__' && asset.relPath.startsWith(filter + '/')) {
                    displayName = asset.relPath.substring(filter.length + 1).replace(/\.[^/.]+$/, '');
                } else if (!filter || filter === '__favorites__') {
                    displayName = asset.relPath.replace(/\.[^/.]+$/, '');
                }
            }

            const thumb = document.createElement('div');
            thumb.className = 'asset-thumb';
            if (asset.thumbnail) {
                // Use the protocol-prefixed URL from backend directly
                thumb.style.backgroundImage = `url("${asset.thumbnail}")`;
            }

            const info = document.createElement('div');
            info.className = 'asset-info';
            const badgeColor = mode === 'lora' ? 'rose' : mode === 'embedding' ? 'purple' : 'sky';
            info.innerHTML = `
                <div class="asset-name">${displayName}</div>
                <div class="asset-category asset-category--${badgeColor}">${mode.toUpperCase()}</div>
            `;

            // Attach Premium Popup (not for checkpoint — click sets gen field directly)
            // WebUI: "Name"（prefixなし）  /  ComfyUI: "embedding:Name"
            // LoRA は両モード共通 <lora:name:weight>
            if (mode !== 'checkpoint') {
                const promptValue = mode === 'lora'      ? `<lora:${asset.name}:1.0>`
                                  : mode === 'embedding' ? (State.isComfyMode ? `embedding:${asset.name}` : asset.name)
                                  : asset.name;
                attachPopupEvents(card, {
                    name: displayName,
                    value: promptValue,
                    thumbnail: asset.thumbnail,
                    type: mode,
                    triggerWords: asset.triggerWords || [],
                }, mode === 'lora' ? 'rose' : 'purple');
            }

            // Checkpoint-specific: hover popup + edit button
            if (mode === 'checkpoint') {
                attachCheckpointPopupEvents(card, asset);
                const editBtn = document.createElement('button');
                editBtn.className = 'btn-checkpoint-edit';
                editBtn.title = 'Edit Recommended Settings';
                editBtn.textContent = '✏';
                editBtn.onclick = (ev) => {
                    ev.stopPropagation();
                    window.dispatchEvent(new CustomEvent('checkpoint:open-edit', { detail: asset }));
                };
                card.appendChild(editBtn);
            }

            // CivitAI page button (open in browser) — shown when modelId is known
            if (asset.fullPath && asset.modelId) {
                const pageBtn = document.createElement('button');
                pageBtn.className = 'btn-civitai-page';
                pageBtn.title = 'Open CivitAI page';
                // Globe / external link icon
                pageBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>';
                pageBtn.onclick = async (e) => {
                    e.stopPropagation();
                    const url = await IPC.civitaiPageUrl(asset.modelId, asset.versionId);
                    IPC.openExternal(url);
                };
                card.appendChild(pageBtn);
            }

            // CivitAI fetch button
            if (asset.fullPath) {
                const fetchBtn = document.createElement('button');
                fetchBtn.className = 'btn-civitai-fetch';
                fetchBtn.title = 'Fetch metadata from CivitAI';
                fetchBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>';
                fetchBtn.onclick = async (e) => {
                    e.stopPropagation();
                    if (fetchBtn.classList.contains('loading')) return;
                    fetchBtn.classList.add('loading');
                    fetchBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" class="spin"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>';
                    try {
                        const cfg = await IPC.getConfig();
                        await IPC.fetchCivitaiMetadata(asset.fullPath, cfg.civitaiApiKey || '');
                        State.allAssets = await loadAssets();
                        renderAssetGrid();
                    } catch (err) {
                        fetchBtn.classList.remove('loading');
                        fetchBtn.title = `Error: ${err.message}`;
                        fetchBtn.innerHTML = '✕';
                        fetchBtn.style.color = '#fb7185';
                    }
                };
                card.appendChild(fetchBtn);
            }

            // Favorite button
            if (asset.fullPath) {
                const favSet = mode === 'lora'       ? State.loraFavorites
                             : mode === 'embedding'  ? State.embeddingFavorites
                             :                         State.checkpointFavorites;
                const favBtn = document.createElement('button');
                favBtn.className = 'btn-asset-fav' + (favSet.has(asset.fullPath) ? ' is-fav' : '');
                favBtn.title = favSet.has(asset.fullPath) ? 'Remove from Favorites' : 'Add to Favorites';
                favBtn.textContent = '★';
                favBtn.onclick = (e) => {
                    e.stopPropagation();
                    toggleAssetFavorite(mode, asset.fullPath);
                    const nowFav = (mode === 'lora'       ? State.loraFavorites
                                  : mode === 'embedding'  ? State.embeddingFavorites
                                  :                         State.checkpointFavorites).has(asset.fullPath);
                    favBtn.classList.toggle('is-fav', nowFav);
                    favBtn.title = nowFav ? 'Remove from Favorites' : 'Add to Favorites';
                    // If in favorites view and unfavorited, remove card
                    if (State.currentAssetFilter === '__favorites__' && !nowFav) {
                        card.remove();
                    }
                };
                card.appendChild(favBtn);
            }

            // オーバーレイボタンにホバーしたときはポップアップを即座に抑制
            card.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('mouseenter', () => {
                    if (popupTimer) { clearTimeout(popupTimer); popupTimer = null; }
                    if (hideTimer)  { clearTimeout(hideTimer);  hideTimer  = null; }
                    hideInfoPopup();
                });
            });

            card.appendChild(thumb);
            card.appendChild(info);

            card.onclick = (e) => {
                if (e.ctrlKey || e.metaKey) {
                    // Ctrl+click: toggle selection
                    if (asset.fullPath) {
                        if (State.selectedAssets.has(asset.fullPath)) {
                            State.selectedAssets.delete(asset.fullPath);
                            card.classList.remove('asset-selected');
                        } else {
                            State.selectedAssets.add(asset.fullPath);
                            card.classList.add('asset-selected');
                        }
                        State.lastSelectedAssetIndex = assetIndex;
                    }
                } else if (e.shiftKey && State.lastSelectedAssetIndex >= 0 && asset.fullPath) {
                    // Shift+click: range select
                    const from = Math.min(State.lastSelectedAssetIndex, assetIndex);
                    const to   = Math.max(State.lastSelectedAssetIndex, assetIndex);
                    const allCards = grid.querySelectorAll('.asset-card');
                    grid._assets.slice(from, to + 1).forEach((a, offset) => {
                        if (a.fullPath) {
                            State.selectedAssets.add(a.fullPath);
                            allCards[from + offset]?.classList.add('asset-selected');
                        }
                    });
                } else {
                    // Plain click: clear selection, add to prompt
                    State.selectedAssets.clear();
                    State.lastSelectedAssetIndex = asset.fullPath ? assetIndex : -1;
                    grid.querySelectorAll('.asset-card').forEach(c => c.classList.remove('asset-selected'));
                    if (mode === 'checkpoint') {
                        const ckptInput = document.getElementById('gen-main-checkpoint');
                        if (ckptInput) {
                            const basename = (asset.relPath || asset.name || '')
                                .replace(/\\/g, '/').split('/').pop();
                            ckptInput.value = basename;
                            ckptInput.dispatchEvent(new Event('input'));
                        }
                    } else {
                        let val;
                        if (mode === 'lora') val = `<lora:${asset.name}:1.0>`;
                        else if (mode === 'embedding') val = State.isComfyMode ? `embedding:${asset.name}` : asset.name;
                        else val = asset.name;
                        addToPrompt(val);
                    }
                }
            };

            // Drag to explorer folder
            if (asset.fullPath) {
                card.draggable = true;
                card.addEventListener('dragstart', (e) => {
                    // If dragged card is not in selection, select only it
                    if (!State.selectedAssets.has(asset.fullPath)) {
                        State.selectedAssets.clear();
                        grid.querySelectorAll('.asset-card').forEach(c => c.classList.remove('asset-selected'));
                        State.selectedAssets.add(asset.fullPath);
                        card.classList.add('asset-selected');
                    }
                    const paths = Array.from(State.selectedAssets);
                    e.dataTransfer.setData('application/x-asset-paths', JSON.stringify(paths));
                    e.dataTransfer.effectAllowed = 'move';

                    // Custom drag ghost: "N files"
                    const ghost = document.createElement('div');
                    ghost.className = 'asset-drag-ghost';
                    ghost.textContent = paths.length > 1 ? `${paths.length} files` : asset.name;
                    document.body.appendChild(ghost);
                    e.dataTransfer.setDragImage(ghost, 0, 0);
                    setTimeout(() => ghost.remove(), 0);
                });
            }

            card.oncontextmenu = (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent('showContextMenu', {
                    detail: { event: e, target: asset, type: 'asset-card' }
                }));
            };

            grid.appendChild(card);
        } catch (e) {
            console.error('[PBv4-Lib] Failed to render asset card:', asset, e);
        }
    }

    
}

/**
 * --- Premium Popup Controller ---
 */
let popupTimer = null;
let hideTimer  = null;
// ポップアップが表示済みかを管理するフラグ
let popupVisible = false;

/** ポップアップ要素自体へのホバーリスナーを一度だけ設定（DOM準備後に呼ぶこと） */
export function initPopupHoverListeners() {
    const popup = document.getElementById('chip-info-popup');
    if (!popup || popup._hoverBound) return;
    popup._hoverBound = true;
    // ポップアップ上にマウスが入ったら非表示タイマーをキャンセル
    popup.addEventListener('mouseenter', () => {
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    });
    // ポップアップからマウスが出たら非表示タイマーをセット
    popup.addEventListener('mouseleave', () => {
        scheduleHide(400);
    });
    // 右クリックコンテキストメニューが開いたら即消す
    window.addEventListener('showContextMenu', () => {
        if (popupTimer) { clearTimeout(popupTimer); popupTimer = null; }
        if (hideTimer)  { clearTimeout(hideTimer);  hideTimer  = null; }
        hideInfoPopup();
    });
}

function scheduleHide(delay = 500) {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
        hideInfoPopup();
        hideTimer = null;
    }, delay);
}

export function attachPopupEvents(el, data, colorKey) {
    el.addEventListener('mouseenter', (e) => {
        if (popupTimer) clearTimeout(popupTimer);
        // 非表示タイマーが走っていればキャンセル（隣タグへ移動した場合など）
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        popupTimer = setTimeout(() => {
            showInfoPopup(e, data, colorKey);
        }, 700);
    });

    el.addEventListener('mouseleave', () => {
        if (popupTimer) { clearTimeout(popupTimer); popupTimer = null; }
        // ポップアップが見えているときだけ長め（500ms）で、まだ見えていなければ即キャンセル
        if (popupVisible) scheduleHide(500);
    });

    el.addEventListener('mousemove', (e) => {
        // 表示前のみ追従（表示後は固定してポップアップに移動しやすくする）
        if (!popupVisible) _lastMouseEvent = e;
    });

    el.addEventListener('contextmenu', () => {
        if (popupTimer) { clearTimeout(popupTimer); popupTimer = null; }
        if (hideTimer)  { clearTimeout(hideTimer);  hideTimer  = null; }
        hideInfoPopup();
    });
}

// 最後のマウス位置を保持（showInfoPopup 時の初期配置用）
let _lastMouseEvent = null;

function showInfoPopup(e, data, colorKey) {
    const popup = document.getElementById('chip-info-popup');
    if (!popup) return;

    const color = PALETTE_CSS_VAR[colorKey] || 'var(--glow-primary)';
    popup.style.borderColor = color;
    popup.style.boxShadow = `0 20px 50px rgba(0,0,0,0.5), 0 0 20px ${color}33`;

    const hasImage = !!data.thumbnail;
    popup.classList.toggle('has-image', hasImage);
    popup.classList.toggle('compact', !hasImage);

    let contentHtml = '';
    if (hasImage) {
        contentHtml += `<img class="popup-thumb" src="${data.thumbnail}" alt="">`;
    }

    const hasTriggers = Array.isArray(data.triggerWords) && data.triggerWords.length > 0;
    const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    let triggerHtml = '';
    if (hasTriggers) {
        triggerHtml = `
            <div class="popup-trigger-label">Trigger Words</div>
            <div class="popup-trigger-words">
                ${data.triggerWords.map(w => `<button class="popup-trigger-pill" data-word="${esc(w)}">${esc(w)}</button>`).join('')}
            </div>`;
    }

    contentHtml += `
        <div class="popup-content">
            <div class="popup-name">${data.name}</div>
            <div class="popup-value">${data.value}</div>
            ${data.type !== 'tag' ? `<div class="popup-meta">
                <span class="popup-badge" style="border-left: 3px solid ${color}">${data.type}</span>
            </div>` : ''}
            ${triggerHtml}
        </div>
    `;

    popup.innerHTML = contentHtml;
    popup.classList.toggle('has-triggers', hasTriggers);

    // Wire trigger word buttons → insert into focused prompt area
    popup.querySelectorAll('.popup-trigger-pill').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            addToPrompt(btn.dataset.word);
        });
        // Prevent mouseleave-hide while clicking a pill
        btn.addEventListener('mousedown', (e) => e.stopPropagation());
    });

    popup.classList.add('visible');
    popupVisible = true;
    positionPopup(e);
}

function hideInfoPopup() {
    const popup = document.getElementById('chip-info-popup');
    if (popup) popup.classList.remove('visible');
    popupVisible = false;
}

export function attachCheckpointPopupEvents(card, asset) {
    card.addEventListener('mouseenter', (e) => {
        if (popupTimer) clearTimeout(popupTimer);
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        popupTimer = setTimeout(() => {
            showCheckpointPopup(e, asset);
        }, 700);
    });
    card.addEventListener('mousemove', (e) => {
        // 表示前のみ追従（表示後は固定してポップアップに移動しやすくする）
        if (!popupVisible) _lastMouseEvent = e;
    });
    card.addEventListener('mouseleave', () => {
        if (popupTimer) { clearTimeout(popupTimer); popupTimer = null; }
        hideTimer = setTimeout(() => {
            hideInfoPopup();
            hideTimer = null;
        }, 150);
    });
    card.addEventListener('contextmenu', () => {
        if (popupTimer) { clearTimeout(popupTimer); popupTimer = null; }
        if (hideTimer)  { clearTimeout(hideTimer);  hideTimer  = null; }
        hideInfoPopup();
    });
}

function showCheckpointPopup(e, asset) {
    const popup = document.getElementById('chip-info-popup');
    if (!popup) return;

    const color = PALETTE_CSS_VAR['sky'] || '#0ea5e9';
    popup.style.borderColor = color;
    popup.style.boxShadow = `0 20px 50px rgba(0,0,0,0.5), 0 0 20px ${color}33`;

    const hasImage = !!asset.thumbnail;
    popup.classList.toggle('has-image', hasImage);
    popup.classList.toggle('compact', !hasImage);
    popup.classList.toggle('has-triggers', false);

    const hasSettings = !!asset.pbSettings;
    const displayName = asset.displayName || asset.name;
    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const posPreview = asset.pbSettings?.positive
        ? esc(asset.pbSettings.positive.slice(0, 100) + (asset.pbSettings.positive.length > 100 ? '…' : ''))
        : '';

    let contentHtml = '';
    if (hasImage) contentHtml += `<img class="popup-thumb" src="${asset.thumbnail}" alt="">`;

    contentHtml += `
        <div class="popup-content">
            <div class="popup-name">${esc(displayName)}</div>
            <div class="popup-meta">
                <span class="popup-badge" style="border-left:3px solid ${color}">checkpoint</span>
                ${hasSettings ? '<span class="popup-badge popup-badge--saved">✔ settings</span>' : ''}
            </div>
            ${posPreview ? `<div class="popup-checkpoint-preview">${posPreview}</div>` : ''}
            <div class="popup-checkpoint-actions">
                ${hasSettings ? `<button class="popup-action-btn popup-action-apply">▶ Apply</button>` : ''}
                <button class="popup-action-btn popup-action-edit">✏ Edit Settings</button>
            </div>
        </div>
    `;

    popup.innerHTML = contentHtml;
    popup.classList.add('visible');
    popupVisible = true;
    positionPopup(e);

    // Wire buttons — mousedown stops propagation to prevent card-click / popup-hide race
    popup.querySelector('.popup-action-apply')?.addEventListener('click', (ev) => {
        ev.stopPropagation();
        window.dispatchEvent(new CustomEvent('checkpoint:apply-settings', { detail: asset }));
    });
    popup.querySelector('.popup-action-apply')?.addEventListener('mousedown', ev => ev.stopPropagation());

    const editBtn = popup.querySelector('.popup-action-edit');
    if (editBtn) {
        editBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            hideInfoPopup();
            window.dispatchEvent(new CustomEvent('checkpoint:open-edit', { detail: asset }));
        });
        editBtn.addEventListener('mousedown', ev => ev.stopPropagation());
    }
}

function positionPopup(e) {
    const popup = document.getElementById('chip-info-popup');
    if (!popup || !popupVisible) return;

    const margin = 20;
    let x = e.clientX + margin;
    let y = e.clientY + margin;

    // Boundary check
    const rect = popup.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) {
        x = e.clientX - rect.width - margin;
    }
    if (y + rect.height > window.innerHeight) {
        y = e.clientY - rect.height - margin;
    }

    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;
}

/**
 * Pick N random tags from the currently displayed tag grid and add to prompt
 */
export function pickRandomTags(n = 1) {
    const flatTags = [];
    const collect = (nodes) => {
        for (const node of nodes) {
            if (node.type === 'tag') flatTags.push(node);
            else if (node.children) collect(node.children);
        }
    };
    collect(State.currentTags);
    if (flatTags.length === 0) return;

    const shuffled = [...flatTags].sort(() => Math.random() - 0.5);
    shuffled.slice(0, n).forEach(tag => addToPrompt(tag.value || tag.name, null, tag.name));
}
