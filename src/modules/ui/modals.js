/**
 * UI Modals Component for v4 - Logic for all dialogs
 */
import { CATEGORIES_PALETTE, PALETTE_CSS_VAR } from '../core/palette.js';
import { DEFAULT_SHORTCUTS, eventToKey, formatKey, loadShortcutOverrides } from '../core/shortcuts.js';

/**
 * トースト通知を表示する
 * @param {string} message  表示メッセージ
 * @param {'success'|'error'|'info'} type  種別
 * @param {number} duration  表示時間 ms（デフォルト 3000）
 */
export function showToast(message, type = 'info', duration = 3000) {
    const existing = document.getElementById('pb-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'pb-toast';
    toast.className = `pb-toast pb-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // アニメーション用に次フレームで active 付与
    requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add('pb-toast-active'));
    });

    const remove = () => {
        toast.classList.remove('pb-toast-active');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    };
    setTimeout(remove, duration);
    toast.addEventListener('click', remove);
}

/**
 * Generic text-input dialog. Returns the entered string or null if cancelled.
 */
export function showConfirmDialog(message) {
    return new Promise((resolve) => {
        const dialog = document.getElementById('confirm-dialog');
        const msgEl = document.getElementById('confirm-dialog-message');
        const okBtn = document.getElementById('btn-confirm-dialog-ok');
        const cancelBtn = document.getElementById('btn-confirm-dialog-cancel');
        if (!dialog || !msgEl || !okBtn || !cancelBtn) { resolve(false); return; }

        msgEl.textContent = message;
        dialog.showModal();

        const finish = (result) => {
            okBtn.onclick = null;
            cancelBtn.onclick = null;
            dialog.onkeydown = null;
            dialog.close();
            resolve(result);
        };

        okBtn.onclick = () => finish(true);
        cancelBtn.onclick = () => finish(false);
        dialog.onkeydown = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); finish(true); }
            if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        };
    });
}

export function showInputDialog(title, defaultValue = '', { allowEmpty = false } = {}) {
    return new Promise((resolve) => {
        const dialog = document.getElementById('input-dialog');
        const titleEl = document.getElementById('input-dialog-title');
        const field = document.getElementById('input-dialog-field');
        const confirmBtn = document.getElementById('btn-input-dialog-confirm');
        const cancelBtn = document.getElementById('btn-input-dialog-cancel');
        if (!dialog || !titleEl || !field || !confirmBtn || !cancelBtn) { resolve(null); return; }

        titleEl.textContent = title;
        field.value = defaultValue;
        dialog.showModal();
        setTimeout(() => { field.focus(); field.select(); }, 0);

        const finish = (value) => {
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
            dialog.onkeydown = null;
            dialog.close();
            resolve(value);
        };

        const confirm = () => finish(allowEmpty ? field.value.trim() : (field.value.trim() || null));
        confirmBtn.onclick = confirm;
        cancelBtn.onclick = () => finish(null);
        dialog.onkeydown = (e) => {
            if (e.key === 'Enter' && e.target === field) { e.preventDefault(); confirm(); }
            if (e.key === 'Escape') { e.preventDefault(); finish(null); }
        };
    });
}
import { i18n } from '../core/i18n.js';
import { State } from '../core/state.js';
import { IPC } from '../core/ipc.js';
import { recordTagUsage, getUsedTagsMap } from '../core/tagHistory.js';
import { saveTagOrder, loadTags } from '../tags/service.js';

// Constants for color palette (Ported from v3)

const THEME_TITLEBAR = {
    dark:  { color: '#0f172a', symbolColor: '#ffffff' },
    black: { color: '#000000', symbolColor: '#ffffff' },
    gray:  { color: '#252526', symbolColor: '#ffffff' },
    light: { color: '#f1f5f9', symbolColor: '#0f172a' },
};

export function applyTheme(theme) {
    document.body.classList.remove('theme-dark', 'theme-light', 'theme-black', 'theme-gray');
    document.body.classList.add(`theme-${theme}`);
    window.electronAPI?.setTitlebarOverlay?.(THEME_TITLEBAR[theme] || THEME_TITLEBAR.dark);
    IPC.setPreviewTheme(theme);
}

export function setupModals() {
    const btnSettings = document.getElementById('btn-settings');
    const settingsModal = document.getElementById('settings-modal');
    const langSelect = document.getElementById('setting-language');
    
    if (btnSettings && settingsModal) {
        btnSettings.onclick = () => {
            langSelect.value = i18n.currentLang;
            openSettings();
        };
    }

    // Backdrop Click to Close
    document.querySelectorAll('dialog').forEach(dialog => {
        dialog.addEventListener('mousedown', (e) => {
            if (e.target === dialog) {
                dialog.close();
            }
        });
    });

    // Language Change Handler
    if (langSelect) {
        langSelect.onchange = (e) => {
            i18n.setLanguage(e.target.value);
        };
    }


    // Modal Close buttons
    document.querySelectorAll('.btn-secondary, .btn-primary').forEach(btn => {
        if (btn.id.startsWith('btn-cancel') || btn.id.startsWith('btn-save')) {
            btn.onclick = (e) => {
                const modal = e.target.closest('dialog');
                if (modal) modal.close();
            };
        }
    });

    // Settings 2-pane tab switching
    document.querySelectorAll('.settings-nav-item').forEach(navItem => {
        navItem.onclick = () => {
            document.querySelectorAll('.settings-nav-item').forEach(n => n.classList.remove('active'));
            document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
            navItem.classList.add('active');
            const tab = document.getElementById(`stab-${navItem.dataset.tab}`);
            if (tab) tab.classList.add('active');
        };
    });

    // Browse Folder Buttons for Settings
    const pathKeys = ['lora', 'embedding', 'tags', 'checkpoint', 'vae', 'upscaler', 'gen-presets', 'output-images', 'userdata'];
    pathKeys.forEach(key => {
        const btn = document.getElementById(`btn-browse-${key}`);
        if (btn) {
            btn.onclick = async () => {
                const selected = await IPC.browseFolder();
                if (selected) document.getElementById(`setting-${key}`).value = selected;
            };
        }
    });

    // Reimport YAML
    const btnReimport = document.getElementById('btn-reimport-yaml');
    if (btnReimport) {
        btnReimport.onclick = async () => {
            btnReimport.disabled = true;
            btnReimport.textContent = i18n.t('reimport_loading');
            const result = await IPC.reimportYAML();
            if (result?.success) {
                await loadTags();
                window.dispatchEvent(new CustomEvent('tags-reloaded'));
                btnReimport.textContent = i18n.t('reimport_done').replace('{n}', result.count);
            } else {
                btnReimport.textContent = i18n.t('reimport_error').replace('{msg}', result?.error || i18n.t('toast_connection_failed'));
            }
            setTimeout(() => {
                btnReimport.disabled = false;
                btnReimport.textContent = i18n.t('btn_reimport_yaml');
            }, 3000);
        };
    }

    // Save Settings
    const btnSaveSettings = document.getElementById('btn-save-settings');
    if (btnSaveSettings) {
        btnSaveSettings.onclick = async () => {
            const config = {
                loraPath: document.getElementById('setting-lora').value,
                embeddingsPath: document.getElementById('setting-embedding').value,
                tagsPath: document.getElementById('setting-tags').value,
                civitaiApiKey:    document.getElementById('setting-civitai-key').value,
                civitaiDomain:    document.getElementById('setting-civitai-domain')?.value || 'auto',
                checkpointsPath: document.getElementById('setting-checkpoint').value,
                vaesPath: document.getElementById('setting-vae').value,
                upscalersPath: document.getElementById('setting-upscaler').value,
                genPresetsPath: document.getElementById('setting-gen-presets').value,
                outputImagesPath: document.getElementById('setting-output-images')?.value || '',
                customARs: document.getElementById('setting-custom-ars').value,
                customResolutions: document.getElementById('setting-custom-res').value,
                webuiUrl: document.getElementById('setting-webui-url').value,
                comfyUrl: document.getElementById('setting-comfy-url').value,
                comfyDefaultSlot: document.getElementById('setting-comfy-default-slot').value || 'slot_1',
                comfyGenSlot: document.getElementById('setting-comfy-gen-slot').value || 'gen_1',
                sendPromptEnabled: document.getElementById('setting-send-prompt').checked,
                sendGenSettingsEnabled: document.getElementById('setting-send-gen').checked,
                ollamaUrl:    document.getElementById('setting-ai-ollama-url')?.value   || 'http://localhost:11434',
                ollamaModel:  document.getElementById('setting-ai-ollama-model')?.value || 'llama3',
                claudeApiKey: document.getElementById('setting-claude-apikey')?.value   || '',
                claudeModel:  document.getElementById('setting-claude-model')?.value    || '',
                openaiApiKey: document.getElementById('setting-openai-apikey')?.value   || '',
                openaiModel:  document.getElementById('setting-openai-model')?.value    || '',
                yamlAutoSave: document.getElementById('setting-yaml-autosave')?.checked || false,
                allowMultipleInstances: document.getElementById('setting-allow-multi-instance')?.checked || false,
                danbooruUnderscoreToSpace: document.getElementById('setting-danbooru-underscore')?.checked ?? true,
                translateBackend:       document.getElementById('setting-translate-backend')?.value       || 'off',
                translateOllamaUrl:     document.getElementById('setting-translate-ollama-url')?.value    || 'http://localhost:11434',
                translateOllamaModel:   document.getElementById('setting-translate-ollama-model')?.value  || 'llama3',
                translateLibreUrl:      document.getElementById('setting-translate-libre-url')?.value     || 'http://localhost:5000',
                translateLibreApiKey:   document.getElementById('setting-translate-libre-apikey')?.value  || '',
                shortcuts: collectShortcutOverrides(),
                language: langSelect?.value || 'en',
            };
            await IPC.saveConfig(config);
            loadShortcutOverrides(config.shortcuts);

            // User Data Folder: 変更があればuserdata.txtに書き込み（再起動後に有効）
            const newUserDataPath = document.getElementById('setting-userdata')?.value.trim() || '';
            const currentUserDataPath = await IPC.getUserDataPath?.() || '';
            if (newUserDataPath !== currentUserDataPath) {
                await IPC.setUserDataPath?.(newUserDataPath);
                showToast(i18n.t('toast_userdata_restart'));
            }

            const theme = document.getElementById('setting-theme')?.value || 'dark';
            localStorage.setItem('pb-theme', theme);
            applyTheme(theme);

            // Notify Image Browser of new path
            if (config.outputImagesPath !== undefined) {
                window.dispatchEvent(new CustomEvent('outputImagesPathChanged', { detail: config.outputImagesPath }));
            }

            // Notify other modules that settings were saved
            window.dispatchEvent(new CustomEvent('settings:saved', { detail: config }));

            settingsModal.close();
        };
    }

    // Translation backend select (live preview in settings)
    const translateBackendSelect = document.getElementById('setting-translate-backend');
    if (translateBackendSelect) {
        translateBackendSelect.addEventListener('change', () => {
            _updateTranslateBackendSections(translateBackendSelect.value);
        });
    }

    // Add Category
    const btnAddCategory = document.getElementById('btn-add-category');
    if (btnAddCategory) {
        btnAddCategory.onclick = () => openAddCategoryModal();
    }

    const inputCategoryName = document.getElementById('new-category-name');
    if (inputCategoryName) {
        inputCategoryName.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btn-save-add-cat')?.click(); }
        });
    }

    const btnSaveCategory = document.getElementById('btn-save-add-cat');
    if (btnSaveCategory) {
        btnSaveCategory.onclick = async () => {
            const name = document.getElementById('new-category-name').value;
            const editId = document.getElementById('edit-category-id')?.value;
            if (!name) return;

            if (editId) {
                // Update Existing
                const cat = State.allTags.find(c => c.id === editId);
                if (cat) cat.name = name;
            } else {
                // Simple addition (v4 style)
                State.allTags.push({
                    id: name.toLowerCase().replace(/\s+/g, '_'),
                    name: name,
                    type: 'category',
                    children: [],
                    color: 'indigo'
                });
            }

            await saveTagOrder(State.allTags);
            window.dispatchEvent(new CustomEvent('tagsUpdated'));
            document.getElementById('add-category-modal').close();
        };
    }

    // Save Add Tag / Group
    const btnSaveAddTag = document.getElementById('btn-save-add-tag');
    if (btnSaveAddTag) {
        btnSaveAddTag.onclick = async () => {
            const mode = document.getElementById('add-mode').value;
            const catId = document.getElementById('add-target-cat').value;
            const groupName = document.getElementById('add-target-group').value;
            const editId = document.getElementById('edit-tag-id')?.value || null;

            const newName = mode === 'tag' ? document.getElementById('new-tag-key').value : document.getElementById('new-subgroup-name').value;
            const newVal = document.getElementById('new-tag-val').value;

            if (!newName) return;

            // If Edit Mode: Remove old item first, recording original position
            let preservedChildren = null;
            let originalInfo = null;
            if (editId) {
                originalInfo = findNodeWithParent(State.allTags, editId);
                if (mode === 'group') {
                    const oldNode = findNodeById(State.allTags, editId);
                    if (oldNode) preservedChildren = oldNode.children || [];
                }
                removeNodeById(State.allTags, editId);
            }

            // Update State
            const category = State.allTags.find(cat => cat.id === catId);
            if (category) {
                const targetNode = groupName ? findGroupInTree(category.children, groupName) : category;
                if (targetNode) {
                    const thumbnail = document.getElementById('edit-tag-img-preview')?.dataset.url || null;
                    const newItem = mode === 'tag'
                        ? { id: editId || `tag-${Date.now()}`, name: newName, value: newVal, type: 'tag', thumbnail }
                        : { id: editId || `grp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: newName, type: 'group', children: preservedChildren ?? [] };

                    targetNode.children = targetNode.children || [];
                    // Restore original position if target group is unchanged, otherwise append
                    if (originalInfo && originalInfo.parentChildren === targetNode.children) {
                        const idx = Math.min(originalInfo.index, targetNode.children.length);
                        targetNode.children.splice(idx, 0, newItem);
                    } else {
                        targetNode.children.push(newItem);
                    }
                    
                    await saveTagOrder(State.allTags);
                    window.dispatchEvent(new CustomEvent('tagsUpdated'));
                }
            }

            document.getElementById('add-tag-modal').close();
            hideAutocomplete(); // Clean up
        };
    }

    // --- Delete Tag / Group ---
    const btnDeleteItem = document.getElementById('btn-delete-item');
    if (btnDeleteItem) {
        btnDeleteItem.onclick = async () => {
            const editId = document.getElementById('edit-tag-id')?.value || null;
            if (!editId) return;

            if (await showConfirmDialog(i18n.t('confirm_delete', 'Are you sure you want to delete this item?'))) {
                const deleted = removeNodeById(State.allTags, editId);
                if (deleted) {
                    await saveTagOrder(State.allTags);
                    window.dispatchEvent(new CustomEvent('tagsUpdated'));
                    document.getElementById('add-tag-modal').close();
                }
            }
        };
    }

    // --- Searchable Target Selector (Reverted) ---
    const moveSearch = document.getElementById('tag-move-search');
    const moveDropdown = document.getElementById('tag-move-dropdown');
    
    if (moveSearch && moveDropdown) {
        moveSearch.addEventListener('input', (e) => {
            const val = e.target.value.toLowerCase();
            const allTargets = flattenGroups(State.allTags);
            const filtered = allTargets.filter(t => t.path.toLowerCase().includes(val));

            moveDropdown.innerHTML = '';
            filtered.slice(0, 10).forEach(item => {
                const div = document.createElement('div');
                div.className = 'search-item';
                div.innerHTML = `<span class="cat-label">${item.catId}</span>${item.path}`;
                div.onclick = () => {
                    moveSearch.value = item.path;
                    document.getElementById('add-target-cat').value = item.catId;
                    document.getElementById('add-target-group').value = item.groupName;
                    moveDropdown.classList.add('hidden');
                };
                moveDropdown.appendChild(div);
            });
            moveDropdown.classList.toggle('hidden', filtered.length === 0);
        });
        
        moveSearch.addEventListener('focus', () => {
            if (moveSearch.value === '') moveSearch.dispatchEvent(new Event('input'));
        });
    }

    // Cleanup: Hide autocomplete and moveDropdown on any modal close
    document.querySelectorAll('dialog').forEach(modal => {
        modal.addEventListener('close', () => {
            hideAutocomplete();
            moveDropdown?.classList.add('hidden');
        });
    });


    // Cleanup: Hide autocomplete on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.searchable-select-container') && !e.target.closest('.ac-list') && e.target.id !== 'new-tag-val') {
            hideAutocomplete();
        }
    });

    // ── タグ値フィールド: Danbooru サジェスト ──────────────────
    const tagValInput = document.getElementById('new-tag-val');
    if (tagValInput) {
        let _acTimer = null;
        tagValInput.addEventListener('input', () => {
            clearTimeout(_acTimer);
            const q = tagValInput.value.trim();
            if (q.length < 2) { hideAutocomplete(); return; }
            _acTimer = setTimeout(async () => {
                const results = await IPC.searchDanbooru(q);
                if (!results?.length) { hideAutocomplete(); return; }
                showAutocomplete(tagValInput, results.map(r => ({
                    label: r.n,
                    type:  r.t,
                    count: r.c,
                })), (item) => {
                    const chk = document.getElementById('setting-danbooru-underscore');
                    const convert = chk ? chk.checked : true;
                    const val = convert ? item.label.replaceAll('_', ' ') : item.label;
                    tagValInput.value = val;
                    // タグ表示名が空なら tag name も補完
                    const keyEl = document.getElementById('new-tag-key');
                    if (keyEl && !keyEl.value) keyEl.value = val;
                    recordTagUsage(item.label);
                });
            }, 150);
        });
        tagValInput.addEventListener('keydown', (e) => {
            const list = document.getElementById('autocomplete-list');
            if (!list || list.classList.contains('hidden')) return;
            const items = list.querySelectorAll('.ac-item');
            const active = list.querySelector('.ac-item.ac-active');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const next = active ? active.nextElementSibling : items[0];
                active?.classList.remove('ac-active');
                next?.classList.add('ac-active');
                next?.scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prev = active ? active.previousElementSibling : items[items.length - 1];
                active?.classList.remove('ac-active');
                prev?.classList.add('ac-active');
                prev?.scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'Tab' || e.key === 'Enter') {
                if (active) {
                    e.preventDefault();
                    active.onmousedown(e);
                }
            } else if (e.key === 'Escape') {
                hideAutocomplete();
            }
        });
    }

    // --- Tag Image Support ---
    const btnSelectTagImg = document.getElementById('btn-select-tag-img');
    const btnRemoveTagImg = document.getElementById('btn-remove-tag-img');
    const tagImgPreview = document.getElementById('edit-tag-img-preview');

    if (btnSelectTagImg) {
        btnSelectTagImg.onclick = async () => {
            const selected = await IPC.selectImageFile();
            if (selected) {
                const tagValue = document.getElementById('new-tag-val')?.value ||
                                 document.getElementById('new-tag-key')?.value || 'unnamed_tag';
                const result = await IPC.registerTagImage(tagValue, selected);
                
                if (result && result.success) {
                    tagImgPreview.dataset.url = result.path;
                    tagImgPreview.style.backgroundImage = `url("${result.path}")`;
                    btnRemoveTagImg?.classList.remove('hidden');
                } else if (result && result.error) {
                    alert(`Failed to register image: ${result.error}`);
                }
            }
        };
    }

    if (btnRemoveTagImg) {
        btnRemoveTagImg.onclick = () => {
            tagImgPreview.dataset.url = '';
            tagImgPreview.style.backgroundImage = 'none';
            btnRemoveTagImg.classList.add('hidden');
        };
    }
}

