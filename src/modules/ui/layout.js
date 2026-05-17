/**
 * UI Layout and Resizer Logic for v4
 */
import { State, saveUiState } from '../core/state.js';
import { Win } from '../core/ipc.js';

export function initLayout() {
    const explorer = document.getElementById('explorer');
    const inspector = document.getElementById('inspector');
    const divider1 = document.getElementById('divider-1');
    const divider2 = document.getElementById('divider-2');
    const container = document.getElementById('workspace-container');

    let isResizing1 = false;
    let isResizing2 = false;

    if (divider1) {
        divider1.addEventListener('mousedown', () => { 
            isResizing1 = true; 
            document.body.style.cursor = 'col-resize'; 
        });
    }
    if (divider2) {
        divider2.addEventListener('mousedown', () => {
            const isBottom = container.classList.contains('layout-bottom');
            isResizing2 = true;
            document.body.style.cursor = isBottom ? 'row-resize' : 'col-resize';
        });
    }

    document.addEventListener('mousemove', (e) => {
        if (isResizing1) {
            const containerRect = container.getBoundingClientRect();
            const newWidth = e.clientX - containerRect.left;
            if (newWidth > 150 && newWidth < 600) explorer.style.width = `${newWidth}px`;
        }
        if (isResizing2) {
            const isBottom = container.classList.contains('layout-bottom');
            const containerRect = container.getBoundingClientRect();

            if (isBottom) {
                const newHeight = containerRect.bottom - e.clientY;
                if (newHeight > 100 && newHeight < 800) inspector.style.height = `${newHeight}px`;
            } else {
                const newWidth = containerRect.right - e.clientX;
                if (newWidth > 150 && newWidth < 800) {
                    inspector.style.width = `${newWidth}px`;
                    _syncInspectorVar(newWidth);
                }
            }
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizing1 || isResizing2) {
            isResizing1 = false; 
            isResizing2 = false;
            document.body.style.cursor = 'default';
            saveResizedValue(container, explorer, inspector);
        }
    });

    // Apply layout class FIRST so restoreResizedValues reads the correct mode
    const savedLayout = localStorage.getItem('layout-mode') || 'right';
    container.classList.toggle('layout-bottom', savedLayout === 'bottom');
    container.classList.toggle('layout-right', savedLayout === 'right');

    // Then restore sizes (isBottom check is now correct)
    restoreResizedValues(container, explorer, inspector);
}

function _syncInspectorVar(px) {
    document.documentElement.style.setProperty('--inspector-w', `${px}px`);
}

function saveResizedValue(container, explorer, inspector) {
    if (explorer) localStorage.setItem('explorer-width', explorer.style.width);
    const isBottom = container.classList.contains('layout-bottom');
    if (isBottom) localStorage.setItem('inspector-height', inspector.style.height);
    else localStorage.setItem('inspector-width', inspector.style.width);
}

function restoreResizedValues(container, explorer, inspector) {
    if (explorer) {
        const savedExpWidth = localStorage.getItem('explorer-width');
        if (savedExpWidth) explorer.style.width = savedExpWidth;
    }
    const isBottom = container.classList.contains('layout-bottom');
    if (isBottom) {
        inspector.style.height = localStorage.getItem('inspector-height') || '380px';
        inspector.style.width = '';
        _syncInspectorVar(0);
    } else {
        const w = parseInt(localStorage.getItem('inspector-width') || '400', 10);
        inspector.style.width = `${w}px`;
        inspector.style.height = '';
        _syncInspectorVar(w);
    }
}

export function toggleLayout() {
    const container = document.getElementById('workspace-container');
    const inspector = document.getElementById('inspector');
    const isBottom = container.classList.contains('layout-bottom');
    
    if (isBottom) {
        container.classList.remove('layout-bottom');
        container.classList.add('layout-right');
        localStorage.setItem('layout-mode', 'right');
    } else {
        container.classList.remove('layout-right');
        container.classList.add('layout-bottom');
        localStorage.setItem('layout-mode', 'bottom');
    }
    restoreResizedValues(container, null, inspector);
}


export function resetLayoutToDefault() {
    localStorage.removeItem('explorer-width');
    localStorage.removeItem('inspector-height');
    localStorage.removeItem('inspector-width');
    localStorage.removeItem('layout-mode');

    Win.reset();

    // Force default DOM state (right = 3-column side-by-side)
    const explorer = document.getElementById('explorer');
    const inspector = document.getElementById('inspector');
    const container = document.getElementById('workspace-container');

    if (explorer) explorer.style.width = '250px';
    container.classList.remove('layout-bottom');
    container.classList.add('layout-right');
    restoreResizedValues(container, explorer, inspector);

    // Expand all UI prompt sections
    document.querySelectorAll('.prompt-section').forEach(s => s.classList.remove('collapsed'));
    document.querySelectorAll('.btn-toggle-section').forEach(b => b.textContent = '▼');
}

/**
 * Auto-collapse the Explorer pane when the window gets narrow,
 * and restore it when the window widens again.
 * Uses a data-attribute flag to distinguish auto-collapse from manual collapse,
 * so a user-triggered collapse is never auto-restored.
 */
export function initExplorerAutoCollapse() {
    const workspace    = document.getElementById('workspace-container');
    const explorerPane = document.getElementById('explorer');
    if (!workspace || !explorerPane) return;

    const COLLAPSE_THRESHOLD = 920;  // px — collapse when window narrows past this
    const RESTORE_THRESHOLD  = 950;  // px — restore with hysteresis to avoid thrashing

    const check = () => {
        const w = workspace.offsetWidth;
        const isCollapsed      = explorerPane.classList.contains('collapsed');
        const wasAutoCollapsed = explorerPane.dataset.autoCollapsed === 'true';

        if (!isCollapsed && w < COLLAPSE_THRESHOLD) {
            explorerPane.classList.add('collapsed');
            explorerPane.dataset.autoCollapsed = 'true';
        } else if (isCollapsed && wasAutoCollapsed && w >= RESTORE_THRESHOLD) {
            explorerPane.classList.remove('collapsed');
            delete explorerPane.dataset.autoCollapsed;
        }
    };

    new ResizeObserver(check).observe(workspace);
    check();
}
