/**
 * Gen mode — PNG Info drop zone
 * Drag & drop (or click) an image to read its embedded SD generation metadata.
 * All PNG parsing is done in the renderer (no IPC needed).
 * Buttons: Send Prompt → builder textareas, Send Gen Data → gen form fields, Clear.
 */

import { applyPreset } from './generation.js';
import { i18n } from '../core/i18n.js';

// ── PNG tEXt/iTXt chunk reader (renderer-side) ────────────────────────────────

export function readPngTextChunks(buffer) {
    const view = new DataView(buffer);
    const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) {
        if (view.getUint8(i) !== PNG_SIG[i]) return null; // not a PNG
    }
    const latin1 = new TextDecoder('latin1');
    const utf8   = new TextDecoder('utf-8');
    const chunks = {};
    let offset = 8;
    while (offset + 12 <= buffer.byteLength) {
        const length = view.getUint32(offset);
        const type   = String.fromCharCode(
            view.getUint8(offset + 4), view.getUint8(offset + 5),
            view.getUint8(offset + 6), view.getUint8(offset + 7)
        );
        const data = new Uint8Array(buffer, offset + 8, length);
        offset += 12 + length;

        if (type === 'tEXt') {
            const sep = data.indexOf(0);
            if (sep !== -1) {
                chunks[latin1.decode(data.subarray(0, sep))] =
                    latin1.decode(data.subarray(sep + 1));
            }
        } else if (type === 'iTXt') {
            const sep = data.indexOf(0);
            if (sep === -1) continue;
            const key = latin1.decode(data.subarray(0, sep));
            let pos = sep + 3;
            const l1 = data.indexOf(0, pos); if (l1 === -1) continue; pos = l1 + 1;
            const l2 = data.indexOf(0, pos); if (l2 === -1) continue; pos = l2 + 1;
            chunks[key] = utf8.decode(data.subarray(pos));
        } else if (type === 'IEND') break;
    }
    return chunks;
}

/**
 * Parse the SD "parameters" tEXt string into { positive, negative, params }.
 * Format:
 *   <positive text>
 *   Negative prompt: <negative text>
 *   Steps: N, Sampler: X, CFG scale: Y, Seed: Z, Size: WxH, Model: ..., ...
 */
export function parseSdMetadata(raw) {
    const lines    = raw.split('\n');
    const posLines = [], negLines = [];
    let state      = 'pos';
    let paramsLine = '';

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('Negative prompt:')) {
            state = 'neg';
            negLines.push(trimmed.replace(/^Negative prompt:\s*/, ''));
        } else if (/^(Steps|Sampler|CFG scale|Seed|Size|Model)\s*:/i.test(trimmed)) {
            state = 'params';
            paramsLine += (paramsLine ? ' ' : '') + trimmed;
        } else if (state === 'pos') {
            posLines.push(line);
        } else if (state === 'neg') {
            negLines.push(line);
        } else if (state === 'params') {
            paramsLine += ' ' + trimmed;
        }
    }

    const params = {};
    const rx = /([\w\s]+):\s*([^,]+(?:,\s*(?![\w\s]+:)[^,]+)*)/g;
    let m;
    while ((m = rx.exec(paramsLine)) !== null) {
        params[m[1].trim()] = m[2].trim();
    }

    return {
        positive: posLines.join('\n').trim(),
        negative: negLines.join('\n').trim(),
        params,
        raw,
    };
}

async function extractInfo(file) {
    const buf = await file.arrayBuffer();

    const chunks = readPngTextChunks(buf);
    if (!chunks) {
        // Not a PNG — no metadata to extract
        return { positive: '', negative: '', params: {}, raw: '' };
    }

    let raw = chunks['parameters'] || chunks['prompt'] || '';
    // ComfyUI stores JSON in 'prompt' chunk — skip it
    if (raw.startsWith('{')) raw = '';
    if (!raw) return { positive: '', negative: '', params: {}, raw: '' };

    return parseSdMetadata(raw);
}

// ── PNG param → applyPreset mapping ──────────────────────────────────────────

const SCHEDULE_SUFFIXES = ['Karras', 'Exponential', 'Polyexponential', 'SGM Uniform'];

function paramsToPreset(params) {
    const ci = (key) => {
        const entry = Object.entries(params)
            .find(([k]) => k.toLowerCase() === key.toLowerCase());
        return entry ? entry[1] : undefined;
    };
    const num = (key) => { const v = ci(key); return v !== undefined ? parseFloat(v) : undefined; };

    let sampler  = ci('Sampler');
    let schedule = ci('Schedule type');

    // Old A1111: schedule baked into sampler name — split it out
    if (sampler && !schedule) {
        for (const suf of SCHEDULE_SUFFIXES) {
            if (sampler.endsWith(` ${suf}`)) {
                sampler  = sampler.slice(0, -(suf.length + 1)).trim();
                schedule = suf;
                break;
            }
        }
    }

    const sizeStr = ci('Size');
    let width, height;
    if (sizeStr) {
        const [w, h] = sizeStr.split('x').map(Number);
        if (!isNaN(w)) width  = w;
        if (!isNaN(h)) height = h;
    }

    const hiresUpscale   = num('Hires upscale');
    const hiresUpscaler  = ci('Hires upscaler');
    const hiresFix       = hiresUpscale !== undefined || hiresUpscaler !== undefined;

    return {
        checkpoint:     ci('Model'),
        sampler, schedule,
        steps:          num('Steps'),
        cfg:            num('CFG scale'),
        seed:           num('Seed'),
        width, height,
        clipSkip:       num('Clip skip'),
        hiresFix,
        hiresUpscaler,
        hiresSteps:     num('Hires steps'),
        hiresDenoising: num('Denoising strength'),
        hiresUpscaleBy: hiresUpscale,
    };
}

