const MAX_HISTORY = 50;
const undoStack = [];
const redoStack = [];
let committedState = { positive: '', negative: '' };
let pendingSnapshot = null;
let debounceTimer = null;
let suppressPush = false;

function getEls() {
    return {
        pos: document.getElementById('positive-prompt'),
        neg: document.getElementById('negative-prompt')
    };
}

export function initHistory() {
    const { pos, neg } = getEls();
    if (!pos || !neg) return;
    committedState = { positive: pos.value, negative: neg.value };

    const onInput = () => {
        if (suppressPush) return;
        if (!pendingSnapshot) {
            pendingSnapshot = { ...committedState };
        }
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(commitPending, 600);
    };

    pos.addEventListener('input', onInput);
    neg.addEventListener('input', onInput);
}

function commitPending() {
    if (!pendingSnapshot) return;
    const { pos, neg } = getEls();
    const top = undoStack[undoStack.length - 1];
    if (!top || top.positive !== pendingSnapshot.positive || top.negative !== pendingSnapshot.negative) {
        undoStack.push(pendingSnapshot);
        if (undoStack.length > MAX_HISTORY) undoStack.shift();
        redoStack.length = 0;
    }
    committedState = { positive: pos?.value ?? '', negative: neg?.value ?? '' };
    pendingSnapshot = null;
    debounceTimer = null;
}

function flushPending() {
    if (pendingSnapshot) {
        clearTimeout(debounceTimer);
        commitPending();
    }
}

export function undo() {
    const { pos, neg } = getEls();
    if (!pos || !neg) return false;
    flushPending();
    if (undoStack.length === 0) return false;
    redoStack.push({ positive: pos.value, negative: neg.value });
    applyRestore(pos, neg, undoStack.pop());
    return true;
}

export function redo() {
    const { pos, neg } = getEls();
    if (!pos || !neg || redoStack.length === 0) return false;
    flushPending();
    undoStack.push({ positive: pos.value, negative: neg.value });
    applyRestore(pos, neg, redoStack.pop());
    return true;
}

function applyRestore(posEl, negEl, state) {
    suppressPush = true;
    posEl.value = state.positive;
    negEl.value = state.negative;
    posEl.dispatchEvent(new Event('input'));
    negEl.dispatchEvent(new Event('input'));
    committedState = { positive: state.positive, negative: state.negative };
    suppressPush = false;
}
