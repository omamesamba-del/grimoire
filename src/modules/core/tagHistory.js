const LS_KEY = 'danbooruUsedTags';

function _load() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
    catch { return {}; }
}

export function recordTagUsage(tag) {
    if (!tag) return;
    const key = tag.toLowerCase();
    const data = _load();
    data[key] = (data[key] || 0) + 1;
    localStorage.setItem(LS_KEY, JSON.stringify(data));
}

export function getUsedTagsMap() {
    return _load();
}