const AC_BADGE_LABEL = { 0: 'GEN', 1: 'ART', 3: 'CPY', 4: 'CHR', 5: 'META' };

export function showAutocomplete(anchor, items, onSelect) {
    // Prefer an in-dialog ac-list so it renders above the top-layer
    const dialog = anchor.closest('dialog');
    const list = (dialog && dialog.querySelector('.ac-list'))
        || document.getElementById('autocomplete-list');
    if (!list || items.length === 0) {
        hideAutocomplete();
        return;
    }

    const usedMap = getUsedTagsMap();
    const sorted = [...items].sort((a, b) => {
        const aUsed = usedMap[a.label.toLowerCase()] || 0;
        const bUsed = usedMap[b.label.toLowerCase()] || 0;
        return bUsed - aUsed;
    });

    list.innerHTML = '';
    sorted.slice(0, 15).forEach(item => {
        const div = document.createElement('div');
        div.className = 'ac-item';
        const t = item.type ?? 0;
        const badge = AC_BADGE_LABEL[t] ?? 'GEN';
        const usedCount = usedMap[item.label.toLowerCase()] || 0;
        const count = item.count != null
            ? (item.count >= 1000 ? `${(item.count / 1000).toFixed(1)}k` : item.count)
            : (item.sub ?? '');
        div.innerHTML = `
            ${usedCount ? `<span class="ac-used-mark" title="${usedCount}回使用">★</span>` : ''}
            <span class="ac-item-name color-${t}" title="${item.label}">${item.label}</span>
            <span class="ac-badge-inline ac-badge-${t}">${badge}</span>
            ${count !== '' ? `<span class="ac-item-count">${count}</span>` : ''}
        `;
        div.onmousedown = (e) => {
            e.preventDefault();
            onSelect(item);
            hideAutocomplete();
        };
        list.appendChild(div);
    });

    const rect = anchor.getBoundingClientRect();
    const listWidth = Math.max(rect.width, 220);
    let left = rect.left;
    let top = rect.bottom + 2;

    // Keep within viewport
    if (left + listWidth > window.innerWidth) left = window.innerWidth - listWidth - 8;
    if (top + 300 > window.innerHeight) top = rect.top - 300;

    list.style.left = `${left}px`;
    list.style.top = `${top}px`;
    list.style.width = `${listWidth}px`;
    list.classList.remove('hidden');
}

