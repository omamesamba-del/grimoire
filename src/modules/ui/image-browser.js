/**
 * Image Browser — Images mode
 * Explorer: recursive subfolder tree  |  Library: thumbnail grid  |  Builder: PNG info + Send
 */
import { State } from '../core/state.js';
import { renderPromptChips } from './prompt-chips.js';
import { saveTagOrder } from '../tags/service.js';
import { showConfirmDialog } from './modals.js';
import { attachPopupEvents } from './library.js';
import { i18n } from '../core/i18n.js';

// ── Module State ───────────────────────────────────────────────
let _rootPath = '';
let _favDir = '';            // data/fav_image の絶対パス
let _currentFolder = null;   // null = すべて
let _currentFile = null;
let _folderTree = [];        // cached folder tree

let _allImages = [];         // 現在表示中の全画像リスト（検索用）
let _pngInfoCache = {};      // path → { positive, negative, params, raw }
let _metaLoadAbort = false;  // バックグラウンド先読みのキャンセルフラグ
let _thumbObserver = null;   // IntersectionObserver for lazy thumbnail loading
let _sentinelObserver = null; // IntersectionObserver for incremental rendering
let _renderQueue = [];       // remaining images to render incrementally
const RENDER_BATCH = 100;    // cards per batch
let _imgCtxMenu = null;      // image card context menu element

// ── Helpers ───────────────────────────────────────────────────
function _getFavPath() {
    return _favDir;
}

function _isInFavFolder(filePath) {
    if (!filePath || !_favDir) return false;
    return filePath.startsWith(_favDir + '\\') || filePath.startsWith(_favDir + '/') || filePath === _favDir;
}

// ── Init ───────────────────────────────────────────────────────
export async function initImageBrowser() {
    const cfg = await window.electronAPI?.getConfig?.();
    _rootPath = cfg?.outputImagesPath || '';
    _favDir = await window.electronAPI.getFavImageDir?.() || '';
    await renderImageExplorer();
    _initKeyNav();

    window.addEventListener('outputImagesPathChanged', async (e) => {
        _rootPath = e.detail || '';
        _currentFolder = null;
        _currentFile = null;
        _folderTree = [];
        _allImages = [];
        _pngInfoCache = {};
        await renderImageExplorer();
        clearImageInfo();
    });
}

function _initKeyNav() {
    document.addEventListener('keydown', async (e) => {
        if (State.currentMode !== 'images') return;
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return;

        const grid = document.getElementById('image-grid');
        if (!grid) return;
        const cards = [...grid.querySelectorAll('.image-card')];
        if (cards.length === 0) return;

        e.preventDefault();

        const cols = window.getComputedStyle(grid).gridTemplateColumns.split(' ').length || 1;
        let idx = _currentFile ? cards.findIndex(c => c.dataset.path === _currentFile) : -1;
        if (idx === -1) {
            idx = 0;
        } else {
            if (e.key === 'ArrowLeft')  idx = Math.max(0, idx - 1);
            else if (e.key === 'ArrowRight') idx = Math.min(cards.length - 1, idx + 1);
            else if (e.key === 'ArrowUp')    idx = Math.max(0, idx - cols);
            else if (e.key === 'ArrowDown')  {
                const want = idx + cols;
                // 対象カードがまだ未描画なら次バッチを先にロードする
                if (want >= cards.length && _renderQueue.length > 0) {
                    _sentinelObserver?.disconnect();
                    grid.querySelector('.img-load-sentinel')?.remove();
                    _appendNextBatch(grid);
                    // バッチ追加後に再クエリ
                    const newCards = [...grid.querySelectorAll('.image-card')];
                    idx = Math.min(newCards.length - 1, want);
                    const target = newCards[idx];
                    if (!target) return;
                    _currentFile = target.dataset.path;
                    newCards.forEach(c => c.classList.remove('active'));
                    target.classList.add('active');
                    target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    await showImageInfo(_currentFile);
                    return;
                }
                idx = Math.min(cards.length - 1, want);
            }
        }

        const target = cards[idx];
        if (!target) return;

        _currentFile = target.dataset.path;
        cards.forEach(c => c.classList.remove('active'));
        target.classList.add('active');
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        await showImageInfo(_currentFile);
    });
}

