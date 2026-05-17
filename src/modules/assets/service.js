/**
 * Asset Service for v4 (LoRA and Embeddings)
 */
import { State } from '../core/state.js';
import { IPC } from '../core/ipc.js';

export async function loadAssets() {
    try {
        const assets = await IPC.getAllAssets();
        // Normalize Windows backslashes to forward slashes for cross-platform folder tree parsing
        if (assets) {
            ['loras', 'embeddings', 'checkpoints'].forEach(key => {
                if (assets[key]) {
                    assets[key] = assets[key].map(a => {
                        if (typeof a === 'string') {
                            return { name: a.replace(/\\/g, '/'), thumbnail: null };
                        } else if (a && typeof a.name === 'string') {
                            // Deep copy and normalize
                            const norm = { ...a };
                            norm.name = norm.name.replace(/\\/g, '/');
                            if (norm.relPath) norm.relPath = norm.relPath.replace(/\\/g, '/');
                            if (norm.thumbnail) norm.thumbnail = norm.thumbnail.replace(/\\/g, '/');
                            return norm;
                        }
                        return a;
                    });
                }
            });
        }
        State.allAssets = assets || { loras: [], embeddings: [], checkpoints: [] };
        return State.allAssets;
    } catch (e) {
        console.error('Failed to load assets:', e);
        return { loras: [], embeddings: [] };
    }
}

export function searchAssets(query, type) {
    if (!State.allAssets) return [];
    
    let list = type === 'lora'       ? (State.allAssets.loras       || [])
             : type === 'embedding'  ? (State.allAssets.embeddings  || [])
             :                         (State.allAssets.checkpoints || []);

    // Apply Folder Filter from Sidebar
    if (State.currentAssetFilter === '__favorites__') {
        const favs = type === 'lora'      ? State.loraFavorites
                   : type === 'embedding' ? State.embeddingFavorites
                   :                        State.checkpointFavorites;
        list = list.filter(item => item.fullPath && favs.has(item.fullPath));
    } else if (State.currentAssetFilter) {
        list = list.filter(item => (item.relPath || '').startsWith(State.currentAssetFilter + '/'));
    }

    if (!query) return list;
    
    const q = query.toLowerCase();
    return list.filter(item => {
        const nameMatch = (item.name || '').toLowerCase().includes(q);
        const triggerMatch = item.triggerWords && item.triggerWords.some(w => w.toLowerCase().includes(q));
        return nameMatch || triggerMatch;
    });
}
