/**
 * Explorer Tree Component for v4 - Restored Recursive Rendering
 */
import { State } from '../core/state.js';
import { IPC } from '../core/ipc.js';
import { renderTagGrid, renderAssetGrid } from './library.js';
import { loadAssets } from '../assets/service.js';
import { moveWithConflictCheck } from './context-menu.js';
import { i18n } from '../core/i18n.js';
import { saveTagOrder } from '../tags/service.js';
import { showInputDialog } from './modals.js';
import { saveCurrentPreset } from './generation.js';
import Sortable from 'sortablejs';

// Track Sortable instances to destroy before re-render
const explorerSortables = [];

const CAT_COLOR_MAP = {
    indigo: '#6366f1', rose: '#f43f5e', amber: '#f59e0b', emerald: '#10b981',
    sky: '#0ea5e9', purple: '#a855f7', teal: '#14b8a6', orange: '#f97316',
    lime: '#84cc16', cyan: '#06b6d4', pink: '#ec4899', slate: '#64748b',
    'danbooru-general': '#0093ff', 'danbooru-character': '#00ab00',
    'danbooru-copyright': '#c000c0', 'danbooru-artist': '#c00000', 'danbooru-meta': '#fd9200',
};

// Auto-expand timer for hover-while-dragging
let autoExpandTimer = null;
const AUTO_EXPAND_DELAY = 700;

// Left-drag promotion state
let dragStartX = 0;
let promotionPending = false;
let activePointerMoveListener = null;
const PROMOTE_THRESHOLD = 50; // px leftward to trigger promotion

export function renderExplorer() {
    const explorer = document.getElementById('explorer-content');
    const actions  = document.getElementById('explorer-actions');
    if (!explorer) return;

    // Destroy existing Sortable instances before clearing DOM
    explorerSortables.forEach(s => { try { s.destroy(); } catch (_) {} });
    explorerSortables.length = 0;
    if (autoExpandTimer) { clearTimeout(autoExpandTimer); autoExpandTimer = null; }

    explorer.innerHTML = '';
    if (actions) actions.innerHTML = '';

    if (State.currentMode === 'gen') {
        renderGenPresetsExplorer(explorer);
        return;
    }

    // Categories and Recursive Tree
    if (State.currentMode === 'tags') {
        // Favorites Virtual Category (tags mode only)
        const favWrap = document.createElement('div');
        favWrap.className = 'explorer-item-wrap favorites';
        const favItem = createExplorerItem({ name: '★ Favorites', id: 'favorites' }, () => {
            State.isFavoriteView = true;
            State.currentCategoryId = 'favorites';
            State.currentTags = getFavoriteTree(State.allTags);
            renderExplorer();
            window.dispatchEvent(new CustomEvent('renderGridReq'));
        }, 0, false);
        if (State.isFavoriteView) favItem.classList.add('active');
        favWrap.appendChild(favItem);
        explorer.appendChild(favWrap);

        // Frequent Tags Virtual Category
        const freqWrap = document.createElement('div');
        freqWrap.className = 'explorer-item-wrap favorites';
        const freqItem = createExplorerItem({ name: i18n.t('cat_frequent'), id: 'frequent' }, () => {
            State.isFrequentView = true;
            State.isFavoriteView = false;
            State.currentCategoryId = 'frequent';
            State.currentTags = getFrequentTree(State.allTags);
            renderExplorer();
            window.dispatchEvent(new CustomEvent('renderGridReq'));
        }, 0, false);
        if (State.isFrequentView) freqItem.classList.add('active');

        freqWrap.appendChild(freqItem);
        explorer.appendChild(freqWrap);

        buildExplorerTree(State.allTags, explorer);

        // Init Sortable on ALL containers at once (V3 pattern)
        // _parentChildren is set on each container by buildExplorerTree
        explorer.querySelectorAll('.nav-tree').forEach(el => initExplorerSortable(el, false));
        initExplorerSortable(explorer, true);

        // Add Category Button — fixed at bottom
        if (actions) {
            const addBtn = document.createElement('div');
            addBtn.className = 'btn-add-explorer';
            addBtn.innerHTML = `<span class="plus">＋</span><span data-i18n="explorer_add_category">Add Category</span>`;
            addBtn.onclick = () => {
                const btn = document.getElementById('btn-add-category');
                if (btn) btn.click();
            };
            actions.appendChild(addBtn);
        }
    } else {
        renderAssetExplorer(explorer);

        if (actions) {
            const addFolderBtn = document.createElement('div');
            addFolderBtn.className = 'btn-add-explorer';
            addFolderBtn.innerHTML = `<span class="plus">＋</span><span>New Folder</span>`;
            addFolderBtn.onclick = async () => {
                const name = await showInputDialog('New Folder Name');

                if (!name) return;
                const cfg = await IPC.getConfig();
                const basePath = State.currentMode === 'lora'       ? cfg.loraPath
                               : State.currentMode === 'checkpoint' ? cfg.checkpointsPath
                               :                                       cfg.embeddingsPath;

                if (!basePath) {
                    alert('フォルダーパスが設定されていません。設定から対象フォルダーを指定してください。');
                    return;
                }
                try {
                    const fullPath = basePath.replace(/[\\/]+$/, '') + '\\' + name.trim();
                    await IPC.createAssetFolder(fullPath);
                    State.allAssets = await loadAssets();
                    renderExplorer();
                    renderAssetGrid();
                } catch (e) {
                    console.error('[NewFolder] error:', e);
                    alert(`Failed to create folder: ${e.message}`);
                }
            };
            actions.appendChild(addFolderBtn);
        }
    }
}

