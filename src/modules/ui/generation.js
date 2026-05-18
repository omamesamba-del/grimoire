import { IPC } from '../core/ipc.js';
import { State } from '../core/state.js';

let _models = { checkpoints: [], vaes: [], upscalers: [] };

const GEN_STORAGE_KEY = 'genSettings';
const GEN_SEND_MASK_KEY = 'genSendMask';
const ALL_MASK_GROUPS = ['checkpoint','vae','clipSkip','sampler','schedule','steps','resolution','batch','cfg','seed','hires','refiner'];
let _sendMask = Object.fromEntries(ALL_MASK_GROUPS.map(k => [k, true]));

function _loadSendMask() {
    try {
        const raw = localStorage.getItem(GEN_SEND_MASK_KEY);
        if (raw) _sendMask = { ...Object.fromEntries(ALL_MASK_GROUPS.map(k => [k, true])), ...JSON.parse(raw) };
    } catch (_) {}
}
function _saveSendMask() {
    localStorage.setItem(GEN_SEND_MASK_KEY, JSON.stringify(_sendMask));
}
function _applyGroupDisabled(group, disabled) {
    document.querySelectorAll(`[data-gen-group="${group}"]`).forEach(el => {
        el.classList.toggle('gen-group-disabled', disabled);
    });
}
function _wireSendMask() {
    document.querySelectorAll('.gen-send-chk').forEach(chk => {
        const group = chk.dataset.genGroup;
        if (!group) return;
        chk.checked = _sendMask[group] !== false;
        _applyGroupDisabled(group, !chk.checked);
        chk.addEventListener('change', () => {
            _sendMask[group] = chk.checked;
            _saveSendMask();
            _applyGroupDisabled(group, !chk.checked);
        });
    });
    document.getElementById('btn-gen-mask-all-on')?.addEventListener('click', () => {
        ALL_MASK_GROUPS.forEach(g => { _sendMask[g] = true; });
        _saveSendMask();
        document.querySelectorAll('.gen-send-chk').forEach(chk => { chk.checked = true; _applyGroupDisabled(chk.dataset.genGroup, false); });
    });
    document.getElementById('btn-gen-mask-all-off')?.addEventListener('click', () => {
        ALL_MASK_GROUPS.forEach(g => { _sendMask[g] = false; });
        _saveSendMask();
        document.querySelectorAll('.gen-send-chk').forEach(chk => { chk.checked = false; _applyGroupDisabled(chk.dataset.genGroup, true); });
    });
}

// ── バックエンド別サンプラー / スケジューラー定義 ─────────────────────────────
const SAMPLERS = {
    webui: [
        'Euler a', 'Euler', 'LMS', 'Heun',
        'DPM2', 'DPM2 a',
        'DPM++ 2S a', 'DPM++ 2M', 'DPM++ SDE', 'DPM++ 2M SDE', 'DPM++ 3M SDE',
        'DPM++ 2S a Karras',
        'DPM++ 2M Karras', 'DPM++ SDE Karras', 'DPM++ 2M SDE Karras',
        'DPM++ 3M SDE Karras', 'DPM++ 3M SDE Exponential',
        'DPM2 Karras', 'DPM2 a Karras',
        'DDIM', 'PLMS', 'UniPC',
        'LCM',
    ],
    comfy: [
        'euler', 'euler_ancestral',
        'heun', 'heunpp2',
        'dpm_2', 'dpm_2_ancestral',
        'lms', 'dpm_fast', 'dpm_adaptive',
        'dpmpp_2s_ancestral',
        'dpmpp_sde', 'dpmpp_sde_gpu',
        'dpmpp_2m', 'dpmpp_2m_sde', 'dpmpp_2m_sde_gpu',
        'dpmpp_3m_sde', 'dpmpp_3m_sde_gpu',
        'ddpm', 'lcm',
        'ipndm', 'ipndm_v', 'deis',
    ],
};

