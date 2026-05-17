/**
 * Tag Navigation and Hierarchy Service for v4
 */
import { State } from '../core/state.js';
import { IPC } from '../core/ipc.js';

export async function loadTags() {
    try {
        const rawTags = await IPC.getAllTags();
        const migrated = migrateToUnifiedTree(Array.isArray(rawTags) ? rawTags : []);

        // If migration added IDs to any tags/groups, persist them back immediately
        const hasMissingIds = (nodes) => Array.isArray(nodes) && nodes.some(
            n => ((n.type === 'tag' || n.type === 'group') && !n.id) || hasMissingIds(n.children)
        );
        if (hasMissingIds(Array.isArray(rawTags) ? rawTags : [])) {
            await IPC.saveTags(migrated);
        }

        State.allTags = migrated;
        return State.allTags;
    } catch (e) {
        console.error('Failed to load tags:', e);
        return [];
    }
}

/**
 * Normalizes legacy tag structures into the v4 unified tree format
 */
function migrateToUnifiedTree(nodes) {
    if (!nodes || !Array.isArray(nodes)) return [];
    return nodes.map(node => {
        const newNode = { ...node };

        // Standardize types
        if (newNode.id && !newNode.type) newNode.type = 'category';
        if (!newNode.type && (newNode.children || newNode.items || newNode.content || newNode.subcategories)) {
            newNode.type = newNode.id ? 'category' : 'group';
        }
        if (!newNode.type && newNode.value) newNode.type = 'tag';

        // Ensure all tags have a stable ID (YAML-imported tags have none)
        if (newNode.type === 'tag' && !newNode.id) {
            const base = (newNode.value || newNode.name || '').replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 24);
            newNode.id = `tag-${base}`;
        }

        // Ensure all groups have a stable ID
        if (newNode.type === 'group' && !newNode.id) {
            const base = (newNode.name || '').replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 20);
            newNode.id = `grp-${base}-${Math.random().toString(36).slice(2, 7)}`;
        }

        // Unify child keys (children, subcategories, content, items) -> children
        let rawChildren = [];
        if (newNode.children) rawChildren.push(...newNode.children);
        if (newNode.subcategories) rawChildren.push(...newNode.subcategories);
        if (newNode.content) rawChildren.push(...newNode.content);
        if (newNode.items) rawChildren.push(...newNode.items);

        if (rawChildren.length > 0) {
            newNode.children = migrateToUnifiedTree(rawChildren);
        } else if (newNode.type !== 'tag') {
            newNode.children = newNode.children || [];
        }

        // Cleanup legacy keys
        delete newNode.subcategories;
        delete newNode.content;
        delete newNode.items;

        return newNode;
    });
}



export function filterTagTree(query) {
    if (!query) return State.allTags;
    const q = query.toLowerCase();
    
    // Simple filter that returns categories that have matching tags/groups
    return State.allTags.map(cat => {
        const filteredChildren = filterNodes(cat.children || [], q);
        if (filteredChildren.length > 0) {
            return { ...cat, children: filteredChildren };
        }
        return null;
    }).filter(Boolean);
}

function filterNodes(nodes, query) {
    return nodes.reduce((acc, node) => {
        if (node.name.toLowerCase().includes(query) || (node.value && node.value.toLowerCase().includes(query))) {
            acc.push(node);
        } else if (node.children) {
            const childMatches = filterNodes(node.children, query);
            if (childMatches.length > 0) {
                acc.push({ ...node, children: childMatches });
            }
        }
        return acc;
    }, []);
}

export async function saveTagOrder(newCategories) {
    State.allTags = newCategories;
    const result = await IPC.saveTags(newCategories);

    // Sync id/filename back to State.allTags after YAML rename on main process
    if (result && result.categories) {
        result.categories.forEach((updated, i) => {
            if (State.allTags[i]) {
                State.allTags[i].id = updated.id;
                State.allTags[i].filename = updated.filename;
            }
        });
    }

    // 自動 YAML エクスポート
    try {
        const cfg = await IPC.getConfig();
        if (cfg.yamlAutoSave && cfg.tagsPath) {
            await IPC.exportToYAML(State.allTags, cfg.tagsPath);
        }
    } catch (e) {
        console.warn('[AutoSave] YAML エクスポート失敗:', e);
    }

    return result;
}
