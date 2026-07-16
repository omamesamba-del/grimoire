/**
 * Checkpoint Recommended Settings — edit modal + apply logic.
 *
 * The hover popup is rendered by library.js (showCheckpointPopup).
 * This module:
 *   - Listens for 'checkpoint:open-edit' and 'checkpoint:apply-settings' events.
 *   - Opens / populates the #checkpoint-edit-dialog.
 *   - Saves settings as <name>.pb_settings.json via IPC.
 *   - Fetches CivitAI sample images and parses PNG metadata for auto-fill.
 */

import { IPC } from '../core/ipc.js';
import { i18n } from '../core/i18n.js';
import { applyPreset } from './generation.js';
import { readPngTextChunks, parseSdMetadata } from './genPngDrop.js';

let _currentAsset = null;
let _contextMenu  = null;

// ── Init ──────────────────────────────────────────────────────────────────────

export function initCheckpointEdit() {
    const dialog = document.getElementById('checkpoint-edit-dialog');
    if (!dialog) return;

    // Close / Cancel
    document.getElementById('checkpoint-edit-close')?.addEventListener('click', () => dialog.close());
    document.getElementById('checkpoint-edit-cancel')?.addEventListener('click', () => dialog.close());

    // Send Tags
    document.getElementById('checkpoint-edit-send-tags')?.addEventListener('click', () => {
        if (!_currentAsset) return;
        _sendTags();
    });

    // Send Gen Settings
    document.getElementById('checkpoint-edit-send-gens')?.addEventListener('click', () => {
        if (!_currentAsset) return;
        _sendGens();
    });

    // Clear
    document.getElementById('checkpoint-edit-clear')?.addEventListener('click', () => {
        const ids = [
            'checkpoint-edit-positive', 'checkpoint-edit-negative',
            'checkpoint-edit-sampler', 'checkpoint-edit-schedule',
            'checkpoint-edit-steps', 'checkpoint-edit-cfg', 'checkpoint-edit-seed',
            'checkpoint-edit-width', 'checkpoint-edit-height', 'checkpoint-edit-clipskip', 'checkpoint-edit-vae',
            'checkpoint-edit-hires-upscaler', 'checkpoint-edit-hires-steps', 'checkpoint-edit-hires-denoise',
        ];
        ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        const hires = document.getElementById('checkpoint-edit-hires-enabled');
        if (hires) hires.checked = false;
    });

    // Apply Now
    document.getElementById('checkpoint-edit-apply')?.addEventListener('click', () => {
        if (!_currentAsset) return;
        _collectAndApply();
    });

    // Save
    document.getElementById('checkpoint-edit-save')?.addEventListener('click', async () => {
        if (!_currentAsset) return;
        await _collectAndSave();
    });

    // Right-click on a CivitAI thumbnail → set as thumbnail
    document.getElementById('checkpoint-edit-images')?.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const thumb = e.target.closest('.cp-edit-civitai-thumb');
        if (!thumb) return;
        _showContextMenu(e.clientX, e.clientY, thumb.dataset.url);
    });

    // Close context menu on outside click
    document.addEventListener('click', _hideContextMenu);
    document.addEventListener('contextmenu', (e) => {
        if (!e.target.closest('#checkpoint-edit-images')) _hideContextMenu();
    });

    // Click on a CivitAI thumbnail → auto-fill from PNG metadata
    document.getElementById('checkpoint-edit-images')?.addEventListener('click', async (e) => {
        const thumb = e.target.closest('.cp-edit-civitai-thumb');
        if (!thumb) return;
        const url = thumb.dataset.url;
        if (!url) return;

        thumb.classList.add('loading');
        // Mark all thumbs, highlight this one
        document.querySelectorAll('.cp-edit-civitai-thumb').forEach(t => t.classList.remove('selected'));
        thumb.classList.add('selected');

        try {
            // 1. Try PNG chunk parsing first
            const parsed = await _fetchAndParsePng(url);
            if (parsed?.positive || parsed?.params) {
                _fillFormFromParsed(parsed);
                return;
            }
            // 2. Fallback: use CivitAI API meta JSON stored in data attribute
            const metaJson = thumb.dataset.metaJson;
            if (metaJson) {
                try {
                    _fillFormFromApiMeta(JSON.parse(metaJson));
                } catch (_) {}
            }
        } catch (err) {
            console.error('[CheckpointEdit] PNG fetch error', err);
        } finally {
            thumb.classList.remove('loading');
        }
    });

    // Global event bus
    window.addEventListener('checkpoint:open-edit', (e) => {
        openCheckpointEditModal(e.detail);
    });
    window.addEventListener('checkpoint:apply-settings', (e) => {
        applyCheckpointSettings(e.detail);
    });
}