async function renderGenPresetsExplorer(container) {
    const actions = document.getElementById('explorer-actions');
    container.innerHTML = '<div style="padding:0.5rem 0.8rem;color:var(--slate-500);font-size:0.78rem;">Loading…</div>';
    let tree;
    try {
        tree = await IPC.getGenPresetsTree();
    } catch (_) {
        container.innerHTML = '<div style="padding:0.5rem 0.8rem;color:var(--slate-500);font-size:0.78rem;">No presets folder</div>';
        return;
    }
    container.innerHTML = '';

    // "All" item
    const allWrap = document.createElement('div');
    allWrap.className = 'explorer-item-wrap favorites';
    const allItem = createExplorerItem({ name: '📋 All Presets', id: '_all' }, () => {
        State.currentGenPresetFolder = null;
        renderExplorer();
    }, 0, false);
    if (!State.currentGenPresetFolder) allItem.classList.add('active');
    allWrap.appendChild(allItem);
    container.appendChild(allWrap);

    renderPresetFolderTree(tree, container, 0, '');

    // Save Preset + New Folder buttons — fixed at bottom
    if (actions) {
        const saveBtn = document.createElement('div');
        saveBtn.className = 'btn-add-explorer';
        saveBtn.innerHTML = `<span class="plus">💾</span><span>Save Preset</span>`;
        saveBtn.onclick = () => saveCurrentPreset();
        actions.appendChild(saveBtn);

        const addBtn = document.createElement('div');
        addBtn.className = 'btn-add-explorer';
        addBtn.innerHTML = `<span class="plus">＋</span><span>New Folder</span>`;
        addBtn.onclick = async () => {
            const name = await showInputDialog('New Folder Name');
            if (!name) return;
            try {
                await IPC.createGenPresetFolder(name);
                renderExplorer();
            } catch (e) {
                alert(`Failed to create folder: ${e.message}`);
            }
        };
        actions.appendChild(addBtn);
    }
}

