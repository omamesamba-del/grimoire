/**
 * UI Header Component for v5 - Integrated Controls
 * Handles group filtering, search, display options, and mode tabs
 */
import { State, saveUiState } from '../core/state.js';
import { renderTagGrid, renderAssetGrid } from './library.js';
import { renderExplorer } from './explorer.js';
import { filterImages } from './image-browser.js';
import { i18n } from '../core/i18n.js';

export function initHeader() {
    initSearch();
    initDisplayOptions();
    initTabsCompact();
}

/**
 * Populate the category filter dropdown from State.allTags.
 * Call after tags are loaded or reloaded.
 */
export function refreshSearchCatFilter() {
    const sel = document.getElementById('search-cat-filter');
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = `<option value="">${i18n.t('filter_all')}</option>`;
    (State.allTags || []).forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name;
        sel.appendChild(opt);
    });
    // Restore previous selection if still valid
    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
}

/**
 * Show/hide the category filter based on current mode (only visible in tags mode).
 */
export function syncCatFilterVisibility(mode) {
    const sel = document.getElementById('search-cat-filter');
    if (sel) sel.hidden = (mode !== 'tags');
}

/**
 * Initialize search functionality
 */
function initSearch() {
    const searchInput = document.getElementById('library-search');
    const clearBtn    = document.getElementById('btn-search-clear');
    if (!searchInput) return;

    let searchTimeout = null;

    const runSearch = (query) => {
        const mode = State.currentMode;
        if (mode === 'images') {
            filterImages(query);
        } else if (mode === 'lora' || mode === 'embedding') {
            renderAssetGrid(query);
        } else {
            applySearch(query);
        }
    };

    const updateClearBtn = (value) => {
        if (clearBtn) clearBtn.hidden = !value;
    };

    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.toLowerCase();
        updateClearBtn(e.target.value);
        searchTimeout = setTimeout(() => runSearch(query), 300);
    });

    clearBtn?.addEventListener('click', () => {
        searchInput.value = '';
        updateClearBtn('');
        clearTimeout(searchTimeout);
        runSearch('');
        searchInput.focus();
    });

    // Category filter: re-run search when scope changes
    const catFilter = document.getElementById('search-cat-filter');
    catFilter?.addEventListener('change', () => {
        const query = searchInput.value.toLowerCase();
        if (query) runSearch(query);
    });
}

/**
 * Apply search filter to tag grid.
 * Searches categories (all or the one selected in #search-cat-filter) and returns
 * flat sections with breadcrumb paths.
 * Each section = { type:'group', name:'Cat › Group › Sub', color, children:[matchingTags] }
 */
function applySearch(query) {
    if (!query) {
        State.isTagSearch = false;
        applyGroupFilter();
        return;
    }

    const q = query.toLowerCase();

    // Determine search scope: selected category or all
    const selectedCatId = document.getElementById('search-cat-filter')?.value || '';
    const roots = selectedCatId
        ? (State.allTags || []).filter(c => c.id === selectedCatId)
        : (State.allTags || []);

    // Walk the tree and collect flat sections for every node with matching direct tags.
    const buildFlatSections = (nodes, path = [], inheritedColor = null) => {
        const sections = [];
        for (const node of nodes) {
            if (node.type === 'tag') continue; // handled by parent
            const nodeColor = inheritedColor || node.color || null;
            const nodePath  = path.length ? [...path, node.name] : [node.name];

            // Direct tag children that match the query
            const matchingTags = (node.children || []).filter(c =>
                c.type === 'tag' && (
                    c.name.toLowerCase().includes(q) ||
                    (c.value && c.value.toLowerCase().includes(q))
                )
            );
            if (matchingTags.length > 0) {
                sections.push({
                    id:       node.id || node.name,
                    type:     'group',
                    name:     nodePath.join(' › '),
                    color:    nodeColor,
                    children: matchingTags,
                });
            }

            // Recurse into sub-groups / sub-categories
            const childGroups = (node.children || []).filter(c =>
                c.type === 'group' || c.type === 'category' || (c.children && !c.type)
            );
            sections.push(...buildFlatSections(childGroups, nodePath, nodeColor));
        }
        return sections;
    };

    State.isTagSearch = true;
    State.currentTags = buildFlatSections(roots);
    window.dispatchEvent(new CustomEvent('renderGridReq'));
}

function applyGroupFilter() {
    State.isTagSearch = false;
    if (!State.selectedGroupFilter) {
        State.currentTags = State.allTags.find(c => c.id === State.currentCategoryId)?.children || [];
    } else {
        const findGroupTags = (nodes, groupId) => {
            for (const node of nodes) {
                if (node.id === groupId || node.name === groupId) {
                    return node.children || [];
                }
                if (node.children) {
                    const result = findGroupTags(node.children, groupId);
                    if (result) return result;
                }
            }
            return null;
        };

        const filteredTags = findGroupTags(State.allTags, State.selectedGroupFilter);
        if (filteredTags !== null) {
            State.currentTags = filteredTags;
        }
    }

    window.dispatchEvent(new CustomEvent('renderGridReq'));
}