export function hideAutocomplete() {
    document.getElementById('autocomplete-list')?.classList.add('hidden');
    document.getElementById('autocomplete-list-modal')?.classList.add('hidden');
}

function flattenGroups(categories, parentPath = '', catId = null) {
    let results = [];
    categories.forEach(cat => {
        const currentCatId = catId || cat.id;
        const currentPath = parentPath ? `${parentPath} > ${cat.name}` : cat.name;
        
        if (cat.type === 'category' || cat.type === 'group') {
            results.push({
                name: cat.name,
                path: currentPath,
                catId: currentCatId,
                groupName: cat.type === 'group' ? cat.name : ''
            });
            if (cat.children) {
                results.push(...flattenGroups(cat.children.filter(c => c.type === 'group'), currentPath, currentCatId));
            }
        }
    });
    return results;
}

function findGroupInTree(nodes, name) {
    if (!nodes) return null;
    for (const node of nodes) {
        if (node.type === 'group' && node.name === name) return node;
        if (node.children) {
            const found = findGroupInTree(node.children, name);
            if (found) return found;
        }
    }
    return null;
}

function findNodeWithParent(nodes, nodeId) {
    for (let i = 0; i < nodes.length; i++) {
        const id = nodes[i].id || (nodes[i].type === 'group' ? nodes[i].name : null);
        if (id === nodeId) return { parentChildren: nodes, index: i };
        if (nodes[i].children) {
            const found = findNodeWithParent(nodes[i].children, nodeId);
            if (found) return found;
        }
    }
    return null;
}