function renderPresetFolderTree(node, container, depth, parentPath) {
    // Files first
    node._files?.forEach(file => {
        const wrap = document.createElement('div');
        wrap.className = 'explorer-item-wrap';
        const item = createExplorerItem({ name: '📄 ' + file.name, id: file.relPath }, (e) => {
            e.stopPropagation();
            State.currentGenPresetRelPath = file.relPath;
            window.dispatchEvent(new CustomEvent('genPresetSelected', { detail: { relPath: file.relPath } }));
            container.querySelectorAll('.explorer-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
        }, depth, false);

        if (State.currentGenPresetRelPath === file.relPath) item.classList.add('active');

        item.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent('showContextMenu', {
                detail: { event: e, target: { name: file.name, relPath: file.relPath }, type: 'gen-preset-file' }
            }));
        };

        // Draggable preset file
        item.draggable = true;
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('application/x-gen-preset', file.relPath);
            e.dataTransfer.effectAllowed = 'move';
        });

        wrap.appendChild(item);
        container.appendChild(wrap);
    });

    // Then subfolders
    Object.keys(node._children || {}).sort().forEach(folderName => {
        const child = node._children[folderName];
        const relPath = parentPath ? `${parentPath}/${folderName}` : folderName;
        const canExpand = Object.keys(child._children).length > 0 || child._files.length > 0;

        const wrap = document.createElement('div');
        wrap.className = 'explorer-item-wrap';

        const item = createExplorerItem({ name: '📁 ' + folderName, id: relPath }, (e) => {
            e.stopPropagation();
            wrap.classList.toggle('expanded');
            State.currentGenPresetFolder = relPath;
        }, depth, canExpand);

        if (State.currentGenPresetFolder === relPath ||
            State.currentGenPresetFolder?.startsWith(relPath + '/')) {
            item.classList.add('active');
            wrap.classList.add('expanded');
        }

        item.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent('showContextMenu', {
                detail: { event: e, target: { name: folderName, relPath }, type: 'gen-preset-folder' }
            }));
        };

        // Drop target
        item.addEventListener('dragover', (e) => {
            if (!e.dataTransfer.types.includes('application/x-gen-preset')) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            item.classList.add('folder-drop-active');
        });
        item.addEventListener('dragleave', () => item.classList.remove('folder-drop-active'));
        item.addEventListener('drop', async (e) => {
            e.preventDefault();
            item.classList.remove('folder-drop-active');
            const srcRelPath = e.dataTransfer.getData('application/x-gen-preset');
            if (!srcRelPath) return;
            // Prevent dropping into own folder
            const srcFolder = srcRelPath.includes('/') ? srcRelPath.split('/').slice(0, -1).join('/') : '';
            if (srcFolder === relPath) return;
            await IPC.moveGenPreset(srcRelPath, relPath);
            if (State.currentGenPresetRelPath === srcRelPath) State.currentGenPresetRelPath = null;
            renderExplorer();
        });

        wrap.appendChild(item);

        if (canExpand) {
            const sub = document.createElement('div');
            sub.className = 'nav-tree';
            renderPresetFolderTree(child, sub, depth + 1, relPath);
            wrap.appendChild(sub);
        }

        container.appendChild(wrap);
    });
}

/**
 * Builds a folder tree from LoRA/Embedding assets
 */