// ── Explorer: Recursive Folder Tree ───────────────────────────
export async function renderImageExplorer() {
    const container = document.getElementById('explorer-content');
    if (!container) return;
    container.innerHTML = '';

    if (!_rootPath) {
        container.innerHTML = `<div class="img-browser-empty">
            <span>📁</span>
            <p>${i18n.t('images_no_folder_hint')}</p>
        </div>`;
        return;
    }

    container.innerHTML = `<div class="img-loading">${i18n.t('images_loading')}</div>`;
    const result = await window.electronAPI.getImageFolders(_rootPath);
    _folderTree = result?.folders || [];
    container.innerHTML = '';

    if (_folderTree.length === 0) {
        container.innerHTML = `<div class="img-browser-empty"><span>📁</span><p>${i18n.t('images_no_subfolders')}</p></div>`;
        return;
    }

    // "Favorites" row
    const favPath = _getFavPath();
    const favRow = _makeFolderRow('★ Favorites', null, favPath, 0);
    favRow.classList.toggle('active', _currentFolder === favPath);
    favRow.querySelector('.img-folder-icon').textContent = '⭐';
    favRow.querySelector('.img-folder-label').addEventListener('click', async () => {
        _currentFolder = favPath;
        _currentFile = null;
        _setActiveRow(favPath);
        clearImageInfo();
        _clearSearch();
        await renderImageGrid(favPath);
    });
    container.appendChild(favRow);

    // "All" row
    const allRow = _makeFolderRow(i18n.t('images_folder_all'), null, null, 0);
    allRow.classList.toggle('active', _currentFolder === null);
    allRow.querySelector('.img-folder-label').addEventListener('click', async () => {
        _currentFolder = null;
        _currentFile = null;
        _setActiveRow(null);
        clearImageInfo();
        _clearSearch();
        await renderImageGrid(null);
    });
    container.appendChild(allRow);

    // Recursive tree
    _buildFolderTreeDOM(_folderTree, container, 1);

    // Auto-select on first load
    if (_currentFolder === null) {
        await renderImageGrid(null);
    } else {
        await renderImageGrid(_currentFolder);
    }
}

/** Build DOM tree recursively */
function _buildFolderTreeDOM(folders, container, depth) {
    folders.forEach(f => {
        const hasChildren = f.children && f.children.length > 0;
        const row = _makeFolderRow(f.name, f.count, f.path, depth, hasChildren);

        const expandKey = `imgexp:${f.path}`;
        const isExpanded = localStorage.getItem(expandKey) !== '0';

        const childContainer = row.querySelector('.img-child-container');
        const toggle = row.querySelector('.img-folder-toggle');

        if (hasChildren) {
            if (isExpanded) {
                _buildFolderTreeDOM(f.children, childContainer, depth + 1);
            }
            toggle?.addEventListener('click', (e) => {
                e.stopPropagation();
                const open = childContainer.children.length === 0 ||
                             childContainer.style.display === 'none';
                if (open) {
                    childContainer.style.display = '';
                    if (childContainer.children.length === 0) {
                        _buildFolderTreeDOM(f.children, childContainer, depth + 1);
                    }
                    toggle.textContent = '▾';
                    localStorage.setItem(expandKey, '1');
                } else {
                    childContainer.style.display = 'none';
                    toggle.textContent = '▸';
                    localStorage.setItem(expandKey, '0');
                }
            });
            if (!isExpanded && childContainer) childContainer.style.display = 'none';
            if (toggle) toggle.textContent = isExpanded ? '▾' : '▸';
        }

        // Click folder label to select AND toggle expand/collapse
        row.querySelector('.img-folder-label').addEventListener('click', async () => {
            _currentFolder = f.path;
            _currentFile = null;
            _setActiveRow(f.path);
            clearImageInfo();
            _clearSearch();
            await renderImageGrid(f.path);

            if (hasChildren && childContainer && toggle) {
                const open = childContainer.style.display === 'none';
                if (open) {
                    childContainer.style.display = '';
                    if (childContainer.children.length === 0) {
                        _buildFolderTreeDOM(f.children, childContainer, depth + 1);
                    }
                    toggle.textContent = '▾';
                    localStorage.setItem(expandKey, '1');
                } else {
                    childContainer.style.display = 'none';
                    toggle.textContent = '▸';
                    localStorage.setItem(expandKey, '0');
                }
            }
        });

        row.classList.toggle('active', _currentFolder === f.path);
        container.appendChild(row);
    });
}

function _makeFolderRow(name, count, folderPath, depth, hasChildren = false) {
    const row = document.createElement('div');
    row.className = 'img-folder-row';
    row.dataset.path = folderPath || '';

    const indent = depth * 14;

    row.innerHTML = `
        <div class="explorer-item img-folder-item" style="padding-left:${indent}px">
            <span class="img-folder-toggle" style="width:14px;display:inline-block;text-align:center;flex-shrink:0;color:var(--slate-500);font-size:0.7rem;cursor:pointer;">
                ${hasChildren ? '▾' : ''}
            </span>
            <span class="img-folder-icon">📁</span>
            <span class="img-folder-label item-label">${_esc(name)}</span>
            ${count !== null ? `<span class="img-folder-count">${count > 999 ? '999+' : count}</span>` : ''}
        </div>
        <div class="img-child-container"></div>
    `;
    return row;
}

