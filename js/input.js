// js/input.js
import { hexMath } from './hex.js';

export class InputController {
    constructor(canvas, gameContext, renderContext) {
        this.canvas = canvas;
        this.game = gameContext;
        this.render = renderContext;

        this.isDragging = false;
        this.isLeftDown = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.lastX = 0;
        this.lastY = 0;

        this.bindEvents();
    }

    bindEvents() {
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Left click
                this.isLeftDown = true;
                this.isDragging = false;
                this.dragStartX = e.clientX;
                this.dragStartY = e.clientY;
                this.lastX = e.clientX;
                this.lastY = e.clientY;
            }
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (this.isLeftDown) {
                const dist = Math.hypot(e.clientX - this.dragStartX, e.clientY - this.dragStartY);
                if (dist > 5) {
                    this.isDragging = true;
                }

                if (this.isDragging) {
                    // Panning calculates raw screen pixel deltas, and we scale by CSS ratio 
                    const rect = this.canvas.getBoundingClientRect();
                    const scaleX = this.canvas.width / rect.width;
                    const scaleY = this.canvas.height / rect.height;

                    const dx = (e.clientX - this.lastX) * scaleX;
                    const dy = (e.clientY - this.lastY) * scaleY;

                    this.render.camera.x += dx;
                    this.render.camera.y += dy;
                    this.render.requestRender();
                }
            } else {
                this.handleHover(e);
            }

            this.lastX = e.clientX;
            this.lastY = e.clientY;
        });

        this.canvas.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                this.isLeftDown = false;
                if (!this.isDragging) {
                    this.handleClick(e, false);
                }
                this.isDragging = false;
            }
        });

        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.handleClick(e, true);
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.isLeftDown = false;
            this.isDragging = false;
            this.render.hoveredHex = null;
            this.render.requestRender();
        });

        // Enable Map Zooming logic
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;

            const mouseX = (e.clientX - rect.left) * scaleX;
            const mouseY = (e.clientY - rect.top) * scaleY;

            // Get world position under mouse BEFORE zoom
            const pt = this.getScreenToWorld(mouseX, mouseY);

            // Apply zoom scalar
            const zoomDelta = e.deltaY < 0 ? 1.05 : (1 / 1.05);
            this.render.camera.zoom *= zoomDelta;

            // Constrain camera strictly between limits
            this.render.camera.zoom = Math.max(0.3, Math.min(3.0, this.render.camera.zoom));

            // Adjust camera so that the exact world position remains permanently locked under the mouse
            this.render.camera.x = mouseX - pt.worldX * this.render.camera.zoom;
            this.render.camera.y = mouseY - pt.worldY * this.render.camera.zoom;

            this.render.requestRender();
        });
    }

    getScreenToWorld(canvasX, canvasY) {
        // World coordinates translation
        const worldX = (canvasX - this.render.camera.x) / this.render.camera.zoom;
        const worldY = (canvasY - this.render.camera.y) / this.render.camera.zoom;
        return { worldX, worldY };
    }

    handleHover(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        const pt = this.getScreenToWorld((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);

        const off = hexMath.pixelToOffset(pt.worldX, pt.worldY, this.render.hexRadius);
        if (this.game.isValid(off.col, off.row)) {
            this.render.hoveredHex = `${off.col},${off.row}`;
        } else {
            this.render.hoveredHex = null;
        }

        this.render.requestRender();
    }

    handleClick(e, isRightClick) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        const pt = this.getScreenToWorld((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);

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