function renderAssetExplorer(container) {
    // Favorites item
    const favWrap = document.createElement('div');
    favWrap.className = 'explorer-item-wrap favorites';
    const favItem = createExplorerItem({ name: '★ Favorites', id: '__favorites__' }, () => {
        State.currentAssetFilter = '__favorites__';
        renderExplorer();
        window.dispatchEvent(new CustomEvent('renderGridReq'));
    }, 0, false);
    if (State.currentAssetFilter === '__favorites__') favItem.classList.add('active');
    favWrap.appendChild(favItem);
    container.appendChild(favWrap);

    // All (root) item
    const allWrap = document.createElement('div');
    allWrap.className = 'explorer-item-wrap favorites';
    const allItem = createExplorerItem({ name: '📁 All', id: '__all__' }, () => {
        State.currentAssetFilter = null;
        renderExplorer();
        window.dispatchEvent(new CustomEvent('renderGridReq'));
    }, 0, false);
    if (State.currentAssetFilter === null) allItem.classList.add('active');
    allWrap.appendChild(allItem);
    container.appendChild(allWrap);

    const key = State.currentMode === 'lora' ? 'loras'
              : State.currentMode === 'checkpoint' ? 'checkpoints'
              : 'embeddings';
    const folderKey = State.currentMode === 'lora' ? 'loraFolders'
                    : State.currentMode === 'checkpoint' ? 'checkpointFolders'
                    : 'embeddingFolders';
    const assets  = State.allAssets[key] || [];
    const folders = State.allAssets[folderKey] || [];
    const tree = {};

    const ensurePath = (parts, root) => {
        let current = root;
        for (const p of parts) {
            if (!current[p]) current[p] = { _children: {} };
            current = current[p]._children;
        }
    };

    assets.forEach(asset => {
        const parts = (asset.relPath || '').split('/');
        if (parts.length > 1) ensurePath(parts.slice(0, -1), tree);
    });

    folders.forEach(relFolder => {
        const parts = relFolder.split('/').filter(Boolean);
        if (parts.length) ensurePath(parts, tree);
    });

    renderAssetFolders(tree, container, 0, '');
}

function renderAssetFolders(tree, container, depth, parentPath) {
    Object.keys(tree).sort().forEach(folderName => {
        const node = tree[folderName];
        const wrap = document.createElement('div');
        wrap.className = 'explorer-item-wrap';

        const currentPath = parentPath ? `${parentPath}/${folderName}` : folderName;
        const canExpand = Object.keys(node._children).length > 0;

        const item = createExplorerItem({ name: folderName, id: currentPath }, (e) => {
            e.stopPropagation();
            State.currentAssetFilter = currentPath;
            renderExplorer();
            window.dispatchEvent(new CustomEvent('renderGridReq'));
        }, depth, canExpand);

        if (State.currentAssetFilter === currentPath || State.currentAssetFilter?.startsWith(currentPath + '/')) {
            item.classList.add('active');
            wrap.classList.add('expanded');
        }

        item.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent('showContextMenu', {
                detail: { event: e, target: { name: folderName, relPath: currentPath }, type: 'asset-folder' }
            }));
        };

        // Drop target for asset card D&D
        item.addEventListener('dragover', (e) => {
            if (!e.dataTransfer.types.includes('application/x-asset-paths')) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            item.classList.add('folder-drop-active');
        });
        item.addEventListener('dragleave', () => item.classList.remove('folder-drop-active'));
        item.addEventListener('drop', async (e) => {
            e.preventDefault();
            item.classList.remove('folder-drop-active');
            const raw = e.dataTransfer.getData('application/x-asset-paths');
            if (!raw) return;
            const paths = JSON.parse(raw);
            const cfg = await IPC.getConfig();
            const basePath = (State.currentMode === 'lora' || State.currentMode === 'loras')
                ? cfg.loraPath
                : State.currentMode === 'checkpoint'
                ? cfg.checkpointsPath
                : cfg.embeddingsPath;
            const destDir = currentPath
                ? `${basePath}\\${currentPath.replace(/\//g, '\\')}`
                : basePath;
            try {
                await moveWithConflictCheck(paths, destDir);
            } catch (_) {}
            State.selectedAssets.clear();
            State.allAssets = await loadAssets();
            renderAssetGrid();
        });

        wrap.appendChild(item);

        if (canExpand) {
            const subContainer = document.createElement('div');
            subContainer.className = 'nav-tree';
            renderAssetFolders(node._children, subContainer, depth + 1, currentPath);
            wrap.appendChild(subContainer);
        }

        container.appendChild(wrap);
    });
}