function findNodeById(nodes, id) {
    for (const node of nodes) {
        const nodeId = node.id || (node.type === 'group' ? node.name : null);
        if (nodeId === id) return node;
        if (node.children) {
            const found = findNodeById(node.children, id);
            if (found) return found;
        }
    }
    return null;
}

export function removeNodeById(nodes, id) {
    for (let i = 0; i < nodes.length; i++) {
        // Match either id or group name (heuristic)
        const nodeId = nodes[i].id || (nodes[i].type === 'group' ? nodes[i].name : null);
        if (nodeId === id) {
            nodes.splice(i, 1);
            return true;
        }
        if (nodes[i].children) {
            if (removeNodeById(nodes[i].children, id)) return true;
        }
    }
    return false;
}

export function openAddCategoryModal(catObject = null) {
    const modal = document.getElementById('add-category-modal');
    if (!modal) return;
    
    document.getElementById('add-category-title').textContent = catObject ? 'Edit Category' : 'Add Category';
    document.getElementById('new-category-name').value = catObject ? catObject.name : '';
    document.getElementById('edit-category-id').value = catObject ? catObject.id : '';
    
    modal.showModal();
}

export async function openSettings() {
    const settingsModal = document.getElementById('settings-modal');
    const cfg = await IPC.getConfig();
    
    const fill = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    fill('setting-lora', cfg.loraPath);
    fill('setting-embedding', cfg.embeddingsPath);
    fill('setting-tags', cfg.tagsPath);
    fill('setting-civitai-key', cfg.civitaiApiKey);
    fill('setting-civitai-domain', cfg.civitaiDomain || 'auto');
    fill('setting-checkpoint', cfg.checkpointsPath);
    fill('setting-vae', cfg.vaesPath);
    fill('setting-upscaler', cfg.upscalersPath);
    fill('setting-gen-presets', cfg.genPresetsPath);
    fill('setting-output-images', cfg.outputImagesPath);
    fill('setting-custom-ars', cfg.customARs);
    fill('setting-custom-res', cfg.customResolutions);
    fill('setting-webui-url', cfg.webuiUrl);
    fill('setting-comfy-url', cfg.comfyUrl);
    fill('setting-comfy-default-slot', cfg.comfyDefaultSlot || 'slot_1');
    fill('setting-comfy-gen-slot', cfg.comfyGenSlot || 'gen_1');
    const chkPrompt = document.getElementById('setting-send-prompt');
    const chkGen = document.getElementById('setting-send-gen');
    if (chkPrompt) chkPrompt.checked = cfg.sendPromptEnabled !== false;
    if (chkGen) chkGen.checked = cfg.sendGenSettingsEnabled !== false;
    const chkAutoSave = document.getElementById('setting-yaml-autosave');
    if (chkAutoSave) chkAutoSave.checked = cfg.yamlAutoSave === true;
    const chkMultiInstance = document.getElementById('setting-allow-multi-instance');
    if (chkMultiInstance) chkMultiInstance.checked = cfg.allowMultipleInstances === true;
    const chkDanbooruUnderscore = document.getElementById('setting-danbooru-underscore');
    if (chkDanbooruUnderscore) chkDanbooruUnderscore.checked = cfg.danbooruUnderscoreToSpace !== false;

    const btnResetHistory = document.getElementById('btn-reset-danbooru-history');
    if (btnResetHistory) btnResetHistory.onclick = () => {
        localStorage.removeItem('danbooruUsedTags');
        showToast(i18n.t('toast_danbooru_reset'));
    };

    const themeEl = document.getElementById('setting-theme');
    if (themeEl) themeEl.value = localStorage.getItem('pb-theme') || 'gray';

    // AI settings — per-provider fields
    fill('setting-ai-ollama-url',   cfg.ollamaUrl    || 'http://localhost:11434');
    fill('setting-ai-ollama-model', cfg.ollamaModel  || 'llama3');
    fill('setting-claude-apikey',   cfg.claudeApiKey || '');
    fill('setting-claude-model',    cfg.claudeModel  || '');
    fill('setting-openai-apikey',   cfg.openaiApiKey || '');
    fill('setting-openai-model',    cfg.openaiModel  || '');

    // Translation settings
    const translateBackendEl = document.getElementById('setting-translate-backend');
    if (translateBackendEl) translateBackendEl.value = cfg.translateBackend || 'off';
    fill('setting-translate-ollama-url',   cfg.translateOllamaUrl   || 'http://localhost:11434');
    fill('setting-translate-ollama-model', cfg.translateOllamaModel || 'llama3');
    fill('setting-translate-libre-url',    cfg.translateLibreUrl    || 'http://localhost:5000');
    fill('setting-translate-libre-apikey', cfg.translateLibreApiKey || '');
    _updateTranslateBackendSections(cfg.translateBackend || 'off');

    renderCategoryColorSettings();
    renderShortcutsTab(cfg.shortcuts || {});

    // User Data Folder（現在の実際のパスを表示）
    IPC.getUserDataPath?.().then(p => fill('setting-userdata', p || ''));

    settingsModal.showModal();
}

