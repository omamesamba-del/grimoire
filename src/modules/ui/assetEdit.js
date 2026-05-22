/**
 * Asset Edit Modal — for LoRA and Embedding assets.
 * Shows CivitAI sample images with right-click "Set as Thumbnail",
 * trigger words, and a personal notes field.
 */

import { IPC } from '../core/ipc.js';
import { i18n } from '../core/i18n.js';

let _currentAsset = null;
let _contextMenu  = null;

export function initAssetEdit() {
    const dialog = document.getElementById('asset-edit-dialog');
    if (!dialog) return;

    document.getElementById('asset-edit-close')?.addEventListener('click', () => dialog.close());
    document.getElementById('asset-edit-cancel')?.addEventListener('click', () => dialog.close());

    // Copy trigger words
    document.getElementById('asset-edit-copy-triggers')?.addEventListener('click', () => {
        const text = document.getElementById('asset-edit-triggers')?.textContent || '';
        if (text) navigator.clipboard.writeText(text);
    });

    // Save notes
    document.getElementById('asset-edit-save')?.addEventListener('click', async () => {
        if (!_currentAsset?.fullPath) return;
        const notes = document.getElementById('asset-edit-notes')?.value || '';
        const settings = { ...(_currentAsset.pbSettings || {}), notes };
        const result = await IPC.saveCheckpointSettings(_currentAsset.fullPath, settings);
        if (result?.success) {
            _currentAsset.pbSettings = settings;
            dialog.close();
        }
    });

    // Image grid right-click
    document.getElementById('asset-edit-images')?.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const thumb = e.target.closest('.asset-edit-thumb');
        if (!thumb) return;
        _showContextMenu(e.clientX, e.clientY, thumb.dataset.url);
    });

    // Close context menu on outside click
    document.addEventListener('click', _hideContextMenu);
    document.addEventListener('contextmenu', (e) => {
        if (!e.target.closest('#asset-edit-images')) _hideContextMenu();
    });

    window.addEventListener('asset:open-edit', (e) => openAssetEditModal(e.detail));
}

export function openAssetEditModal(asset) {
    const dialog = document.getElementById('asset-edit-dialog');
    if (!dialog) return;
    _currentAsset = asset;

    const type = asset.type || 'lora';
    document.getElementById('asset-edit-type').textContent  = type.toUpperCase();
    document.getElementById('asset-edit-name').textContent  = asset.displayName || asset.name;

    // Trigger words
    const triggers = (asset.triggerWords || []).join(', ');
    const triggersEl = document.getElementById('asset-edit-triggers');
    if (triggersEl) triggersEl.textContent = triggers || '(none)';
    document.getElementById('asset-edit-copy-triggers').style.display = triggers ? '' : 'none';

    // Notes
    const notesEl = document.getElementById('asset-edit-notes');
    if (notesEl) notesEl.value = asset.pbSettings?.notes || '';

    // CivitAI images
    const imagesGrid    = document.getElementById('asset-edit-images');
    const imagesSection = document.getElementById('asset-edit-images-section');
    if (imagesGrid) {
        const images = asset.civitaiImages || [];
        if (images.length > 0) {
            imagesGrid.innerHTML = images.slice(0, 12).map(img => {
                const safeUrl = String(img.url || '').replace(/"/g, '&quot;');
                return `<div class="asset-edit-thumb" data-url="${safeUrl}" title="Right-click to set as thumbnail">
                    <img src="${safeUrl}" alt="" loading="lazy" onerror="this.closest('.asset-edit-thumb').style.display='none'">
                </div>`;
            }).join('');
            if (imagesSection) imagesSection.style.display = '';
        } else {
            if (imagesSection) imagesSection.style.display = 'none';
        }
    }

    dialog.showModal();
}

function _showContextMenu(x, y, imageUrl) {
    _hideContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.id = 'asset-edit-context-menu';
    menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:9999;`;
    menu.innerHTML = `<div class="context-menu-item" id="asset-edit-set-thumb">${i18n.t('asset_edit_set_thumb')}</div>`;
    document.getElementById('asset-edit-dialog').appendChild(menu);
    _contextMenu = menu;

    document.getElementById('asset-edit-set-thumb').addEventListener('click', async () => {
        _hideContextMenu();
        if (!_currentAsset?.fullPath || !imageUrl) return;
        const btn = document.getElementById('asset-edit-set-thumb');
        const result = await IPC.setAssetThumbnail(_currentAsset.fullPath, imageUrl);
        if (result?.success) {
            // Reflect new thumbnail in the asset card immediately
            _currentAsset.thumbnail = `asset:///${encodeURIComponent(result.thumbPath.replace(/\\/g, '/'))}`;
            window.dispatchEvent(new CustomEvent('asset:thumbnail-updated', { detail: _currentAsset }));
        }
    });
}

function _hideContextMenu() {
    if (_contextMenu) { _contextMenu.remove(); _contextMenu = null; }
}