function buildExplorerTree(nodes, container, depth = 0, parentPath = '', parentColor = null) {
    // Store data array reference directly on the container (V3 pattern)
    container._parentChildren = nodes;

    nodes.forEach(node => {
        if (node.type === 'tag') return; // Only show folders in explorer

        const wrap = document.createElement('div');
        wrap._nodeData = node; // Direct reference for onEnd handler
        const effectiveColor = parentColor || node.color;
        const colorClass = effectiveColor ? `cat-${effectiveColor}` : '';
        wrap.className = `explorer-item-wrap ${colorClass}`;
        wrap.dataset.nodeId = node.id || node.name;

        const isExpanded = (node.type === 'category' && State.expandedCategories.has(node.id)) ||
                           (node.type === 'group' && State.expandedGroups.has(node._pathId || node.name));

        if (isExpanded) wrap.classList.add('expanded');

        const canExpand = node.children && node.children.some(c => c.type !== 'tag');
        const currentPath = parentPath ? `${parentPath} > ${node.name}` : node.name;
        node._pathId = currentPath; // フルパスIDをノードに付与（アコーディオン判定用）

        const item = createExplorerItem(node, (e) => {
            handleItemClick(e, node, wrap, canExpand);
        }, depth, canExpand, true);

        const isActiveCategory = node.type === 'category' && State.currentCategoryId === node.id && !State.currentGroupName && !State.isFavoriteView;
        const isActiveGroup = node.type === 'group' && State.currentGroupName === node.name && !State.isFavoriteView;
        if (isActiveCategory || isActiveGroup) item.classList.add('active');

        if (effectiveColor) {
            item.classList.add(`cat-${effectiveColor}`);
            const labelEl = item.querySelector('.item-label');
            if (labelEl) {
                labelEl.classList.add('cat-colored');
                if (!(isActiveCategory || isActiveGroup)) {
                    const hex = CAT_COLOR_MAP[effectiveColor];
                    if (hex) labelEl.style.color = hex;
                }
            }
        }

        wrap.appendChild(item);

        // Children container — only for sub-folder nodes, not tags
        const hasSubFolders = node.children && node.children.some(c => c.type !== 'tag');
        if (hasSubFolders) {
            const subContainer = document.createElement('div');
            subContainer.className = 'nav-tree';
            buildExplorerTree(node.children, subContainer, depth + 1, currentPath, effectiveColor);
            wrap.appendChild(subContainer);
        }

        container.appendChild(wrap);
    });
}

function createExplorerItem(node, onClick, depth, canExpand, draggable = false) {
    const item = document.createElement('div');
    item.className = 'explorer-item';
    item.style.paddingLeft = `${depth * 1.2 + 0.8}rem`;

    const label = node.name;

    if (draggable) {
        const handle = document.createElement('span');
        handle.className = 'drag-handle';
        handle.textContent = '⠿';
        handle.title = 'Drag to reorder / move';
        item.appendChild(handle);
    }

    const toggle = document.createElement('span');
    toggle.className = 'toggle-icon';
    toggle.textContent = canExpand ? '▶' : '•';
    if (!canExpand) toggle.style.opacity = '0.3';
    item.appendChild(toggle);

    const text = document.createElement('span');
    text.className = 'item-label';
    text.textContent = label;
    item.appendChild(text);

    item.onclick = onClick;

    // Toggle icon (▶): free expand/collapse — does NOT close siblings
    if (canExpand) {
        toggle.onclick = (e) => {
            e.stopPropagation();
            const wrap = item.closest('.explorer-item-wrap');
            if (!wrap) return;
            const isExpanded = wrap.classList.toggle('expanded');
            if (node.type === 'category') {
                if (isExpanded) State.expandedCategories.add(node.id);
                else State.expandedCategories.delete(node.id);
            } else {
                const pathId = node._pathId || node.name;
                if (isExpanded) State.expandedGroups.add(pathId);
                else State.expandedGroups.delete(pathId);
            }
            renderExplorer();
        };
    }

    item.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const event = new CustomEvent('showContextMenu', {
            detail: {
                event: e,
                target: node,
                type: node.id === 'favorites' ? 'favorites' : (node.type || (node.id ? 'category' : 'group'))
            }
        });
        window.dispatchEvent(event);
    };

    return item;
}