const SCHEDULERS = {
    webui: ['Automatic', 'Karras', 'Exponential', 'Polyexponential', 'SGM Uniform'],
    comfy: ['normal', 'karras', 'exponential', 'sgm_uniform', 'simple', 'ddim_uniform', 'beta'],
};

const SAMPLER_LABELS = {
    webui: { sampler: 'Sampling method', schedule: 'Schedule type' },
    comfy: { sampler: 'Sampler',         schedule: 'Scheduler' },
};

/** バックエンドモードに応じてサンプラー/スケジューラー選択肢を切り替える */
export function syncSamplerScheduleToMode() {
    const mode   = State.isComfyMode ? 'comfy' : 'webui';
    const labels = SAMPLER_LABELS[mode];

    // ラベル更新
    const lblSampler  = document.getElementById('lbl-gen-sampler');
    const lblSchedule = document.getElementById('lbl-gen-schedule');
    if (lblSampler)  lblSampler.textContent  = labels.sampler;
    if (lblSchedule) lblSchedule.textContent = labels.schedule;

    // 現在の選択値を保持しながら選択肢を入れ替え
    const samplerEl  = document.getElementById('gen-sampler');
    const scheduleEl = document.getElementById('gen-schedule');
    const prevSampler  = samplerEl?.value  ?? '';
    const prevSchedule = scheduleEl?.value ?? '';

    if (samplerEl) {
        samplerEl.innerHTML = '';
        SAMPLERS[mode].forEach(s => {
            const opt = document.createElement('option');
            opt.value = opt.textContent = s;
            samplerEl.appendChild(opt);
        });
        // 前の選択値が新リストにあれば復元、なければ先頭
        if (SAMPLERS[mode].includes(prevSampler)) samplerEl.value = prevSampler;
    }

    if (scheduleEl) {
        scheduleEl.innerHTML = '';
        SCHEDULERS[mode].forEach(s => {
            const opt = document.createElement('option');
            opt.value = opt.textContent = s;
            scheduleEl.appendChild(opt);
        });
        if (SCHEDULERS[mode].includes(prevSchedule)) scheduleEl.value = prevSchedule;
    }
}

function _collectAll() {
    const v = id => document.getElementById(id)?.value ?? '';
    const n = id => parseFloat(document.getElementById(id)?.value ?? '0');
    const b = id => document.getElementById(id)?.checked ?? false;
    return {
        checkpoint: v('gen-main-checkpoint'),
        vae: v('gen-main-vae'),
        clipSkip: n('gen-clip-skip-num'),
        sampler: v('gen-sampler'),
        schedule: v('gen-schedule'),
        steps: n('gen-steps-num'),
        width: n('gen-width-num'),
        height: n('gen-height-num'),
        batchCount: n('gen-batch-count-num'),
        batchSize: n('gen-batch-size-num'),
        cfg: n('gen-cfg-num'),
        seed: n('gen-seed'),
        hiresFix: b('gen-hires'),
        hiresUpscaler: v('gen-upscaler'),
        hiresSteps: n('gen-hires-steps-num'),
        hiresDenoising: n('gen-denoising-num'),
        hiresUpscaleBy: n('gen-upscale-by-num'),
        refiner: b('gen-refiner'),
        refinerCheckpoint: v('gen-refiner-ckpt'),
        refinerSwitchAt: n('gen-refiner-switch-num'),
    };
}

function saveGenSettings() {
    localStorage.setItem(GEN_STORAGE_KEY, JSON.stringify(_collectAll()));
}

function restoreGenSettings() {
    try {
        const saved = localStorage.getItem(GEN_STORAGE_KEY);
        if (saved) applyPreset(JSON.parse(saved));
    } catch (e) { /* ignore corrupt data */ }
}

