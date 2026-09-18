// js/input.js
import { hexMath } from './hex.js';

export class InputController {
    constructor(canvas, gameContext, renderContext) {
        this.canvas = canvas;
        this.game = gameContext;
        this.render = renderContext;

        this.isDragging = false;
        this.lastX = 0;
        this.lastY = 0;

        this.bindEvents();
    }

    bindEvents() {
        this.canvas.addEventListener('click', (e) => {
            if (e.button === 0) {
                this.handleClick(e, false);
            }
        });

        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.handleClick(e, true);
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.render.hoveredHex = null;
        });

        this.canvas.addEventListener('mousemove', (e) => {
            this.handleHover(e);
        });

        // Wheel event disabled - fixed zoom
    }

    getScreenToWorld(canvasX, canvasY) {
        // World coordinates translation
        const worldX = (canvasX - this.render.camera.x) / this.render.camera.zoom;
        const worldY = (canvasY - this.render.camera.y) / this.render.camera.zoom;
        return { worldX, worldY };
    }

    handleHover(e) {
        const rect = this.canvas.getBoundingClientRect();
        const pt = this.getScreenToWorld(e.clientX - rect.left, e.clientY - rect.top);

        const off = hexMath.pixelToOffset(pt.worldX, pt.worldY, this.render.hexRadius);
        if (this.game.isValid(off.col, off.row)) {
            this.render.hoveredHex = `${off.col},${off.row}`;
        } else {
            this.render.hoveredHex = null;
        }
    }

    handleClick(e, isRightClick) {
        const rect = this.canvas.getBoundingClientRect();
        const pt = this.getScreenToWorld(e.clientX - rect.left, e.clientY - rect.top);

        const off = hexMath.pixelToOffset(pt.worldX, pt.worldY, this.render.hexRadius);
        if (this.game.isValid(off.col, off.row)) {
            const key = `${off.col},${off.row}`;

            if (isRightClick) {
                if (this.onHexRightClick) this.onHexRightClick(off.col, off.row, key, e);
            } else {
                if (this.onHexClick) this.onHexClick(off.col, off.row, key, e);
            }
        }
    }
}