function _setActiveRow(folderPath) {
    document.querySelectorAll('.img-folder-row').forEach(r => r.classList.remove('active'));
    if (folderPath === null) {
        document.querySelector('.img-folder-row[data-path=""]')?.classList.add('active');
    } else {
        document.querySelector(`.img-folder-row[data-path="${CSS.escape(folderPath)}"]`)?.classList.add('active');
    }
}

/**
 * Restore images mode view without any IPC call or grid rebuild.
 * Rebuilds the folder tree from cache, re-highlights the active folder/card,
 * then scrolls the active card into view (or scrolls grid to savedScrollTop).
 * Called when switching back to images mode after it was already initialized.
 */
export function refreshImageBrowserView(savedGridScrollTop = 0) {
    // Rebuild folder tree from cached _folderTree (no IPC)
    const container = document.getElementById('explorer-content');
    if (container) {
        container.innerHTML = '';
    }
    if (container && _folderTree.length > 0) {

        // Favorites row
        const favPath2 = _getFavPath();
        const favRow2 = _makeFolderRow('★ Favorites', null, favPath2, 0);
        favRow2.classList.toggle('active', _currentFolder === favPath2);
        favRow2.querySelector('.img-folder-icon').textContent = '⭐';
        favRow2.querySelector('.img-folder-label').addEventListener('click', async () => {
            _currentFolder = favPath2;
            _currentFile = null;
            _setActiveRow(favPath2);
            clearImageInfo();
            _clearSearch();
            await renderImageGrid(favPath2);
        });
        container.appendChild(favRow2);

        const allRow = _makeFolderRow(i18n.t('images_folder_all'), null, null, 0);
        allRow.classList.toggle('active', _currentFolder === null);
        allRow.querySelector('.img-folder-label').addEventListener('click', async () => {
            _currentFolder = null;
            _currentFile = null;
            _setActiveRow(null);
            clearImageInfo();
            _clearSearch();
            await renderImageGrid(null);
        });
        container.appendChild(allRow);
        _buildFolderTreeDOM(_folderTree, container, 1);
        _setActiveRow(_currentFolder);
    }

    // Re-highlight active card without rebuilding grid DOM
    if (_currentFile) {
        let activeCard = null;
        document.querySelectorAll('.image-card').forEach(c => {
            const active = c.dataset.path === _currentFile;
            c.classList.toggle('active', active);
            if (active) activeCard = c;
        });
        if (activeCard) {
            requestAnimationFrame(() => activeCard.scrollIntoView({ behavior: 'instant', block: 'nearest' }));
        }
    } else {
        // No selected card — restore the raw scroll position
        const grid = document.getElementById('image-grid');
        const scrollEl = grid?.closest('.pane-content') ?? grid?.parentElement;
        if (scrollEl && savedGridScrollTop > 0) {
            requestAnimationFrame(() => { scrollEl.scrollTop = savedGridScrollTop; });
        }
    }
}

// ── Library: Image Grid ────────────────────────────────────────
export async function renderImageGrid(folderPath) {
    const grid = document.getElementById('image-grid');
    if (!grid) return;

    // バックグラウンド先読みをキャンセル
    _metaLoadAbort = true;

    grid.innerHTML = `<div class="img-loading">${i18n.t('images_loading')}</div>`;

    let images = [];
    const scanPath = folderPath || _rootPath;
    if (scanPath) {
        const result = await window.electronAPI.getImagesInFolder(scanPath);
        images = result?.images || [];
    }

    // 全画像リストを保存（検索用）
    _allImages = images;

    grid.innerHTML = '';
    if (images.length === 0) {
        grid.innerHTML = `<div class="img-browser-empty"><span>🖼️</span><p>${i18n.t('images_empty')}</p></div>`;
        return;
    }

    _renderCards(images, grid);

    // バックグラウンドでPNG info先読み開始
    _metaLoadAbort = false;
    _preloadMetadata([...images]);
}