export async function initGeneration() {
    _models = await IPC.getGenModels();
    populateDropdowns();
    syncSamplerScheduleToMode();   // ← バックエンドモードに合わせた初期化
    wireControls();
    loadArResPresets();
    _loadSendMask();
    restoreGenSettings();
    _wireSendMask();

    // Auto-save on any change inside the generation container
    document.getElementById('generation-container')?.addEventListener('change', saveGenSettings);
    document.getElementById('generation-container')?.addEventListener('input', saveGenSettings);

    // Listen for preset selection from Explorer
    window.addEventListener('genPresetSelected', async (e) => {
        const data = await IPC.loadGenPreset(e.detail.relPath);
        if (data) { applyPreset(data); saveGenSettings(); }
    });

    // 設定保存時に AR / 解像度ボタンを再構築
    window.addEventListener('settings:saved', () => loadArResPresets());
}

function populateDropdowns() {
    populateSelect('gen-main-checkpoint', _models.checkpoints, null, true);
    populateSelect('gen-main-vae', _models.vaes, null);
    populateSelect('gen-upscaler', _models.upscalers, null);
    populateSelect('gen-refiner-ckpt', ['None', ..._models.checkpoints], null);
}

function populateSelect(id, items, selected, useBasename = false) {
    const el = document.getElementById(id);
    if (!el) return;

    // INPUT + datalist combo box
    if (el.tagName === 'INPUT') {
        const dlId = el.getAttribute('list');
        const dl   = dlId ? document.getElementById(dlId) : null;
        if (dl) {
            dl.innerHTML = '';
            (items || []).forEach(item => {
                const opt   = document.createElement('option');
                const label = useBasename ? item.replace(/\\/g, '/').split('/').pop() : item;
                opt.value       = label;   // show/autocomplete basename
                opt.dataset.full = item;   // keep full path for reference
                dl.appendChild(opt);
            });
        }
        if (selected) el.value = selected;
        return;
    }

    // Regular <select>
    el.innerHTML = '';
    if (!items || items.length === 0) {
        el.innerHTML = '<option>— none found —</option>';
        return;
    }
    items.forEach(item => {
        const opt = document.createElement('option');
        const label = useBasename ? item.replace(/\\/g, '/').split('/').pop() : item;
        opt.value = item;
        opt.textContent = label;
        el.appendChild(opt);
    });
    if (selected) el.value = selected;
}

function wireControls() {
    // Hires collapsible
    const hiresChk = document.getElementById('gen-hires');
    const hiresPanel = document.getElementById('gen-hires-details');
    if (hiresChk && hiresPanel) {
        const syncHires = () => { hiresPanel.style.display = hiresChk.checked ? 'flex' : 'none'; };
        syncHires();
        hiresChk.addEventListener('change', syncHires);
    }

    // Refiner collapsible
    const refinerChk = document.getElementById('gen-refiner');
    const refinerPanel = document.getElementById('gen-refiner-details');
    if (refinerChk && refinerPanel) {
        const syncRefiner = () => { refinerPanel.style.display = refinerChk.checked ? 'flex' : 'none'; };
        syncRefiner();
        refinerChk.addEventListener('change', syncRefiner);
    }

    // Swap W/H
    document.getElementById('btn-res-swap')?.addEventListener('click', () => {
        const w = document.getElementById('gen-width-num');
        const h = document.getElementById('gen-height-num');
        if (w && h) { const tmp = w.value; w.value = h.value; h.value = tmp; }
    });

    // Seed random / reuse
    document.getElementById('btn-seed-random')?.addEventListener('click', () => {
        const s = document.getElementById('gen-seed');
        if (s) s.value = Math.floor(Math.random() * 4294967295);
    });
    document.getElementById('btn-seed-reuse')?.addEventListener('click', () => {
        const s = document.getElementById('gen-seed');
        if (s && State.lastSeed != null) s.value = State.lastSeed;
    });
}

export function loadArResPresets() {
    IPC.getConfig().then(cfg => {
        buildArButtons(cfg.customARs || '');
        buildResButtons(cfg.customResolutions || '');
    });
}

