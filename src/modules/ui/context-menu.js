/**
 * Context Menu Logic for v4
 */
import { State } from '../core/state.js';
import { IPC } from '../core/ipc.js';
import { saveTagOrder } from '../tags/service.js';
import { openAddTagModal, openAddGroupModal, openAddCategoryModal, removeNodeById, showInputDialog, showConfirmDialog } from './modals.js';
import { findNodeContext, renderExplorer } from './explorer.js';
import { renderTagGrid, renderAssetGrid } from './library.js';
import { loadAssets } from '../assets/service.js';
import { i18n } from '../core/i18n.js';
import { CATEGORIES_PALETTE, PALETTE_CSS_VAR } from '../core/palette.js';

export function setupContextMenu() {
    const menu = document.getElementById('custom-context-menu');
    if (!menu) return;

    window.addEventListener('showContextMenu', (e) => {
        const { event, target, type } = e.detail;
        
        State.contextTarget = target;
        State.contextType = type;

        // Position menu
        let x = event.clientX;
        let y = event.clientY;
        if (x + 220 > window.innerWidth) x -= 220;
        if (y + 300 > window.innerHeight) y -= 300;
        
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.style.display = 'block';

        // Context-aware visibility
        const isAssetFolder = (type === 'asset-folder');
        const isAssetCard = (type === 'asset-card');
        const isGenPresetFolder = (type === 'gen-preset-folder');
        const isGenPresetFile = (type === 'gen-preset-file');
        const isTagType = !isAssetFolder && !isAssetCard && !isGenPresetFolder && !isGenPresetFile;

        document.getElementById('menu-tag-items').style.display = isTagType ? 'block' : 'none';
        document.getElementById('menu-asset-items').style.display = isAssetFolder ? 'block' : 'none';
        document.getElementById('menu-asset-card-items').style.display = isAssetCard ? 'block' : 'none';
        // Show/hide items based on mode and available metadata
        if (isAssetCard) {
            const isCheckpoint = State.currentMode === 'checkpoint';
            const hasPbSettings = !!(target?.pbSettings && Object.keys(target.pbSettings).length > 0);
            const sendItem = document.getElementById('menu-asset-send-settings');
            const editItem = document.getElementById('menu-asset-edit-settings');
            const editSep  = document.getElementById('menu-asset-edit-settings-sep');
            if (sendItem) sendItem.style.display = (isCheckpoint && hasPbSettings) ? '' : 'none';
            if (editItem) editItem.style.display = isCheckpoint ? '' : 'none';
            if (editSep)  editSep.style.display  = isCheckpoint ? '' : 'none';
            const openPageItem = document.getElementById('menu-asset-open-civitai-page');
            if (openPageItem) openPageItem.style.display = target?.modelId ? '' : 'none';
        }
        document.getElementById('menu-gen-preset-folder-items').style.display = isGenPresetFolder ? 'block' : 'none';
        document.getElementById('menu-gen-preset-file-items').style.display = isGenPresetFile ? 'block' : 'none';

        const menuCat = document.getElementById('menu-cat-only');
        if (menuCat) {
            menuCat.style.display = (type === 'category') ? 'block' : 'none';
            if (type === 'category') renderContextMenuColors(target);
        }
    });

    window.addEventListener('click', () => {
        menu.style.display = 'none';
    });

    // Menu Item Click Handlers
    document.getElementById('menu-add-tag').onclick = () => {
        if (!State.contextTarget) return;
        const target = State.contextTarget;
        if (target.type === 'group') {
            const context = findGroupParentContext(State.allTags, target.name);
            if (context) openAddTagModal(context.catId, target.name);
        } else {
            openAddTagModal(target.id, '');
        }
    };

    document.getElementById('menu-add-group').onclick = () => {
        if (!State.contextTarget) return;
        const target = State.contextTarget;
        if (target.type === 'group') {
            const context = findGroupParentContext(State.allTags, target.name);
            if (context) openAddGroupModal(context.catId, target.name);
        } else {
            openAddGroupModal(target.id, '');
        }
    };

    document.getElementById('menu-rename').onclick = () => {
        if (!State.contextTarget) return;
        const target = State.contextTarget;
        const type = State.contextType;

        if (type === 'tag') {
            const context = findNodeContext(State.allTags, target.id);
            if (context) openAddTagModal(context.catId, context.groupName, target, context.groupPath);
        } else if (type === 'group') {
            const context = findGroupParentContext(State.allTags, target.name);
            if (context) openAddGroupModal(context.catId, context.parentGroupName, target);
        } else if (type === 'category') {
            openAddCategoryModal(target);
        }
    };
    
    document.getElementById('menu-delete').onclick = async () => {
        if (!State.contextTarget) return;
        const target = State.contextTarget;
        const id = target.id || target.name;

        if (await showConfirmDialog(`Delete "${target.name || id}"?`)) {
            if (removeNodeById(State.allTags, id)) {
                await saveTagOrder(State.allTags);
                window.dispatchEvent(new CustomEvent('tagsUpdated'));
                renderExplorer();
                renderTagGrid();
            }
        }
    };

    // --- Asset Folder handlers ---
    document.getElementById('menu-asset-new-subfolder').onclick = async () => {
        const target = State.contextTarget;
        if (!target) return;
        const name = await showInputDialog('New Folder Name');
        if (!name) return;
        const cfg = await IPC.getConfig();
        const basePath = State.currentMode === 'lora'       ? cfg.loraPath
                       : State.currentMode === 'checkpoint' ? cfg.checkpointsPath
                       :                                       cfg.embeddingsPath;
        if (!basePath) { alert('フォルダーパスが設定されていません。'); return; }
        const base = basePath.replace(/[\\/]+$/, '');
        const parentRel = target.relPath;
        const fullPath = parentRel
            ? `${base}\\${parentRel.replace(/\//g, '\\')}\\${name.trim()}`
            : `${base}\\${name.trim()}`;
        try {
            await IPC.createAssetFolder(fullPath);
            State.allAssets = await loadAssets();
            renderExplorer();
            renderAssetGrid();
        } catch (e) {
            alert(`Failed to create folder: ${e.message}`);
        }
    };

    document.getElementById('menu-asset-rename-folder').onclick = async () => {
        const target = State.contextTarget;
        if (!target || !target.relPath) return;
        const newName = await showInputDialog('Rename Folder', target.name);
        if (!newName || newName === target.name) return;
        const cfg = await IPC.getConfig();
        const basePath = State.currentMode === 'lora'       ? cfg.loraPath
                       : State.currentMode === 'checkpoint' ? cfg.checkpointsPath
                       :                                       cfg.embeddingsPath;
        const parts = target.relPath.replace(/\//g, '\\').split('\\');
        parts[parts.length - 1] = newName.trim();
        const oldFull = `${basePath}\\${target.relPath.replace(/\//g, '\\')}`;
        const newFull = `${basePath}\\${parts.join('\\')}`;
        try {
            await IPC.moveAssetFolder(oldFull, newFull);
            State.allAssets = await loadAssets();
            State.currentAssetFilter = null;
            renderExplorer();
            renderAssetGrid();
        } catch (e) {
            alert(`Failed to rename folder: ${e.message}`);
        }
    };

    // --- Asset Card handlers ---
    document.getElementById('menu-asset-send-settings').onclick = () => {
        const asset = State.contextTarget;
        if (!asset) return;
        window.dispatchEvent(new CustomEvent('checkpoint:apply-settings', { detail: asset }));
    };

    document.getElementById('menu-asset-edit-settings').onclick = () => {
        const asset = State.contextTarget;
        if (!asset) return;
        window.dispatchEvent(new CustomEvent('checkpoint:open-edit', { detail: asset }));
    };

    document.getElementById('menu-asset-delete-metadata').onclick = async () => {
        const asset = State.contextTarget;
        if (!asset?.fullPath) return;
        if (!await showConfirmDialog(`Delete metadata for "${asset.name}"?\n(.civitai.info and preview image will be removed)`)) return;
        try {
            await IPC.deleteAssetMetadata(asset.fullPath);
            State.allAssets = await loadAssets();
            renderAssetGrid();
        } catch (err) {
            alert(`Failed to delete metadata: ${err.message}`);
        }
    };

    document.getElementById('menu-asset-fetch-civitai').onclick = async () => {
        const asset = State.contextTarget;
        if (!asset?.fullPath) return;
        try {
            const cfg = await IPC.getConfig();
            await IPC.fetchCivitaiMetadata(asset.fullPath, cfg.civitaiApiKey || '');
            State.allAssets = await loadAssets();
            renderAssetGrid();
        } catch (err) {
            alert(`CivitAI fetch failed: ${err.message}`);
        }
    };

    document.getElementById('menu-asset-open-civitai-page').onclick = async () => {
        const asset = State.contextTarget;
        if (!asset?.modelId) return;
        const url = await IPC.civitaiPageUrl(asset.modelId, asset.versionId);
        IPC.openExternal(url);
    };

    document.getElementById('menu-asset-move-to').onclick = () => {
        openFolderPicker(State.contextTarget);
    };

    document.getElementById('menu-asset-delete').onclick = async () => {
        const asset = State.contextTarget;
        if (!asset?.fullPath) return;
        const name = asset.name || asset.fullPath.split(/[\\/]/).pop();
        if (!await showConfirmDialog(i18n.t('confirm_delete_asset').replace('{name}', name))) return;
        try {
            await IPC.deleteAssetFile(asset.fullPath);
            State.allAssets = await loadAssets();
            renderExplorer();
            renderAssetGrid();
        } catch (err) {
            alert(i18n.t('toast_delete_failed').replace('{msg}', err.message));
        }
    };

    // --- Gen Preset Folder handlers ---
    document.getElementById('menu-gen-preset-new-folder').onclick = async () => {
        const target = State.contextTarget;
        const name = await showInputDialog('New Folder Name');
        if (!name) return;
        const parentRel = target?.relPath || '';
        const newRel = parentRel ? `${parentRel}/${name.trim()}` : name.trim();
        await IPC.createGenPresetFolder(newRel);
        renderExplorer();
    };

    document.getElementById('menu-gen-preset-rename-folder').onclick = async () => {
        const target = State.contextTarget;
        if (!target?.relPath) return;
        const newName = await showInputDialog('Rename Folder', target.name);
        if (!newName || newName === target.name) return;
        await IPC.renameGenPresetFolder(target.relPath, newName);
        State.currentGenPresetFolder = null;
        renderExplorer();
    };

    document.getElementById('menu-gen-preset-delete-folder').onclick = async () => {
        const target = State.contextTarget;
        if (!target?.relPath) return;
        if (!await showConfirmDialog(`Delete folder "${target.name}" and all its presets?`)) return;
        await IPC.deleteGenPresetFolder(target.relPath);
        State.currentGenPresetFolder = null;
        renderExplorer();
    };

    // --- Gen Preset File handlers ---
    document.getElementById('menu-gen-preset-rename-file').onclick = async () => {
        const target = State.contextTarget;
        if (!target?.relPath) return;
        const newName = await showInputDialog('Rename Preset', target.name);
        if (!newName || newName === target.name) return;
        await IPC.renameGenPreset(target.relPath, newName);
        if (State.currentGenPresetRelPath === target.relPath) State.currentGenPresetRelPath = null;
        renderExplorer();
    };

    document.getElementById('menu-gen-preset-delete-file').onclick = async () => {
        const target = State.contextTarget;
        if (!target?.relPath) return;
        if (!await showConfirmDialog(`Delete preset "${target.name}"?`)) return;
        await IPC.deleteGenPreset(target.relPath);
        if (State.currentGenPresetRelPath === target.relPath) State.currentGenPresetRelPath = null;
        renderExplorer();
    };
}

async function openFolderPicker(asset) {
    if (!asset) return;
    const cfg = await IPC.getConfig();
    const basePath = State.currentMode === 'lora'       ? cfg.loraPath
                   : State.currentMode === 'checkpoint' ? cfg.checkpointsPath
                   :                                       cfg.embeddingsPath;

    // Collect unique folder paths from current assets
    const assets = State.currentMode === 'lora'       ? (State.allAssets.loras       || [])
                 : State.currentMode === 'checkpoint' ? (State.allAssets.checkpoints || [])
                 :                                       (State.allAssets.embeddings  || []);
    const folders = new Set(['']);
    assets.forEach(a => {
        if (a.relPath) {
            const parts = a.relPath.replace(/\\/g, '/').split('/');
            parts.pop();
            for (let i = 1; i <= parts.length; i++) {
                folders.add(parts.slice(0, i).join('/'));
            }
        }
    });
    const folderList = Array.from(folders).sort();

    const listEl = document.getElementById('folder-picker-list');
    listEl.innerHTML = '';
    let selectedFolder = null;

    folderList.forEach(rel => {
        const row = document.createElement('div');
        row.className = 'folder-picker-item';
        row.textContent = rel === '' ? '/ (root)' : rel;
        row.dataset.rel = rel;
        row.onclick = () => {
            listEl.querySelectorAll('.folder-picker-item').forEach(r => r.classList.remove('selected'));
            row.classList.add('selected');
            selectedFolder = rel;
        };
        listEl.appendChild(row);
    });

    const dialog = document.getElementById('asset-folder-picker');
    dialog.showModal();

    document.getElementById('btn-folder-picker-cancel').onclick = () => dialog.close();

    document.getElementById('btn-folder-picker-confirm').onclick = async () => {
        if (selectedFolder === null) return;
        const destDir = selectedFolder === ''
            ? basePath
            : `${basePath}\\${selectedFolder.replace(/\//g, '\\')}`;
        dialog.close();
        try {
            await moveWithConflictCheck([asset.fullPath], destDir);
            State.allAssets = await loadAssets();
            renderExplorer();
            renderAssetGrid();
        } catch (e) {
            alert(`Move failed: ${e.message}`);
        }
    };
}

/**
 * Move one or more asset files to destDir, showing a conflict dialog if needed.
 * conflictMode: 'ask' (default) → show dialog, 'rename', 'overwrite'
 */
export async function moveWithConflictCheck(fullPaths, destDir, conflictMode = 'ask') {
    let resolvedMode = conflictMode;

    // First pass: check for conflicts using the first file
    if (resolvedMode === 'ask') {
        for (const fp of fullPaths) {
            const result = await IPC.moveAssetFile(fp, destDir, 'ask');
            if (result?.needsConfirm) {
                resolvedMode = await showConflictDialog(result.conflicts);
                if (!resolvedMode) return; // cancelled
                break;
            }
        }
        if (resolvedMode === 'ask') resolvedMode = 'rename'; // no conflicts found
    }

    // Actual move with resolved mode
    for (const fp of fullPaths) {
        await IPC.moveAssetFile(fp, destDir, resolvedMode);
    }
}

function showConflictDialog(conflicts) {
    return new Promise((resolve) => {
        const dialog = document.getElementById('asset-conflict-dialog');
        const msg = document.getElementById('conflict-dialog-msg');
        const names = conflicts.slice(0, 3).join(', ') + (conflicts.length > 3 ? ` … (+${conflicts.length - 3})` : '');
        msg.textContent = `The following file(s) already exist in the destination:\n${names}`;

        const cleanup = (result) => {
            dialog.close();
            btnCancel.onclick = btnRename.onclick = btnOverwrite.onclick = null;
            resolve(result);
        };

        const btnCancel    = document.getElementById('btn-conflict-cancel');
        const btnRename    = document.getElementById('btn-conflict-rename');
        const btnOverwrite = document.getElementById('btn-conflict-overwrite');

        btnCancel.onclick    = () => cleanup(null);
        btnRename.onclick    = () => cleanup('rename');
        btnOverwrite.onclick = () => cleanup('overwrite');

        dialog.showModal();
    });
}

/**
 * Finds the parent category ID and parent group name for a group node by its name.
 */
export function findGroupParentContext(nodes, groupName, parentCatId = null, parentGroupName = '') {
    for (const node of nodes) {
        const catId = node.type === 'category' ? node.id : parentCatId;
        if (node.type === 'group' && node.name === groupName) {
            return { catId, parentGroupName };
        }
        if (node.children) {
            const groupCtx = node.type === 'group' ? node.name : parentGroupName;
            const result = findGroupParentContext(node.children, groupName, catId, groupCtx);
            if (result) return result;
        }
    }
    return null;
}

function renderContextMenuColors(target) {
    const grid = document.getElementById('menu-color-grid');
    if (!grid) return;
    
    // Find the actual node in State to get current color
    // target in event usually just has id/name for categories from Explorer
    const category = State.allTags.find(cat => cat.id === target.id);
    if (!category) return;

    grid.innerHTML = '';
    CATEGORIES_PALETTE.forEach(colorKey => {
        const swatch = document.createElement('div');
        swatch.className = `color-swatch cat-${colorKey} ${category.color === colorKey ? 'active' : ''}`;
        swatch.style.backgroundColor = PALETTE_CSS_VAR[colorKey];
        swatch.title = colorKey;
        
        swatch.onclick = async (e) => {
            e.stopPropagation();
            category.color = colorKey;
            await saveTagOrder(State.allTags);
            
            // Trigger refresh of main UI
            window.dispatchEvent(new CustomEvent('tagsUpdated'));
            
            const menu = document.getElementById('custom-context-menu');
            if (menu) menu.style.display = 'none';
        };
        grid.appendChild(swatch);
    });
}