// ── State ─────────────────────────────────────────────────────────────────────

let _currentInfo = null;
let _objectUrl   = null;

function resetObjectUrl() {
    if (_objectUrl) { URL.revokeObjectURL(_objectUrl); _objectUrl = null; }
}

// ── Display ───────────────────────────────────────────────────────────────────

const esc = (s) => (s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function showResult(info, previewUrl) {
    _currentInfo = info;
    const { positive = '', negative = '', params = {}, raw = '' } = info;

    document.getElementById('gen-png-preview').src = previewUrl || '';

    const posEl = document.getElementById('gen-png-positive');
    if (posEl) posEl.textContent = raw ? (positive || i18n.t('png_no_value')) : i18n.t('png_no_meta');

    const negWrap = document.getElementById('gen-png-neg-wrap');
    const negEl   = document.getElementById('gen-png-negative');
    if (negEl)   negEl.textContent = negative;
    if (negWrap) negWrap.style.display = (raw && negative) ? '' : 'none';

    const paramsWrap = document.getElementById('gen-png-params-wrap');
    const table      = document.getElementById('gen-png-params');
    if (table) {
        table.innerHTML = Object.entries(params)
            .map(([k, v]) =>
                `<tr><td class="gpng-key">${esc(k)}</td><td class="gpng-val">${esc(v)}</td></tr>`)
            .join('');
    }
    if (paramsWrap) paramsWrap.style.display = Object.keys(params).length ? '' : 'none';

    document.getElementById('gen-png-dropzone').style.display = 'none';
    document.getElementById('gen-png-result').style.display   = '';
    document.getElementById('gen-png-actions').style.display  = '';

    const sendPromptBtn = document.getElementById('btn-gen-png-send-prompt');
    const sendGenBtn    = document.getElementById('btn-gen-png-send-gen');
    if (sendPromptBtn) sendPromptBtn.disabled = !raw || (!positive && !negative);
    if (sendGenBtn)    sendGenBtn.disabled    = Object.keys(params).length === 0;
}

function clearPanel() {
    _currentInfo = null;
    resetObjectUrl();
    document.getElementById('gen-png-preview').src           = '';
    document.getElementById('gen-png-result').style.display  = 'none';
    document.getElementById('gen-png-actions').style.display = 'none';
    document.getElementById('gen-png-dropzone').style.display = '';
}

// ── File processing ───────────────────────────────────────────────────────────

async function processFile(file) {
    if (!file) return;

    resetObjectUrl();
    _objectUrl = URL.createObjectURL(file);

    // Show loading
    const dropLabel = document.querySelector('#gen-png-dropzone .gen-png-drop-label');
    if (dropLabel) dropLabel.textContent = i18n.t('png_loading');

    try {
        const info = await extractInfo(file);
        showResult(info, _objectUrl);
    } catch (e) {
        console.error('[GenPngDrop]', e);
        showResult({ positive: '', negative: '', params: {}, raw: '' }, _objectUrl);
    } finally {
        if (dropLabel) dropLabel.textContent = i18n.t('gen_png_drop_label');
    }
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initGenPngDrop() {
    const dropzone = document.getElementById('gen-png-dropzone');
    if (!dropzone) return;

    // Drag & drop on dropzone
    dropzone.addEventListener('dragover',  (e) => { e.preventDefault(); dropzone.classList.add('gen-png-drag-over'); });
    dropzone.addEventListener('dragleave', ()  => dropzone.classList.remove('gen-png-drag-over'));
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('gen-png-drag-over');
        const file = e.dataTransfer.files[0];
        if (file) processFile(file);
    });

    // Also accept drops on the whole panel (after a result is shown)
    const panel = document.getElementById('gen-png-panel');
    if (panel) {
        panel.addEventListener('dragover', (e) => { e.preventDefault(); });
        panel.addEventListener('drop', (e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) processFile(file);
        });
    }

    // Click to pick file
    dropzone.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type   = 'file';
        input.accept = 'image/png';
        input.onchange = () => { if (input.files[0]) processFile(input.files[0]); };
        input.click();
    });

    // Buttons
    document.getElementById('btn-gen-png-send-prompt')?.addEventListener('click', () => {
        if (!_currentInfo) return;
        const posEl = document.getElementById('positive-prompt');
        const negEl = document.getElementById('negative-prompt');
        if (posEl) { posEl.value = _currentInfo.positive || ''; posEl.dispatchEvent(new Event('input')); }
        if (negEl) { negEl.value = _currentInfo.negative || ''; negEl.dispatchEvent(new Event('input')); }
    });

    document.getElementById('btn-gen-png-send-gen')?.addEventListener('click', () => {
        if (!_currentInfo?.params) return;
        applyPreset(paramsToPreset(_currentInfo.params));
    });

    document.getElementById('btn-gen-png-clear')?.addEventListener('click', clearPanel);
}
