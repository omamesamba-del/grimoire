/**
 * Central State Management for grimoire
 */
export const State = {
    // App State
    currentMode: 'tags', // 'tags', 'lora', 'embedding', 'gen'
    isComfyMode: false,
    config: {},
    
    // Tag State
    allTags: [], // Loaded categories
    currentTags: [], // Currently displayed tags in grid
    currentCategoryId: null,
    currentGroupName: null, // Name of the group when drilling into subgroups (null = category root)
    currentGroupPath: null, // Full path array of group names e.g. ["ゲーム", "東方Project"]
    isFavoriteView: false,
    isTagSearch: false, // true while search query is active (suppresses root toolbar)
    selectedTags: new Set(), // Set of Tag IDs (library tag-grid selection)
    selectedChips: new Set(), // Set of chip names (prompt-chip selection in builder pane)
    lastSelectedTagId: null, // For Shift-click range selection
    expandedCategories: new Set(),
    expandedGroups: new Set(),
    favorites: [],
    tagHistory: [], // Undo/Redo stack for prompt
    
    // Asset State
    allAssets: { loras: [], embeddings: [], checkpoints: [] },
    assetSize: 2, // 0-4 slider index
    currentAssetFilter: null,
    selectedAssets: new Set(),   // Set of fullPath strings
    lastSelectedAssetIndex: -1,  // For Shift-click range selection
    loraFavorites: new Set(),       // Set of fullPath strings
    embeddingFavorites: new Set(),  // Set of fullPath strings
    checkpointFavorites: new Set(), // Set of fullPath strings

    // Gen Presets
    currentGenPresetFolder: null,
    currentGenPresetRelPath: null,

    // Prompt State
    disabledTagsPositive: new Set(),
    disabledTagsNegative: new Set(),
    lastFocusedAreaId: 'positive-prompt',

    // Context Menu State
    contextTarget: null,
    contextType: null,

    // Usage Frequency
    tagUsageCount: new Map(), // tag label (name) → use count
    isFrequentView: false,
    viewMode: 'grid', // 'grid' | 'list'

    // Tag color source map: tag name → catId (recorded at add time)
    tagColorMap: new Map(),
    // Manual chip color overrides: tag name → hex color string
    chipColorOverride: new Map(),

    // Style Palette
    pendingStyle: {
        colorMods: [],    // string[] selected color modifier values (dark/light/two-tone…)
        colors: [],       // string[] selected color values (for active-state lookup)
        materials: [],    // string[] selected material values
        patterns: [],     // string[] selected pattern values
        decorations: [],  // string[] selected decoration values
        custom: '',       // free-text prefix (chips append here directly)
        modeAEnabled: true, // auto-apply on tag click
    }
};

/**
 * Persist small UI state items to localStorage
 */
export function saveUiState() {
    localStorage.setItem('assetSize', State.assetSize);
    localStorage.setItem('isComfyMode', State.isComfyMode);
    localStorage.setItem('viewMode', State.viewMode);
    localStorage.setItem('tagUsageCount', JSON.stringify([...State.tagUsageCount.entries()]));
}

export function saveTagColorMap() {
    localStorage.setItem('tagColorMap', JSON.stringify([...State.tagColorMap.entries()]));
}

export function saveChipColorOverride() {
    localStorage.setItem('chipColorOverride', JSON.stringify([...State.chipColorOverride.entries()]));
}

/**
 * Initialize state from localStorage
 */
export function initUiState() {
    State.assetSize = parseInt(localStorage.getItem('assetSize')) || 2;
    State.isComfyMode = localStorage.getItem('isComfyMode') === 'true';
    State.viewMode = localStorage.getItem('viewMode') || 'grid';
    State.loraFavorites        = new Set(JSON.parse(localStorage.getItem('loraFavorites')        || '[]'));
    State.embeddingFavorites   = new Set(JSON.parse(localStorage.getItem('embeddingFavorites')   || '[]'));
    State.checkpointFavorites  = new Set(JSON.parse(localStorage.getItem('checkpointFavorites')  || '[]'));
    try {
        State.tagUsageCount = new Map(JSON.parse(localStorage.getItem('tagUsageCount') || '[]'));
    } catch {
        State.tagUsageCount = new Map();
    }
    try {
        State.tagColorMap = new Map(JSON.parse(localStorage.getItem('tagColorMap') || '[]'));
    } catch {
        State.tagColorMap = new Map();
    }
    try {
        State.chipColorOverride = new Map(JSON.parse(localStorage.getItem('chipColorOverride') || '[]'));
    } catch {
        State.chipColorOverride = new Map();
    }
}

export function incrementTagUsage(tagValue) {
    if (!tagValue) return;
    const count = State.tagUsageCount.get(tagValue) || 0;
    State.tagUsageCount.set(tagValue, count + 1);
    saveUiState();
}

export function removeTagUsage(label) {
    if (!label) return;
    State.tagUsageCount.delete(label);
    saveUiState();
}

export function resetTagUsage() {
    State.tagUsageCount.clear();
    saveUiState();
}

export function saveFavorites(mode) {
    const key = mode === 'lora'       ? 'loraFavorites'
              : mode === 'embedding'  ? 'embeddingFavorites'
              :                         'checkpointFavorites';
    const set = mode === 'lora'       ? State.loraFavorites
              : mode === 'embedding'  ? State.embeddingFavorites
              :                         State.checkpointFavorites;
    localStorage.setItem(key, JSON.stringify([...set]));
}

export function toggleAssetFavorite(mode, fullPath) {
    const set = mode === 'lora'       ? State.loraFavorites
              : mode === 'embedding'  ? State.embeddingFavorites
              :                         State.checkpointFavorites;
    if (set.has(fullPath)) set.delete(fullPath);
    else set.add(fullPath);
    saveFavorites(mode);
}