// ── Shortcut Settings Tab ──────────────────────────────────────

// pending overrides being edited in the settings tab (id → keyStr)
let _scPending = {};

function collectShortcutOverrides() {
    return { ..._scPending };
}

function renderShortcutsTab(savedOverrides) {
    const root = document.getElementById('sc-table-root');
    if (!root) return;
    // Start fresh with saved values
    _scPending = { ...savedOverrides };

    root.innerHTML = '';

    // Group shortcuts by their group field
    const groups = [];
    const seen = new Set();
    DEFAULT_SHORTCUTS.forEach(sc => {
        if (!seen.has(sc.group)) { seen.add(sc.group); groups.push(sc.group); }
    });

    groups.forEach(groupName => {
        const header = document.createElement('div');
        header.className = 'sc-group-header';
        header.textContent = i18n.t(groupName);
        root.appendChild(header);

        DEFAULT_SHORTCUTS
            .filter(sc => sc.group === groupName)
            .forEach(sc => {
                const row = document.createElement('div');
                row.className = 'sc-row';

                const label = document.createElement('span');
                label.className = 'sc-label';
                label.textContent = i18n.t(sc.label);

                const chip = document.createElement('div');
                chip.className = 'sc-binding';
                chip.dataset.id = sc.id;
                _renderChip(chip, sc.id);

                chip.addEventListener('click', () => _startRecording(chip, sc.id));

                row.appendChild(label);
                row.appendChild(chip);
                root.appendChild(row);
            });
    });
}

