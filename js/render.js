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

    getMeshPattern() {
        if (this._meshPattern) return this._meshPattern;

        // Brick Wall Texture configuration
        const pCanvas = document.createElement('canvas');
        pCanvas.width = 30;
        pCanvas.height = 16;
        const pCtx = pCanvas.getContext('2d');

        // Match empty void baseline mathematically
        pCtx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        pCtx.fillRect(0, 0, 30, 16);

        // Draw brick mortar lines perfectly crisp natively using 0.5px translation boundaries
        pCtx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        pCtx.lineWidth = 1;

        // Horizontal mortar strokes seamlessly delineating rows
        pCtx.beginPath();
        pCtx.moveTo(0, 8.5);
        pCtx.lineTo(30, 8.5);
        pCtx.stroke();

        pCtx.beginPath();
        pCtx.moveTo(0, 0.5);
        pCtx.lineTo(30, 0.5);
        pCtx.stroke();

        // Vertical mortar staggered joints mapped for seamless masonry
        // Row 1 (y: 0 to 8) centered joint
        pCtx.beginPath();
        pCtx.moveTo(15.5, 0);
        pCtx.lineTo(15.5, 8.5);
        pCtx.stroke();

        // Row 2 (y: 8 to 16) boundary joint
        pCtx.beginPath();
        pCtx.moveTo(0.5, 8.5);
        pCtx.lineTo(0.5, 16);
        pCtx.stroke();

        this._meshPattern = this.ctx.createPattern(pCanvas, 'repeat');
        return this._meshPattern;
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

        // Cleanup pending death units attached to this tile visually
        let t = this.game.getTile(col, row);
        if (t && t.pendingDeathVisual) {
            t.pendingDeathVisual = null;
        }
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

    drawHexSegment(x, y, radius, strokeColor, lineWidth = 1, i) {
        this.ctx.beginPath();
        const angle_rad1 = (Math.PI / 180) * (60 * i);
        const angle_rad2 = (Math.PI / 180) * (60 * (i + 1));

        let x1 = x + radius * Math.cos(angle_rad1);
        let y1 = y + radius * Math.sin(angle_rad1);
        let x2 = x + radius * Math.cos(angle_rad2);
        let y2 = y + radius * Math.sin(angle_rad2);

        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);

        this.ctx.strokeStyle = strokeColor;
        this.ctx.lineWidth = lineWidth;
        this.ctx.stroke();
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
                const eyeWidth = r * 0.55;
                const eyeHeight = r * 0.75;
                const pupilRadius = r * 0.18;

                this.ctx.strokeStyle = '#fff';
                this.ctx.lineWidth = Math.max(2, r * 0.12);
                this.ctx.lineCap = 'round';
                this.ctx.lineJoin = 'round';

                // Eye almond outline (eyelids)
                this.ctx.beginPath();
                this.ctx.moveTo(x - eyeWidth, y);
                this.ctx.quadraticCurveTo(x, y - eyeHeight, x + eyeWidth, y);
                this.ctx.quadraticCurveTo(x, y + eyeHeight, x - eyeWidth, y);
                this.ctx.stroke();

                // Solid white pupil
                this.ctx.fillStyle = '#fff';
                this.ctx.beginPath();
                this.ctx.arc(x, y, pupilRadius, 0, Math.PI * 2);
                this.ctx.fill();
            } else {
                // Ensure text sizes dynamically scale exactly to the current render diameter
                // Perfectly centered without dots
                const fontSize = r * 1.35;
                this.ctx.font = `bold ${fontSize}px Inter`;
                this.ctx.fillText(unit.strength.toString(), x, y);
            }
        }
    }
    getThreatColor(norm) {
        let r, g, b;
        if (norm <= 0.5) {
            let t = norm * 2;
            r = Math.round(26 + (136 - 26) * t);
            g = Math.round(26 + (119 - 26) * t);
            b = Math.round(10 + (0 - 10) * t);
        } else {
            let t = (norm - 0.5) * 2;
            r = Math.round(136 + (255 - 136) * t);
            g = Math.round(119 + (221 - 119) * t);
            b = 0;
        }
        return `rgba(${r}, ${g}, ${b}, 0.6)`;
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

        // Dynamically compute UX Threat Map Overlays natively via Asymmetric HUD configuration
        let showRedMove = false;
        let showBlueMove = false;

        let team = this.game.activeTeam;
        if (team === 'BLUE') {
            let bR = document.getElementById('chk-blue-cfg-red');
            let bB = document.getElementById('chk-blue-cfg-blue');
            showRedMove = bR ? bR.checked : false;
            showBlueMove = bB ? bB.checked : false;
        } else if (team === 'RED') {
            let rR = document.getElementById('chk-red-cfg-red');
            let rB = document.getElementById('chk-red-cfg-blue');
            showRedMove = rR ? rR.checked : false;
            showBlueMove = rB ? rB.checked : false;
        }
        let blueThreat = new Set();
        let redThreat = new Set();
        let blueThreatUncertain = new Set();
        let redThreatUncertain = new Set();

        if (showRedMove || showBlueMove) {
            for (let cols = 0; cols < this.game.cols; cols++) {
                for (let rows = 0; rows < this.game.rows; rows++) {
                    let tileData = this.game.getTile(cols, rows);
                    if (!tileData || !tileData.unit) continue;

                    let u = tileData.unit;
                    if (u.type === 'observation' || u.isFlag) continue;

                    let isCompletelyHidden = (u.team !== this.game.activeTeam && u.player !== this.game.activeTeam) && !this.game.canSeeUnit(cols, rows, this.game.activeTeam);
                    if (isCompletelyHidden) continue;

                    let hideStats = this.game.getFogOfWar(cols, rows, this.game.activeTeam);

                    let isRed = u.team === 'RED' || u.player === 'RED';
                    if (isRed && !showRedMove) continue;
                    if (!isRed && !showBlueMove) continue;

                    let speed = hideStats ? (this.game.config.maxSpeed || 5) : (u.speed || 1);

                    // Use local fast BFS to respect Barricade boundaries natively
                    let queue = [{ c: cols, r: rows, dist: 0 }];
                    let visited = new Set([`${cols},${rows}`]);

                    while (queue.length > 0) {
                        let curr = queue.shift();

                        let k = `${curr.c},${curr.r}`;

                        // Threat registration applies organically
                        if (hideStats) {
                            if (isRed) redThreatUncertain.add(k);
                            else blueThreatUncertain.add(k);
                        } else {
                            if (isRed) redThreat.add(k);
                            else blueThreat.add(k);
                        }

                        if (curr.dist >= speed) continue;

                        // If this tile holds an enemy, movement stops here
                        let currTileObj = this.game.getTile(curr.c, curr.r);
                        if (curr.dist > 0 && currTileObj && currTileObj.unit && currTileObj.unit.team !== u.team) {
                            continue;
                        }

                        let ax = hexMath.offsetToAxial(curr.c, curr.r);
                        for (let dir of hexMath.hexDirections) {
                            let nAx = { q: ax.q + dir.dq, r: ax.r + dir.dr };
                            let nOff = hexMath.axialToOffset(nAx.q, nAx.r);

                            if (nOff.col >= 0 && nOff.row >= 0 && nOff.col < this.game.cols && nOff.row < this.game.rows) {
                                let nKey = `${nOff.col},${nOff.row}`;
                                let destTile = this.game.getTile(nOff.col, nOff.row);
                                let dBlock = destTile ? destTile.isBarricade : false;

                                if (!visited.has(nKey) && !dBlock) {
                                    // You cannot step ON a friendly unit, but you can pass THROUGH them? No, Hex-Invaders doesn't allow passing strictly.
                                    let dUnit = destTile ? destTile.unit : null;
                                    let blockedByFriendly = dUnit && dUnit.team === u.team;

                                    if (!blockedByFriendly) {
                                        visited.add(nKey);
                                        queue.push({ c: nOff.col, r: nOff.row, dist: curr.dist + 1 });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        let aiTreeKeys = null;
        if (this.game.ui && this.game.ui.showAIActionTree && this.game.aiActionTreeCache) {
            aiTreeKeys = this.game.aiActionTreeCache.map(c => `${c.col},${c.row}`);
        }

        // Draw board base
        for (let col = 0; col < this.game.cols; col++) {
            for (let row = 0; row < this.game.rows; row++) {
                const pt = hexMath.hexToPixel(col, row, this.hexRadius);
                const key = `${col},${row}`;
                const tile = this.game.getTile(col, row);

                let fill = 'rgba(0,0,0,0.2)'; // Faint black overlay dims empty tiles explicitly against background
                let stroke = 'rgba(255,255,255,0.1)';
                let lineWidth = 1;

                const isHomeBase = col === 0 || col === this.game.cols - 1;

                // Base zone colors
                if (col === 0) fill = 'rgba(59, 130, 246, 0.3)'; // Brighter Blue zone
                if (col === this.game.cols - 1) fill = 'rgba(239, 68, 68, 0.3)'; // Brighter Red zone

                // Threat Map Overlays (Calculated natively based on Fog of War)
                if (!isHomeBase) {
                    let rT = redThreat.has(key);
                    let bT = blueThreat.has(key);

                    let rTU = !rT && redThreatUncertain.has(key);
                    let bTU = !bT && blueThreatUncertain.has(key);

                    if (rT || bT || rTU || bTU) {
                        let pulse = (Math.sin(Date.now() / 300) + 1) / 2;

                        let wR = rT ? 1 : (rTU ? pulse : 0);
                        let wB = bT ? 1 : (bTU ? pulse : 0);

                        let totalW = wR + wB;
                        if (totalW > 0) {
                            let pctR = wR / totalW;
                            let pctB = wB / totalW;

                            // Severely darken the absolute max luminosity so it reads as a 'dark' hint rather than a neon grid natively
                            let R = Math.floor(pctR * 210);
                            let B = Math.floor(pctB * 210);

                            // Base standard threat projection is 0.10 (subtle faint). 
                            // Strongest overlap intersection maximizes at 0.15.
                            let minW = Math.min(wR, wB);
                            let maxW = Math.max(wR, wB);
                            let finalAlpha = (0.10 * maxW) + (0.05 * minW);

                            fill = `rgba(${R}, 0, ${B}, ${finalAlpha.toFixed(3)})`;
                        }
                    }
                }

                // Unit Hover Vision Rules
                if (this.visionHexes && !isHomeBase) {
                    let isReachable = this.hoverHexes && (this.hoverHexes.includes(key) || key === this.hoveredHex);

                    if (!isReachable) {
                        const vis = this.visionHexes;
                        if (vis.inspect.has(key)) {
                            // Inspect: Brighter translucent gray (0.08 alpha pure white over dark background)
                            fill = 'rgba(255, 255, 255, 0.08)';
                        } else if (vis.spot.has(key)) {
                            // Spot: Darker translucent gray (0.04 alpha pure white over dark background)
                            fill = 'rgba(255, 255, 255, 0.04)';
                        }
                    }
                }

                // Barricade styling
                if (tile.isBarricade) {
                    fill = this.getMeshPattern(); // Replaces solid black with transparent mesh
                    stroke = '#e2e8f0'; // bright gray, almost white
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
                } else if (this.highlightHexes && this.highlightHexes.includes(key) && !isHomeBase) {
                    // Replaced fill logic with outer perimeter segments rendered later.
                } else if (this.hoverHexes && this.hoverHexes.includes(key) && !isHomeBase) {
                    // Replaced fill logic with outer perimeter segments rendered later.
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

                let isBlueRange = this.game.blueRangeHexes && this.game.blueRangeHexes.has(key);
                let isRedRange = this.game.redRangeHexes && this.game.redRangeHexes.has(key);

                if (isBlueRange && isRedRange) {
                    fill = 'rgba(168, 85, 247, 0.4)'; // Purple
                } else if (isBlueRange) {
                    fill = 'rgba(59, 130, 246, 0.3)';
                } else if (isRedRange) {
                    fill = 'rgba(239, 68, 68, 0.3)';
                }

                if (this.game.ui && this.game.ui.showAIHeatmap && this.game.aiHeatmapCache) {
                    let hm = this.game.aiHeatmapCache.find(h => h.col === col && h.row === row);
                    if (hm) {
                        if (hm.occupied) {
                            fill = hm.val > 0 ? 'rgba(59, 130, 246, 0.4)' : 'rgba(239, 68, 68, 0.4)';
                        } else {
                            fill = this.getThreatColor(hm.norm);
                        }
                    }
                } else if (this.game.ui && this.game.ui.showAIActionTree && this.game.aiActionTreeCache) {
                    let ev = this.game.aiActionTreeCache.find(e => e.col === col && e.row === row);
                    if (ev) {
                        fill = this.getThreatColor(ev.norm);
                    }
                }
                this.drawHex(pt.x, pt.y, this.hexRadius - 1, fill, stroke, lineWidth);

                // Draw perimeter strokes for reachable zones natively 
                let isHoverReach = this.hoverHexes && (this.hoverHexes.includes(key) || key === this.hoveredHex);
                let isSelectReach = this.highlightHexes && (this.highlightHexes.includes(key) || key === this.game.selectedTile);
                let isAiReach = aiTreeKeys && aiTreeKeys.includes(key);

                if ((isHoverReach && this.hoverHexes && this.hoverHexes.length > 0) ||
                    (isSelectReach && this.highlightHexes && this.highlightHexes.length > 0) ||
                    (isAiReach)) {

                    let perimeterGroup;
                    let perimeterColor;
                    let rootTile;
                    if (isAiReach) {
                        perimeterGroup = aiTreeKeys;
                        perimeterColor = 'rgba(251, 191, 36, 1.0)';
                        rootTile = null;
                    } else if (isSelectReach) {
                        perimeterGroup = this.highlightHexes;
                        perimeterColor = this.highlightHexesColor;
                        rootTile = this.game.selectedTile;
                    } else {
                        perimeterGroup = this.hoverHexes;
                        perimeterColor = this.hoverHexesColor;
                        rootTile = this.hoveredHex;
                    }

                    // Thicker stroke for maximum perimeter visibility matching the threat alpha implicitly
                    let pStroke = perimeterColor;

                    if (perimeterColor) {
                        // Extract rgba to explicitly mutate the physical coordinates dynamically
                        let m = perimeterColor.match(/rgba\((\d+),\s*(\d+),\s*(\d+),/);
                        if (m) {
                            let r = parseInt(m[1]);
                            let g = parseInt(m[2]);
                            let b = parseInt(m[3]);

                            // Mathematically shift the base Red/Blue strictly 40% towards pure white
                            // ensuring the topological bounds explicitly detach from identically colored UI matrices
                            r = Math.min(255, Math.floor(r + (255 - r) * 0.4));
                            g = Math.min(255, Math.floor(g + (255 - g) * 0.4));
                            b = Math.min(255, Math.floor(b + (255 - b) * 0.4));

                            pStroke = `rgba(${r}, ${g}, ${b}, 0.95)`;
                        }
                    }

                    const ax = hexMath.offsetToAxial(col, row);
                    for (let d = 0; d < 6; d++) {
                        let dir = hexMath.hexDirections[d];
                        const nAx = { q: ax.q + dir.dq, r: ax.r + dir.dr };
                        const nOff = hexMath.axialToOffset(nAx.q, nAx.r);
                        let nKey = `${nOff.col},${nOff.row}`;

                        // If neighbor is NOT in the reach set and is NOT the root tile itself, draw an edge mapping!
                        if (!perimeterGroup.includes(nKey) && nKey !== rootTile) {
                            let segI = (6 - d) % 6; // Geometrically correct polar to axial edge inversion mapping
                            this.drawHexSegment(pt.x, pt.y, this.hexRadius - 1, pStroke, 3.5, segI);
                        }
                    }
                }

                // Draw Unit
                let baseUnit = tile ? tile.unit : null;
                if (!baseUnit && tile && tile.pendingDeathVisual) {
                    baseUnit = tile.pendingDeathVisual;
                }

                if (baseUnit && !baseUnit.isAnimating) {
                    this.drawUnit(pt.x, pt.y, col, row, baseUnit);
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

        // --- DRAW ACTION TREE ---
        if (this.game.ui && this.game.ui.showAIActionTree && this.game.aiActionTreeCache) {
            let evals = this.game.aiActionTreeCache;
            let maxVal = evals.length > 0 ? Math.max(...evals.map(e => e.val)) : 0;

            for (let ev of evals) {
                let targetPt = hexMath.hexToPixel(ev.col, ev.row, this.hexRadius, this.ox, this.oy);
                let roundedVal = Math.round(ev.val);
                let scoreTxt = (roundedVal > 0 ? '+' : '') + roundedVal.toLocaleString();

                let isMax = ev.val === maxVal;
                this.ctx.font = 'bold ' + (isMax ? '18px' : '14px') + ' Inter, sans-serif';
                this.ctx.fillStyle = isMax ? '#fbbf24' : '#fff';
                this.ctx.shadowColor = 'black';
                this.ctx.shadowBlur = 4;
                this.ctx.textAlign = 'center';
                this.ctx.fillText(scoreTxt, targetPt.x, targetPt.y + 6);
                this.ctx.shadowBlur = 0;
            }
        }

        this.ctx.restore();

        if (this.game.ui && typeof this.game.ui.updatePopupTracking === 'function') {
            this.game.ui.updatePopupTracking();
        }

        requestAnimationFrame(() => this.drawLoop());
    }
}