// Per-mode size configuration
const SIZE_CONFIG = {
    tags:       { levels: [50, 65, 80, 95, 110, 125, 140],    key: 'size-index-tags',       vars: ['--tag-button-size'] },
    lora:       { levels: [100, 130, 160, 200, 240, 280, 320], key: 'size-index-lora',       vars: ['--asset-card-size', '--asset-grid-size'] },
    embedding:  { levels: [100, 130, 160, 200, 240, 280, 320], key: 'size-index-embedding',  vars: ['--asset-card-size', '--asset-grid-size'] },
    checkpoint: { levels: [100, 130, 160, 200, 240, 280, 320], key: 'size-index-checkpoint', vars: ['--asset-card-size', '--asset-grid-size'] },
    images:     { levels: [120, 150, 180, 220, 260, 300, 360], key: 'size-index-images',     vars: ['--img-thumb-height'] },
};
const DEFAULT_SIZE_INDEX = 3;

function _applyModeSize(mode, sizeIndex) {
    const cfg = SIZE_CONFIG[mode];
    if (!cfg) return;
    const px = `${cfg.levels[sizeIndex]}px`;
    cfg.vars.forEach(v => document.documentElement.style.setProperty(v, px));
    localStorage.setItem(cfg.key, sizeIndex);
}

export function syncSliderToMode(mode) {
    const sizeSlider = document.getElementById('asset-size-slider');
    if (!sizeSlider) return;
    const cfg = SIZE_CONFIG[mode];
    // Show slider only for modes that have a size config
    const sizeCtrl = document.getElementById('lib-size-ctrl');
    if (sizeCtrl) sizeCtrl.style.display = cfg ? '' : 'none';
    if (!cfg) return;
    const raw = parseInt(localStorage.getItem(cfg.key));
    const idx = Math.min(6, isNaN(raw) ? DEFAULT_SIZE_INDEX : raw);
    sizeSlider.value = idx;
    _applyModeSize(mode, idx);
    sizeSlider.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Initialize display options (grid/list toggle, thumbnail size)
 */
function initDisplayOptions() {
    const sizeSlider = document.getElementById('asset-size-slider');
    const sizeMinus  = document.getElementById('btn-size-minus');
    const sizePlus   = document.getElementById('btn-size-plus');

    if (sizeSlider) {
        sizeSlider.addEventListener('input', (e) => {
            const mode = State.currentMode || 'tags';
            const value = parseInt(e.target.value);
            _applyModeSize(mode, value);
        });

        // On startup: restore saved sizes for current mode only
        const initMode = State.currentMode || 'tags';
        syncSliderToMode(initMode);
    }

    if (sizeMinus && sizeSlider) {
        sizeMinus.addEventListener('click', () => {
            const current = Math.max(0, parseInt(sizeSlider.value) - 1);
            sizeSlider.value = current;
            sizeSlider.dispatchEvent(new Event('input'));
        });
    }

    if (sizePlus && sizeSlider) {
        sizePlus.addEventListener('click', () => {
            const current = Math.min(6, parseInt(sizeSlider.value) + 1);
            sizeSlider.value = current;
            sizeSlider.dispatchEvent(new Event('input'));
        });
    }
}

/**
 * Dynamically collapse mode tabs to icon-only when the header gets too narrow.
 * Measures the natural full-text width once at init, then observes header resizes.
 */
function initTabsCompact() {
    const tabs      = document.querySelector('.mode-tabs-header');
    const headerEl  = document.querySelector('.app-header');
    const headerLeft = document.querySelector('.header-left');
    const headerRight = document.querySelector('.header-titlebar-right');
    if (!tabs || !headerEl || !headerLeft) return;

    // Measure the natural (full-text) width of the left section once.
    // Since header-left has flex-shrink:0 at this point, offsetWidth = natural content width.
    tabs.classList.remove('mode-tabs-compact');
    const leftNatural   = headerLeft.offsetWidth;
    const titlebarRight = headerRight ? headerRight.offsetWidth : 60; // ⬛⚙ buttons
    const winBtnSpacer  = (document.querySelector('.header-right')?.offsetWidth) ?? 138; // native window buttons space
    // Measure fixed elements inside header-center (WEBUI/COMFY toggle etc.)
    const centerFixed   = (() => {
        let w = 0;
        const center = document.querySelector('.header-center');
        if (center) {
            center.querySelectorAll('.titlebar-no-drag').forEach(el => {
                if (!el.classList.contains('search-wrap')) w += el.offsetWidth + 8; // +8 for gap
            });
        }
        return w;
    })();
    const MIN_SEARCH    = 140; // minimum usable search bar width
    // Total: all fixed sections + fixed center contents + minimum search
    const COMPACT_THRESHOLD = leftNatural + titlebarRight + winBtnSpacer + centerFixed + MIN_SEARCH;
    const RESTORE_THRESHOLD = COMPACT_THRESHOLD - 30; // small hysteresis to prevent thrashing

    const check = () => {
        const w = headerEl.offsetWidth;
        const isCompact = tabs.classList.contains('mode-tabs-compact');
        if (!isCompact && w < COMPACT_THRESHOLD) {
            tabs.classList.add('mode-tabs-compact');
        } else if (isCompact && w >= RESTORE_THRESHOLD) {
            tabs.classList.remove('mode-tabs-compact');
        }
    };

    new ResizeObserver(check).observe(headerEl);
    check();
}