function _getDisplayKey(id) {
    return id in _scPending
        ? _scPending[id]
        : (DEFAULT_SHORTCUTS.find(s => s.id === id)?.defaultKey ?? '');
}

function _renderChip(chip, id) {
    chip.innerHTML = '';
    chip.classList.remove('recording', 'empty');
    const keyStr = _getDisplayKey(id);
    if (!keyStr) {
        chip.classList.add('empty');
        chip.textContent = '—';
        return;
    }
    const parts = formatKey(keyStr);
    parts.forEach((part, i) => {
        if (i > 0) {
            const sep = document.createElement('span');
            sep.className = 'sc-key-sep';
            sep.textContent = '+';
            chip.appendChild(sep);
        }
        const k = document.createElement('span');
        k.className = 'sc-key';
        k.textContent = part;
        chip.appendChild(k);
    });
}

function _startRecording(chip, id) {
    if (chip.classList.contains('recording')) return;

    chip.innerHTML = '';
    chip.classList.add('recording');
    chip.textContent = i18n.t('keybind_press_key');

    const onKey = (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (e.key === 'Escape') {
            // Cancel
            cleanup();
            _renderChip(chip, id);
            return;
        }
        if (e.key === 'Backspace' || e.key === 'Delete') {
            // Clear binding
            _scPending[id] = '';
            cleanup();
            _renderChip(chip, id);
            return;
        }
        const keyStr = eventToKey(e);
        if (!keyStr) return; // modifier-only key
        _scPending[id] = keyStr;
        cleanup();
        _renderChip(chip, id);
    };

    const onClickOutside = (e) => {
        if (!chip.contains(e.target)) {
            cleanup();
            _renderChip(chip, id);
        }
    };

    const cleanup = () => {
        document.removeEventListener('keydown', onKey, true);
        document.removeEventListener('mousedown', onClickOutside, true);
        chip.classList.remove('recording');
    };

    // Use capture so we intercept before other handlers
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => document.addEventListener('mousedown', onClickOutside, true), 0);
}