// ── Apply saved settings on checkpoint click ──────────────────────────────────

export function applyPbSettingsFromAsset(asset) {
    const s = asset?.pbSettings;
    if (!s) return;

    // Prompts: append
    const posEl = document.getElementById('positive-prompt');
    const negEl = document.getElementById('negative-prompt');
    if (posEl && s.positive) {
        const cur = posEl.value.trim();
        posEl.value = cur ? `${cur}, ${s.positive}` : s.positive;
        posEl.dispatchEvent(new Event('input'));
    }
    if (negEl && s.negative) {
        const cur = negEl.value.trim();
        negEl.value = cur ? `${cur}, ${s.negative}` : s.negative;
        negEl.dispatchEvent(new Event('input'));
    }

    // Gen settings
    applyPreset({
        sampler:        s.sampler       || undefined,
        schedule:       s.schedule      || undefined,
        steps:          s.steps         ? Number(s.steps)          : undefined,
        cfg:            s.cfg           ? Number(s.cfg)            : undefined,
        seed:           s.seed !== ''   ? s.seed                   : undefined,
        width:          s.width         ? Number(s.width)          : undefined,
        height:         s.height        ? Number(s.height)         : undefined,
        clipSkip:       s.clipSkip      ? Number(s.clipSkip)       : undefined,
        vae:            s.vae           || undefined,
        hiresFix:       s.hiresEnabled  ? true                     : undefined,
        hiresUpscaler:  s.hiresUpscaler || undefined,
        hiresSteps:     s.hiresSteps    ? Number(s.hiresSteps)     : undefined,
        hiresDenoising: s.hiresDenoising? Number(s.hiresDenoising) : undefined,
    });
}

// ── Apply only gen settings on checkpoint click (no prompt change) ────────────

export function applyGenSettingsFromAsset(asset) {
    const s = asset?.pbSettings;
    if (!s) return;
    applyPreset({
        sampler:        s.sampler       || undefined,
        schedule:       s.schedule      || undefined,
        steps:          s.steps         ? Number(s.steps)          : undefined,
        cfg:            s.cfg           ? Number(s.cfg)            : undefined,
        seed:           s.seed !== ''   ? s.seed                   : undefined,
        width:          s.width         ? Number(s.width)          : undefined,
        height:         s.height        ? Number(s.height)         : undefined,
        clipSkip:       s.clipSkip      ? Number(s.clipSkip)       : undefined,
        vae:            s.vae           || undefined,
        hiresFix:       s.hiresEnabled  ? true                     : undefined,
        hiresUpscaler:  s.hiresUpscaler || undefined,
        hiresSteps:     s.hiresSteps    ? Number(s.hiresSteps)     : undefined,
        hiresDenoising: s.hiresDenoising? Number(s.hiresDenoising) : undefined,
    });
}

// ── Open Modal ────────────────────────────────────────────────────────────────