/**
 * Sets up unified drag-to-reorder AND cross-container move on an Explorer container.
 * Uses V3 pattern: _nodeData on wrap, _parentChildren on container.
 */
function initExplorerSortable(container, isRoot) {
    const s = Sortable.create(container, {
        group: 'unified-explorer',
        handle: '.drag-handle',
        animation: 150,
        fallbackOnBody: true,
        swapThreshold: 0.65,
        ghostClass: 'sortable-ghost',
        draggable: '.explorer-item-wrap' + (isRoot ? ':not(.favorites)' : ''),

        onStart: (evt) => {
            const node = evt.item._nodeData;
            if (!node || node.type !== 'group') return;

            dragStartX = evt.originalEvent?.clientX ?? 0;
            promotionPending = false;

            activePointerMoveListener = (e) => {
                const deltaX = e.clientX - dragStartX;
                if (deltaX < -PROMOTE_THRESHOLD) {
                    if (!promotionPending) {
                        promotionPending = true;
                        evt.item.classList.add('promote-pending');
                    }
                } else {
                    if (promotionPending) {
                        promotionPending = false;
                        evt.item.classList.remove('promote-pending');
                    }
                }
            };
            window.addEventListener('pointermove', activePointerMoveListener);
        },

        onMove: (evt) => {
            const targetWrap = evt.related;
            if (!targetWrap || !targetWrap._nodeData) return;
            const node = targetWrap._nodeData;
            if (node.children && node.children.some(c => c.type !== 'tag')) {
                if (autoExpandTimer) clearTimeout(autoExpandTimer);
                autoExpandTimer = setTimeout(() => {
                    targetWrap.classList.add('expanded');
                    if (node.type === 'category') State.expandedCategories.add(node.id);
                    else State.expandedGroups.add(node._pathId || node.name);
                }, AUTO_EXPAND_DELAY);
            }
        },

        onEnd: async (evt) => {
            if (autoExpandTimer) { clearTimeout(autoExpandTimer); autoExpandTimer = null; }

            if (activePointerMoveListener) {
                window.removeEventListener('pointermove', activePointerMoveListener);
                activePointerMoveListener = null;
            }
            evt.item.classList.remove('promote-pending');
            const didPromote = promotionPending;
            promotionPending = false;

            const itemEl = evt.item;
            const node = itemEl._nodeData;
            if (!node) return;

            const fromArr = evt.from._parentChildren;
            const toArr = evt.to._parentChildren;
            if (!fromArr || !toArr) return;

            const prevCatName = State.allTags.find(c => c.id === State.currentCategoryId)?.name;

            // Remove from source array
            const srcIdx = fromArr.findIndex(n => n === node);
            if (srcIdx === -1) return;
            fromArr.splice(srcIdx, 1);

            if (didPromote && node.type !== 'category') {
                // Left-drag promotion: add to root regardless of drop position
                node.type = 'category';
                node.id = node.id || `promo_${node.name.replace(/\s+/g, '_')}`;
                if (!node.children) node.children = [];
                State.allTags.push(node);
            } else {
                // Normal drop: type promotion/demotion on cross-container move
                const toIsRoot = toArr === State.allTags;
                if (evt.from !== evt.to) {
                    if (toIsRoot && node.type !== 'category') {
                        node.type = 'category';
                        node.id = node.id || `promo_${node.name.replace(/\s+/g, '_')}`;
                        if (!node.children) node.children = [];
                    } else if (!toIsRoot && node.type === 'category') {
                        node.type = 'group';
                        // node.id はそのまま保持（グループも常にIDを持つ）
                    }
                }

                // Map DOM index → data array index (skip tags)
                const domIdx = evt.newDraggableIndex ?? evt.newIndex;
                let insertAt = toArr.length;
                let groupCount = 0;
                for (let i = 0; i < toArr.length; i++) {
                    if (toArr[i].type !== 'tag') {
                        if (groupCount === domIdx) { insertAt = i; break; }
                        groupCount++;
                    }
                }
                toArr.splice(insertAt, 0, node);
            }

            await saveTagOrder(State.allTags);

            if (prevCatName) {
                const updated = State.allTags.find(c => c.name === prevCatName);
                if (updated) State.currentCategoryId = updated.id;
            }

            renderExplorer();
            renderTagGrid();
        }
    });
    explorerSortables.push(s);
}

