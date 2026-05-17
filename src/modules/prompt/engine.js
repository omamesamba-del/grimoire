/**
 * Prompt Engine for v4
 * Handles parsing, stringification, and chip collection management.
 */
import { State, incrementTagUsage } from '../core/state.js';

export function parsePrompt(text) {
    if (!text) return [];

    // [@...@] must be matched BEFORE [tag] so it isn't swallowed by the square-bracket rule
    const regex = /(\[@[^\]@]*@\])|(<lora:[^>]+>)|(\([^:)]+:[^)]+\))|(\([^)]+\))|(\[[^\]]+\])|(\n+)|([^,\n]+)/g;
    const matches = text.match(regex) || [];

    return matches.map(m => {
        return m.includes('\n') ? m : m.trim();
    }).filter(Boolean).map(chunk => {
        if (chunk.includes('\n')) return { name: 'BR', type: 'break', weight: null };

        // Match [@scope@] — random chip
        if (chunk.startsWith('[@') && chunk.endsWith('@]')) {
            const scope = chunk.slice(2, -2);
            return { name: chunk, type: 'random', scope, weight: null };
        }

        // Match <lora:name:weight> or <lora:name>
        if (chunk.startsWith('<') && chunk.endsWith('>') && chunk.toLowerCase().startsWith('<lora:')) {
            const inner = chunk.slice(1, -1);
            const parts = inner.split(':');
            const lName = parts[1] || '';
            const lWeight = parts[2] !== undefined ? parseFloat(parts[2]) : 1.0;
            return { name: lName, weight: lWeight, type: 'lora' };
        }

        // Match (tag:weight)
        let match = chunk.match(/^\((.+):([\d.]+)\)$/);
        if (match) return { name: match[1], weight: parseFloat(match[2]), type: 'round' };

        // Match (tag)
        match = chunk.match(/^\((.+)\)$/);
        if (match) return { name: match[1], weight: null, type: 'round' };

        // Match [tag]
        match = chunk.match(/^\[(.+)\]$/);
        if (match) return { name: match[1], weight: null, type: 'square' };

        return { name: chunk, weight: null, type: 'none' };
    });
}

function fmtWeight(w) {
    // Show up to 2 decimal places, strip trailing zeros (1.20 → 1.2, 1.23 → 1.23)
    return parseFloat(w.toFixed(2)).toString();
}

export function stringifyPrompt(tags) {
    let result = '';
    tags.forEach((tag, i) => {
        let str = '';
        if (tag.type === 'break') {
            str = '\n';
        } else if (tag.type === 'random') {
            str = `[@${tag.scope}@]`;
        } else if (tag.type === 'lora') {
            str = `<lora:${tag.name}:${tag.weight !== null ? fmtWeight(tag.weight) : '1.0'}>`;
        } else {
            if (tag.weight !== null && tag.weight !== 1.0) {
                str = `(${tag.name}:${fmtWeight(tag.weight)})`;
            } else if (tag.type === 'round') {
                str = `(${tag.name})`;
            } else if (tag.type === 'square') {
                str = `[${tag.name}]`;
            } else {
                str = tag.name;
            }
        }

        if (result === '') {
            result = str;
        } else if (str === '\n') {
            result += '\n';
        } else if (result.endsWith('\n')) {
            result += str;
        } else {
            result += ', ' + str;
        }
    });
    return result;
}

export function addToPrompt(tag, targetId = null, label = null) {
    if (!tag) return;
    const tagStr = String(tag);
    const area = document.getElementById(targetId) || document.getElementById(State.lastFocusedAreaId) || document.getElementById('positive-prompt');

    let currentPrompt = parsePrompt(area.value);

    if (tagStr === '\n') {
        currentPrompt.push({ name: 'BR', type: 'break', weight: null });
    } else if (tagStr.startsWith('[@') && tagStr.endsWith('@]')) {
        // Random chip — always append, no dedup
        const scope = tagStr.slice(2, -2);
        currentPrompt.push({ name: tagStr, type: 'random', scope, weight: null });
    } else {
        const rawIncoming = tagStr.split(',').map(t => t.trim()).filter(Boolean);
        const incoming = [];
        const seenIncoming = new Set();
        rawIncoming.forEach(t => {
            const norm = t.toLowerCase();
            if (!seenIncoming.has(norm)) {
                seenIncoming.add(norm);
                incoming.push(t);
            }
        });

        const incomingObjs = parsePrompt(incoming.join(', '));
        const existingNamesLower = currentPrompt.filter(t => t.type !== 'break').map(t => t.name.toLowerCase());
        const allPresent = incomingObjs.every(inc => existingNamesLower.includes(inc.name.toLowerCase()));

        if (allPresent) {
            const incomingNamesLower = incomingObjs.map(inc => inc.name.toLowerCase());
            currentPrompt = currentPrompt.filter(t => t.type === 'break' || !incomingNamesLower.includes(t.name.toLowerCase()));
        } else {
            // Track usage by label (once per tag click) if label provided, otherwise per token
            let tracked = false;
            incomingObjs.forEach(inc => {
                const idx = currentPrompt.findIndex(t => t.type !== 'break' && t.name.toLowerCase() === inc.name.toLowerCase());
                if (idx === -1) {
                    currentPrompt.push(inc);
                    if (label) {
                        if (!tracked) { incrementTagUsage(label); tracked = true; }
                    } else {
                        incrementTagUsage(inc.name);
                    }
                } else if (inc.type === 'lora') {
                    // Update weight for LoRA instead of duplicate
                    currentPrompt[idx] = inc;
                }
            });
        }
    }

    area.value = stringifyPrompt(currentPrompt);
    area.dispatchEvent(new Event('input'));
}

// ── 無効化チップ除外 ─────────────────────────────────────────────────────

/**
 * 無効化チップを除いたプロンプト文字列を返す（コピー・送信用）
 */
export function getActivePrompt(inputId) {
    const isNeg = inputId === 'negative-prompt';
    const input = document.getElementById(inputId);
    if (!input) return '';
    const disabled = isNeg ? State.disabledTagsNegative : State.disabledTagsPositive;
    const tags = parsePrompt(input.value).filter(t => t.type === 'break' || !disabled.has(t.name));
    const resolved = resolveRandomChips(tags, State.allTags);
    return stringifyPrompt(resolved);
}

// ── ランダムチップ解決 ────────────────────────────────────────────────────

function _flattenTags(node) {
    const result = [];
    if (node.type === 'tag') { result.push(node.value || node.name); return result; }
    if (node.children) node.children.forEach(c => result.push(..._flattenTags(c)));
    return result;
}

function _pickFromScope(allTags, scopeParts) {
    const cat = allTags.find(c => c.name === scopeParts[0]);
    if (!cat) return null;
    if (scopeParts.length === 1) {
        const pool = _flattenTags(cat);
        return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    }
    const group = (cat.children || []).find(g => g.name === scopeParts[1]);
    if (!group) return null;
    if (scopeParts.length === 2) {
        const pool = _flattenTags(group);
        return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    }
    const sub = (group.children || []).find(s => s.name === scopeParts[2]);
    if (!sub) return null;
    const pool = _flattenTags(sub);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

/**
 * ランダムチップ (type:'random') を実際のタグに置換した新しい配列を返す。
 * 元の配列は変更しない。解決できなかった場合はそのまま残す。
 */
export function resolveRandomChips(chips, allTags) {
    return chips.map(chip => {
        if (chip.type !== 'random') return chip;
        const parts = chip.scope.split(':');
        const picked = _pickFromScope(allTags, parts);
        return picked ? { name: picked, weight: null, type: 'none' } : chip;
    });
}