export function openCheckpointEditModal(asset) {
    const dialog = document.getElementById('checkpoint-edit-dialog');
    if (!dialog) return;
    _currentAsset = asset;

    // Title
    const nameEl = document.getElementById('checkpoint-edit-name');
    if (nameEl) nameEl.textContent = asset.displayName || asset.name;

    // CivitAI images
    const imagesGrid    = document.getElementById('checkpoint-edit-images');
    const imagesSection = document.getElementById('checkpoint-edit-images-section');
    if (imagesGrid) {
        const images = asset.civitaiImages || [];
        if (images.length > 0) {
            imagesGrid.innerHTML = images.slice(0, 12).map(img => {
                const safeUrl  = String(img.url || '').replace(/"/g, '&quot;');
                const metaJson = img.meta ? JSON.stringify(img.meta).replace(/"/g, '&quot;') : '';
                const hasMeta  = !!img.meta;
                return `<div class="cp-edit-civitai-thumb" data-url="${safeUrl}" data-meta-json="${metaJson}" title="${hasMeta ? 'Click to auto-fill · Right-click to set as thumbnail' : 'Right-click to set as thumbnail'}">
                    <img src="${safeUrl}" alt="" loading="lazy" onerror="this.closest('.cp-edit-civitai-thumb').style.display='none'">
                    ${hasMeta ? '<span class="cp-edit-has-meta">i</span>' : ''}
                </div>`;
            }).join('');
            if (imagesSection) imagesSection.style.display = '';
        } else {
            if (imagesSection) imagesSection.style.display = 'none';
        }
    }

    // Fill form from saved pbSettings
    const s = asset.pbSettings || {};
    _setVal('checkpoint-edit-positive',      s.positive      ?? '');
    _setVal('checkpoint-edit-negative',      s.negative      ?? '');
    _setVal('checkpoint-edit-sampler',       s.sampler       ?? '');
    _setVal('checkpoint-edit-schedule',      s.schedule      ?? '');
    _setVal('checkpoint-edit-steps',         s.steps         ?? '');
    _setVal('checkpoint-edit-cfg',           s.cfg           ?? '');
    _setVal('checkpoint-edit-seed',          s.seed          ?? '');
    _setVal('checkpoint-edit-width',         s.width         ?? '');
    _setVal('checkpoint-edit-height',        s.height        ?? '');
    _setVal('checkpoint-edit-clipskip',      s.clipSkip      ?? '');
    _setVal('checkpoint-edit-vae',           s.vae           ?? '');
    _setChk('checkpoint-edit-hires-enabled', !!s.hiresEnabled);
    _setVal('checkpoint-edit-hires-upscaler',s.hiresUpscaler ?? '');
    _setVal('checkpoint-edit-hires-steps',   s.hiresSteps    ?? '');
    _setVal('checkpoint-edit-hires-denoise', s.hiresDenoising ?? '');

    dialog.showModal();
}

// ── Apply settings from pbSettings directly (e.g. from popup button) ──────────

export function applyCheckpointSettings(asset) {
    const s = asset?.pbSettings;
    if (!s) return;

    // Prompts
    if (s.positive !== undefined) {
        const el = document.getElementById('positive-prompt');
        if (el) { el.value = s.positive; el.dispatchEvent(new Event('input')); }
    }
    if (s.negative !== undefined) {
        const el = document.getElementById('negative-prompt');
        if (el) { el.value = s.negative; el.dispatchEvent(new Event('input')); }
    }

    // Gen data via applyPreset
    const basename = (asset.relPath || asset.name || '').replace(/\\/g, '/').split('/').pop();
    applyPreset({
        checkpoint:    basename                                   || undefined,
        sampler:       s.sampler       || undefined,
        schedule:      s.schedule      || undefined,
        steps:         s.steps         ? Number(s.steps)         : undefined,
        cfg:           s.cfg           ? Number(s.cfg)           : undefined,
        seed:          s.seed          !== '' ? s.seed           : undefined,
        width:         s.width         ? Number(s.width)         : undefined,
        height:        s.height        ? Number(s.height)        : undefined,
        clipSkip:      s.clipSkip      ? Number(s.clipSkip)      : undefined,
        vae:           s.vae           || undefined,
        hiresFix:      s.hiresEnabled  ? true                    : undefined,
        hiresUpscaler: s.hiresUpscaler || undefined,
        hiresSteps:    s.hiresSteps    ? Number(s.hiresSteps)    : undefined,
        hiresDenoising:s.hiresDenoising? Number(s.hiresDenoising): undefined,
    });
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _setVal(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ?? '';
}

function _setChk(id, checked) {
    const el = document.getElementById(id);
    if (el) el.checked = !!checked;
}

function _collectSettings() {
    return {
        positive:      document.getElementById('checkpoint-edit-positive')?.value      || '',
        negative:      document.getElementById('checkpoint-edit-negative')?.value      || '',
        sampler:       document.getElementById('checkpoint-edit-sampler')?.value       || '',
        schedule:      document.getElementById('checkpoint-edit-schedule')?.value      || '',
        steps:         document.getElementById('checkpoint-edit-steps')?.value         || '',
        cfg:           document.getElementById('checkpoint-edit-cfg')?.value           || '',
        seed:          document.getElementById('checkpoint-edit-seed')?.value          || '',
        width:         document.getElementById('checkpoint-edit-width')?.value         || '',
        height:        document.getElementById('checkpoint-edit-height')?.value        || '',
        clipSkip:      document.getElementById('checkpoint-edit-clipskip')?.value      || '',
        vae:           document.getElementById('checkpoint-edit-vae')?.value            || '',
        hiresEnabled:  document.getElementById('checkpoint-edit-hires-enabled')?.checked ?? false,
        hiresUpscaler: document.getElementById('checkpoint-edit-hires-upscaler')?.value || '',
        hiresSteps:    document.getElementById('checkpoint-edit-hires-steps')?.value   || '',
        hiresDenoising:document.getElementById('checkpoint-edit-hires-denoise')?.value  || '',
    };
}

function _sendTags() {
    const s = _collectSettings();
    const posEl = document.getElementById('positive-prompt');
    const negEl = document.getElementById('negative-prompt');
    if (posEl && s.positive) { posEl.value = s.positive; posEl.dispatchEvent(new Event('input')); }
    if (negEl && s.negative) { negEl.value = s.negative; negEl.dispatchEvent(new Event('input')); }
}

function _sendGens() {
    const s = _collectSettings();
    applyPreset({
        sampler:        s.sampler       || undefined,
        schedule:       s.schedule      || undefined,
        steps:          s.steps         ? Number(s.steps)          : undefined,
        cfg:            s.cfg           ? Number(s.cfg)            : undefined,
        seed:           s.seed !== ''   ? s.seed                   : undefined,
        width:          s.width         ? Number(s.width)          : undefined,
        height:         s.height        ? Number(s.height)         : undefined,
        clipSkip:       s.clipSkip      ? Number(s.clipSkip)       : undefined,
        vae:            s.vae           || undefined,
        hiresFix:       s.hiresEnabled  ? true                     : undefined,
        hiresUpscaler:  s.hiresUpscaler || undefined,
        hiresSteps:     s.hiresSteps    ? Number(s.hiresSteps)     : undefined,
        hiresDenoising: s.hiresDenoising? Number(s.hiresDenoising) : undefined,
    });
}

function _collectAndApply() {
    const s = _collectSettings();

    // Prompts
    const posEl = document.getElementById('positive-prompt');
    const negEl = document.getElementById('negative-prompt');
    if (posEl && s.positive) { posEl.value = s.positive; posEl.dispatchEvent(new Event('input')); }
    if (negEl && s.negative) { negEl.value = s.negative; negEl.dispatchEvent(new Event('input')); }

    // Gen data
    applyPreset({
        sampler:        s.sampler       || undefined,
        schedule:       s.schedule      || undefined,
        steps:          s.steps         ? Number(s.steps)          : undefined,
        cfg:            s.cfg           ? Number(s.cfg)            : undefined,
        seed:           s.seed !== ''   ? s.seed                   : undefined,
        width:          s.width         ? Number(s.width)          : undefined,
        height:         s.height        ? Number(s.height)         : undefined,
        clipSkip:       s.clipSkip      ? Number(s.clipSkip)       : undefined,
        vae:            s.vae           || undefined,
        hiresFix:       s.hiresEnabled  ? true                     : undefined,
        hiresUpscaler:  s.hiresUpscaler || undefined,
        hiresSteps:     s.hiresSteps    ? Number(s.hiresSteps)     : undefined,
        hiresDenoising: s.hiresDenoising? Number(s.hiresDenoising) : undefined,
    });
}

async function _collectAndSave() {
    if (!_currentAsset?.fullPath) return;
    const settings = _collectSettings();
    try {
        const result = await IPC.saveCheckpointSettings(_currentAsset.fullPath, settings);
        if (result?.success) {
            // Update in-memory asset so popup reflects new state immediately
            _currentAsset.pbSettings = settings;
            document.getElementById('checkpoint-edit-dialog')?.close();
        }
    } catch (err) {
        console.error('[CheckpointEdit] Save failed', err);
    }
}

// ── PNG fetching & parsing ────────────────────────────────────────────────────

async function _fetchAndParsePng(url) {
    try {
        const base64 = await IPC.fetchCheckpointImageBuffer(url);
        if (!base64) return null;

        // Decode base64 → ArrayBuffer
        const binary = atob(base64);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        const chunks = readPngTextChunks(bytes.buffer);
        if (!chunks) return null;

        const raw = chunks['parameters'] || chunks['Parameters'] || '';
        if (!raw || raw.startsWith('{')) return null;

        return parseSdMetadata(raw);
    } catch (err) {
        console.error('[CheckpointEdit] _fetchAndParsePng', err);
        return null;
    }
}

function _fillFormFromParsed(parsed) {
    if (parsed.positive) _setVal('checkpoint-edit-positive', parsed.positive);
    if (parsed.negative) _setVal('checkpoint-edit-negative', parsed.negative);

    const p = parsed.params || {};
    const ci = (key) => {
        const entry = Object.entries(p).find(([k]) => k.toLowerCase() === key.toLowerCase());
        return entry ? entry[1] : undefined;
    };

    const sampler = ci('Sampler');
    if (sampler) {
        // Strip schedule suffix if baked in (old A1111 style)
        const SCHED = ['Karras', 'Exponential', 'Polyexponential', 'SGM Uniform'];
        let s = sampler, sch = ci('Schedule type') || '';
        if (!sch) {
            for (const sf of SCHED) {
                if (s.endsWith(` ${sf}`)) { s = s.slice(0, -(sf.length + 1)); sch = sf; break; }
            }
        }
        _setVal('checkpoint-edit-sampler', s);
        if (sch) _setVal('checkpoint-edit-schedule', sch);
    }

    const scheduleType = ci('Schedule type');
    if (scheduleType) _setVal('checkpoint-edit-schedule', scheduleType);

    if (ci('Steps'))     _setVal('checkpoint-edit-steps',   ci('Steps'));
    if (ci('CFG scale')) _setVal('checkpoint-edit-cfg',     ci('CFG scale'));
    if (ci('Seed'))      _setVal('checkpoint-edit-seed',    ci('Seed'));
    if (ci('Clip skip')) _setVal('checkpoint-edit-clipskip',ci('Clip skip'));
    if (ci('VAE'))       _setVal('checkpoint-edit-vae',     ci('VAE'));

    const sizeStr = ci('Size');
    if (sizeStr) {
        const [w, h] = sizeStr.split('x');
        if (w && !isNaN(Number(w))) _setVal('checkpoint-edit-width',  w.trim());
        if (h && !isNaN(Number(h))) _setVal('checkpoint-edit-height', h.trim());
    }

    const hiresUpscaler = ci('Hires upscaler');
    const hiresUpscale  = ci('Hires upscale');
    if (hiresUpscaler || hiresUpscale) {
        _setChk('checkpoint-edit-hires-enabled', true);
        if (hiresUpscaler) _setVal('checkpoint-edit-hires-upscaler', hiresUpscaler);
        const hiresSteps = ci('Hires steps');
        if (hiresSteps) _setVal('checkpoint-edit-hires-steps', hiresSteps);
        const denoise = ci('Denoising strength');
        if (denoise) _setVal('checkpoint-edit-hires-denoise', denoise);
    }
}

function _fillFormFromApiMeta(meta) {
    // CivitAI API img.meta fields
    if (meta.prompt)         _setVal('checkpoint-edit-positive', meta.prompt);
    if (meta.negativePrompt) _setVal('checkpoint-edit-negative', meta.negativePrompt);
    if (meta.sampler)        _setVal('checkpoint-edit-sampler',  meta.sampler);
    if (meta.steps)          _setVal('checkpoint-edit-steps',    String(meta.steps));
    if (meta.cfgScale)       _setVal('checkpoint-edit-cfg',      String(meta.cfgScale));
    if (meta.seed)           _setVal('checkpoint-edit-seed',     String(meta.seed));
    if (meta.clipSkip)       _setVal('checkpoint-edit-clipskip', String(meta.clipSkip));
    if (meta.VAE)            _setVal('checkpoint-edit-vae',       meta.VAE);
    if (meta.Size) {
        const [w, h] = meta.Size.split('x');
        if (w) _setVal('checkpoint-edit-width',  w.trim());
        if (h) _setVal('checkpoint-edit-height', h.trim());
    }
}

// ── Thumbnail context menu ────────────────────────────────────────────────────

function _showContextMenu(x, y, imageUrl) {
    _hideContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.id = 'cp-edit-context-menu';
    menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:9999;`;
    menu.innerHTML = `<div class="context-menu-item" id="cp-edit-set-thumb">${i18n.t('asset_edit_set_thumb')}</div>`;
    document.getElementById('checkpoint-edit-dialog').appendChild(menu);
    _contextMenu = menu;

    document.getElementById('cp-edit-set-thumb').addEventListener('click', async () => {
        _hideContextMenu();
        if (!_currentAsset?.fullPath || !imageUrl) return;
        const result = await IPC.setAssetThumbnail(_currentAsset.fullPath, imageUrl);
        if (result?.success) {
            _currentAsset.thumbnail = `asset:///${encodeURIComponent(result.thumbPath.replace(/\\/g, '/'))}`;
            window.dispatchEvent(new CustomEvent('asset:thumbnail-updated', { detail: _currentAsset }));
        }
    });
}

function _hideContextMenu() {
    if (_contextMenu) { _contextMenu.remove(); _contextMenu = null; }
}
