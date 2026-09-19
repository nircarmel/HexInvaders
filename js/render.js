// js/render.js
import { hexMath } from './hex.js';

export class RenderEngine {
    constructor(canvas, gameContext) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.game = gameContext;

        this.hexRadius = 25;
        this.camera = { x: 0, y: 0, zoom: 1 };

        this.hoveredHex = null;   // "col,row" string
        this.validPath = null;    // Array of keys for path visualization
        this.invalidMove = false; // Flag if pathing failed

        this.highlightHexes = null; // Array of keys that are reachable
        this.hoverHexes = null; // Array of keys reachable by currently hovered unit
        this.hoverHexesColor = null;
        this.previewBarricade = null; // Array of keys previewing a barricade
        this.explosions = []; // Transitory combat animations
        this.moveAnimations = []; // Linear Interpolation payloads

        // Auto-resize
        window.addEventListener('resize', () => this.resize());
        this.resize();

        // Setup initial camera center to middle of board
        this.centerCamera();

        // Begin loop
        requestAnimationFrame(() => this.drawLoop());
    }

    resize() {
        const boardFrame = document.getElementById('board-frame');
        if (boardFrame) {
            this.canvas.width = boardFrame.clientWidth;
            this.canvas.height = boardFrame.clientHeight;
        } else {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }
        this.centerCamera();
    }

    requestRender() {
        // Continuous drawing loop handles this now, leaving here to avoid crashes from legacy calls
    }

    addExplosion(col, row) {
        const img = document.createElement('img');
        img.src = 'boom.gif?' + Date.now(); // Cache bust to force animation restart from frame 0
        img.style.position = 'absolute';
        img.style.pointerEvents = 'none'; // Click-through
        img.style.zIndex = '100'; // Layer above canvas
        img.style.display = 'none'; // Hide until first layout calculate
        document.body.appendChild(img);

        this.explosions.push({ col, row, time: Date.now(), el: img });
    }

    addMoveAnimation(sC, sR, eC, eR, unit, duration, physicalBoardTarget) {
        if (physicalBoardTarget) {
            physicalBoardTarget.isAnimating = true;
        }
        this.moveAnimations.push({ sC, sR, eC, eR, unit, startTime: Date.now(), duration, physicalBoardTarget });
    }

    clearExplosions() {
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            if (this.explosions[i].el) this.explosions[i].el.remove();
        }
        this.explosions = [];
    }

    centerCamera() {
        // Calculate true max bounds including physical rendering edges
        const reqWidth = this.game.cols * 1.5 + 0.5;
        const reqHeight = (this.game.rows + 0.5) * Math.sqrt(3);

        const marginWidth = 20;
        const marginHeight = 30;
        const maxRx = (this.canvas.width - marginWidth) / reqWidth;
        const maxRy = (this.canvas.height - marginHeight) / reqHeight;

        // Auto-scale to fit window, max radius 45
        const r = Math.max(15, Math.min(maxRx, maxRy, 45));
        this.hexRadius = r;

        // Reconstruct exact true dimension footprint
        const boardPixelWidth = reqWidth * r;
        const boardPixelHeight = reqHeight * r;

        // Ensure left and top vertices are inset properly past the anchor offsets
        this.camera.x = (this.canvas.width - boardPixelWidth) / 2 + r;
        this.camera.y = (this.canvas.height - boardPixelHeight) / 2 + (Math.sqrt(3) / 2 * r);
        this.camera.zoom = 1;

        // Do not alter Top HUD here; CSS layout handles it natively now
        const topPanelInner = document.getElementById('top-info-panel-inner');
        if (topPanelInner) {
            // Keep strictly matching canvas visual width!
            topPanelInner.style.width = `${Math.floor(boardPixelWidth)}px`;
        }
    }

    drawHex(x, y, radius, fillColor, strokeColor, lineWidth = 1) {
        this.ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle_deg = 60 * i;
            const angle_rad = Math.PI / 180 * angle_deg;
            // Flat-topped means corners are at 0, 60, 120...
            const pt_x = x + radius * Math.cos(angle_rad);
            const pt_y = y + radius * Math.sin(angle_rad);
            if (i === 0) {
                this.ctx.moveTo(pt_x, pt_y);
            } else {
                this.ctx.lineTo(pt_x, pt_y);
            }
        }
        this.ctx.closePath();

        if (fillColor) {
            this.ctx.fillStyle = fillColor;
            this.ctx.fill();
        }

        if (strokeColor) {
            this.ctx.lineWidth = lineWidth;
            this.ctx.strokeStyle = strokeColor;
            this.ctx.stroke();
        }
    }

    drawUnit(x, y, col, row, unit) {
        // Obscure enemy if Hidden Mode
        let perspective = this.game.activeTeam;
        if (this.game.gameMode === 'ONLINE' || this.game.gameMode === 'AI') {
            perspective = this.game.localTeam;
        }

        // Line of Sight Mechanic Check
        // Totally skip rendering enemy if they are completely hidden by barricades
        if (unit.team !== perspective) {
            if (!this.game.canSeeUnit(col, row, perspective)) {
                return; // Skip rendering entirely
            }
        }
        let hideStats = this.game.getFogOfWar(col, row, perspective);

        // Override if moving unit isn't physically on the tile during combat explosions
        if (unit.exposedCounter && unit.exposedCounter > 0) {
            hideStats = false;
        }

        if (unit.exposedCounter && unit.exposedCounter > 0) {
            hideStats = false;
        }

        const r = this.hexRadius * 0.7;

        // Unit Background
        this.ctx.beginPath();
        this.ctx.arc(x, y, r, 0, 2 * Math.PI);

        let grad = this.ctx.createRadialGradient(x - r / 3, y - r / 3, r / 4, x, y, r);
        if (unit.team === 'BLUE') {
            grad.addColorStop(0, '#60a5fa');
            grad.addColorStop(1, '#1d4ed8');
        } else {
            grad.addColorStop(0, '#f87171');
            grad.addColorStop(1, '#b91c1c');
        }

        this.ctx.fillStyle = grad;
        this.ctx.fill();

        this.ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        if (unit.isFlag) {
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
        }

        this.ctx.lineWidth = 1.5;
        const gap = Math.max(2, r * 0.15); // Dynamic gap, min 2px

        if (!hideStats) {
            for (let i = 0; i < unit.speed; i++) {
                const ringRadius = r - (i * gap);
                if (ringRadius > 3) {
                    this.ctx.beginPath();
                    this.ctx.arc(x, y, ringRadius, 0, 2 * Math.PI);
                    this.ctx.stroke();
                }
            }
        }

        // Stats Text or Flag Icon
        if (!hideStats) {
            this.ctx.fillStyle = 'white';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';

            if (unit.isFlag) {
                // Draw a simple literal red/blue tinted flag icon centered
                const fw = r * 0.4; // flag flag width
                const fh = r * 0.4; // flag flag height
                const ph = r * 0.8; // flag pole height

                this.ctx.fillStyle = '#fff';
                // Draw Pole
                this.ctx.fillRect(x - fw / 2, y - ph / 2, 2, ph);
                // Draw Flag triangle
                this.ctx.beginPath();
                this.ctx.moveTo(x - fw / 2 + 2, y - ph / 2);
                this.ctx.lineTo(x + fw / 2 + 2, y - ph / 2 + fh / 2);
                this.ctx.lineTo(x - fw / 2 + 2, y - ph / 2 + fh);
                this.ctx.fill();
            } else if (unit.type === 'observation') {
                const bRadius = r * 0.22;
                const bSpacing = r * 0.35;

                this.ctx.strokeStyle = '#fff';
                this.ctx.lineWidth = Math.max(2, r * 0.15);
                this.ctx.lineCap = 'round';

                // Left lens
                this.ctx.beginPath();
                this.ctx.arc(x - bSpacing, y, bRadius, 0, Math.PI * 2);
                this.ctx.stroke();

                // Right lens
                this.ctx.beginPath();
                this.ctx.arc(x + bSpacing, y, bRadius, 0, Math.PI * 2);
                this.ctx.stroke();

                // Bridge
                this.ctx.beginPath();
                this.ctx.moveTo(x - bSpacing + bRadius, y);
                this.ctx.lineTo(x + bSpacing - bRadius, y);
                this.ctx.stroke();
            } else {
                // Ensure text sizes dynamically scale exactly to the current render diameter
                // Perfectly centered without dots
                const fontSize = r * 1.35;
                this.ctx.font = `bold ${fontSize}px Inter`;
                this.ctx.fillText(unit.strength.toString(), x, y);
            }
        }
    }

    drawLoop() {
        // Auto-correct any flexbox asynchronous geometry updates stretching CSS
        const boardFrame = document.getElementById('board-frame');
        if (boardFrame && (this.canvas.width !== boardFrame.clientWidth || this.canvas.height !== boardFrame.clientHeight)) {
            this.resize();
        }

        // Clear screen
        this.ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-dark') || '#090a0f';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();
        this.ctx.translate(this.camera.x, this.camera.y);
        this.ctx.scale(this.camera.zoom, this.camera.zoom);

        // Render dynamic mathematical outer border contour
        const teamColor = this.game.activeTeam === 'BLUE' ? 'rgba(59, 130, 246, 0.8)' : 'rgba(239, 68, 68, 0.8)';
        this.ctx.strokeStyle = teamColor;
        this.ctx.lineWidth = 4;
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';

        const edgeToDir = [0, 5, 4, 3, 2, 1];

        this.ctx.beginPath();
        for (let col = 0; col < this.game.cols; col++) {
            for (let row = 0; row < this.game.rows; row++) {
                if (col === 0 || col === this.game.cols - 1 || row === 0 || row === this.game.rows - 1) {
                    const pt = hexMath.hexToPixel(col, row, this.hexRadius);
                    const ax = hexMath.offsetToAxial(col, row);

                    for (let i = 0; i < 6; i++) {
                        const dirIndex = edgeToDir[i];
                        const dr = hexMath.hexDirections[dirIndex];
                        const nx = hexMath.axialToOffset(ax.q + dr.dq, ax.r + dr.dr);

                        if (!this.game.isValid(nx.col, nx.row)) {
                            const a1 = (Math.PI / 180) * (60 * i);
                            const a2 = (Math.PI / 180) * (60 * ((i + 1) % 6));

                            this.ctx.moveTo(pt.x + this.hexRadius * Math.cos(a1), pt.y + this.hexRadius * Math.sin(a1));
                            this.ctx.lineTo(pt.x + this.hexRadius * Math.cos(a2), pt.y + this.hexRadius * Math.sin(a2));
                        }
                    }
                }
            }
        }
        this.ctx.stroke();

        // Draw board base
        for (let col = 0; col < this.game.cols; col++) {
            for (let row = 0; row < this.game.rows; row++) {
                const pt = hexMath.hexToPixel(col, row, this.hexRadius);
                const key = `${col},${row}`;
                const tile = this.game.getTile(col, row);

                let fill = 'rgba(255,255,255,0.03)';
                let stroke = 'rgba(255,255,255,0.1)';
                let lineWidth = 1;

                // Base zone colors
                if (col === 0) fill = 'rgba(59, 130, 246, 0.1)'; // Blue zone
                if (col === this.game.cols - 1) fill = 'rgba(239, 68, 68, 0.1)'; // Red zone

                // Barricade styling
                if (tile.isBarricade) {
                    fill = '#2a2a2a'; // unmistakably neutral dark gray
                    stroke = '#555555';
                    lineWidth = 2;
                }

                // Selection / Hover styling
                if (this.game.selectedTile === key) {
                    fill = 'rgba(255, 255, 255, 0.2)';
                    stroke = 'white';
                    lineWidth = 2;
                } else if (this.hoveredHex === key) {
                    fill = 'rgba(255, 255, 255, 0.15)';
                }

                // Path highlighting
                if (this.validPath && this.validPath.includes(key) && key !== this.game.selectedTile) {
                    // Check if it's the target (last element)
                    if (this.validPath[this.validPath.length - 1] === key) {
                        fill = this.invalidMove ? 'rgba(239, 68, 68, 0.5)' : 'rgba(16, 185, 129, 0.5)';
                    } else {
                        fill = 'rgba(16, 185, 129, 0.2)';
                    }
                } else if (this.highlightHexes && this.highlightHexes.includes(key)) {
                    fill = 'rgba(16, 185, 129, 0.15)'; // Subtle green for reachable
                } else if (this.hoverHexes && this.hoverHexes.includes(key)) {
                    fill = this.hoverHexesColor || 'rgba(16, 185, 129, 0.15)'; // Render the specific team color during hover
                } else if (this.previewBarricade && this.previewBarricade.includes(key)) {
                    if (this.game.activeTeam === 'BLUE') {
                        fill = 'rgba(59, 130, 246, 0.4)';
                        stroke = '#60a5fa';
                    } else {
                        fill = 'rgba(239, 68, 68, 0.4)';
                        stroke = '#ef4444';
                    }
                    lineWidth = 2;
                }

                this.drawHex(pt.x, pt.y, this.hexRadius - 1, fill, stroke, lineWidth);

                // Draw Unit
                if (tile.unit && !tile.unit.isAnimating) {
                    this.drawUnit(pt.x, pt.y, col, row, tile.unit);
                }
            }
        }

        // Draw active combat explosions
        const now = Date.now();
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const exp = this.explosions[i];
            const age = now - exp.time;
            if (age > 1000) { // 1.0 second decay
                if (exp.el) exp.el.remove();
                this.explosions.splice(i, 1);
                continue;
            }
            const pt = hexMath.hexToPixel(exp.col, exp.row, this.hexRadius, this.ox, this.oy);
            // Apply Camera Transform
            const screenX = (pt.x * this.camera.zoom) + this.camera.x;
            const screenY = (pt.y * this.camera.zoom) + this.camera.y;

            // Map canvas pixels back to DOM client pixels
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = rect.width / this.canvas.width;
            const scaleY = rect.height / this.canvas.height;

            const domX = (screenX * scaleX) + rect.left;
            const domY = (screenY * scaleY) + rect.top;

            const size = (this.hexRadius * 4 * this.camera.zoom) * scaleX;

            // Center image over tile with a visual anchor shift upwards
            if (exp.el) {
                exp.el.style.display = 'block'; // Ensure it's shown once positioned
                exp.el.style.left = (domX - size / 2) + 'px';
                exp.el.style.top = (domY - size / 2 - size * 0.075) + 'px';
                exp.el.style.width = size + 'px';
                exp.el.style.height = size + 'px';

                // Fade out slightly near the end
                if (age > 700) {
                    exp.el.style.opacity = 1 - ((age - 700) / 300);
                }
                exp.el.style.display = 'block';
            }
        }

        // Draw Lerping Units
        for (let i = this.moveAnimations.length - 1; i >= 0; i--) {
            const a = this.moveAnimations[i];
            const progress = Math.min(1, (now - a.startTime) / a.duration);

            const startPt = hexMath.hexToPixel(a.sC, a.sR, this.hexRadius, this.ox, this.oy);
            const endPt = hexMath.hexToPixel(a.eC, a.eR, this.hexRadius, this.ox, this.oy);

            // Linear Interpolation
            const lerpX = startPt.x + (endPt.x - startPt.x) * progress;
            const lerpY = startPt.y + (endPt.y - startPt.y) * progress;

            this.drawUnit(lerpX, lerpY, a.eC, a.eR, a.unit);

            if (progress >= 1) {
                if (a.physicalBoardTarget) {
                    a.physicalBoardTarget.isAnimating = false;
                }
                this.moveAnimations.splice(i, 1);
            }
        }

        this.ctx.restore();

        if (this.game.ui && typeof this.game.ui.updatePopupTracking === 'function') {
            this.game.ui.updatePopupTracking();
        }

        requestAnimationFrame(() => this.drawLoop());
    }
}