// ─────────────────────────────────────────────────────────────

function renderCategoryColorSettings() {
    const container = document.getElementById('settings-group-colors');
    if (!container) return;
    container.innerHTML = '';

    // ── ランダム配色ボタン ──────────────────────────────────
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex; gap:0.5rem; margin-bottom:0.75rem;';

    const btnRandom = document.createElement('button');
    btnRandom.className = 'btn-secondary';
    btnRandom.textContent = i18n.t('btn_random_colors');
    btnRandom.onclick = async () => {
        // カラーパレットをシャッフルして各カテゴリに割り当て（重複なし優先）
        const palette = [...CATEGORIES_PALETTE];
        const categories = State.allTags.filter(t => t.type === 'category');
        const shuffled = palette.sort(() => Math.random() - 0.5);
        categories.forEach((cat, i) => {
            cat.color = shuffled[i % shuffled.length];
        });
        await saveTagOrder(State.allTags);
        renderCategoryColorSettings();
        window.dispatchEvent(new CustomEvent('tagsUpdated'));
    };

    const btnClear = document.createElement('button');
    btnClear.className = 'btn-secondary';
    btnClear.textContent = i18n.t('btn_reset_colors');
    btnClear.onclick = async () => {
        State.allTags.filter(t => t.type === 'category').forEach(cat => { cat.color = null; });
        await saveTagOrder(State.allTags);
        renderCategoryColorSettings();
        window.dispatchEvent(new CustomEvent('tagsUpdated'));
    };

    btnRow.appendChild(btnRandom);
    btnRow.appendChild(btnClear);
    container.appendChild(btnRow);
    // ────────────────────────────────────────────────────────

    State.allTags.forEach(cat => {
        if (cat.type !== 'category') return;

        const row = document.createElement('div');
        row.className = 'setting-cat-row';
        row.innerHTML = `<span class="setting-cat-name">${cat.name}</span>`;

        const grid = document.createElement('div');
        grid.className = 'color-grid';

        CATEGORIES_PALETTE.forEach(colorKey => {
            const swatch = document.createElement('div');
            swatch.className = `color-swatch cat-${colorKey} ${cat.color === colorKey ? 'active' : ''}`;
            swatch.style.backgroundColor = PALETTE_CSS_VAR[colorKey];
            swatch.title = colorKey;

            swatch.onclick = async () => {
                cat.color = colorKey;
                await saveTagOrder(State.allTags);
                renderCategoryColorSettings();

                // Trigger refresh of main UI
                window.dispatchEvent(new CustomEvent('tagsUpdated'));
            };
            grid.appendChild(swatch);
        });

        row.appendChild(grid);
        container.appendChild(row);
    });
}

/**
 * Opens "Add Tag" modal (or Edit Tag if tag object is provided)
 */
export function openAddTagModal(catId, groupName = '', tagObject = null, groupPath = null) {
    const modal = document.getElementById('add-tag-modal');
    if (!modal) return;

    // Show/Hide Delete Button
    const btnDelete = document.getElementById('btn-delete-item');
    if (btnDelete) btnDelete.classList.toggle('hidden', !tagObject);

    // Reset fields
    const titleKey = tagObject ? 'modal_edit_tag_title' : 'modal_add_tag_title';
    document.getElementById('add-tag-title').textContent = i18n.t(titleKey, tagObject ? 'Edit Tag' : 'Add Tag');
    document.getElementById('fg-subgroup-name').style.display = 'none';
    document.getElementById('fg-tag-key').style.display = 'block';
    document.getElementById('fg-tag-val').style.display = 'block';
    
    document.getElementById('new-tag-key').value = tagObject ? tagObject.name : '';
    document.getElementById('new-tag-val').value = tagObject ? tagObject.value : '';
    document.getElementById('add-mode').value = 'tag';
    document.getElementById('edit-tag-id').value = tagObject?.id || '';
    
    document.getElementById('add-target-cat').value = catId;
    document.getElementById('add-target-group').value = groupName;

    // Handle Image Preview
    const tagImgPreview = document.getElementById('edit-tag-img-preview');
    const btnRemoveTagImg = document.getElementById('btn-remove-tag-img');
    if (tagImgPreview) {
        const thumbUrl = tagObject?.thumbnail || '';
        tagImgPreview.dataset.url = thumbUrl;
        tagImgPreview.style.backgroundImage = thumbUrl ? `url("${thumbUrl}")` : 'none';
        btnRemoveTagImg?.classList.toggle('hidden', !thumbUrl);
    }

    // Pre-fill search input with full path
    const moveSearch = document.getElementById('tag-move-search');
    if (moveSearch) {
        const cat = State.allTags.find(c => c.id === catId);
        if (cat) {
            const pathParts = groupPath && groupPath.length > 0 ? groupPath : (groupName ? [groupName] : []);
            moveSearch.value = pathParts.length > 0
                ? `${cat.name} > ${pathParts.join(' > ')}`
                : cat.name;
        }
    }

    modal.showModal();
}