function buildArButtons(arString) {
    const container = document.getElementById('gen-ar-container');
    if (!container) return;
    container.innerHTML = '';
    arString.split(',').map(s => s.trim()).filter(Boolean).forEach(ar => {
        const [wR, hR] = ar.split(':').map(Number);
        if (!wR || !hR) return;
        const btn = document.createElement('button');
        btn.className = 'gen-preset-btn';
        btn.textContent = ar;
        btn.addEventListener('click', () => applyAR(wR, hR));
        container.appendChild(btn);
    });
}

function buildResButtons(resString) {
    const container = document.getElementById('gen-res-container');
    if (!container) return;
    container.innerHTML = '';
    resString.split(',').map(s => s.trim()).filter(Boolean).forEach(res => {
        const [w, h] = res.split('x').map(Number);
        if (!w || !h) return;
        const btn = document.createElement('button');
        btn.className = 'gen-preset-btn';
        btn.textContent = res;
        btn.addEventListener('click', () => {
            const wEl = document.getElementById('gen-width-num');
            const hEl = document.getElementById('gen-height-num');
            if (wEl) wEl.value = w;
            if (hEl) hEl.value = h;
        });
        container.appendChild(btn);
    });
}

function applyAR(wR, hR) {
    const wEl = document.getElementById('gen-width-num');
    const hEl = document.getElementById('gen-height-num');
    if (!wEl || !hEl) return;
    const curW = parseInt(wEl.value) || 832;
    const newH = Math.round((curW / wR) * hR / 8) * 8;
    hEl.value = Math.max(64, Math.min(4096, newH));
}

export function applyPreset(data) {
    const set = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val; };
    const setChk = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.checked = !!val; el?.dispatchEvent(new Event('change')); };

    // Fuzzy match: exact first, then basename-without-extension match
    // Works for both <select> and <input list="datalist">
    const setFuzzy = (id, val) => {
        if (val === undefined) return;
        const el = document.getElementById(id);
        if (!el) return;
        el.value = val;

        if (el.tagName === 'INPUT') {
            // For combo box, also try fuzzy against datalist option values
            const dlId = el.getAttribute('list');
            const dl   = dlId ? document.getElementById(dlId) : null;
            if (!dl) return;
            // Check if typed value matches an existing option exactly
            const exact = Array.from(dl.options).find(o => o.value === val);
            if (exact) return;
            // Fuzzy: strip extension from both needle and hay
            const needle = val.replace(/\\/g, '/').split('/').pop().replace(/\.[^.]+$/, '').toLowerCase();
            for (const opt of dl.options) {
                const hay = opt.value.replace(/\.[^.]+$/, '').toLowerCase();
                if (hay === needle) { el.value = opt.value; return; }
            }
            // No match — leave whatever the user typed (free-text is OK)
            return;
        }

        // <select>: check if assignment took
        if (el.value === val) return;
        const needle = val.replace(/\\/g, '/').split('/').pop().replace(/\.[^.]+$/, '').toLowerCase();
        for (const opt of el.options) {
            const hay = opt.value.replace(/\\/g, '/').split('/').pop().replace(/\.[^.]+$/, '').toLowerCase();
            if (hay === needle) { el.value = opt.value; return; }
        }
    };

    setFuzzy('gen-main-checkpoint', data.checkpoint);
    set('gen-main-vae', data.vae);
    set('gen-clip-skip-num', data.clipSkip);
    set('gen-sampler', data.sampler);
    set('gen-schedule', data.schedule);
    set('gen-steps-num', data.steps);
    set('gen-width-num', data.width);
    set('gen-height-num', data.height);
    set('gen-batch-count-num', data.batchCount);
    set('gen-batch-size-num', data.batchSize);
    set('gen-cfg-num', data.cfg);
    set('gen-seed', data.seed);
    setChk('gen-hires', data.hiresFix);
    set('gen-upscaler', data.hiresUpscaler);
    set('gen-hires-steps-num', data.hiresSteps);
    set('gen-denoising-num', data.hiresDenoising);
    set('gen-upscale-by-num', data.hiresUpscaleBy);
    setChk('gen-refiner', data.refiner);
    set('gen-refiner-ckpt', data.refinerCheckpoint);
    set('gen-refiner-switch-num', data.refinerSwitchAt);
}