function handleItemClick(e, node, wrap, canExpand) {
    e.stopPropagation();
    State.isFavoriteView = false;
    State.isFrequentView = false;

    if (canExpand) {
        const isExpanded = wrap.classList.toggle('expanded');
        if (node.type === 'category') {
            if (isExpanded) {
                State.expandedCategories.clear();
                State.expandedCategories.add(node.id);
                State.expandedGroups.clear(); // カテゴリ切り替え時はグループもリセット
            } else {
                State.expandedCategories.delete(node.id);
                State.expandedGroups.clear();
            }
        } else {
            const pathId = node._pathId || node.name;
            if (isExpanded) {
                // 祖先グループ（このグループのパスのプレフィックス）だけ残し、
                // 兄弟・他ブランチは閉じる（アコーディオン）
                const ancestors = new Set();
                for (const id of State.expandedGroups) {
                    if (pathId.startsWith(id + ' > ')) ancestors.add(id);
                }
                State.expandedGroups.clear();
                for (const a of ancestors) State.expandedGroups.add(a);
                State.expandedGroups.add(pathId);
            } else {
                State.expandedGroups.delete(pathId);
            }
        }
    }

    if (node.type === 'category') {
        State.currentCategoryId = node.id;
        State.currentGroupName = null;
        State.currentTags = node.children || [];
    } else {
        State.currentGroupName = node.name;
        State.currentTags = node.children || [];
    }

    renderExplorer();
    renderTagGrid();
}

/**
 * Builds a pruned tree containing only favorite tags
 */
export function getFavoriteTree(nodes) {
    return nodes.map(node => {
        if (node.type === 'tag') {
            return node.favorite ? node : null;
        } else {
            const children = getFavoriteTree(node.children || []);
            const hasFavs = children.some(c => c !== null);
            if (hasFavs) {
                return { ...node, children: children.filter(c => c !== null) };
            }
        }
        return null;
    }).filter(n => n !== null);
}

/**
 * Returns flat list of tags sorted by usage frequency (top 60 used)
 */
export function getFrequentTree(nodes) {
    const allTags = [];
    const collect = (ns) => {
        for (const n of ns) {
            if (n.type === 'tag') allTags.push(n);
            else if (n.children) collect(n.children);
        }
    };
    collect(nodes);
    return allTags
        .filter(t => (State.tagUsageCount.get(t.name) || 0) > 0)
        .sort((a, b) => {
            const ca = State.tagUsageCount.get(a.name) || 0;
            const cb = State.tagUsageCount.get(b.name) || 0;
            return cb - ca;
        })
        .slice(0, 60);
}

/**
 * Global utility to find the path (CatID, GroupName) of a tag by its ID
 */
export function findNodeContext(nodes, tagId, parentCatId = null, parentGroupPath = []) {
    for (const node of nodes) {
        const isCat = !node.type || node.type === 'category';
        const catId = isCat ? node.id : parentCatId;
        const groupPath = node.type === 'group'
            ? [...parentGroupPath, node.name]
            : parentGroupPath;

        if (node.type === 'tag' && node.id === tagId) {
            return {
                catId,
                groupName: groupPath[groupPath.length - 1] || '',
                groupPath   // full path array e.g. ['表情', '基本表情', '喜び・笑い']
            };
        }
        if (node.children) {
            const result = findNodeContext(node.children, tagId, catId, groupPath);
            if (result) return result;
        }
    }
    return null;
}