/**
 * Opens "Add Group" modal (or Edit if groupObject is provided)
 */
export function openAddGroupModal(catId, groupName = '', groupObject = null) {
    const modal = document.getElementById('add-tag-modal');
    if (!modal) return;

    // Show/Hide Delete Button
    const btnDelete = document.getElementById('btn-delete-item');
    if (btnDelete) btnDelete.classList.toggle('hidden', !groupObject);

    const titleKey = groupObject ? 'modal_edit_group_title' : 'modal_add_group_title';
    document.getElementById('add-tag-title').textContent = i18n.t(titleKey, groupObject ? 'Edit Group' : 'Add Group');
    document.getElementById('fg-subgroup-name').style.display = 'block';
    document.getElementById('fg-tag-key').style.display = 'none';
    document.getElementById('fg-tag-val').style.display = 'none';
    
    document.getElementById('new-subgroup-name').value = groupObject ? groupObject.name : '';
    document.getElementById('add-mode').value = 'group';
    document.getElementById('edit-tag-id').value = groupObject ? (groupObject.id || groupObject.name) : '';

    document.getElementById('add-target-cat').value = catId;
    document.getElementById('add-target-group').value = groupName;

    const moveSearch = document.getElementById('tag-move-search');
    if (moveSearch) {
        const cat = State.allTags.find(c => c.id === catId);
        if (cat) {
            moveSearch.value = groupName ? `${cat.name} > ${groupName}` : cat.name;
        }
    }

    modal.showModal();
}

export function openImportYamlModal(parsedCategories) {
    const modal = document.getElementById('import-yaml-modal');
    const list = document.getElementById('import-yaml-list');
    if (!modal || !list) return;

    const existingNames = new Set(State.allTags.map(c => c.name));

    list.innerHTML = '';
    parsedCategories.forEach(cat => {
        const exists = existingNames.has(cat.name);
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:4px;';
        row.innerHTML = `
            <input type="checkbox" class="import-cat-cb" data-id="${cat.id}" checked style="flex-shrink:0;margin-top:1px;">
            <input type="text" class="import-cat-name modal-input" data-id="${cat.id}" value="${cat.name}"
                style="flex:1;padding:3px 6px;font-size:0.85rem;height:28px;">
            ${exists ? `<span style="font-size:0.72rem;color:var(--accent-warn,#f59e0b);white-space:nowrap;">${i18n.t('category_exists')}</span>` : ''}
        `;
        // Update "既存・上書き" badge when name changes
        const nameInput = row.querySelector('.import-cat-name');
        const badge = row.querySelector('span');
        nameInput.addEventListener('input', () => {
            const isExisting = existingNames.has(nameInput.value.trim());
            if (badge) badge.style.display = isExisting ? '' : 'none';
        });
        list.appendChild(row);
    });

    document.getElementById('import-yaml-check-all').onclick = () =>
        list.querySelectorAll('.import-cat-cb').forEach(cb => cb.checked = true);
    document.getElementById('import-yaml-uncheck-all').onclick = () =>
        list.querySelectorAll('.import-cat-cb').forEach(cb => cb.checked = false);

    document.getElementById('import-yaml-cancel').onclick = () => modal.close();

    document.getElementById('import-yaml-confirm').onclick = async () => {
        const checkedIds = new Set(
            [...list.querySelectorAll('.import-cat-cb:checked')].map(cb => cb.dataset.id)
        );
        if (checkedIds.size === 0) { modal.close(); return; }

        // Build name map from inputs
        const nameMap = {};
        list.querySelectorAll('.import-cat-name').forEach(input => {
            nameMap[input.dataset.id] = input.value.trim() || input.value;
        });

        const toImport = parsedCategories
            .filter(c => checkedIds.has(c.id))
            .map(c => ({ ...c, name: nameMap[c.id] || c.name }));

        const importedNames = new Set(toImport.map(c => c.name));
        const merged = [
            ...State.allTags.filter(c => !importedNames.has(c.name)),
            ...toImport,
        ];

        await IPC.saveTags(merged);
        State.allTags = merged;
        window.dispatchEvent(new CustomEvent('tags-reloaded'));
        modal.close();
    };

    modal.showModal();
}

// ── Translation Modal ──────────────────────────────────────────

function _updateTranslateBackendSections(backend) {
    const ollamaSection = document.getElementById('translate-section-ollama');
    const libreSection  = document.getElementById('translate-section-libre');
    if (ollamaSection) ollamaSection.style.display = backend === 'ollama' ? '' : 'none';
    if (libreSection)  libreSection.style.display  = backend === 'libre'  ? '' : 'none';
}