async function saveCurrentPreset() {
    const dialog = document.getElementById('save-gen-preset-dialog');
    const nameInput = document.getElementById('gen-preset-name-input');
    const folderSelect = document.getElementById('gen-preset-folder-select');
    const confirmBtn = document.getElementById('btn-gen-preset-confirm');
    const cancelBtn = document.getElementById('btn-gen-preset-cancel');
    if (!dialog || !nameInput || !folderSelect) return;

    // Populate folder dropdown
    const tree = await IPC.getGenPresetsTree();
    const folders = collectFolders(tree, '');
    folderSelect.innerHTML = '<option value="">/ (root)</option>';
    folders.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f;
        opt.textContent = f;
        folderSelect.appendChild(opt);
    });

    nameInput.value = '';
    dialog.showModal();
    setTimeout(() => nameInput.focus(), 0);

    await new Promise((resolve) => {
        const finish = async (save) => {
            // Replace handlers immediately to prevent double-fire
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
            dialog.onkeydown = null;
            dialog.close();
            if (save) {
                const name = nameInput.value.trim();
                if (name) {
                    await IPC.saveGenPreset(name, folderSelect.value, getGenPayload());
                    window.dispatchEvent(new CustomEvent('genPresetsTreeChanged'));
                }
            }
            resolve();
        };

        confirmBtn.onclick = () => {
            if (!nameInput.value.trim()) { nameInput.focus(); return; }
            finish(true);
        };
        cancelBtn.onclick = () => finish(false);

        dialog.onkeydown = (e) => {
            if (e.key === 'Enter' && e.target === nameInput) {
                e.preventDefault();
                if (!nameInput.value.trim()) { nameInput.focus(); return; }
                finish(true);
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                finish(false);
            }
        };
    });
}

function collectFolders(node, prefix) {
    const result = [];
    for (const key of Object.keys(node._children || {})) {
        const rel = prefix ? `${prefix}/${key}` : key;
        result.push(rel);
        result.push(...collectFolders(node._children[key], rel));
    }
    return result;
}

export function getGenPayload() {
    const all = _collectAll();
    const m = k => _sendMask[k] !== false;
    return {
        checkpoint:        m('checkpoint')  ? all.checkpoint        : null,
        vae:               m('vae')         ? all.vae               : null,
        clipSkip:          m('clipSkip')    ? all.clipSkip          : null,
        sampler:           m('sampler')     ? all.sampler           : null,
        schedule:          m('schedule')    ? all.schedule          : null,
        steps:             m('steps')       ? all.steps             : null,
        width:             m('resolution')  ? all.width             : null,
        height:            m('resolution')  ? all.height            : null,
        batchCount:        m('batch')       ? all.batchCount        : null,
        batchSize:         m('batch')       ? all.batchSize         : null,
        cfg:               m('cfg')         ? all.cfg               : null,
        seed:              m('seed')        ? all.seed              : null,
        hiresFix:          m('hires')       ? all.hiresFix          : null,
        hiresUpscaler:     m('hires')       ? all.hiresUpscaler     : null,
        hiresSteps:        m('hires')       ? all.hiresSteps        : null,
        hiresDenoising:    m('hires')       ? all.hiresDenoising    : null,
        hiresUpscaleBy:    m('hires')       ? all.hiresUpscaleBy    : null,
        refiner:           m('refiner')     ? all.refiner           : null,
        refinerCheckpoint: m('refiner')     ? all.refinerCheckpoint : null,
        refinerSwitchAt:   m('refiner')     ? all.refinerSwitchAt   : null,
    };
}