/** カードを grid に描画（検索時も共用） — lazy + incremental */
function _renderCards(images, grid) {
    if (!grid) grid = document.getElementById('image-grid');
    if (!grid) return;

    // 既存 observer を解放
    _thumbObserver?.disconnect();
    _sentinelObserver?.disconnect();
    _renderQueue = [];
    grid.innerHTML = '';

    if (images.length === 0) {
        grid.innerHTML = `<div class="img-browser-empty"><span>🔍</span><p>${i18n.t('images_no_results')}</p></div>`;
        return;
    }

    // IntersectionObserver: 画面内に入ったカードのみ src をセット
    _thumbObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const img = entry.target.querySelector('img.image-thumb[data-src]');
            if (img) {
                img.src = img.dataset.src;
                delete img.dataset.src;
            }
            _thumbObserver.unobserve(entry.target);
        });
    }, { rootMargin: '300px' });

    _renderQueue = [...images];
    _appendNextBatch(grid);
}

/** キューから RENDER_BATCH 枚分カードを追加し、sentinel を設置 */
function _appendNextBatch(grid) {
    const batch = _renderQueue.splice(0, RENDER_BATCH);
    const frag = document.createDocumentFragment();

    batch.forEach(img => {
        const card = document.createElement('div');
        card.className = 'image-card';
        card.classList.toggle('active', _currentFile === img.path);
        card.dataset.path = img.path;
        if (img.mtime) card.dataset.mtime = img.mtime;
        card.innerHTML = `
            <div class="image-thumb-wrap">
                <img class="image-thumb" data-src="${img.thumbUrl}" alt="${_esc(img.name)}"
                     onerror="this.src='';this.style.display='none';this.nextElementSibling.style.display='flex'">
                <div class="image-thumb-fallback" style="display:none">🖼️</div>
            </div>
            <div class="image-card-name">${_esc(img.name)}</div>
        `;
        card.addEventListener('click', async () => {
            _currentFile = img.path;
            document.querySelectorAll('.image-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            await showImageInfo(img.path);
        });
        card.addEventListener('contextmenu', async (e) => {
            e.preventDefault();
            // 右クリックでもカードを選択・情報表示
            _currentFile = img.path;
            document.querySelectorAll('.image-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            showImageInfo(img.path); // パネル更新（await不要）
            // PNG info がキャッシュになければ先読み
            if (!_pngInfoCache[img.path]) {
                _pngInfoCache[img.path] = await window.electronAPI.getPngInfo(img.path) || {};
            }
            _showImgCtxMenu(e.clientX, e.clientY, img.path);
        });
        _thumbObserver.observe(card);
        frag.appendChild(card);
    });

    grid.appendChild(frag);

    // まだキューが残っていれば sentinel を置いてスクロール時に次バッチを追加
    if (_renderQueue.length > 0) {
        _sentinelObserver?.disconnect();
        const sentinel = document.createElement('div');
        sentinel.className = 'img-load-sentinel';
        grid.appendChild(sentinel);

        _sentinelObserver = new IntersectionObserver((entries) => {
            if (!entries[0].isIntersecting) return;
            sentinel.remove();
            _sentinelObserver.disconnect();
            _appendNextBatch(grid);
        }, { rootMargin: '400px' });
        _sentinelObserver.observe(sentinel);
    }
}

// ── Search: バックグラウンドPNG info先読み ────────────────────
async function _preloadMetadata(images) {
    const BATCH = 8;
    for (let i = 0; i < images.length; i += BATCH) {
        if (_metaLoadAbort) return;
        const batch = images.slice(i, i + BATCH);
        await Promise.all(batch.map(async img => {
            if (_pngInfoCache[img.path] !== undefined) return; // キャッシュ済み
            try {
                const info = await window.electronAPI.getPngInfo(img.path) || {};
                _pngInfoCache[img.path] = info;
            } catch (_) {
                _pngInfoCache[img.path] = {};
            }
        }));
        // UIをブロックしないよう少し待機
        await new Promise(r => setTimeout(r, 40));
    }
}

/** 検索クエリで画像をフィルタリングしてグリッドを更新 */
export function filterImages(query) {
    if (!query) {
        // クエリなし → 全件表示
        _renderCards(_allImages);
        return;
    }
    const q = query.toLowerCase();
    const filtered = _allImages.filter(img => {
        // ファイル名マッチ
        if (img.name.toLowerCase().includes(q)) return true;
        // キャッシュ済みPNG infoマッチ
        const info = _pngInfoCache[img.path];
        if (info?.positive?.toLowerCase().includes(q)) return true;
        if (info?.negative?.toLowerCase().includes(q)) return true;
        if (info?.params?.Model?.toLowerCase().includes(q)) return true;
        return false;
    });
    _renderCards(filtered);
}

function _clearSearch() {
    const el = document.getElementById('library-search');
    if (el && State.currentMode === 'images') el.value = '';
}

// ── Builder: PNG Info ─────────────────────────────────────────
export async function showImageInfo(filePath) {
    const panel = document.getElementById('image-info-panel');
    if (!panel) return;

    panel.innerHTML = `<div class="img-loading">${i18n.t('images_parsing')}</div>`;

    const info = await window.electronAPI.getPngInfo(filePath) || {};

    // キャッシュに保存（検索に使用）
    _pngInfoCache[filePath] = info;

    const { positive = '', negative = '', params = {}, raw = '' } = info;
    const fname = filePath.split(/[/\\]/).pop();
    const mtimeMs = _allImages.find(img => img.path === filePath)?.mtime;
    const dateStr = mtimeMs ? new Date(mtimeMs).toLocaleString('ja-JP', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    }) : '';

    const paramRows = Object.entries(params).map(([k, v]) => {
        const valHtml = k === 'Model'
            ? `<button class="pinfo-model-btn" data-model="${_esc(v)}" title="${i18n.t('title_search_model').replace('{name}', _esc(v))}">${_esc(v)}</button>`
            : _esc(v);
        return `<tr><td class="pinfo-key">${_esc(k)}</td><td class="pinfo-val">${valHtml}</td></tr>`;
    }).join('');

    panel.innerHTML = `
        <div class="image-preview-wrap">
            <img class="image-preview" src="thumb:///${encodeURIComponent(filePath.replace(/\\/g, '/'))}"
                 alt="${_esc(fname)}" onerror="this.style.opacity='0.3'">
        </div>
        <div class="pinfo-filename" title="${_esc(filePath)}">${_esc(fname)}</div>
        ${dateStr ? `<div class="pinfo-date">📅 ${dateStr}</div>` : ''}

        <div class="pinfo-section">
            <div class="pinfo-label">✅ Positive</div>
            <div class="pinfo-text pinfo-positive">${_esc(positive) || `<span style="opacity:.4">${i18n.t('images_no_positive')}</span>`}</div>
        </div>

        ${negative ? `
        <div class="pinfo-section">
            <div class="pinfo-label">❌ Negative</div>
            <div class="pinfo-text pinfo-negative">${_esc(negative)}</div>
        </div>` : ''}

        ${paramRows ? `
        <div class="pinfo-section">
            <div class="pinfo-label">⚙️ Generation Info</div>
            <table class="pinfo-table">${paramRows}</table>
        </div>` : ''}

        ${!raw ? `<div class="pinfo-no-meta">${i18n.t('images_no_meta')}</div>` : ''}

        <div class="pinfo-actions">
            <button class="btn-send-to-tags btn-primary" id="btn-send-to-tags"
                ${!positive ? 'disabled' : ''}>
                ${i18n.t('btn_send_to_tags')}
            </button>
            <button class="btn-secondary" id="btn-copy-positive"
                ${!positive ? 'disabled' : ''}>
                ${i18n.t('btn_copy_positive')}
            </button>
            <button class="btn-secondary" id="btn-register-to-tag">
                ${i18n.t('btn_register_to_tag_img')}
            </button>
            <button class="btn-secondary" id="btn-add-favorite"
                ${_isInFavFolder(filePath) ? 'disabled' : ''}>
                ${_isInFavFolder(filePath) ? i18n.t('btn_already_favorite') : i18n.t('btn_add_favorite_img')}
            </button>
        </div>
    `;

    panel.querySelector('.pinfo-model-btn')?.addEventListener('click', (e) => {
        const model = e.currentTarget.dataset.model;
        const searchEl = document.getElementById('library-search');
        if (searchEl) {
            searchEl.value = model;
            filterImages(model);
        }
    });

    document.getElementById('btn-send-to-tags')?.addEventListener('click', () => {
        sendToTags(positive, negative);
    });
    document.getElementById('btn-copy-positive')?.addEventListener('click', () => {
        navigator.clipboard.writeText(positive).then(() => {
            const btn = document.getElementById('btn-copy-positive');
            if (btn) { btn.textContent = i18n.t('toast_copy_done'); setTimeout(() => btn.textContent = i18n.t('btn_copy_positive'), 2000); }
        });
    });

    document.getElementById('btn-register-to-tag')?.addEventListener('click', () => {
        _openTagImagePicker(filePath);
    });

    document.getElementById('btn-add-favorite')?.addEventListener('click', async () => {
        if (!_rootPath) return;
        const result = await window.electronAPI.addFavoriteImage(filePath);
        const btn = document.getElementById('btn-add-favorite');
        if (result?.success) {
            if (btn) {
                btn.textContent = result.alreadyExists ? i18n.t('btn_already_favorite') : i18n.t('btn_fav_added');
                btn.disabled = true;
            }
        }
    });
}

// ── Tag Image Picker ───────────────────────────────────────────
function _openTagImagePicker(filePath) {
    if (!State.allTags?.length) return;

    // ── Build flat list for search ──────────────────────────────
    const allItems = [];
    const collectFlat = (nodes, catName, crumb) => {
        for (const n of (nodes || [])) {
            if (n.type === 'tag') {
                allItems.push({ tag: n, catName, crumb });
            } else if (n.children) {
                collectFlat(n.children, catName, crumb ? `${crumb} › ${n.name}` : n.name);
            }
        }
    };
    for (const cat of State.allTags) collectFlat(cat.children || [], cat.name, '');
    if (allItems.length === 0) return;

    // ── Dialog skeleton ─────────────────────────────────────────
    const dialog = document.createElement('dialog');
    dialog.className = 'tag-img-picker tip-v2';
    dialog.innerHTML = `
        <div class="tip-header">
            <span class="tip-title">🏷️ タグに画像を登録</span>
            <input class="tip-search" placeholder="🔍  タグ名・値で検索…" autocomplete="off" spellcheck="false">
            <button class="tip-close btn-icon-sm">✕</button>
        </div>
        <div class="tip-body">
            <div class="tip-cat-list"></div>
            <div class="tip-tag-area"></div>
        </div>
    `;
    document.body.appendChild(dialog);

    const catListEl  = dialog.querySelector('.tip-cat-list');
    const tagAreaEl  = dialog.querySelector('.tip-tag-area');
    const searchEl   = dialog.querySelector('.tip-search');

    // ── Register helper ─────────────────────────────────────────
    const doRegister = async (tag) => {
        dialog.close();
        const result = await window.electronAPI.registerTagImage(tag.value, filePath);
        if (result?.success) {
            tag.thumbnail = result.path;
            await saveTagOrder(State.allTags);
            const btn = document.getElementById('btn-register-to-tag');
            if (btn) { btn.textContent = i18n.t('toast_register_done'); setTimeout(() => btn.textContent = '🏷️ タグに登録', 2000); }
        }
    };

    // ── Render a single tag button ───────────────────────────────
    const makTagBtn = (tag, color) => {
        const colorClass = color ? `cat-${color}` : '';
        const btn = document.createElement('div');
        btn.className = `tag-btn ${colorClass}`;
        btn.innerHTML = `<span class="tag-name">${_esc(tag.name)}</span>`;
        if (tag.thumbnail) {
            const badge = document.createElement('span');
            badge.className = 'tip-has-img';
            badge.textContent = '✔';
            btn.appendChild(badge);
        }
        attachPopupEvents(btn, { name: tag.name, value: tag.value, thumbnail: tag.thumbnail, type: 'tag' }, color);
        btn.addEventListener('click', () => doRegister(tag));
        return btn;
    };

    // ── Render tag grid for a category ──────────────────────────
    const renderTagArea = (cat) => {
        tagAreaEl.innerHTML = '';
        const color = cat.color || null;

        const renderNodes = (nodes, container, depth = 0) => {
            const tags    = nodes.filter(n => n.type === 'tag');
            const groups  = nodes.filter(n => n.type !== 'tag' && n.children);

            if (tags.length > 0) {
                const grid = document.createElement('div');
                grid.className = 'btn-grid';
                tags.forEach(t => grid.appendChild(makTagBtn(t, color)));
                container.appendChild(grid);
            }

            groups.forEach(grp => {
                const section = document.createElement('div');
                section.className = 'tag-group-section';

                const header = document.createElement('div');
                header.className = 'tag-section-header tag-section-title-wrap';
                if (color) header.style.borderLeftColor = `var(--cat-accent, var(--glow-primary))`;
                const title = document.createElement('h3');
                title.className = 'tag-section-title';
                title.textContent = grp.name;
                header.appendChild(title);
                section.appendChild(header);

                const inner = document.createElement('div');
                if (depth > 0) {
                    inner.className = 'nested-groups-container';
                    inner.style.paddingLeft = '1.2rem';
                    inner.style.borderLeft = '1px solid var(--border-color)';
                }
                renderNodes(grp.children || [], inner, depth + 1);
                section.appendChild(inner);
                container.appendChild(section);
            });
        };

        renderNodes(cat.children || [], tagAreaEl);
    };

    // ── Render search results (flat) ─────────────────────────────
    const renderSearch = (q) => {
        tagAreaEl.innerHTML = '';
        catListEl.querySelectorAll('.tip-cat-item').forEach(el => el.classList.remove('active'));

        const lq = q.toLowerCase();
        const filtered = allItems.filter(i =>
            i.tag.name.toLowerCase().includes(lq) || (i.tag.value || '').toLowerCase().includes(lq)
        );

        if (filtered.length === 0) {
            tagAreaEl.innerHTML = `<div class="tip-empty">${i18n.t('tag_picker_no_results')}</div>`;
            return;
        }

        // Group by category for display
        const byCat = new Map();
        for (const { tag, catName, crumb } of filtered) {
            if (!byCat.has(catName)) byCat.set(catName, []);
            byCat.get(catName).push({ tag, crumb });
        }

        for (const [catName, tagList] of byCat) {
            const catColor = State.allTags.find(c => c.name === catName)?.color || null;
            const section = document.createElement('div');
            section.className = 'tag-group-section';

            const header = document.createElement('div');
            header.className = 'tag-section-header tag-section-title-wrap';
            const title = document.createElement('h3');
            title.className = 'tag-section-title';
            title.textContent = catName;
            header.appendChild(title);
            section.appendChild(header);

            const grid = document.createElement('div');
            grid.className = 'btn-grid';
            tagList.forEach(({ tag }) => grid.appendChild(makTagBtn(tag, catColor)));
            section.appendChild(grid);
            tagAreaEl.appendChild(section);
        }
    };

    // ── Build category list ──────────────────────────────────────
    let activeCatEl = null;
    State.allTags.forEach((cat, idx) => {
        const item = document.createElement('div');
        item.className = `tip-cat-item${cat.color ? ` cat-${cat.color}` : ''}`;
        item.textContent = cat.name;
        item.addEventListener('click', () => {
            catListEl.querySelectorAll('.tip-cat-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            activeCatEl = item;
            searchEl.value = '';
            renderTagArea(cat);
        });
        catListEl.appendChild(item);

        // Select first category by default
        if (idx === 0) {
            item.classList.add('active');
            activeCatEl = item;
            renderTagArea(cat);
        }
    });

    // ── Search input ─────────────────────────────────────────────
    let searchTimer = null;
    searchEl.addEventListener('input', () => {
        clearTimeout(searchTimer);
        const q = searchEl.value.trim();
        if (!q) {
            // Restore active category
            const activeItem = catListEl.querySelector('.tip-cat-item.active');
            if (activeItem) {
                const idx = [...catListEl.children].indexOf(activeItem);
                if (idx >= 0) renderTagArea(State.allTags[idx]);
            }
            return;
        }
        searchTimer = setTimeout(() => renderSearch(q), 200);
    });

    dialog.querySelector('.tip-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });

    // Move #chip-info-popup into dialog so it renders in the top layer above it
    const infoPopup = document.getElementById('chip-info-popup');
    const infoPopupParent = infoPopup?.parentNode;
    if (infoPopup) dialog.appendChild(infoPopup);

    dialog.addEventListener('close', () => {
        // Restore popup to original parent before removing dialog
        if (infoPopup && infoPopupParent) infoPopupParent.appendChild(infoPopup);
        dialog.remove();
    });

    dialog.showModal();
    searchEl.focus();
}

export function clearImageInfo() {
    const panel = document.getElementById('image-info-panel');
    if (panel) {
        panel.innerHTML = `<div class="image-info-placeholder">
            <span>🖼️</span>
            <p>${i18n.t('image_info_placeholder')}</p>
        </div>`;
    }
}

// ── Send to Tags ───────────────────────────────────────────────
async function sendToTags(positive, negative) {
    if (!positive) return;
    window.dispatchEvent(new CustomEvent('app:switch-mode', { detail: 'tags' }));

    const posArea = document.getElementById('positive-prompt');
    if (posArea) { posArea.value = positive; posArea.dispatchEvent(new Event('input')); }
    if (negative) {
        const negArea = document.getElementById('negative-prompt');
        if (negArea) { negArea.value = negative; negArea.dispatchEvent(new Event('input')); }
    }
    renderPromptChips('positive-chips', 'positive-prompt');
    if (negative) renderPromptChips('negative-chips', 'negative-prompt');

    const btn = document.getElementById('btn-send-to-tags');
    if (btn) {
        btn.textContent = i18n.t('toast_tags_sent');
        btn.disabled = true;
        setTimeout(() => { btn.textContent = i18n.t('btn_send_to_tags'); btn.disabled = false; }, 2000);
    }
}

// ── Helpers ────────────────────────────────────────────────────
function _esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


// ── Image Card Context Menu ────────────────────────────────────
function _getImgCtxMenu() {
    if (_imgCtxMenu) return _imgCtxMenu;
    _imgCtxMenu = document.createElement('div');
    _imgCtxMenu.className = 'img-ctx-menu';
    _imgCtxMenu.innerHTML = `
        <div class="img-ctx-item" data-action="send-to-tags" data-i18n="btn_send_to_tags">${i18n.t('btn_send_to_tags')}</div>
        <div class="img-ctx-item" data-action="copy-positive" data-i18n="img_ctx_copy_positive">${i18n.t('img_ctx_copy_positive')}</div>
        <div class="img-ctx-item" data-action="copy-pnginfo" data-i18n="img_ctx_copy_pnginfo">${i18n.t('img_ctx_copy_pnginfo')}</div>
        <div class="img-ctx-separator"></div>
        <div class="img-ctx-item" data-action="add-favorite" data-i18n="btn_add_favorite_img">${i18n.t('btn_add_favorite_img')}</div>
        <div class="img-ctx-item" data-action="register-tag" data-i18n="img_ctx_register_tag">${i18n.t('img_ctx_register_tag')}</div>
        <div class="img-ctx-separator"></div>
        <div class="img-ctx-item" data-action="show-in-explorer" data-i18n="img_ctx_show_in_explorer">${i18n.t('img_ctx_show_in_explorer')}</div>
        <div class="img-ctx-item img-ctx-danger" data-action="delete" data-i18n="img_ctx_delete">${i18n.t('img_ctx_delete')}</div>
    `;
    document.body.appendChild(_imgCtxMenu);

    _imgCtxMenu.addEventListener('click', async (e) => {
        const item = e.target.closest('[data-action]');
        if (!item) return;
        const action = item.dataset.action;
        const filePath = _imgCtxMenu._filePath;
        _hideImgCtxMenu();
        if (!filePath) return;

        const info = _pngInfoCache[filePath] || {};

        switch (action) {
            case 'send-to-tags':
                sendToTags(info.positive || '', info.negative || '');
                break;
            case 'copy-positive':
                if (info.positive) navigator.clipboard.writeText(info.positive);
                break;
            case 'copy-pnginfo':
                if (info.raw) navigator.clipboard.writeText(info.raw);
                break;
            case 'add-favorite': {
                if (!_rootPath) break;
                const favResult = await window.electronAPI.addFavoriteImage(filePath);
                if (favResult?.success && !favResult.alreadyExists) {
                    // 追加後に Explorer の Favorites がアクティブなら再描画
                    if (_currentFolder === _getFavPath()) {
                        await renderImageGrid(_getFavPath());
                    }
                }
                break;
            }
            case 'register-tag':
                _openTagImagePicker(filePath);
                break;
            case 'show-in-explorer':
                window.electronAPI.showItemInFolder(filePath);
                break;
            case 'delete': {
                const fname = filePath.split(/[/\\]/).pop();
                const ok = await showConfirmDialog(i18n.t('confirm_trash_file').replace('{name}', fname));
                if (!ok) return;
                const result = await window.electronAPI.deleteImageFile(filePath);
                if (result?.success) {
                    // DOMからカードを除去
                    document.querySelector(`.image-card[data-path="${CSS.escape(filePath)}"]`)?.remove();
                    // _allImages からも除去
                    _allImages = _allImages.filter(img => img.path !== filePath);
                    if (_currentFile === filePath) {
                        _currentFile = null;
                        clearImageInfo();
                    }
                }
                break;
            }
        }
    });

    // 外クリックで閉じる
    window.addEventListener('click', _hideImgCtxMenu, true);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') _hideImgCtxMenu(); });
    return _imgCtxMenu;
}

function _showImgCtxMenu(x, y, filePath) {
    const menu = _getImgCtxMenu();
    menu._filePath = filePath;

    // 画面端に収まるよう調整
    menu.style.display = 'block';
    const mw = menu.offsetWidth || 200;
    const mh = menu.offsetHeight || 220;
    menu.style.left = `${Math.min(x, window.innerWidth  - mw - 4)}px`;
    menu.style.top  = `${Math.min(y, window.innerHeight - mh - 4)}px`;

    // info が揃っているか判定してアイテムをグレーアウト
    const info = _pngInfoCache[filePath] || {};
    menu.querySelector('[data-action="send-to-tags"]').classList.toggle('img-ctx-disabled', !info.positive);
    menu.querySelector('[data-action="copy-positive"]').classList.toggle('img-ctx-disabled', !info.positive);
    menu.querySelector('[data-action="copy-pnginfo"]').classList.toggle('img-ctx-disabled', !info.raw);

    // Favorites 状態を反映
    const favItem = menu.querySelector('[data-action="add-favorite"]');
    if (favItem) {
        const alreadyFav = _isInFavFolder(filePath);
        favItem.textContent = alreadyFav ? '✅ お気に入り済み' : '★ お気に入り';
        favItem.classList.toggle('img-ctx-disabled', alreadyFav);
    }
}

function _hideImgCtxMenu() {
    if (_imgCtxMenu) _imgCtxMenu.style.display = 'none';
}
