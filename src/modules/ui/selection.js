/**
 * Generic Marquee (Drag-to-Select) Utility for v4
 */
import { State } from '../core/state.js';

export class MarqueeSelector {
    constructor(container, itemSelector, onSelectionChange, targetSet) {
        this.container = container;
        this.itemSelector = itemSelector;
        this.onSelectionChange = onSelectionChange;
        // Where selected ids/names are written. Defaults to State.selectedTags for backwards compat.
        this.targetSet = targetSet || State.selectedTags;

        this.marquee = null;
        this.startPos = { x: 0, y: 0 };
        this.isSelecting = false;

        this.init();
    }

    init() {
        this.container.addEventListener('mousedown', (e) => this.onMouseDown(e));
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    }

    onMouseDown(e) {
        // Only trigger on empty space (not on items)
        if (e.target.closest(this.itemSelector) || e.button !== 0) return;
        e.preventDefault(); // Prevent browser text selection during drag

        this.isSelecting = true;
        this.startPos = { x: e.pageX, y: e.pageY };
        
        // Clear previous selection unless Shift/Ctrl
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
            this.targetSet.clear();
            this.container.querySelectorAll(`${this.itemSelector}.selected`).forEach(el => el.classList.remove('selected'));
            if (this.onSelectionChange) this.onSelectionChange(this.targetSet);
        }

        this.marquee = document.createElement('div');
        this.marquee.className = 'selection-marquee';
        document.body.appendChild(this.marquee);
        
        this.updateMarquee(e);
    }

    onMouseMove(e) {
        if (!this.isSelecting || !this.marquee) return;
        this._lastEvent = e;
        this.updateMarquee(e);
        this.checkIntersections();
    }

    onMouseUp(e) {
        if (!this.isSelecting) return;
        
        this.isSelecting = false;
        if (this.marquee) {
            this.marquee.remove();
            this.marquee = null;
        }
        
        if (this.onSelectionChange) this.onSelectionChange(this.targetSet);
        window.dispatchEvent(new CustomEvent('selection-changed'));
    }

    updateMarquee(e) {
        const x = Math.min(e.pageX, this.startPos.x);
        const y = Math.min(e.pageY, this.startPos.y);
        const width = Math.abs(e.pageX - this.startPos.x);
        const height = Math.abs(e.pageY - this.startPos.y);
        
        this.marquee.style.left = `${x}px`;
        this.marquee.style.top = `${y}px`;
        this.marquee.style.width = `${width}px`;
        this.marquee.style.height = `${height}px`;
    }

    checkIntersections() {
        if (!this.marquee) return;
        const marqueeRect = this.marquee.getBoundingClientRect();
        const items = this.container.querySelectorAll(this.itemSelector);
        
        items.forEach(item => {
            const itemRect = item.getBoundingClientRect();
            const intersects = !(
                itemRect.right < marqueeRect.left ||
                itemRect.left > marqueeRect.right ||
                itemRect.bottom < marqueeRect.top ||
                itemRect.top > marqueeRect.bottom
            );
            
            const id = item.dataset.id || item.dataset.name;
            if (intersects) {
                this.targetSet.add(id);
                item.classList.add('selected');
            } else {
                // Only remove if we just added it in this session?
                // Simple version: if not holding Ctrl, remove if not intersecting
                if (!this._lastEvent?.ctrlKey && !this._lastEvent?.metaKey) {
                    this.targetSet.delete(id);
                    item.classList.remove('selected');
                }
            }
        });
    }
}
