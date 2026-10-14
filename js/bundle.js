// --- hex.js ---
// js/hex.js
// Handles Hex Grid Mathematics for Flat-Topped Hexagons (Odd-q offset coordinates)

const hexMath = {
    // Convert Offset (col, row) to Axial (q, r)
    offsetToAxial(col, row) {
        const q = col;
        const r = row - Math.floor((col - (col & 1)) / 2);
        return { q, r };
    },

    // Convert Axial (q, r) back to Offset (col, row)
    axialToOffset(q, r) {
        const col = q;
        const row = r + Math.floor((q - (q & 1)) / 2);
        return { col, row };
    },

    // Distance between two axial coordinates
    axialDistance(q1, r1, q2, r2) {
        return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
    },

    // Distance between two offset coordinates directly
    offsetDistance(col1, row1, col2, row2) {
        const a1 = this.offsetToAxial(col1, row1);
        const a2 = this.offsetToAxial(col2, row2);
        return this.axialDistance(a1.q, a1.r, a2.q, a2.r);
    },

    // Calculate center pixel X and Y for a given hex (col, row)
    hexToPixel(col, row, hexRadius, offsetX = 0, offsetY = 0) {
        const x = col * 1.5 * hexRadius + offsetX;
        const y = row * Math.sqrt(3) * hexRadius + (col % 2 === 1 ? (Math.sqrt(3) / 2) * hexRadius : 0) + offsetY;
        return { x, y };
    },

    // Convert screen/pixel coordinate to axial coordinates loosely, then round to nearest exact hex
    pixelToHex(x, y, hexRadius, offsetX = 0, offsetY = 0) {
        const px = x - offsetX;
        const py = y - offsetY;

        // Approximate axial coords for flat topped hexes
        const q = (2 / 3 * px) / hexRadius;
        const r = (-1 / 3 * px + Math.sqrt(3) / 3 * py) / hexRadius;

        return this.hexRound(q, r);
    },

    // Convert float axial space to rounded axial integer
    hexRound(q, r) {
        let s = -q - r;
        let rq = Math.round(q);
        let rr = Math.round(r);
        let rs = Math.round(s);

        const q_diff = Math.abs(rq - q);
        const r_diff = Math.abs(rr - r);
        const s_diff = Math.abs(rs - s);

        if (q_diff > r_diff && q_diff > s_diff) {
            rq = -rr - rs;
        } else if (r_diff > s_diff) {
            rr = -rq - rs;
        } else {
            rs = -rq - rr;
        }

        return { q: rq, r: rr };
    },

    // Pixel to closest board offset coords (col, row)
    pixelToOffset(x, y, hexRadius, offsetX = 0, offsetY = 0) {
        const ax = this.pixelToHex(x, y, hexRadius, offsetX, offsetY);
        return this.axialToOffset(ax.q, ax.r);
    },

    // Interpolation for Line of Sight
    hexLerp(a, b, t) {
        return {
            q: a.q + (b.q - a.q) * t,
            r: a.r + (b.r - a.r) * t
        };
    },

    // Generate an array of offset (col, row) tiles that intersect a straight line between two offset coords
    hexLine(col1, row1, col2, row2) {
        const a = this.offsetToAxial(col1, row1);
        const b = this.offsetToAxial(col2, row2);
        const dist = this.axialDistance(a.q, a.r, b.q, b.r);
        const results = [];

        // Epsilon nudges prevent exact edge/corner intersections returning unpredictable lines
        const nudgeA = { q: a.q + 1e-6, r: a.r + 2e-6 };
        const nudgeB = { q: b.q + 1e-6, r: b.r + 2e-6 };

        for (let i = 0; i <= dist; i++) {
            const t = dist === 0 ? 0.0 : i / dist;
            const lerped = this.hexLerp(nudgeA, nudgeB, t);
            const rounded = this.hexRound(lerped.q, lerped.r);
            results.push(this.axialToOffset(rounded.q, rounded.r));
        }
        return results;
    },

    // Get adjacent hexes (Axial coords)
    // Flat-topped directions: right, bottom-right, bottom-left, left, top-left, top-right
    hexDirections: [
        { dq: 1, dr: 0 },
        { dq: 1, dr: -1 },
        { dq: 0, dr: -1 },
        { dq: -1, dr: 0 },
        { dq: -1, dr: 1 },
        { dq: 0, dr: 1 }
    ],

    // Return the radius array of offsets covering N steps
    getHexesInRadius(q, r, radius) {
        const results = [];
        for (let dq = -radius; dq <= radius; dq++) {
            for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
                results.push({ q: q + dq, r: r + dr });
            }
        }
        return results;
    }
};


// --- unit.js ---
// js/unit.js

class Unit {
    constructor(team, type, strength, speed, flagCost) {
        this.team = team; // 'BLUE' or 'RED'
        this.type = type; // 'combat' or 'flag'

        if (this.type === 'flag') {
            this.strength = 0;
            this.speed = speed;
            this.isFlag = true;
            this.isObservation = false;
            this.cost = flagCost * speed;
        } else if (this.type === 'observation') {
            this.strength = 0;
            this.speed = 0;
            this.isFlag = false;
            this.isObservation = true;
            this.cost = 0;
        } else {
            this.strength = strength;
            this.speed = speed;
            this.isFlag = false;
            this.isObservation = false;
            this.cost = strength * speed;
        }

        // Active/Exhausted state for a turn
        this.hasActed = false;
    }
}


// --- game.js ---
// js/game.js



class HexGame {
    constructor(config) {
        this.config = config;

        this.cols = config.width;
        this.rows = config.height;
        this.mode = config.mode; // 'VISIBLE' | 'HIDDEN'
        this.type = config.type; // 'INVADE' | 'PLANT' | 'CAPTURE'

        this.credits = {
            BLUE: config.credits,
            RED: config.credits
        };

        this.phase = 'MAIN';
        this.activeTeam = 'BLUE';

        // key format: "col,row" 
        // value: { unit: Unit|null, isBarricade: boolean }
        this.board = new Map();
        for (let col = 0; col < this.cols; col++) {
            for (let row = 0; row < this.rows; row++) {
                this.board.set(`${col},${row}`, { unit: null, isBarricade: false });
            }
        }

        this.logs = [];
        this.selectedTile = null;
        this.actionUsed = false;
        this.winner = null;
        this.gameFinished = false;

        // Deployment tracking Rules
        this.deployCounts = { 'BLUE': 0, 'RED': 0 };
        this.hasFlag = { 'BLUE': false, 'RED': false };

        this.history = [];
        this.historyIndex = 0;
        this.activeCombats = [];

        this.blueName = config.blueName || 'Blue';
        this.redName = config.redName || 'Red';

        this.timerDuration = config.timerDuration || 0;
        this.timeLeft = this.timerDuration;
        this.timerInterval = null;

        this.overlayMode = 'NONE';
        this.overlayCache = { 'BLUE': null, 'RED': null };

        this.logSystem(`Game initialized. ${this.blueName}'s Turn.`);
        this.saveSnapshot();
        // Timers in network games will be started manually upon connection
    }

    get isGameOver() {
        return this.gameFinished === true || (this.history.length > 0 && this.history[this.history.length - 1].winner !== null);
    }

    startTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timeLeft = this.timerDuration;

        if (this.ui) this.ui.updateHUDTimer(this.timeLeft);

        if (this.timerDuration > 0 && !this.winner) {
            this.timerInterval = setInterval(() => {
                if (this.winner) {
                    clearInterval(this.timerInterval);
                    return;
                }
                this.timeLeft--;
                if (this.ui) this.ui.updateHUDTimer(this.timeLeft);

                if (this.timeLeft <= 0) {
                    clearInterval(this.timerInterval);
                    let isActivePlayer = true;
                    if (this.network && this.localTeam) {
                        isActivePlayer = (this.localTeam === this.activeTeam);
                    }
                    if (this.gameMode === 'AI' && this.activeTeam === 'RED') {
                        isActivePlayer = false; // AI handles its own execution
                    }

                    if (isActivePlayer) {
                        this.logSystem(`Time expired! Turn skipped.`);
                        this.endTurn();
                    }
                }
            }, 1000);
        }
    }

    saveSnapshot() {
        // Deep copy state
        const snap = {
            board: new Map(),
            credits: { ...this.credits },
            activeTeam: this.activeTeam,
            winner: this.winner,
            actionUsed: this.actionUsed,
            deployCounts: { ...this.deployCounts },
            hasFlag: { ...this.hasFlag },
            combats: [...this.activeCombats]
        };
        for (let [k, v] of this.board.entries()) {
            let uCopy = null;
            if (v.unit) {
                uCopy = { ...v.unit };
                delete uCopy.isAnimating;
            }
            snap.board.set(k, { unit: uCopy, isBarricade: v.isBarricade });
        }
        snap.lastMove = this.lastMove ? { ...this.lastMove } : null;
        // Save and increment
        this.history.push(snap);
        this.historyIndex = this.history.length - 1;
        this.activeCombats = []; // Clear for next turn's actions
        this.lastMove = null;
    }

    loadSnapshot(index) {
        if (index < 0 || index >= this.history.length) return;

        if (this.ui && this.ui.render) {
            this.ui.render.clearExplosions();
            if (typeof this.ui.render.clearMoveAnimations === 'function') {
                this.ui.render.clearMoveAnimations();
            }
        }

        let steppedForward = (index === this.historyIndex + 1);
        let steppedBackward = (index === this.historyIndex - 1);

        this.historyIndex = index;
        const snap = this.history[index];

        // Restore deep copy
        this.board = new Map();
        for (let [k, v] of snap.board.entries()) {
            let uCopy = null;
            if (v.unit) {
                uCopy = { ...v.unit };
                delete uCopy.isAnimating;
            }
            this.board.set(k, { unit: uCopy, isBarricade: v.isBarricade });
        }
        this.credits = { ...snap.credits };
        this.activeTeam = snap.activeTeam;
        this.winner = snap.winner;
        this.actionUsed = snap.actionUsed;
        this.deployCounts = { ...(snap.deployCounts || { 'BLUE': 0, 'RED': 0 }) };
        this.hasFlag = { ...(snap.hasFlag || { 'BLUE': false, 'RED': false }) };

        if (this.onCombat && snap.combats && steppedForward) {
            snap.combats.forEach(coord => this.onCombat(coord.c, coord.r, true));
        }

        const isHeatmapActive = (this.ui && this.ui.showAIHeatmap);
        if (this.ui && this.ui.render && !isHeatmapActive) {
            if (steppedForward && snap.lastMove) {
                const trgt = this.getTile(snap.lastMove.eC, snap.lastMove.eR).unit;
                this.ui.render.addMoveAnimation(snap.lastMove.sC, snap.lastMove.sR, snap.lastMove.eC, snap.lastMove.eR, snap.lastMove.unit, 500, trgt);
            } else if (steppedBackward && this.history[index + 1] && this.history[index + 1].lastMove) {
                const l = this.history[index + 1].lastMove;
                const trgt = this.getTile(l.sC, l.sR).unit;
                this.ui.render.addMoveAnimation(l.eC, l.eR, l.sC, l.sR, l.unit, 500, trgt);
            }
        }
    }

    logSystem(msg) {
        this.logs.push({ type: 'system', text: msg });
        if (this.onLog) this.onLog();
    }
    logAction(team, msg, isCombat = false) {
        this.logs.push({ type: team === 'BLUE' ? 'blue' : 'red', isCombat, text: msg });
        if (this.onLog) this.onLog();
    }

    getTile(col, row) {
        return this.board.get(`${col},${row}`);
    }
    setUnit(col, row, unit) {
        const t = this.getTile(col, row);
        if (t) t.unit = unit;
    }

    // Core check if tile is within bounds
    isValid(col, row) {
        return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
    }

    // Deploy unit logical check
    canDeploy(team, col, row, unitCost, isFlag = false) {
        if (this.historyIndex !== this.history.length - 1) return { valid: false, msg: "Cannot deploy in history mode." };
        if (!this.isValid(col, row)) return { valid: false, msg: "Out of bounds." };
        if (this.credits[team] < unitCost) return { valid: false, msg: "Insufficient credits." };
        if (this.getTile(col, row).unit !== null) return { valid: false, msg: "Tile occupied." };
        if (this.getTile(col, row).isBarricade) return { valid: false, msg: "Tile is barricaded." };

        if (isFlag) {
            if (this.config && this.config.type === 'INVADE') {
                return { valid: false, msg: "Flags cannot be deployed in INVADE missions." };
            }
        }

        if (team === 'BLUE' && col !== 0) return { valid: false, msg: "Blue can only deploy on Column 0." };
        if (team === 'RED' && col !== this.cols - 1) return { valid: false, msg: "Red can only deploy on last Column." };

        return { valid: true };
    }

    deployUnit(team, type, strength, speed, col, row, isSyncEvent = false) {
        const u = new Unit(team, type, strength, speed, this.config.flagCost);
        const check = this.canDeploy(team, col, row, u.cost, type === 'flag');
        if (!check.valid) {
            this.logSystem(`Deployment Failed: ${check.msg}`);
            return false;
        }

        if (!isSyncEvent && this.network) {
            this.network.sendData({ type: 'DEPLOY', team, unitType: type, str: strength, spd: speed, col, row });
        }

        this.credits[team] -= u.cost;
        this.setUnit(col, row, u);

        if (type === 'flag') this.hasFlag[team] = true;
        this.deployCounts[team]++;

        this.logAction(team, `Deployed ${type} unit for ${u.cost} cr.`);
        this.actionUsed = true;
        this.endTurn(isSyncEvent, true);

        this.checkWinConditions();
        return true;
    }

    switchPhase() {
        this.activeTeam = this.activeTeam === 'BLUE' ? 'RED' : 'BLUE';
        this.actionUsed = false;
        const currentName = this.activeTeam === 'BLUE' ? this.blueName : this.redName;
        this.logSystem(`${currentName}'s Turn.`);

        if (this.timerDuration > 0) {
            this.startTimer();
        }

        return true;
    }

    endTurn(isSyncEvent = false, doNotBroadcast = false) {
        if (this.winner) return;

        if (!isSyncEvent && !doNotBroadcast && this.network) {
            this.network.sendData({ type: 'SKIP' });
        }

        for (let [k, v] of this.board.entries()) {
            if (v.unit && v.unit.exposedCounter !== undefined && v.unit.exposedCounter > 0) {
                v.unit.exposedCounter--;
            }
        }

        this.invalidateOverlayCache();
        this.switchPhase();
        this.saveSnapshot();
        if (this.onStateChange) this.onStateChange();
    }

    verifyCaptureSetup() {
        let bFlag = 0, rFlag = 0;
        this.board.forEach((t) => {
            if (t.unit && t.unit.isFlag) {
                if (t.unit.team === 'BLUE') bFlag++;
                if (t.unit.team === 'RED') rFlag++;
            }
        });
        return bFlag > 0 && rFlag > 0;
    }

    // BFS Pathfinding checking friendly collisions and barricades
    // Returns path as array of tile string keys, or null if target unreachable
    findPath(startCol, startRow, endCol, endRow, team, maxDist) {
        const startKey = `${startCol},${startRow}`;
        const targetKey = `${endCol},${endRow}`;

        let queue = [{ c: startCol, r: startRow, dist: 0, path: [startKey] }];
        let visited = new Set([startKey]);
        let targetPath = null;

        while (queue.length > 0) {
            let curr = queue.shift();

            if (`${curr.c},${curr.r}` === targetKey) {
                targetPath = curr.path;
                break;
            }
            if (curr.dist >= maxDist) continue;

            const ax = hexMath.offsetToAxial(curr.c, curr.r);
            for (let dir of hexMath.hexDirections) {
                const nAx = { q: ax.q + dir.dq, r: ax.r + dir.dr };
                const nOff = hexMath.axialToOffset(nAx.q, nAx.r);

                if (this.isValid(nOff.col, nOff.row)) {
                    const nextKey = `${nOff.col},${nOff.row}`;
                    if (!visited.has(nextKey)) {
                        const t = this.getTile(nOff.col, nOff.row);
                        if (!t.isBarricade) {
                            // Can step into an empty tile or ENEMY tile but NOT friendly.
                            // If it's an enemy, we can step ON it, but we can't step THROUGH it.
                            // However, we only end movement there if there's combat. BFS will explore from empty tiles.
                            let isTarget = (nextKey === targetKey);
                            let canEnter = !t.unit || t.unit.team !== team;
                            let canPassThrough = !t.unit;

                            if (canEnter) {
                                visited.add(nextKey);
                                const newPath = [...curr.path, nextKey];

                                // Always valid to STOP on an enemy (last step). Valid to pass if empty.
                                if (canPassThrough || isTarget) {
                                    queue.push({ c: nOff.col, r: nOff.row, dist: curr.dist + 1, path: newPath });
                                }
                            }
                        }
                    }
                }
            }
        }
        return targetPath;
    }

    getReachableHexes(startCol, startRow, team, maxDist) {
        const startKey = `${startCol},${startRow}`;
        let queue = [{ c: startCol, r: startRow, dist: 0 }];
        let visited = new Set([startKey]);
        let reachable = [];

        while (queue.length > 0) {
            let curr = queue.shift();

            if (curr.dist > 0) {
                reachable.push(`${curr.c},${curr.r}`);
            }
            // Stop expanding branching from a tile if we reached max distance 
            // OR if it's occupied by an enemy (we can stop on enemy, but not pass through)
            if (curr.dist >= maxDist) continue;
            const currentTile = this.getTile(curr.c, curr.r);
            if (curr.dist > 0 && currentTile.unit && currentTile.unit.team !== team) continue;

            const ax = hexMath.offsetToAxial(curr.c, curr.r);
            for (let dir of hexMath.hexDirections) {
                const nAx = { q: ax.q + dir.dq, r: ax.r + dir.dr };
                const nOff = hexMath.axialToOffset(nAx.q, nAx.r);

                if (this.isValid(nOff.col, nOff.row)) {
                    const nextKey = `${nOff.col},${nOff.row}`;
                    if (!visited.has(nextKey)) {
                        const t = this.getTile(nOff.col, nOff.row);
                        if (!t.isBarricade) {
                            let canEnter = !t.unit || t.unit.team !== team;
                            if (canEnter) {
                                visited.add(nextKey);
                                queue.push({ c: nOff.col, r: nOff.row, dist: curr.dist + 1 });
                            }
                        }
                    }
                }
            }
        }
        return reachable;
    }

    moveUnit(startCol, startRow, endCol, endRow, isSyncEvent = false) {
        if (this.actionUsed || this.phase !== 'MAIN' || this.winner || this.historyIndex !== this.history.length - 1) return false;
        const startTile = this.getTile(startCol, startRow);
        const u = startTile.unit;
        if (!u || u.team !== this.activeTeam) return false;

        if (!isSyncEvent && this.network) {
            this.network.sendData({ type: 'MOVE', col: startCol, row: startRow, tC: endCol, tR: endRow });
        }

        const path = this.findPath(startCol, startRow, endCol, endRow, u.team, u.speed);
        if (!path) {
            this.logSystem("Invalid move: Unreachable or too far.");
            return false;
        }

        let currC = startCol;
        let currR = startRow;

        let collisionC = startCol;
        let collisionR = startRow;

        let survived = true;
        // Travel the path (index 1 to end, skipping start)
        for (let i = 1; i < path.length; i++) {
            const spl = path[i].split(',');
            const trgC = parseInt(spl[0]);
            const trgR = parseInt(spl[1]);
            const targetTile = this.getTile(trgC, trgR);

            if (targetTile.unit && targetTile.unit.team !== u.team) {
                // Combat!
                this.activeCombats.push({ c: trgC, r: trgR });
                if (this.onCombat) this.onCombat(trgC, trgR);

                const defender = targetTile.unit;
                let attackerWins = false;

                if (defender.isFlag) {
                    if (u.strength > 0) attackerWins = true;
                } else if (u.isFlag) {
                    attackerWins = false; // Flag can't win against anything
                } else {
                    if (u.strength >= defender.strength) attackerWins = true;
                }

                if (attackerWins) {
                    this.logAction(u.team, `Combat: ${u.strength} Power defeated ${defender.strength} Power at [${trgC},${trgR}].`, true);
                    targetTile.pendingDeathVisual = { ...defender };
                    targetTile.unit = null;

                    if (this.config.powerMode === 'DEPLETING' && !defender.isFlag && !u.isFlag) {
                        u.strength--;
                        if (u.strength <= 0) {
                            survived = false;
                            this.getTile(currC, currR).pendingDeathVisual = { ...u };
                            this.getTile(currC, currR).unit = null;
                            this.logAction(u.team, `Combat: ${u.team} unit succumbed to exhaustion after battle at [${trgC},${trgR}].`, true);
                            this.activeCombats.push({ c: currC, r: currR });
                            if (this.onCombat) this.onCombat(currC, currR);
                            collisionC = trgC;
                            collisionR = trgR;
                            break;
                        }
                    }
                    u.exposedCounter = 2; // Attacker survived and becomes visibly exposed
                } else {
                    this.logAction(u.team, `Combat: ${u.strength} Power died attacking ${defender.strength} Power at [${trgC},${trgR}].`, true);
                    survived = false;
                    this.getTile(currC, currR).pendingDeathVisual = { ...u };
                    this.getTile(currC, currR).unit = null; // attacker dead, erase from current step
                    this.activeCombats.push({ c: currC, r: currR });
                    if (this.onCombat) this.onCombat(currC, currR);
                    collisionC = trgC;
                    collisionR = trgR;

                    if (this.config.powerMode === 'DEPLETING' && !defender.isFlag && !u.isFlag) {
                        defender.strength--;
                        if (defender.strength <= 0) {
                            targetTile.pendingDeathVisual = { ...defender };
                            targetTile.unit = null;
                            this.logAction(defender.team, `Combat: ${defender.team} defender succumbed to exhaustion after battle at [${trgC},${trgR}].`, true);
                            this.activeCombats.push({ c: trgC, r: trgR });
                            if (this.onCombat) this.onCombat(trgC, trgR);
                        } else {
                            defender.exposedCounter = 2; // Defender survived and is visibly exposed
                        }
                    } else {
                        defender.exposedCounter = 2; // Defender survived and is visibly exposed
                    }
                    break;
                }
            }

            // Move piece to this step physically
            const currentTemp = this.getTile(currC, currR);
            const targetTemp = this.getTile(trgC, trgR);
            targetTemp.unit = currentTemp.unit;
            currentTemp.unit = null;

            currC = trgC;
            currR = trgR;
        }

        let endC = survived ? currC : collisionC;
        let endR = survived ? currR : collisionR;

        if (endC !== startCol || endR !== startRow) {
            this.lastMove = { sC: startCol, sR: startRow, eC: endC, eR: endR, unit: { ...u } };
            if (this.ui && this.ui.render) {
                const trgt = survived ? this.getTile(currC, currR).unit : null;
                this.ui.render.addMoveAnimation(startCol, startRow, endC, endR, { ...u }, 500, trgt);
            }
        }

        this.actionUsed = true;
        this.selectedTile = null;
        this.invalidateOverlayCache();
        this.checkWinConditions();
        if (!this.winner) this.endTurn(isSyncEvent, true);
        return true;
    }

    validateBoardConnectivity(tempBarricades) {
        // BFS to see if col 0 can reach col (cols-1)
        const visited = new Set();
        const queue = [];

        for (let r = 0; r < this.rows; r++) {
            const key = `0,${r}`;
            if (this.isValid(0, r)) {
                const tile = this.getTile(0, r);
                if (!tile.isBarricade && !tempBarricades.has(key)) {
                    queue.push({ c: 0, r: r });
                    visited.add(key);
                }
            }
        }

        while (queue.length > 0) {
            const curr = queue.shift();

            if (curr.c === this.cols - 1) return true; // Reached the other side safely

            const ax = hexMath.offsetToAxial(curr.c, curr.r);
            for (let dir of hexMath.hexDirections) {
                const nAx = { q: ax.q + dir.dq, r: ax.r + dir.dr };
                const nOff = hexMath.axialToOffset(nAx.q, nAx.r);

                if (this.isValid(nOff.col, nOff.row)) {
                    const nextKey = `${nOff.col},${nOff.row}`;
                    if (!visited.has(nextKey)) {
                        const t = this.getTile(nOff.col, nOff.row);
                        if (!t.isBarricade && !tempBarricades.has(nextKey)) {
                            visited.add(nextKey);
                            queue.push({ c: nOff.col, r: nOff.row });
                        }
                    }
                }
            }
        }
        return false;
    }

    getBarricadeFootprint(col, row, power, offset) {
        const length = Math.max(1, power || 1);
        const actualOffset = offset !== undefined ? offset : Math.floor(length / 2);
        const startRow = row - actualOffset;

        let footprint = [];
        // Straight vertical line with length equal to unit's strength
        for (let i = 0; i < length; i++) {
            footprint.push({ col: col, row: startRow + i });
        }

        return footprint;
    }

    canBarricade(col, row, offset) {
        if (this.actionUsed || this.phase !== 'MAIN' || this.winner || this.historyIndex !== this.history.length - 1)
            return { valid: false, reason: "Invalid mode." };

        const cost = this.config ? (this.config.barricadeCost || 10) : 10;
        if (this.credits[this.activeTeam] < cost)
            return { valid: false, reason: `Requires ${cost} credits.` };

        const t = this.getTile(col, row);
        const u = t.unit;
        if (!u || u.team !== this.activeTeam)
            return { valid: false, reason: "Requires Active Unit." };

        const footprint = this.getBarricadeFootprint(col, row, u.strength, offset);

        let previewSet = new Set();
        // Validate area constraints
        for (let pt of footprint) {
            if (this.isValid(pt.col, pt.row)) {
                if (pt.col < 2 || pt.col > this.cols - 3) {
                    return { valid: false, reason: "Barricade touches home colored zones." };
                }
                previewSet.add(`${pt.col},${pt.row}`);
                if (pt.col === col && pt.row === row) continue; // the unit itself
                const nT = this.getTile(pt.col, pt.row);
                if (nT.unit !== null || nT.isBarricade) {
                    return { valid: false, reason: "Target footprint is already occupied." };
                }
            }
        }

        // Final Rule: Cannot seal the board completely
        if (!this.validateBoardConnectivity(previewSet)) {
            return { valid: false, reason: "Cannot completely block off passage!" };
        }

        return { valid: true };
    }

    getBarricadePreview(col, row, offset) {
        const t = this.getTile(col, row);
        const u = t.unit;
        if (!u) return [];

        const footprint = this.getBarricadeFootprint(col, row, u.strength, offset);

        let keys = [];
        for (let pt of footprint) {
            if (this.isValid(pt.col, pt.row)) {
                keys.push(`${pt.col},${pt.row}`);
            }
        }
        return keys;
    }

    createBarricade(col, row, offset, isSyncEvent = false) {
        const check = this.canBarricade(col, row, offset);
        if (!check.valid) {
            this.logSystem(`Error: ${check.reason}`);
            return false;
        }

        if (!isSyncEvent && this.network) {
            this.network.sendData({ type: 'BARRICADE', col, row, offset });
        }

        const cost = this.config ? (this.config.barricadeCost || 10) : 10;
        const t = this.getTile(col, row);
        const u = t.unit;
        const footprint = this.getBarricadeFootprint(col, row, u.strength, offset);

        // Commit Barricade
        this.credits[this.activeTeam] -= cost;
        // Kill unit
        t.unit = null;
        // Paint black
        let previewKeys = new Set();
        for (let pt of footprint) {
            if (this.isValid(pt.col, pt.row)) {
                this.getTile(pt.col, pt.row).isBarricade = true;
                previewKeys.add(`${pt.col},${pt.row}`);
            }
        }

        // Spawn Observation Unit
        let obsCol = this.activeTeam === 'BLUE' ? col - 1 : col + 1;
        let obsRow = row;
        // Slide inward towards home bounds until free tile found
        while (previewKeys.has(`${obsCol},${obsRow}`) || (this.isValid(obsCol, obsRow) && this.getTile(obsCol, obsRow).unit !== null)) {
            obsCol += (this.activeTeam === 'BLUE' ? -1 : 1);
            if (!this.isValid(obsCol, obsRow)) break;
        }

        if (this.isValid(obsCol, obsRow)) {
            const obsUnit = new Unit(this.activeTeam, 'observation', 0, 0, 0);
            this.setUnit(obsCol, obsRow, obsUnit);
        }

        this.logAction(this.activeTeam, `Constructed a vertical barricade at [${col},${row}].`);
        this.actionUsed = true;
        this.selectedTile = null;
        this.invalidateOverlayCache();
        this.checkWinConditions();
        if (!this.winner) this.endTurn(isSyncEvent, true);
        return true;
    }

    getFogOfWar(col, row, perspective, specificUnit = null) {
        if (this.config.mode === 'VISIBLE' || this.isGameOver) return false;

        const tile = this.getTile(col, row);
        if (!tile) return false;

        let checkUnit = specificUnit;
        if (!checkUnit) {
            checkUnit = tile.unit || tile.pendingDeathVisual;
        }

        if (!checkUnit) return false;

        const isEnemy = checkUnit.team !== perspective;
        if (!isEnemy) return false;

        if (checkUnit.type === 'observation') return false;

        if (checkUnit.exposedCounter && checkUnit.exposedCounter > 0) return false;

        if (this.config.mode === 'HIDDEN') return true;

        if (this.config.mode === 'NEARBY') {
            for (let c = 0; c < this.cols; c++) {
                for (let r = 0; r < this.rows; r++) {
                    const t = this.getTile(c, r);
                    if (!t) continue;

                    let viewRange = this.config.maxSpeed + 2;
                    let dist = hexMath.offsetDistance(col, row, c, r);

                    if (t.unit && t.unit.team === perspective && dist <= viewRange) {
                        return false;
                    }
                    if (t.pendingDeathVisual && t.pendingDeathVisual.team === perspective && dist <= viewRange) {
                        return false;
                    }
                }
            }
            return true; // Unseen
        }

        return false;
    }

    canSeeUnit(targetCol, targetRow, perspectiveTeam) {
        if (this.isGameOver || this.config.mode === 'VISIBLE') return true;

        // Collect all units for the perspective team
        const myUnits = [];
        for (let col = 0; col < this.cols; col++) {
            for (let row = 0; row < this.rows; row++) {
                const t = this.getTile(col, row);
                if (!t) continue;
                if (t.unit && t.unit.team === perspectiveTeam) {
                    myUnits.push({ col, row, type: t.unit.type });
                }
                if (t.pendingDeathVisual && t.pendingDeathVisual.team === perspectiveTeam) {
                    myUnits.push({ col, row, type: t.pendingDeathVisual.type });
                }
            }
        }

        // If player has no units, sees none
        if (myUnits.length === 0) return false;

        for (let u of myUnits) {
            const line = hexMath.hexLine(u.col, u.row, targetCol, targetRow);
            let blocked = false;
            let viewRange = this.config.maxSpeed + 2;
            let targetDist = hexMath.offsetDistance(u.col, u.row, targetCol, targetRow);

            let barricadeGroupsBypassed = 0;
            let currentlyInBarricade = false;
            // Check intermediate steps exclusively (skip 0 which is source, skip length-1 which is target)
            for (let i = 1; i < line.length - 1; i++) {
                const step = line[i];
                if (this.isValid(step.col, step.row)) {
                    const stepTile = this.getTile(step.col, step.row);
                    if (stepTile.isBarricade) {
                        if (!currentlyInBarricade) {
                            barricadeGroupsBypassed++;
                            currentlyInBarricade = true;
                        }

                        if (u.type === 'observation' && barricadeGroupsBypassed <= 1) {
                            continue; // Bypasses the very first contiguous barricade mass it encounters (which is its own wall)
                        }
                        blocked = true;
                        break;
                    } else {
                        currentlyInBarricade = false;
                    }
                }
            }
            if (!blocked) {
                return true; // Fast exit if we establish line of sight from at least one unit
            }
        }

        return false;
    }

    getAllUnits(team) {
        let list = [];
        for (let col = 0; col < this.cols; col++) {
            for (let row = 0; row < this.rows; row++) {
                const t = this.getTile(col, row);
                if (t && t.unit && t.unit.team === team) {
                    list.push({ col, row, unit: t.unit });
                }
            }
        }
        return list;
    }

    invalidateOverlayCache() {
        // Obsolete (Hovers compute locally)
    }

    getUnitVision(col, row) {
        let spot = new Set();
        let inspect = new Set();
        let centerTile = this.getTile(col, row);
        if (!centerTile || !centerTile.unit) return { spot, inspect };

        let u = centerTile.unit;
        let viewRange = this.config.maxSpeed + 2;
        const isObservation = u.type === 'observation';

        for (let c = 0; c < this.cols; c++) {
            for (let r = 0; r < this.rows; r++) {
                if (c === col && r === row) continue;

                const line = hexMath.hexLine(col, row, c, r);
                let targetDist = hexMath.offsetDistance(col, row, c, r);
                let blocked = false;
                let barricadeGroupsBypassed = 0;
                let currentlyInBarricade = false;
                // Exclude last tile in the loop since we want to see what is ON it even if barricade
                for (let i = 0; i < line.length - 1; i++) {
                    const stepCol = line[i].col;
                    const stepRow = line[i].row;
                    if (this.isValid(stepCol, stepRow)) {
                        if (this.getTile(stepCol, stepRow).isBarricade) {
                            if (!currentlyInBarricade) {
                                barricadeGroupsBypassed++;
                                currentlyInBarricade = true;
                            }

                            if (isObservation && barricadeGroupsBypassed <= 1) {
                                continue;
                            }
                            blocked = true;
                            break;
                        } else {
                            currentlyInBarricade = false;
                        }
                    }
                }

                if (!blocked) {
                    spot.add(`${c},${r}`);
                    if (hexMath.offsetDistance(c, r, col, row) <= viewRange) {
                        inspect.add(`${c},${r}`);
                    }
                }
            }
        }
        return { spot, inspect, team: u.team };
    }

    checkWinConditions() {
        if (this.winner) return;

        let blueFlagCount = 0;
        let redFlagCount = 0;

        let bInvaded = false;
        let rInvaded = false;

        // Scan board
        for (let col = 0; col < this.cols; col++) {
            for (let row = 0; row < this.rows; row++) {
                const u = this.getTile(col, row).unit;
                if (!u) continue;

                if (u.isFlag) {
                    if (u.team === 'BLUE') blueFlagCount++;
                    if (u.team === 'RED') redFlagCount++;
                }

                if (this.type === 'INVADE') {
                    if (u.team === 'BLUE' && col === this.cols - 1) bInvaded = true;
                    if (u.team === 'RED' && col === 0) rInvaded = true;
                } else if (this.type === 'PLANT') {
                    if (u.team === 'BLUE' && u.isFlag && col === this.cols - 1) bInvaded = true;
                    if (u.team === 'RED' && u.isFlag && col === 0) rInvaded = true;
                }
            }
        }
        if (bInvaded) this.setWinner('BLUE', `${this.blueName} successfully invaded the opponent's zone!`);
        if (rInvaded) this.setWinner('RED', `${this.redName} successfully invaded the opponent's zone!`);
    }

    setWinner(team, reason) {
        this.winner = team;
        this.gameFinished = true;
        const winName = team === 'BLUE' ? this.blueName : this.redName;
        this.logSystem(`GAME OVER. ${winName} wins! ${reason}`);
        this.saveSnapshot();
        if (this.onWinner) this.onWinner(team, reason);
    }
}


// --- input.js ---
// js/input.js


class InputController {
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


// --- render.js ---
// js/render.js


class RenderEngine {
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

    clearMoveAnimations() {
        for (let a of this.moveAnimations) {
            if (a.physicalBoardTarget) {
                a.physicalBoardTarget.isAnimating = false;
            }
        }
        this.moveAnimations = [];
    }

    draw() {
        this.drawLoop();
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

        const isAIHeatmapDebug = (this.game.ui && this.game.ui.showAIHeatmap);

        // Line of Sight Mechanic Check (bypassed in AI heatmap debug mode)
        // Totally skip rendering enemy if they are completely hidden by barricades
        if (!isAIHeatmapDebug && unit.team !== perspective) {
            if (!this.game.canSeeUnit(col, row, perspective)) {
                return; // Skip rendering entirely
            }
        }
        let hideStats = isAIHeatmapDebug ? false : this.game.getFogOfWar(col, row, perspective, unit);

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

    getScoreHeatmapColor(val, maxPos = 1000, maxNeg = 1000) {
        if (!val || val === 0) {
            return 'rgba(0, 0, 0, 0.2)';
        }

        if (val > 0) {
            // Positive numbers: shades of green (soft green for low positive -> bright green for high positive)
            const ref = maxPos > 0 ? maxPos : 1000;
            const t = Math.min(1, Math.max(0.08, Math.pow(Math.min(val, ref) / ref, 0.6)));
            const r = Math.round(52 - 32 * t);
            const g = Math.round(190 + 55 * t);
            const b = Math.round(150 - 60 * t);
            const a = (0.22 + 0.53 * t).toFixed(3);
            return `rgba(${r}, ${g}, ${b}, ${a})`;
        } else {
            // Negative numbers: shades of red (soft red for low negative -> bright red for very negative)
            const ref = maxNeg > 0 ? maxNeg : 1000;
            const absVal = Math.abs(val);
            const t = Math.min(1, Math.max(0.08, Math.pow(Math.min(absVal, ref) / ref, 0.6)));
            const r = Math.round(220 + 35 * t);
            const g = Math.round(90 * (1 - t));
            const b = Math.round(90 * (1 - t));
            const a = (0.22 + 0.55 * t).toFixed(3);
            return `rgba(${r}, ${g}, ${b}, ${a})`;
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

        // Dynamically compute UX Threat Map Overlays natively via Asymmetric HUD configuration
        let showRedMove = false;
        let showBlueMove = false;

        // In AI and Online modes, persistently use the local human player's viewpoint and toggles
        let viewerTeam = (this.game.gameMode === 'AI' || this.game.gameMode === 'ONLINE') ? (this.game.localTeam || 'BLUE') : this.game.activeTeam;
        let prefix = viewerTeam.toLowerCase();
        let bR = document.getElementById(`chk-${prefix}-cfg-red`);
        let bB = document.getElementById(`chk-${prefix}-cfg-blue`);
        showRedMove = bR ? bR.checked : false;
        showBlueMove = bB ? bB.checked : false;

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

                    let isRed = u.team === 'RED' || u.player === 'RED';
                    if (isRed && !showRedMove) continue;
                    if (!isRed && !showBlueMove) continue;

                    // Calculate unit visibility strictly from the viewer's (human player's) perspective
                    let isCompletelyHidden = (u.team !== viewerTeam && u.player !== viewerTeam) && !this.game.canSeeUnit(cols, rows, viewerTeam);
                    if (isCompletelyHidden) continue;

                    let hideStats = this.game.getFogOfWar(cols, rows, viewerTeam, u);
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

        const isAIHeatmapDebug = (this.game.ui && this.game.ui.showAIHeatmap);

        let aiTreeKeys = null;
        if (this.game.ui && this.game.ui.showAIActionTree && this.game.aiActionTreeCache) {
            aiTreeKeys = this.game.aiActionTreeCache.map(c => `${c.col},${c.row}`);
        }

        let heatmapMaxPos = 1000;
        let heatmapMaxNeg = 1000;
        if (this.game.ui && this.game.ui.showAIHeatmap && this.game.aiHeatmapCache) {
            let posVals = this.game.aiHeatmapCache.map(h => h.val).filter(v => v > 0 && v < 500000);
            let negVals = this.game.aiHeatmapCache.map(h => h.val).filter(v => v < 0 && v > -500000);
            if (posVals.length > 0) heatmapMaxPos = Math.max(...posVals);
            if (negVals.length > 0) heatmapMaxNeg = Math.max(...negVals.map(v => Math.abs(v)));
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

                let hm = null;
                if (this.game.ui && this.game.ui.showAIHeatmap && this.game.aiHeatmapCache && !tile.isBarricade) {
                    hm = this.game.aiHeatmapCache.find(h => h.col === col && h.row === row);
                    if (hm && hm.val !== null && hm.val !== undefined) {
                        fill = this.getScoreHeatmapColor(hm.val, heatmapMaxPos, heatmapMaxNeg);
                    }
                } else if (this.game.ui && this.game.ui.showAIActionTree && this.game.aiActionTreeCache) {
                    let ev = this.game.aiActionTreeCache.find(e => e.col === col && e.row === row);
                    if (ev) {
                        fill = this.getThreatColor(ev.norm);
                    }
                }
                this.drawHex(pt.x, pt.y, this.hexRadius - 1, fill, stroke, lineWidth);

                // Unreachable tile dark overlay: 90% black overlay on top of tiles unreachable by the AI bot
                if (hm && !hm.isBarricade && !hm.botReachable) {
                    this.drawHex(pt.x, pt.y, this.hexRadius - 1, 'rgba(0, 0, 0, 0.9)', stroke, lineWidth);
                }

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

                if (baseUnit) {
                    const isCurrentlyAnimating = !isAIHeatmapDebug && this.moveAnimations.some(a => a.physicalBoardTarget === baseUnit);
                    if (!isCurrentlyAnimating) {
                        baseUnit.isAnimating = false;
                        this.drawUnit(pt.x, pt.y, col, row, baseUnit);
                    }
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
        if (!isAIHeatmapDebug) {
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
        }

        // --- DRAW AI OVERLAY NUMBERS ---
        if (this.game.ui && this.game.ui.showAIActionTree && this.game.aiActionTreeCache) {
            let evals = this.game.aiActionTreeCache;
            let maxVal = evals.length > 0 ? Math.max(...evals.map(e => e.val)) : null;

            for (let ev of evals) {
                let targetPt = hexMath.hexToPixel(ev.col, ev.row, this.hexRadius, this.ox, this.oy);
                let roundedVal = Math.round(ev.val);
                let scoreTxt = (roundedVal > 0 ? '+' : '') + roundedVal.toLocaleString();

                let isMax = ev.val === maxVal;
                this.ctx.font = (isMax ? 'bold 10px' : '10px') + ' Inter, sans-serif';
                this.ctx.fillStyle = roundedVal > 0 ? '#86efac' : '#fca5a5';
                this.ctx.shadowColor = 'black';
                this.ctx.shadowBlur = 4;
                this.ctx.textAlign = 'center';
                this.ctx.fillText(scoreTxt, targetPt.x, targetPt.y + 4);
                this.ctx.shadowBlur = 0;
            }
        } else if (this.game.ui && this.game.ui.showAIHeatmap && this.game.aiHeatmapCache) {
            let evals = this.game.aiHeatmapCache;
            let reachableVals = evals
                .filter(e => e.botReachable && !e.isBarricade && e.val !== null && e.val !== undefined && e.val < 500000)
                .map(e => e.val);
            let maxVal = reachableVals.length > 0 ? Math.max(...reachableVals) : null;

            for (let ev of evals) {
                if (ev.isBarricade || ev.val === null || ev.val === undefined) continue;
                let tile = this.game.getTile(ev.col, ev.row);
                if (tile && tile.isBarricade) continue;

                let targetPt = hexMath.hexToPixel(ev.col, ev.row, this.hexRadius, this.ox, this.oy);
                let roundedVal = Math.round(ev.val);
                if (roundedVal === 0) continue;
                let scoreTxt = (roundedVal > 0 ? '+' : '') + roundedVal.toLocaleString();

                let hasUnit = !!(tile && (tile.unit || tile.pendingDeathVisual));
                let textY = hasUnit ? (targetPt.y - this.hexRadius * 0.6) : (targetPt.y + 4);

                let isMax = (ev.botReachable && maxVal !== null && ev.val === maxVal);
                this.ctx.font = (isMax ? 'bold 10px' : '10px') + ' Inter, sans-serif';
                this.ctx.fillStyle = roundedVal > 0 ? '#86efac' : '#fca5a5';
                this.ctx.shadowColor = 'black';
                this.ctx.shadowBlur = 4;
                this.ctx.textAlign = 'center';
                this.ctx.fillText(scoreTxt, targetPt.x, textY);
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


// --- ui.js ---
// js/ui.js


class UIManager {
    constructor(game, render, input) {
        this.game = game;
        this.render = render;
        if (this.render) this.render.ui = this;
        this.input = input;

        this.currentAction = null; // 'MOVE', 'WAITING_MOVE'

        this.bindEvents();
        this.updateHUD();

        this.isTimerMuted = false;

        this.game.onLog = () => this.refreshLog();
        this.game.onCombat = (c, r, instant = false) => {
            if (instant) {
                this.render.addExplosion(c, r);
            } else {
                setTimeout(() => this.render.addExplosion(c, r), 500);
            }
        };
        this.game.onStateChange = () => {
            this.currentAction = null;
            this.game.selectedTile = null;
            this.render.validPath = null;
            this.closeContextMenu();
            this.updateHUD();
        };
        this.game.onWinner = (team, reason) => this.showVictory(team, reason);
    }

    bindEvents() {
        this.btnEndTurn = document.getElementById('btn-end-turn');
        this.btnEndTurn.addEventListener('click', () => {
            if (this.game.gameMode === 'ONLINE' && this.game.localTeam !== this.game.activeTeam) return;
            if (this.game.gameMode === 'AI' && this.game.activeTeam === 'RED') return;
            this.game.endTurn();
        });

        this.btnToggleLog = document.getElementById('btn-toggle-log');
        this.floatingLog = document.getElementById('floating-log');

        if (this.btnToggleLog && this.floatingLog) {
            this.btnToggleLog.addEventListener('click', () => {
                this.floatingLog.classList.toggle('hidden');
            });
        }

        this.btnMuteTimer = document.getElementById('btn-mute-timer');
        if (this.btnMuteTimer) {
            this.btnMuteTimer.addEventListener('click', () => {
                this.isTimerMuted = !this.isTimerMuted;
                this.btnMuteTimer.innerText = this.isTimerMuted ? '🔇' : '🔊';
            });
        }

        // Help Modal interactions
        const btnHelp = document.getElementById('btn-help');
        const helpPanel = document.getElementById('help-panel');
        const btnCloseHelp = document.getElementById('btn-close-help');
        const helpOverlay = document.getElementById('help-overlay');
        if (btnHelp && helpPanel) {
            btnHelp.addEventListener('click', () => {
                helpPanel.classList.toggle('hidden');
                if (helpOverlay) helpOverlay.classList.toggle('hidden');
            });

            const closePanels = () => {
                helpPanel.classList.add('hidden');
                if (helpOverlay) helpOverlay.classList.add('hidden');
            };

            if (btnCloseHelp) {
                btnCloseHelp.addEventListener('click', closePanels);
            }
            if (helpOverlay) {
                helpOverlay.addEventListener('click', closePanels);
            }
        }

        // Map AI insight visual flags natively
        this.showAIActionTree = false;
        this.showAIHeatmap = false;
        this.aiHeatmapTeam = null;

        const btnAiTreeBlue = document.getElementById('btn-blue-action-tree');
        if (btnAiTreeBlue) {
            btnAiTreeBlue.addEventListener('click', () => {
                this.toggleAIHeatmap('BLUE');
            });
        }

        const btnAiTreeRed = document.getElementById('btn-red-action-tree');
        if (btnAiTreeRed) {
            btnAiTreeRed.addEventListener('click', () => {
                this.toggleAIHeatmap('RED');
            });
        }

        const btnBlueAiPrev = document.getElementById('btn-blue-ai-prev');
        const btnBlueAiNext = document.getElementById('btn-blue-ai-next');
        if (btnBlueAiPrev) btnBlueAiPrev.addEventListener('click', () => this.stepAITurn('BLUE', -1));
        if (btnBlueAiNext) btnBlueAiNext.addEventListener('click', () => this.stepAITurn('BLUE', 1));

        const btnRedAiPrev = document.getElementById('btn-red-ai-prev');
        const btnRedAiNext = document.getElementById('btn-red-ai-next');
        if (btnRedAiPrev) btnRedAiPrev.addEventListener('click', () => this.stepAITurn('RED', -1));
        if (btnRedAiNext) btnRedAiNext.addEventListener('click', () => this.stepAITurn('RED', 1));

        this.initTeachAI();

        // History Controls
        document.getElementById('btn-hist-prev').addEventListener('click', () => {
            let idx = this.game.historyIndex - 1;
            if (idx >= 0) {
                this.game.loadSnapshot(idx);
                this.updateHUD();
                this.resetActiveState();
                this.game.logSystem(`Viewing Turn History Snapshot: ${idx + 1}/${this.game.history.length}`);
            }
        });
        document.getElementById('btn-hist-next').addEventListener('click', () => {
            let idx = this.game.historyIndex + 1;
            if (idx < this.game.history.length) {
                this.game.loadSnapshot(idx);
                this.updateHUD();
                this.resetActiveState();
                if (idx === this.game.history.length - 1) {
                    this.game.logSystem("Returned to LIVE state.");
                } else {
                    this.game.logSystem(`Viewing Turn History Snapshot: ${idx + 1}/${this.game.history.length}`);
                }
            }
        });
        const btnClock = document.getElementById('btn-clock');
        if (btnClock) {
            btnClock.addEventListener('click', () => {
                this.timeMachineOpen = !this.timeMachineOpen;
                this.updateHUD();
            });
        }

        document.getElementById('btn-hist-live').addEventListener('click', () => {
            this.timeMachineOpen = false;
            if (this.game.historyIndex !== this.game.history.length - 1) {
                this.game.loadSnapshot(this.game.history.length - 1);
                this.resetActiveState();
                this.game.logSystem("Returned to LIVE state.");
            }
            this.updateHUD();
        });
        const btnExitGame = document.getElementById('btn-exit-game');
        if (btnExitGame) btnExitGame.onclick = () => location.reload();

        const btnRestart = document.getElementById('btn-restart-game');
        if (btnRestart) btnRestart.onclick = () => { if (window.restartCurrentGame) window.restartCurrentGame(this.game.config); };

        // Context Menu Elements
        this.contextMenu = document.getElementById('context-menu');
        this.contextOptions = document.getElementById('context-options');
        this.contextDeployPanel = document.getElementById('context-deploy-panel');
        this.btnCloseContext = document.getElementById('btn-close-context');
        this.unitTooltip = document.getElementById('unit-tooltip');

        this.btnCloseContext.addEventListener('click', () => {
            this.closeContextMenu();
            this.game.selectedTile = null;
            this.render.validPath = null;
            this.currentAction = null;
        });

        // 1-Click Stat Matrix initialization is dynamic per deployment click        
        this.input.onHexClick = (col, row, key, e) => this.handleHexClick(col, row, key, e);
        this.input.onHexRightClick = (col, row, key, e) => this.handleHexRightClick(col, row, key, e);

        const origHover = this.input.handleHover.bind(this.input);
        this.input.handleHover = (e) => {
            origHover(e);
            this.updatePathPreview();
            this.updateTooltip(e);
        };

        this.barricadeOffset = undefined;
        window.addEventListener('wheel', (e) => {
            if (this.currentAction === 'WAITING_BARRICADE' && this.game.selectedTile) {
                e.preventDefault();
                e.stopPropagation(); // Prevent input.js from zooming the canvas

                const s = this.game.selectedTile.split(',');
                const col = parseInt(s[0]);
                const row = parseInt(s[1]);
                const unit = this.game.getTile(col, row).unit;
                if (!unit) return;

                const length = Math.max(1, unit.strength || 1);
                if (this.barricadeOffset === undefined) {
                    this.barricadeOffset = Math.floor(length / 2);
                }

                if (e.deltaY < 0) {
                    this.barricadeOffset = Math.min(length - 1, this.barricadeOffset + 1);
                } else if (e.deltaY > 0) {
                    this.barricadeOffset = Math.max(0, this.barricadeOffset - 1);
                }

                const barricadeCheck = this.game.canBarricade(col, row, this.barricadeOffset);
                if (barricadeCheck.valid) {
                    this.render.previewBarricade = this.game.getBarricadePreview(col, row, this.barricadeOffset);
                }
            }
        }, { capture: true });
    }

    updateTooltip(e) {
        this.render.hoverHexes = null;
        this.render.visionHexes = null;
        const hover = this.render.hoveredHex;
        if (!hover) {
            if (this.unitTooltip) this.unitTooltip.classList.add('hidden');
            return;
        }

        const spl = hover.split(',');
        const col = parseInt(spl[0]);
        const row = parseInt(spl[1]);
        const tile = this.game.getTile(col, row);

        if (tile && tile.unit && !tile.unit.isFlag) {
            // Respect fog of war
            let perspective = this.game.activeTeam;
            if (this.game.gameMode === 'ONLINE' || this.game.gameMode === 'AI') {
                perspective = this.game.localTeam;
            }

            const isAIHeatmapDebug = this.showAIHeatmap;

            // Absolutely hide completely if blocked by barricade line-of-sight (bypassed in AI heatmap debug mode)
            if (!isAIHeatmapDebug && tile.unit.team !== perspective && tile.unit.type !== 'observation' && !this.game.canSeeUnit(col, row, perspective)) {
                if (this.unitTooltip) this.unitTooltip.classList.add('hidden');
                return;
            }

            let hideStats = isAIHeatmapDebug ? false : this.game.getFogOfWar(col, row, perspective);

            if (tile.unit.exposedCounter && tile.unit.exposedCounter > 0) {
                hideStats = false;
            }

            if (!this.game.selectedTile && !this._contextTarget) {
                this.render.visionHexes = this.game.getUnitVision(col, row);
            }

            if (!hideStats) {
                if (!this.game.selectedTile && !this._contextTarget) {
                    this.render.hoverHexes = this.game.getReachableHexes(col, row, tile.unit.team, tile.unit.speed);
                    this.render.hoverHexesColor = tile.unit.team === 'BLUE' ? 'rgba(59, 130, 246, 0.120)' : 'rgba(239, 68, 68, 0.120)';
                }

                document.getElementById('tt-str').innerText = tile.unit.strength;
                document.getElementById('tt-spd').innerText = tile.unit.speed;
                this.unitTooltip.classList.remove('hidden');

                // Position relative to local canvas bounds
                const canvasEl = document.getElementById('gameCanvas');
                const rect = canvasEl.getBoundingClientRect();
                this.unitTooltip.style.left = `${e.clientX - rect.left}px`;
                this.unitTooltip.style.top = `${e.clientY - rect.top - 20}px`;
                return;
            }
        }

        if (this.unitTooltip) this.unitTooltip.classList.add('hidden');
    }

    updatePopupTracking() {
        if (!this.contextMenu.classList.contains('hidden') && this._contextTarget) {
            const isDeploy = !this.contextDeployPanel.classList.contains('hidden');
            if (!isDeploy) return;

            const centerRow = (this.game.rows - 1) / 2;

            const isBlue = this._contextTarget.col < this.game.cols / 2;
            let targetCol = isBlue ? 1 : this.game.cols - 2;

            const pt = hexMath.hexToPixel(targetCol, centerRow, this.render.hexRadius);

            // Apply camera offsets
            const screenX = pt.x * this.render.camera.zoom + this.render.camera.x;
            const screenY = pt.y * this.render.camera.zoom + this.render.camera.y;

            const canvas = document.getElementById('gameCanvas');
            const rect = canvas.getBoundingClientRect();

            const scaleX = rect.width / canvas.width;
            const scaleY = rect.height / canvas.height;

            let cssX = screenX * scaleX;
            let cssY = screenY * scaleY;

            this.contextMenu.style.left = cssX + 'px';
            this.contextMenu.style.top = cssY + 'px';

            if (isBlue) {
                this.contextMenu.style.transform = 'translate(0%, -50%)';
            } else {
                this.contextMenu.style.transform = 'translate(-100%, -50%)';
            }
        }
    }

    playTickSound() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        // Mechanical tick simulation
        osc.type = 'square';
        osc.frequency.setValueAtTime(1000, this.audioCtx.currentTime);

        // Extremely short attack and decay (20ms)
        gain.gain.setValueAtTime(0.5, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.02);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.03);
    }

    updateHUDTimer(timeRemaining) {
        const timerDiv = document.getElementById('turn-timer');
        const muteBtn = document.getElementById('btn-mute-timer');
        if (!timerDiv) return;

        if (this.game.timerDuration > 0) {
            timerDiv.classList.remove('hidden');
            if (muteBtn) muteBtn.style.display = 'flex';

            timerDiv.style.color = timeRemaining <= 5 ? '#ef4444' : 'white';
            timerDiv.innerText = `${timeRemaining}s`;

            if (timeRemaining > 0 && timeRemaining <= 3 && !this.isTimerMuted) {
                const isMyTurn = this.game.activeTeam === this.game.localTeam || this.game.gameMode === 'LOCAL';
                if (isMyTurn) {
                    this.playTickSound();
                }
            }
        } else {
            timerDiv.classList.add('hidden');
            if (muteBtn) muteBtn.style.display = 'none';
        }
    }

    updateHUD() {
        if (!this.topPanelInitialized && this.game.config) {
            this.topPanelInitialized = true;

            // Mode Value and Tooltip
            let modeEl = document.getElementById('info-mode');
            if (this.game.config.type === 'PLANT') {
                modeEl.innerText = 'Plant Flag';
                modeEl.title = "First player to reach the enemy home with a FLAG UNIT wins.";
            } else {
                modeEl.innerText = 'Invade';
                modeEl.title = "First player to reach the enemy home with ANY UNIT wins.";
            }
            modeEl.style.cursor = 'help';

            // Visibility Value and Tooltip
            let visEl = document.getElementById('info-vis');
            let visData = {
                'HIDDEN': { text: 'Your Units', title: 'Speed and Power are visible only for your units.' },
                'NEARBY': { text: 'Nearby Units', title: 'Speed and Power are visible for units within move range + 1.' },
                'VISIBLE': { text: 'All Units', title: 'Speed and Power are visible for all units.' }
            };
            let v = visData[this.game.config.mode] || { text: 'Unknown', title: '' };
            visEl.innerText = v.text;
            visEl.title = v.title;
            visEl.style.cursor = 'help';

            // Power Value and Tooltip
            let pwrEl = document.getElementById('info-power');
            if (this.game.config.powerMode === 'DEPLETING') {
                pwrEl.innerText = 'Depleting';
                pwrEl.title = "Units lose 1 Power point after each fight.";
            } else {
                pwrEl.innerText = 'Constant';
                pwrEl.title = "Units keep their Power value for the whole game.";
            }
            pwrEl.style.cursor = 'help';
        }

        const bNamePlate = document.getElementById('blue-name-plate');
        if (bNamePlate) {
            bNamePlate.innerText = this.game.blueName;
            bNamePlate.style.fontSize = this.game.blueName.length > 10 ? '1.1rem' : '1.5rem';
        }

        const rNamePlate = document.getElementById('red-name-plate');
        if (rNamePlate) {
            rNamePlate.innerText = this.game.redName;
            rNamePlate.style.fontSize = this.game.redName.length > 10 ? '1.1rem' : '1.5rem';
        }

        const bCredits = document.getElementById('blue-credits');
        const rCredits = document.getElementById('red-credits');
        if (bCredits) bCredits.innerText = this.game.credits['BLUE'];
        if (rCredits) rCredits.innerText = this.game.credits['RED'];

        const goalText = document.getElementById('help-goal-text');
        if (goalText && this.game.config) {
            const isPlant = this.game.config.type === 'PLANT';
            goalText.innerText = isPlant ?
                "Be the first player to move a Flag Unit into the enemy base." :
                "Be the first player to move a unit into the enemy base.";

            const flagSection = document.getElementById('help-section-flag');
            if (flagSection) {
                flagSection.style.display = isPlant ? 'block' : 'none';
            }
        }

        const bluePanel = document.querySelector('.team-panel.blue-team');
        const redPanel = document.querySelector('.team-panel.red-team');
        const turnSidebar = document.getElementById('turn-action-sidebar');
        const bigText = document.getElementById('big-turn-text');
        const skipBtn = document.getElementById('btn-end-turn');

        if (this.game.activeTeam === 'BLUE') {
            bluePanel.classList.add('active-turn');
            redPanel.classList.remove('active-turn');

            const leftBox = document.getElementById('left-turn-container');
            if (leftBox) leftBox.appendChild(turnSidebar);

            bigText.style.color = '#3b82f6';
            bigText.style.color = '#3b82f6';
            skipBtn.classList.remove('btn-red');
        } else {
            bluePanel.classList.remove('active-turn');
            redPanel.classList.add('active-turn');

            const rightBox = document.getElementById('right-turn-container');
            if (rightBox) rightBox.appendChild(turnSidebar);

            bigText.style.color = '#ef4444';
            bigText.style.color = '#ef4444';
            skipBtn.classList.add('btn-red');
        }

        // When playing against a bot, the bot player should not have a "skip Action" button
        const isCurrentPlayerBot = (this.game.gameMode === 'AI' && this.game.activeTeam !== this.game.localTeam);
        skipBtn.style.display = isCurrentPlayerBot ? 'none' : 'block';

        // When playing vs computer, remove the two hexagon (red/blue) buttons on the bot AI's player panel
        const isRedBot = (this.game.gameMode === 'AI' && (this.game.localTeam === 'BLUE' || !this.game.localTeam));
        const redHexToggleGroup = document.getElementById('red-hex-toggle-group');
        if (redHexToggleGroup) {
            redHexToggleGroup.style.display = isRedBot ? 'none' : 'flex';
        }
        const blueHexToggleGroup = document.getElementById('blue-hex-toggle-group');
        if (blueHexToggleGroup) {
            blueHexToggleGroup.style.display = 'flex';
        }

        if (this.game.winner && !this.historyHasWon) {
            this.historyHasWon = true;
            this.timeMachineOpen = true;
        }

        const hist = document.getElementById('history-controls');
        const clock = document.getElementById('btn-clock');
        if (hist && clock) {
            hist.style.display = this.timeMachineOpen ? 'flex' : 'none';
        }

        // Show robot button ONLY for computer player, hide under human player
        const isBlueAI = (this.game.gameMode === 'AI' && this.game.localTeam === 'RED') || (this.game.aiBot && this.game.aiTeam === 'BLUE');
        const isRedAI = (this.game.gameMode === 'AI' && (this.game.localTeam === 'BLUE' || !this.game.localTeam)) || (this.game.aiBot && this.game.aiTeam === 'RED');

        const blueAiContainer = document.getElementById('blue-ai-container');
        const redAiContainer = document.getElementById('red-ai-container');
        if (blueAiContainer) blueAiContainer.style.display = isBlueAI ? 'flex' : 'none';
        if (redAiContainer) redAiContainer.style.display = isRedAI ? 'flex' : 'none';

        if (this.showAIHeatmap) {
            this.updateAIHeatmapForCurrentSnapshot();
        }
        this.updateAIHeatmapUI();
    }

    refreshLog() {
        const c = document.getElementById('action-log');
        c.innerHTML = '';
        const limit = Math.max(0, this.game.logs.length - 50);
        for (let i = limit; i < this.game.logs.length; i++) {
            const l = this.game.logs[i];
            const div = document.createElement('div');
            div.className = `log-entry log-entry-${l.type} ${l.isCombat ? 'log-entry-combat' : ''}`;
            div.innerText = l.text;
            c.appendChild(div);
        }
        c.scrollTop = c.scrollHeight;
    }

    closeContextMenu() {
        this.contextMenu.classList.add('hidden');
        this.contextOptions.innerHTML = '';
        this.contextDeployPanel.classList.add('hidden');
        this._contextTarget = null;
    }

    openContextMenu(x, y, col, row, options, customOpts = {}) {
        this.closeContextMenu();
        this._contextTarget = { col, row };

        const headerText = this.contextMenu.querySelector('h4');
        const closeBtn = document.getElementById('btn-close-context');

        if (customOpts.isBarricade) {
            headerText.innerText = 'Build a Barricade';
            closeBtn.style.display = 'none';

            this.contextOptions.innerHTML = `
                <div style="text-align: center; color: #ccc; margin-bottom: 20px; font-size: 0.95rem;">
                    <div style="color: #60a5fa; font-weight: bold; margin-bottom: 10px;">Cost: ${customOpts.cost} credits</div>
                    <div style="font-size: 0.85rem; line-height: 1.5;">
                        <span style="font-size: 1.2rem; color: #10b981;">⇕</span><br>
                        Scroll mouse to position<br>barricade
                    </div>
                </div>
                <div style="display: flex; gap: 10px; justify-content: center;">
                    <button id="btn-barricade-build" class="btn-action" style="background: rgba(16, 185, 129, 0.2); border-color: rgba(16, 185, 129, 0.4); color: #10b981;">Build</button>
                    <button id="btn-barricade-cancel" class="btn-action" style="background: rgba(239, 68, 68, 0.2); border-color: rgba(239, 68, 68, 0.4); color: #ef4444;">Cancel</button>
                </div>
            `;

            document.getElementById('btn-barricade-build').addEventListener('click', customOpts.onConfirm);
            document.getElementById('btn-barricade-cancel').addEventListener('click', () => {
                this.resetActiveState();
                this.updateHUD();
            });
        } else {
            headerText.innerText = 'Deploy Unit';
            closeBtn.style.display = 'block';

            // Build buttons first to populate DOM
            options.forEach(opt => {
                const btn = document.createElement('button');
                btn.className = 'btn-action';
                btn.innerText = opt.label;
                btn.addEventListener('click', opt.onClick);
                this.contextOptions.appendChild(btn);
            });
        }

        this.contextMenu.classList.remove('hidden');

        const rect = this.canvas.getBoundingClientRect();

        const estMaxHeight = customOpts.isBarricade ? 180 : 450;
        const estMaxWidth = customOpts.isBarricade ? 200 : 270;

        let localX = x - rect.left;
        let localY = y - rect.top;

        let safeX = localX > rect.width / 2 ? localX - estMaxWidth - 10 : localX + 10;
        let safeY = localY > rect.height / 2 ? localY - estMaxHeight - 10 : localY + 10;

        if (safeX < 10) safeX = 10;
        if (safeY < 10) safeY = 10;

        this.contextMenu.style.left = `${safeX}px`;
        this.contextMenu.style.top = `${safeY}px`;
        this.contextMenu.style.transform = 'none';
    }

    resetActiveState() {
        this.closeContextMenu();
        this.game.selectedTile = null;
        this.render.validPath = null;
        this.render.highlightHexes = null;
        this.render.previewBarricade = null;
        this.barricadeOffset = undefined;
        this.currentAction = null;
    }

    handleHexClick(col, row, key, e) {
        if (this.game.winner) return;

        // Teach AI: intercept tile click to insert tile coordinates and score
        if (this.teachAIPanelOpen && this.isAwaitingTileMention()) {
            this.insertTileMention(col, row);
            return;
        }

        if (this.game.historyIndex !== this.game.history.length - 1) {
            this.game.logSystem("Viewing history. Return to Live state to take actions.");
            return;
        }

        if (this.game.gameMode === 'ONLINE' && this.game.activeTeam !== this.game.localTeam) return;
        if (this.game.gameMode === 'AI' && this.game.activeTeam === 'RED') return;

        if (this.game.gameMode === 'ONLINE' && this.game.activeTeam !== this.game.localTeam) return;
        if (this.game.gameMode === 'AI' && this.game.activeTeam === 'RED') return;

        // If we are currently building a path
        if (this.currentAction === 'WAITING_MOVE' && this.game.selectedTile) {
            const s = this.game.selectedTile.split(',');
            const sC = parseInt(s[0]);
            const sR = parseInt(s[1]);

            if (this.game.selectedTile !== key) {
                this.game.moveUnit(sC, sR, col, row);
            }
            this.resetActiveState();
            return;
        }

        this.resetActiveState();

        const tile = this.game.getTile(col, row);
        if (tile.unit && tile.unit.team === this.game.activeTeam) {
            if (this.game.actionUsed) {
                this.game.logSystem("You have already used your action this turn.");
                return;
            }

            this.currentAction = 'WAITING_MOVE';
            this.game.selectedTile = key;
            this.render.hoverHexes = null;
            this.render.visionHexes = null;
            this.render.highlightHexes = this.game.getReachableHexes(col, row, this.game.activeTeam, tile.unit.speed);
            this.render.highlightHexesColor = this.game.activeTeam === 'BLUE' ? 'rgba(59, 130, 246, 0.120)' : 'rgba(239, 68, 68, 0.120)';
        } else if (!tile.unit && !tile.isBarricade) {
            // EMPTY TILE: check if it's our deploy baseline
            if ((this.game.activeTeam === 'BLUE' && col === 0) || (this.game.activeTeam === 'RED' && col === this.game.cols - 1)) {
                if (this.game.actionUsed && this.game.phase === 'MAIN') {
                    this.game.logSystem("You have already used your action this turn.");
                    return;
                }

                // Directly trigger Deploy Combat panel
                this.closeContextMenu();
                this._contextTarget = { col, row };

                this.contextMenu.classList.remove('hidden');
                this.contextDeployPanel.classList.remove('hidden');

                this.updatePopupTracking();

                this.buildDeployMatrix(false, this.game.config.maxStrength, this.game.config.maxSpeed, col, row, e);
            }
        }

        this.updateHUD();
    }

    buildDeployMatrix(isFlag, maxPower, maxSpeed, col, row, e) {
        const container = document.getElementById('stat-matrix');
        container.innerHTML = '';
        container.style.display = 'grid';
        container.style.gridTemplateColumns = `repeat(${maxSpeed}, 1fr)`;
        container.style.gap = '4px';

        for (let p = maxPower; p >= (isFlag ? 0 : 1); p--) {
            if (isFlag && p !== 0) continue;

            for (let s = 1; s <= maxSpeed; s++) {
                const btn = document.createElement('div');
                const cost = isFlag ? this.game.config.flagCost * s : p * s;
                btn.className = 'stat-matrix-node';

                const ratio = (cost - 1) / (Math.max(1, (maxPower * maxSpeed) - 1));
                const hue = isFlag ? 200 : (1 - Math.pow(ratio, 0.7)) * 120; // 200 is light blue for flags, or green/red scaling for units
                btn.style.backgroundColor = `hsla(${hue}, 80%, 40%, 0.6)`;
                btn.style.border = `1px solid hsla(${hue}, 80%, 60%, 0.5)`;
                btn.style.width = '26px';
                btn.style.height = '26px';
                btn.style.borderRadius = '5px';
                btn.style.cursor = 'pointer';
                btn.style.display = 'flex';
                btn.style.flexDirection = 'column';
                btn.style.alignItems = 'center';
                btn.style.justifyContent = 'center';
                btn.style.lineHeight = '1';
                btn.style.transition = 'all 0.15s ease-out';
                btn.style.userSelect = 'none';
                const currentCredits = this.game.credits[this.game.activeTeam];

                if (cost > currentCredits) {
                    btn.style.opacity = '0.3';
                    btn.style.cursor = 'not-allowed';
                }

                btn.innerHTML = ``;

                const sizeP = maxPower > 0 ? 0.4 + (p / maxPower) * 0.35 : 0;
                const sizeS = 0.4 + (s / maxSpeed) * 0.35;

                btn.addEventListener('mouseenter', () => {
                    document.getElementById('preview-cost').innerHTML = `Cost: ${cost}`;
                    document.getElementById('axis-speed-val').innerText = s;
                    document.getElementById('axis-power-val').innerText = isFlag ? '-' : p;
                    btn.style.transform = 'scale(1.15)';
                    btn.style.backgroundColor = `hsla(${hue}, 90%, 55%, 1)`;
                    btn.style.boxShadow = `0 0 10px hsla(${hue}, 80%, 50%, 0.6)`;
                    btn.style.zIndex = '10';

                    btn.innerHTML = `<b style="font-size:${sizeS}rem; color:#fff; line-height:1;">S${s}</b>` + (isFlag ? `` : `<b style="font-size:${sizeP}rem; color:#fff; line-height:1;">P${p}</b>`);
                });

                btn.addEventListener('mouseleave', () => {
                    document.getElementById('preview-cost').innerText = 'Cost: -';
                    document.getElementById('axis-speed-val').innerText = '-';
                    document.getElementById('axis-power-val').innerText = '-';
                    btn.style.transform = 'scale(1)';
                    btn.style.backgroundColor = `hsla(${hue}, 80%, 40%, 0.6)`;
                    btn.style.boxShadow = 'none';
                    btn.style.zIndex = '1';

                    btn.innerHTML = ``;
                });

                if (cost <= currentCredits) {
                    btn.addEventListener('click', () => {
                        this.game.deployUnit(this.game.activeTeam, isFlag ? 'flag' : 'combat', p, s, col, row);
                        this.resetActiveState();
                        this.updateHUD();
                        this.closeContextMenu();
                    });
                }

                container.appendChild(btn);
            }
        }
    }

    handleHexRightClick(col, row, key, e) {
        if (this.game.winner) return;
        if (this.game.historyIndex !== this.game.history.length - 1) {
            this.game.logSystem("Viewing history. Return to Live state to take actions.");
            return;
        }

        if (this.game.gameMode === 'ONLINE' && this.game.activeTeam !== this.game.localTeam) return;
        if (this.game.gameMode === 'AI' && this.game.activeTeam === 'RED') return;

        if (this.game.gameMode === 'ONLINE' && this.game.activeTeam !== this.game.localTeam) return;
        if (this.game.gameMode === 'AI' && this.game.activeTeam === 'RED') return;

        this.resetActiveState();

        const tile = this.game.getTile(col, row);
        if (tile.unit && tile.unit.team === this.game.activeTeam) {
            if (this.game.actionUsed) {
                this.game.logSystem("You have already used your action this turn.");
                return;
            }
            const barricadeCheck = this.game.canBarricade(col, row);
            if (barricadeCheck.valid) {
                this.currentAction = 'WAITING_BARRICADE'; // Must define state immediately so scroll captures it!
                this.game.selectedTile = key;
                const length = Math.max(1, tile.unit.strength || 1);
                this.barricadeOffset = Math.floor(length / 2); // initialize offset

                this.render.hoverHexes = null;
                this.render.previewBarricade = this.game.getBarricadePreview(col, row, this.barricadeOffset);

                const cost = this.game.config ? (this.game.config.barricadeCost || 10) : 10;
                this.openContextMenu(e.clientX, e.clientY, col, row, [], {
                    isBarricade: true,
                    cost: cost,
                    onConfirm: () => {
                        this.game.createBarricade(col, row, this.barricadeOffset);
                        this.resetActiveState();
                        this.updateHUD();
                    }
                });
            } else {
                this.game.logSystem(`Invalid Barricade: ${barricadeCheck.reason}`);
            }
        } else if (!tile.unit && !tile.isBarricade) {
            // Check if Empty tile is in our deploy baseline
            if ((this.game.activeTeam === 'BLUE' && col === 0) || (this.game.activeTeam === 'RED' && col === this.game.cols - 1)) {
                if (this.game.actionUsed && this.game.phase === 'MAIN') {
                    this.game.logSystem("You have already used your action this turn.");
                    return;
                }

                if (this.game.config && this.game.config.type === 'INVADE') {
                    this.game.logSystem("Flags cannot be deployed during an Invade mission.");
                    return;
                }

                this.closeContextMenu();
                this._contextTarget = { col, row };
                this.contextMenu.classList.remove('hidden');
                this.contextDeployPanel.classList.remove('hidden');

                this.updatePopupTracking();

                this.buildDeployMatrix(true, 0, this.game.config.maxSpeed, col, row, e);
            }
        }
    }

    updatePathPreview() {
        if (this.currentAction === 'WAITING_MOVE' && this.game.selectedTile && this.render.hoveredHex) {
            const s = this.game.selectedTile.split(',');
            const startCol = parseInt(s[0]);
            const startRow = parseInt(s[1]);

            const h = this.render.hoveredHex.split(',');
            const endCol = parseInt(h[0]);
            const endRow = parseInt(h[1]);

            const unit = this.game.getTile(startCol, startRow).unit;
            if (!unit || unit.team !== this.game.activeTeam) return;

            const path = this.game.findPath(startCol, startRow, endCol, endRow, unit.team, unit.speed);
            this.render.validPath = path || null;

            this.render.invalidMove = false;
            if (path) {
                const targetTile = this.game.getTile(endCol, endRow);
                if (targetTile.unit && targetTile.unit.team !== unit.team) {
                    if (unit.isFlag || (targetTile.unit.strength >= unit.strength && !targetTile.unit.isFlag)) {
                        this.render.invalidMove = true;
                    }
                }
            }
        } else {
            this.render.validPath = null;
        }
    }

    showVictory(team, reason) {
        document.getElementById('ui-layer').classList.remove('hidden');

        const modal = document.getElementById('victory-modal');
        modal.classList.remove('hidden');

        const title = document.getElementById('victory-title');
        title.innerText = `${team} has won the game!`;
        title.style.color = team === 'BLUE' ? '#60a5fa' : '#f87171';

        document.getElementById('victory-reason').innerText = reason;

        document.getElementById('btn-play-again').onclick = () => location.reload();

        const btnExitGame = document.getElementById('btn-exit-game');
        if (btnExitGame) btnExitGame.onclick = () => location.reload();

        const btnRestart = document.getElementById('btn-victory-restart');
        if (this.game.gameMode === 'ONLINE' && this.network && !this.network.isHost) {
            if (btnRestart) btnRestart.style.display = 'none';
        } else {
            if (btnRestart) {
                btnRestart.style.display = 'block';
                btnRestart.onclick = () => {
                    if (window.restartCurrentGame) {
                        window.restartCurrentGame(this.game.config);
                    }
                };
            }
        }

        document.getElementById('btn-review-game').onclick = () => {
            modal.classList.add('hidden');
            this.timeMachineOpen = true;
            this.updateHUD();
        };
    }

    toggleAIHeatmap(team) {
        if (this.render && typeof this.render.clearMoveAnimations === 'function') {
            this.render.clearMoveAnimations();
        }
        if (this.showAIHeatmap && this.aiHeatmapTeam === team) {
            // Turn off
            this.showAIHeatmap = false;
            this.aiHeatmapTeam = null;
            // Restore to live snapshot if we were reviewing past turns
            if (this.game.historyIndex !== this.game.history.length - 1) {
                this.game.loadSnapshot(this.game.history.length - 1);
                this.resetActiveState();
                this.game.logSystem("Returned to LIVE state.");
            }
        } else {
            // Turn on (or switch team)
            this.showAIHeatmap = true;
            this.aiHeatmapTeam = team;
            this.updateAIHeatmapForCurrentSnapshot();
        }
        this.updateAIHeatmapUI();
        if (this.render) this.render.draw();
    }

    updateAIHeatmapForCurrentSnapshot() {
        if (!this.showAIHeatmap || !this.game.aiBot) return;
        const team = this.aiHeatmapTeam || 'RED';
        this.game.aiHeatmapCache = this.game.aiBot.generateHeatmap(this.game.aiBot.cloneState(), team);
    }

    getAISnapshotIndices(team) {
        const indices = [];
        for (let i = 0; i < this.game.history.length; i++) {
            const snap = this.game.history[i];
            if (snap.activeTeam === team) {
                indices.push(i);
            }
        }
        return indices;
    }

    stepAITurn(team, direction) {
        const aiIndices = this.getAISnapshotIndices(team);
        if (aiIndices.length === 0) return;

        const currentIdx = this.game.historyIndex;
        let targetIdx = -1;

        if (direction < 0) {
            // Step backwards to previous AI turn
            for (let i = aiIndices.length - 1; i >= 0; i--) {
                if (aiIndices[i] < currentIdx) {
                    targetIdx = aiIndices[i];
                    break;
                }
            }
        } else {
            // Step forward to next AI turn
            for (let i = 0; i < aiIndices.length; i++) {
                if (aiIndices[i] > currentIdx) {
                    targetIdx = aiIndices[i];
                    break;
                }
            }
            // Allow stepping up to live state if no further AI turn snapshot
            if (targetIdx === -1 && currentIdx < this.game.history.length - 1) {
                targetIdx = this.game.history.length - 1;
            }
        }

        if (targetIdx !== -1 && targetIdx !== currentIdx) {
            this.game.loadSnapshot(targetIdx);
            this.updateHUD();
            this.resetActiveState();
            this.updateAIHeatmapForCurrentSnapshot();
            this.updateAIHeatmapUI();
            if (this.render) this.render.draw();
        }
    }

    updateAIHeatmapUI() {
        ['BLUE', 'RED'].forEach(team => {
            const lower = team.toLowerCase();
            const btnTree = document.getElementById(`btn-${lower}-action-tree`);
            const btnPrev = document.getElementById(`btn-${lower}-ai-prev`);
            const btnNext = document.getElementById(`btn-${lower}-ai-next`);
            const label = document.getElementById(`${lower}-ai-turn-label`);

            const isActive = this.showAIHeatmap && this.aiHeatmapTeam === team;
            if (btnTree) {
                if (isActive) {
                    btnTree.style.background = team === 'BLUE' ? 'rgba(59, 130, 246, 0.45)' : 'rgba(239, 68, 68, 0.45)';
                    btnTree.style.borderColor = team === 'BLUE' ? '#3b82f6' : '#ef4444';
                    btnTree.style.boxShadow = team === 'BLUE' ? '0 0 16px rgba(59, 130, 246, 0.7)' : '0 0 16px rgba(239, 68, 68, 0.7)';
                } else {
                    btnTree.style.background = team === 'BLUE' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(239, 68, 68, 0.2)';
                    btnTree.style.borderColor = team === 'BLUE' ? '#60a5fa' : '#f87171';
                    btnTree.style.boxShadow = 'none';
                }
            }

            if (isActive) {
                if (btnPrev) btnPrev.style.display = 'flex';
                if (btnNext) btnNext.style.display = 'flex';
                if (label) label.style.display = 'block';

                const aiIndices = this.getAISnapshotIndices(team);
                const currentIdx = this.game.historyIndex;
                const isLive = (currentIdx === this.game.history.length - 1);

                // Find which AI turn index this is
                let turnNum = -1;
                for (let i = 0; i < aiIndices.length; i++) {
                    if (aiIndices[i] === currentIdx) {
                        turnNum = i + 1;
                        break;
                    }
                }

                if (label) {
                    if (turnNum !== -1) {
                        label.innerText = `Turn ${turnNum}${isLive ? ' (Live)' : ''}`;
                    } else if (isLive) {
                        label.innerText = 'Live State';
                    } else {
                        label.innerText = 'Turn Review';
                    }
                }

                const hasPrev = aiIndices.some(idx => idx < currentIdx);
                const hasNext = aiIndices.some(idx => idx > currentIdx) || (currentIdx < this.game.history.length - 1);

                if (btnPrev) {
                    btnPrev.style.opacity = hasPrev ? '1' : '0.35';
                    btnPrev.style.pointerEvents = hasPrev ? 'auto' : 'none';
                }
                if (btnNext) {
                    btnNext.style.opacity = hasNext ? '1' : '0.35';
                    btnNext.style.pointerEvents = hasNext ? 'auto' : 'none';
                }
            } else {
                if (btnPrev) btnPrev.style.display = 'none';
                if (btnNext) btnNext.style.display = 'none';
                if (label) label.style.display = 'none';
            }

            // Teach AI Debug Button visibility
            const btnTeach = document.getElementById(`btn-${lower}-teach-ai`);
            const boxThinking = document.getElementById(`${lower}-ai-thinking-box`);
            const isThinking = boxThinking && boxThinking.style.display !== 'none';
            if (btnTeach) {
                if (isActive && !isThinking) {
                    btnTeach.style.display = 'flex';
                } else {
                    btnTeach.style.display = 'none';
                    if (!this.showAIHeatmap && this.teachAIPanelOpen) {
                        this.toggleTeachAIPanel(team);
                    }
                }
            }
        });
    }

    showAIThinking(team, visible) {
        const prefix = team.toLowerCase();
        const box = document.getElementById(`${prefix}-ai-thinking-box`);
        const btnTeach = document.getElementById(`btn-${prefix}-teach-ai`);
        if (box) {
            box.style.display = visible ? 'flex' : 'none';
        }
        if (btnTeach && visible) {
            btnTeach.style.display = 'none';
        }
        if (!visible) {
            this.updateAIThinkingProgress(team, 0);
            this.updateAIHeatmapUI();
        }
    }

    updateAIThinkingProgress(team, percent) {
        const prefix = team.toLowerCase();
        const bar = document.getElementById(`${prefix}-ai-progress-bar`);
        const txt = document.getElementById(`${prefix}-ai-progress-text`);
        const clamped = Math.max(0, Math.min(100, Math.round(percent)));
        if (bar) {
            bar.style.width = `${clamped}%`;
        }
        if (txt) {
            txt.textContent = `${clamped}%`;
        }
    }

    initTeachAI() {
        this.teachAIPanel = document.getElementById('teach-ai-panel');
        this.teachAITextarea = document.getElementById('teach-ai-feedback-text');
        this.teachAIPanelOpen = false;
        this.awaitingTileMention = false;
        this.currentTeachReport = '';

        // Wire debug buttons
        const btnTeachRed = document.getElementById('btn-red-teach-ai');
        if (btnTeachRed) {
            btnTeachRed.addEventListener('click', () => this.toggleTeachAIPanel('RED'));
        }
        const btnTeachBlue = document.getElementById('btn-blue-teach-ai');
        if (btnTeachBlue) {
            btnTeachBlue.addEventListener('click', () => this.toggleTeachAIPanel('BLUE'));
        }

        // Close button
        const btnClose = document.getElementById('btn-close-teach-ai');
        if (btnClose) {
            btnClose.addEventListener('click', () => this.toggleTeachAIPanel(this.aiHeatmapTeam || 'RED'));
        }

        // Textarea input detection for '@'
        if (this.teachAITextarea) {
            this.teachAITextarea.addEventListener('input', (e) => {
                const val = this.teachAITextarea.value;
                const pos = this.teachAITextarea.selectionStart;
                if (pos > 0 && val[pos - 1] === '@') {
                    this.setAwaitingTileMention(true);
                } else if (!val.includes('@')) {
                    this.setAwaitingTileMention(false);
                }
            });
        }

        // Pick Tile Button
        const btnPick = document.getElementById('btn-teach-ai-pick-tile');
        if (btnPick) {
            btnPick.addEventListener('click', () => {
                if (!this.teachAITextarea) return;
                const val = this.teachAITextarea.value;
                const pos = this.teachAITextarea.selectionStart !== undefined ? this.teachAITextarea.selectionStart : val.length;
                if (pos === 0 || val[pos - 1] !== '@') {
                    this.teachAITextarea.value = val.slice(0, pos) + '@' + val.slice(pos);
                    this.teachAITextarea.setSelectionRange(pos + 1, pos + 1);
                }
                this.setAwaitingTileMention(true);
            });
        }

        // Clear Button
        const btnClear = document.getElementById('btn-teach-ai-clear');
        if (btnClear) {
            btnClear.addEventListener('click', () => {
                if (this.teachAITextarea) this.teachAITextarea.value = '';
                this.setAwaitingTileMention(false);
            });
        }

        // Submit Report Button
        const btnSubmit = document.getElementById('btn-teach-ai-submit');
        if (btnSubmit) {
            btnSubmit.addEventListener('click', () => this.submitTeachAIReport());
        }

        // Edit Feedback Button
        const btnEdit = document.getElementById('btn-teach-ai-edit');
        if (btnEdit) {
            btnEdit.addEventListener('click', () => {
                document.getElementById('teach-ai-input-view')?.classList.remove('hidden');
                document.getElementById('teach-ai-report-view')?.classList.add('hidden');
                if (this.teachAITextarea) this.teachAITextarea.focus();
            });
        }

        // Copy Report Button
        const btnCopy = document.getElementById('btn-teach-ai-copy');
        if (btnCopy) {
            btnCopy.addEventListener('click', () => this.copyTeachAIReport());
        }
    }

    toggleTeachAIPanel(team) {
        const panel = document.getElementById('teach-ai-panel');
        if (!panel) return;
        this.teachAIPanelOpen = !this.teachAIPanelOpen;
        if (this.teachAIPanelOpen) {
            const frameId = team === 'BLUE' ? 'left-frame' : 'right-frame';
            const frame = document.getElementById(frameId);
            if (frame && panel.parentElement !== frame) {
                frame.appendChild(panel);
            }
            panel.classList.remove('hidden');
            document.getElementById('teach-ai-input-view')?.classList.remove('hidden');
            document.getElementById('teach-ai-report-view')?.classList.add('hidden');
            this.setAwaitingTileMention(false);
            if (this.teachAITextarea) this.teachAITextarea.focus();
        } else {
            panel.classList.add('hidden');
            this.setAwaitingTileMention(false);
        }
    }

    setAwaitingTileMention(active) {
        this.awaitingTileMention = active;
        const hint = document.getElementById('teach-ai-tile-hint');
        const activeBadge = document.getElementById('teach-ai-tile-active');
        if (hint && activeBadge) {
            if (active) {
                hint.classList.add('hidden');
                activeBadge.classList.remove('hidden');
            } else {
                hint.classList.remove('hidden');
                activeBadge.classList.add('hidden');
            }
        }
    }

    isAwaitingTileMention() {
        if (this.awaitingTileMention) return true;
        if (!this.teachAITextarea) return false;
        const val = this.teachAITextarea.value;
        const selStart = this.teachAITextarea.selectionStart !== undefined ? this.teachAITextarea.selectionStart : val.length;
        if (selStart > 0 && val[selStart - 1] === '@') return true;
        return false;
    }

    insertTileMention(col, row) {
        if (!this.teachAITextarea) return;
        let scoreTxt = '0';
        let isBarricade = false;
        const tile = this.game.getTile(col, row);
        if (tile && tile.isBarricade) isBarricade = true;

        if (this.game.aiHeatmapCache) {
            const ev = this.game.aiHeatmapCache.find(e => e.col === col && e.row === row);
            if (ev) {
                if (ev.isBarricade || ev.val === null) {
                    isBarricade = true;
                } else {
                    const rounded = Math.round(ev.val);
                    scoreTxt = (rounded > 0 ? '+' : '') + rounded.toLocaleString();
                }
            }
        }
        const mention = isBarricade
            ? `@Tile(${col}, ${row}) [Barricade] `
            : `@Tile(${col}, ${row}) [Score: ${scoreTxt}] `;
        const textarea = this.teachAITextarea;
        const val = textarea.value;
        const selStart = textarea.selectionStart !== undefined ? textarea.selectionStart : val.length;
        const atIdx = val.lastIndexOf('@', selStart > 0 ? selStart - 1 : 0);

        if (atIdx !== -1 && (selStart - atIdx) <= 5) {
            textarea.value = val.slice(0, atIdx) + mention + val.slice(selStart);
            const nextPos = atIdx + mention.length;
            textarea.setSelectionRange(nextPos, nextPos);
        } else {
            textarea.value = val.slice(0, selStart) + mention + val.slice(selStart);
            const nextPos = selStart + mention.length;
            textarea.setSelectionRange(nextPos, nextPos);
        }

        this.setAwaitingTileMention(false);
        textarea.focus();
    }

    formatBoardStateText(snap, label) {
        if (!snap) return `#### ${label}\n*No snapshot data available.*`;
        const cols = this.game.cols;
        const rows = this.game.rows;
        let lines = [];
        lines.push(`#### ${label}`);
        lines.push(`- **Active Turn**: ${snap.activeTeam || 'N/A'}`);
        lines.push(`- **Credits**: Blue = ${snap.credits?.BLUE ?? 0}, Red = ${snap.credits?.RED ?? 0}`);
        if (snap.lastMove) {
            const lm = snap.lastMove;
            const u = lm.unit || {};
            lines.push(`- **Last Move**: (${lm.sC}, ${lm.sR}) -> (${lm.eC}, ${lm.eR}) [Unit: ${u.team || 'N/A'} ${u.type || 'combat'}, Str ${u.strength ?? '?'}, Spd ${u.speed ?? '?'}]`);
        }

        const units = [];
        const barricades = [];
        for (let [k, tile] of snap.board.entries()) {
            const [c, r] = k.split(',').map(Number);
            if (tile.unit) {
                const u = tile.unit;
                units.push(`  - [${u.team}] ${u.isFlag ? 'FLAG' : (u.type || 'combat').toUpperCase()} (Str: ${u.strength}, Spd: ${u.speed}) at (${c}, ${r})`);
            }
            if (tile.isBarricade) {
                barricades.push(`(${c}, ${r})`);
            }
        }

        lines.push(`- **Units on Board** (${units.length}):`);
        if (units.length > 0) lines.push(units.join('\n'));
        else lines.push('  - None');

        lines.push(`- **Barricades** (${barricades.length}): ${barricades.length > 0 ? barricades.join(', ') : 'None'}`);

        lines.push(`\n**Grid Representation (${cols}x${rows}):**`);
        lines.push('```text');
        let colHdr = '     ';
        for (let c = 0; c < cols; c++) {
            colHdr += (c < 10 ? ' ' + c : c) + ' ';
        }
        lines.push(colHdr);

        for (let r = 0; r < rows; r++) {
            let rowStr = (r < 10 ? ' ' + r : r) + ':  ';
            for (let c = 0; c < cols; c++) {
                const tile = snap.board.get(`${c},${r}`);
                if (!tile) {
                    rowStr += ' . ';
                } else if (tile.isBarricade) {
                    rowStr += '###';
                } else if (tile.unit) {
                    const u = tile.unit;
                    const t = u.team === 'BLUE' ? 'B' : 'R';
                    if (u.isFlag) rowStr += `${t}F `;
                    else if (u.strength !== undefined) rowStr += `${t}${u.strength} `;
                    else rowStr += `${t}* `;
                } else {
                    rowStr += ' . ';
                }
            }
            lines.push(rowStr);
        }
        lines.push('```');
        return lines.join('\n');
    }

    generateTeachAIReport() {
        const feedback = (this.teachAITextarea?.value || '').trim();
        const currentIdx = this.game.historyIndex;
        const totalSnaps = this.game.history.length;

        let prevSnap = null;
        let postSnap = null;

        if (currentIdx < totalSnaps - 1) {
            postSnap = this.game.history[currentIdx];
            prevSnap = currentIdx > 0 ? this.game.history[currentIdx - 1] : postSnap;
        } else {
            postSnap = this.game.history[totalSnaps - 1];
            prevSnap = totalSnaps >= 2 ? this.game.history[totalSnaps - 2] : postSnap;
        }

        const botTeam = this.aiHeatmapTeam || (this.game.aiBot ? (this.game.aiBot.team || 'RED') : 'RED');

        let report = [];
        report.push('# Teach AI: Bot Feedback Report\n');
        report.push('## 1. User Feedback');
        report.push(feedback.length > 0 ? feedback : '*No text feedback entered.*');
        report.push('\n---\n');
        report.push('## 2. Previous Board State (Before Bot Move)');
        report.push(this.formatBoardStateText(prevSnap, 'Board Before Bot Move'));
        report.push('\n---\n');
        report.push('## 3. Current Board State (After Bot Move)');
        report.push(this.formatBoardStateText(postSnap, 'Board After Bot Move'));
        report.push('\n---\n');
        report.push('## 4. Metadata');
        report.push(`- **Bot Team**: ${botTeam}`);
        report.push(`- **Game Mode**: ${this.game.config?.mode || 'STANDARD'} (${this.game.config?.type || 'INVADE'})`);
        report.push(`- **Grid Size**: ${this.game.cols} cols x ${this.game.rows} rows`);
        report.push(`- **History Snapshot**: ${currentIdx + 1} of ${totalSnaps}`);

        return report.join('\n');
    }

    submitTeachAIReport() {
        this.currentTeachReport = this.generateTeachAIReport();
        const pre = document.getElementById('teach-ai-report-pre');
        if (pre) pre.textContent = this.currentTeachReport;

        document.getElementById('teach-ai-input-view')?.classList.add('hidden');
        document.getElementById('teach-ai-report-view')?.classList.remove('hidden');
    }

    copyTeachAIReport() {
        if (!this.currentTeachReport) return;
        const btn = document.getElementById('btn-teach-ai-copy');
        const txt = document.getElementById('teach-ai-copy-text');

        const onSuccess = () => {
            if (btn && txt) {
                btn.classList.add('copied');
                txt.textContent = 'Copied to Clipboard!';
                setTimeout(() => {
                    btn.classList.remove('copied');
                    txt.textContent = 'Copy Report';
                }, 2000);
            }
        };

        const nav = (typeof window !== 'undefined' && window.navigator) ? window.navigator : (typeof navigator !== 'undefined' ? navigator : null);
        if (nav && nav.clipboard && nav.clipboard.writeText) {
            nav.clipboard.writeText(this.currentTeachReport).then(onSuccess).catch(err => {
                this.fallbackCopyText(this.currentTeachReport, onSuccess);
            });
        } else {
            this.fallbackCopyText(this.currentTeachReport, onSuccess);
        }
    }

    fallbackCopyText(text, cb) {
        const pre = document.getElementById('teach-ai-report-pre');
        if (pre) {
            const range = document.createRange();
            range.selectNodeContents(pre);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }
        try {
            document.execCommand('copy');
            if (cb) cb();
        } catch (e) {
            console.warn('execCommand copy failed:', e);
        }
    }
}


// --- network.js ---
// js/network.js
class NetworkManager {
    constructor(hostId = null, guestName = 'Guest') {
        this.peer = null;
        this.conn = null;
        this.isHost = !hostId;
        this.connected = false;
        this.guestName = guestName;

        // These will be bound after game setup
        this.ui = null;
        this.game = null;

        if (hostId) {
            this.joinGame(hostId);
        }

        this.bindPopupListeners();
    }

    bindPopupListeners() {
        const copyBtn = document.getElementById('btn-copy-link');
        if (copyBtn) {
            copyBtn.onclick = () => {
                const el = document.getElementById('host-link-input');
                el.select();
                document.execCommand('copy');
                copyBtn.innerText = "Copied!";
                setTimeout(() => { copyBtn.innerText = "Copy"; }, 2000);
            };
        }
    }

    bindEngines(game, ui) {
        this.game = game;
        this.ui = ui;
        this.game.localTeam = this.isHost ? 'BLUE' : 'RED';
        if (this.isHost) {
            this.game.logSystem("Waiting for Opponent to connect to the Host Link...");
        } else {
            this.game.logSystem(`Connected as Guest. You are RED.`);
            document.getElementById('online-modal').classList.add('hidden');
        }
    }

    hostGame() {
        const peerConfig = {
            config: {
                'iceServers': [
                    { 'urls': 'stun:stun.l.google.com:19302' },
                    { 'urls': 'stun:stun1.l.google.com:19302' },
                    { 'urls': 'stun:stun2.l.google.com:19302' },
                    { 'urls': 'stun:stun3.l.google.com:19302' },
                    { 'urls': 'stun:stun4.l.google.com:19302' }
                ]
            }
        };
        this.peer = new Peer(peerConfig);
        this.peer.on('open', (id) => {
            const link = `${window.location.origin}${window.location.pathname}?host=${id}`;
            document.getElementById('host-link-input').value = link;

            const pName = document.getElementById('player-name').value || 'Host';
            fetch('/api/lobby', {
                method: 'POST',
                body: JSON.stringify({ hostId: id, name: pName }),
                headers: { 'Content-Type': 'application/json' }
            }).catch(console.error);
        });

        this.peer.on('connection', (conn) => {
            if (this.conn) {
                conn.close(); // Only 1 guest
                return;
            }
            this.conn = conn;
            this.setupConnection();

            document.getElementById('online-modal').classList.add('hidden');
            if (this.game) {
                this.game.logSystem("Opponent Connected! Initializing Channel...");
            }
            if (this.ui) this.ui.updateHUD();
        });

        this.peer.on('error', (err) => {
            console.error(err);
            if (this.game) this.game.logSystem("Network Error: " + err.message);
        });
    }

    joinGame(hostId) {
        const peerConfig = {
            config: {
                'iceServers': [
                    { 'urls': 'stun:stun.l.google.com:19302' },
                    { 'urls': 'stun:stun1.l.google.com:19302' },
                    { 'urls': 'stun:stun2.l.google.com:19302' },
                    { 'urls': 'stun:stun3.l.google.com:19302' },
                    { 'urls': 'stun:stun4.l.google.com:19302' }
                ]
            }
        };
        this.peer = new Peer(peerConfig);
        this.peer.on('open', (id) => {
            this.conn = this.peer.connect(hostId, { reliable: true });
            this.setupConnection();
        });

        this.peer.on('error', (err) => {
            console.error(err);
            if (this.game) this.game.logSystem("Network Error: " + err.message);
        });
    }

    setupConnection() {
        const handleOpen = () => {
            this.connected = true;

            // WebRTC data channels (especially on Firefox) can drop initial payloads if sent immediately
            setTimeout(() => {
                if (this.isHost && this.game) {
                    // Host sends config to guest
                    this.sendData({
                        type: 'CONFIG',
                        config: this.game.config
                    });

                    // Remove game from open lobbies
                    if (this.peer && this.peer.id) {
                        fetch('/api/lobby', {
                            method: 'DELETE',
                            body: JSON.stringify({ hostId: this.peer.id }),
                            headers: { 'Content-Type': 'application/json' }
                        }).catch(console.error);
                    }

                    if (this.game.timerDuration > 0) {
                        this.game.startTimer();
                    }
                    this.game.logSystem("Game Start! You are BLUE.");
                } else {
                    this.sendData({
                        type: 'GUEST_JOIN',
                        name: this.guestName
                    });
                }
                if (this.ui) this.ui.updateHUD();
            }, 500); // 500ms stabilization delay
        };

        if (this.conn.open) {
            handleOpen();
        } else {
            this.conn.on('open', handleOpen);
        }

        this.conn.on('data', (data) => {
            this.receiveData(data);
        });

        this.conn.on('close', () => {
            this.connected = false;
            if (this.game) this.game.logSystem("Opponent Disconnected!");
        });
    }

    sendData(payload) {
        if (this.connected && this.conn) {
            this.conn.send(payload);
        }
    }

    receiveData(data) {
        if (data.type === 'CONFIG') {
            if (!this.isHost && window.onReceiveNetworkConfig) {
                window.onReceiveNetworkConfig(data.config);
            }
            return;
        }

        if (data.type === 'GUEST_JOIN' && this.isHost && this.game) {
            this.game.redName = data.name;
            if (this.ui) this.ui.updateHUD();
            return;
        }

        if (!this.game || !this.ui) return;

        if (data.type === 'DEPLOY') {
            this.game.deployUnit(data.team, data.unitType, data.str, data.spd, data.col, data.row, true);
        } else if (data.type === 'MOVE') {
            this.game.moveUnit(data.col, data.row, data.tC, data.tR, true);
        } else if (data.type === 'BARRICADE') {
            this.game.createBarricade(data.col, data.row, data.offset, true);
        }

        // Notice endTurn implies a SKIP, but moveUnit/deployUnit internally call endTurn if actionUsed!
        // We only explicitly call endTurn if the remote player forcefully skipped.
        if (data.type === 'SKIP') {
            this.game.endTurn(true);
        }

        this.ui.updateHUD();
    }
}


// --- genes-v3.js ---
// js/genes-v3.js

/**
 * ========================================================
 * V3 INFLUENCE MAP AI GENOME WEIGHT STRUCTURE
 * ========================================================
 *
 * All tunable constants for the tile-based scoring engine.
 *
 * COMBAT_BOOST: Target base value for a combat unit.
 * COMBAT_RING_BOOST: Percentage push/pull on tiles surrounding a combat unit.
 * OBS_BOOST: Target base value for an observation unit ring-decay.
 * FLAG_TILE_CONSTANT: Signed boost applied only to the exact tile a flag is on.
 * FLAG_BOOST: Percentage multiplier applied to all combat presence inside a flag's 5-ring zone.
 * WIN_VALUE: Flat unconditional score for reaching the enemy base.
 */
const DEFAULT_V3_GENES = {
    COMBAT_BOOST: 100,
    COMBAT_RING_BOOST: 0.15,
    OBS_BOOST: 5000,
    FLAG_TILE_CONSTANT: 3000,
    FLAG_BOOST: 0.15,
    WIN_VALUE: 1000000
};


// --- ai-v3.js ---
// js/ai-v3.js



const SPAWN_ARCHETYPES = [
    { name: "Sprinter", power: 1, speed: 4, cost: 4 },
    { name: "Enforcer", power: 3, speed: 3, cost: 9 },
    { name: "Interceptor", power: 4, speed: 2, cost: 8 },
    { name: "Titan", power: 5, speed: 3, cost: 15 },
    { name: "Savior", power: 5, speed: 5, cost: 25 },
];

class AIBotV3 {
    constructor(game, genes = null) {
        this.game = game;
        this.genes = genes || DEFAULT_V3_GENES;
    }

    executeTurn() {
        if (this.game.activeTeam !== 'RED') return;
        if (this.game.winner) return;

        this.game.logSystem('Computer is thinking... (Influence Map V3)');
        if (this.game.ui && typeof this.game.ui.showAIThinking === 'function') {
            this.game.ui.showAIThinking('RED', true);
            this.game.ui.updateAIThinkingProgress('RED', 5);
        }

        setTimeout(async () => {
            if (this.game.activeTeam !== 'RED') return;
            try {
                await this.decideAction();
            } finally {
                if (this.game.ui && typeof this.game.ui.showAIThinking === 'function') {
                    this.game.ui.showAIThinking('RED', false);
                }
            }
        }, 50);
    }

    cloneState(existingState = null) {
        if (existingState) {
            return {
                cols: existingState.cols,
                rows: existingState.rows,
                blue_credits: existingState.blue_credits,
                red_credits: existingState.red_credits,
                currentPlayer: existingState.currentPlayer,
                gameMode: existingState.gameMode,
                flagCost: existingState.flagCost,
                barricades: new Set(existingState.barricades || []),
                units: (existingState.units || []).map(u => ({ ...u }))
            };
        }
        if (!this.game) return null;
        const state = {
            cols: this.game.cols,
            rows: this.game.rows,
            blue_credits: this.game.credits['BLUE'],
            red_credits: this.game.credits['RED'],
            currentPlayer: this.game.activeTeam,
            gameMode: this.game.type, // 'INVADE' or 'PLANT'
            flagCost: this.game.config ? this.game.config.flagCost : 10,
            units: [],
            barricades: new Set()
        };

        for (let col = 0; col < this.game.cols; col++) {
            for (let row = 0; row < this.game.rows; row++) {
                const t = this.game.getTile(col, row);
                if (t.isBarricade) {
                    state.barricades.add(`${col},${row}`);
                }
                if (t.unit) {
                    state.units.push({
                        id: `${col},${row}`,
                        col: col,
                        row: row,
                        player: t.unit.team,
                        power: t.unit.strength,
                        speed: t.unit.speed,
                        type: t.unit.type,
                        isFlag: t.unit.isFlag
                    });
                }
            }
        }
        return state;
    }

    getValidMovesVirtual(state, unit) {
        let reachable = [];
        let queue = [{ c: unit.col, r: unit.row, dist: 0 }];
        let visited = new Set([`${unit.col},${unit.row}`]);

        while (queue.length > 0) {
            let curr = queue.shift();
            if (curr.dist > 0) reachable.push({ col: curr.c, row: curr.r });
            if (curr.dist >= unit.speed) continue;

            let currOccupant = state.units.find(u => u.col === curr.c && u.row === curr.r);
            if (curr.dist > 0 && currOccupant && currOccupant.player !== unit.player) continue;

            const ax = hexMath.offsetToAxial(curr.c, curr.r);
            for (let dir of hexMath.hexDirections) {
                const nAx = { q: ax.q + dir.dq, r: ax.r + dir.dr };
                const nOff = hexMath.axialToOffset(nAx.q, nAx.r);

                if (nOff.col >= 0 && nOff.row >= 0 && nOff.col < state.cols && nOff.row < state.rows) {
                    const nKey = `${nOff.col},${nOff.row}`;
                    if (!visited.has(nKey) && !state.barricades.has(nKey)) {
                        let tOccupant = state.units.find(u => u.col === nOff.col && u.row === nOff.row);
                        let canEnter = !tOccupant || tOccupant.player !== unit.player;
                        if (canEnter) {
                            visited.add(nKey);
                            queue.push({ c: nOff.col, r: nOff.row, dist: curr.dist + 1 });
                        }
                    }
                }
            }
        }
        return reachable;
    }

    generateCandidateActions(state, player) {
        const actions = [];
        const credits = player === 'BLUE' ? state.blue_credits : state.red_credits;
        const homeCol = player === 'BLUE' ? 0 : state.cols - 1;

        for (let u of state.units) {
            if (u.player !== player || u.type === 'observation' || (state.gameMode !== 'PLANT' && u.isFlag)) continue;

            const validDestinations = this.getValidMovesVirtual(state, u);
            for (let target of validDestinations) {
                actions.push({ type: 'MOVE', unitId: u.id, unitCol: u.col, unitRow: u.row, targetCol: target.col, targetRow: target.row });
            }
        }

        let emptyHomeTiles = [];
        for (let r = 0; r < state.rows; r++) {
            if (!state.barricades.has(`${homeCol},${r}`) && !state.units.find(u => u.col === homeCol && u.row === r)) {
                emptyHomeTiles.push(r);
            }
        }

        if (emptyHomeTiles.length > 0) {
            let hasLivingFlag = state.units.some(u => u.player === player && u.isFlag);

            if (state.gameMode === 'PLANT' && !hasLivingFlag) {
                let cost = (state.flagCost || 10) * 3;
                if (credits >= cost) {
                    for (let hr of emptyHomeTiles) {
                        actions.push({ type: 'DEPLOY', targetCol: homeCol, targetRow: hr, power: 0, speed: 3, cost: cost, archName: "Flag", unitType: 'flag' });
                    }
                }
            }

            for (let arch of SPAWN_ARCHETYPES) {
                if (credits >= arch.cost) {
                    for (let hr of emptyHomeTiles) {
                        actions.push({ type: 'DEPLOY', targetCol: homeCol, targetRow: hr, power: arch.power, speed: arch.speed, cost: arch.cost, archName: arch.name });
                    }
                }
            }
        }

        actions.push({ type: 'SKIP' });
        return actions;
    }

    applyVirtualAction(state, action) {
        const nextState = {
            cols: state.cols,
            rows: state.rows,
            blue_credits: state.blue_credits,
            red_credits: state.red_credits,
            currentPlayer: state.currentPlayer === 'BLUE' ? 'RED' : 'BLUE',
            gameMode: state.gameMode,
            flagCost: state.flagCost,
            units: state.units.map(u => ({ ...u })),
            barricades: state.barricades
        };

        if (action.type === 'SKIP') {
            return nextState;
        }

        if (action.type === 'MOVE') {
            let u = nextState.units.find(un => un.col === action.unitCol && un.row === action.unitRow);
            if (u) {
                let targetIdx = nextState.units.findIndex(un => un.col === action.targetCol && un.row === action.targetRow);
                if (targetIdx !== -1) {
                    let defender = nextState.units[targetIdx];
                    if (u.power >= defender.power) {
                        nextState.units.splice(targetIdx, 1);
                        u.power -= 1;
                        if (u.power <= 0) {
                            nextState.units = nextState.units.filter(un => un !== u);
                        }
                    } else {
                        nextState.units = nextState.units.filter(un => un !== u);
                        defender.power -= 1;
                        if (defender.power <= 0) {
                            nextState.units.splice(targetIdx, 1);
                        }
                    }
                }

                if (nextState.units.find(un => un.col === action.unitCol && un.row === action.unitRow)) {
                    let match = nextState.units.find(un => un.col === action.unitCol && un.row === action.unitRow);
                    match.col = action.targetCol;
                    match.row = action.targetRow;
                }
            }
        } else if (action.type === 'DEPLOY') {
            if (state.currentPlayer === 'BLUE') nextState.blue_credits -= action.cost;
            else nextState.red_credits -= action.cost;

            const isFlagType = action.unitType === 'flag';
            nextState.units.push({
                id: `spawn_${Math.random()}`,
                col: action.targetCol,
                row: action.targetRow,
                player: state.currentPlayer,
                power: action.power,
                speed: action.speed,
                type: action.unitType || 'combat',
                isFlag: isFlagType
            });
        }
        return nextState;
    }

    isSuicideMove(state, action, player) {
        if (!action || action.type !== 'MOVE') return false;
        const enemyBaseCol = player === 'BLUE' ? state.cols - 1 : 0;
        if (action.targetCol === enemyBaseCol) return false;

        const u = state.units.find(un => un.col === action.unitCol && un.row === action.unitRow);
        if (!u) return false;

        const hasEnemy = state.units.some(un => un.player !== player && un.col === action.targetCol && un.row === action.targetRow);
        if (hasEnemy) return false;

        const reachMap = this.computeReachability(state);
        const tileKey = `${action.targetCol},${action.targetRow}`;
        const occupants = reachMap.get(tileKey) || [];
        const threats = occupants.filter(en => en.player !== player && !en.isFlag && en.type !== 'observation');

        return threats.some(en => en.power >= u.power);
    }

    minimax(state, depth, alpha, beta, maximizing, botPlayer) {
        let score = this.evaluateBoard(state, botPlayer);

        if (depth === 0 || Math.abs(score) >= 900000000.0) {
            if (score >= 900000000.0) score += depth * 1000;
            if (score <= -900000000.0) score -= depth * 1000;
            return { score, action: null };
        }

        let actions = this.generateCandidateActions(state, state.currentPlayer);
        if (actions.length === 0) {
            return { score, action: null };
        }

        let scoredActions = [];
        let beamWidth = 8;

        for (let a of actions) {
            let nextState = this.applyVirtualAction(state, a);
            let immediateScore = this.evaluateBoard(nextState, botPlayer);
            if (this.isSuicideMove(state, a, state.currentPlayer)) {
                immediateScore += (state.currentPlayer === botPlayer ? -2000000 : 2000000);
            }
            scoredActions.push({ action: a, score: immediateScore });
        }

        if (maximizing) {
            scoredActions.sort((a, b) => b.score - a.score);
        } else {
            scoredActions.sort((a, b) => a.score - b.score);
        }

        actions = scoredActions.slice(0, beamWidth).map(pair => pair.action);
        let bestAction = actions[0];

        if (maximizing) {
            let maxEval = -Infinity;
            for (let a of actions) {
                let nextState = this.applyVirtualAction(state, a);
                let result = this.minimax(nextState, depth - 1, alpha, beta, false, botPlayer);
                if (result.score > maxEval) {
                    maxEval = result.score;
                    bestAction = a;
                }
                alpha = Math.max(alpha, result.score);
                if (beta <= alpha) break;
            }
            return { score: maxEval, action: bestAction };
        } else {
            let minEval = Infinity;
            for (let a of actions) {
                let nextState = this.applyVirtualAction(state, a);
                let result = this.minimax(nextState, depth - 1, alpha, beta, true, botPlayer);
                if (result.score < minEval) {
                    minEval = result.score;
                    bestAction = a;
                }
                beta = Math.min(beta, result.score);
                if (beta <= alpha) break;
            }
            return { score: minEval, action: bestAction };
        }
    }

    async decideAction(passedState = null) {
        const rootState = this.cloneState(passedState);
        const botTeam = rootState.currentPlayer || (this.game ? this.game.activeTeam : 'RED');

        let actions = this.generateCandidateActions(rootState, botTeam);
        if (actions.length === 0) {
            if (this.game) {
                this.game.logAction(botTeam, 'AI chose to Skip Action.');
                this.game.endTurn();
            }
            return null;
        }

        this.lastEvaluations = [];
        let maxEval = -Infinity;
        let bestAction = actions[0];

        let scoredActions = [];
        let beamWidth = 16;

        for (let a of actions) {
            let nextState = this.applyVirtualAction(rootState, a);
            let immediateScore = this.evaluateBoard(nextState, botTeam);
            if (this.isSuicideMove(rootState, a, botTeam)) {
                immediateScore -= 2000000;
            }
            scoredActions.push({ action: a, score: immediateScore });
        }
        scoredActions.sort((a, b) => b.score - a.score);
        actions = scoredActions.slice(0, beamWidth).map(pair => pair.action);

        const DEPTH = 3;
        for (let idx = 0; idx < actions.length; idx++) {
            let a = actions[idx];
            let nextState = this.applyVirtualAction(rootState, a);
            let result = this.minimax(nextState, DEPTH - 1, -Infinity, Infinity, false, botTeam);

            this.lastEvaluations.push({
                action: a,
                score: result.score
            });

            if (result.score > maxEval) {
                maxEval = result.score;
                bestAction = a;
            }

            if (this.game && this.game.ui && typeof this.game.ui.updateAIThinkingProgress === 'function') {
                let pct = Math.round(((idx + 1) / actions.length) * 100);
                this.game.ui.updateAIThinkingProgress(botTeam, pct);
                await new Promise(resolve => setTimeout(resolve, 8));
            }
        }

        if (!bestAction) {
            if (this.game) {
                this.game.logAction(botTeam, 'AI chose to Skip Action.');
                this.game.endTurn();
            }
            return null;
        }

        if (this.game) {
            if (bestAction.type === 'DEPLOY') {
                this.game.deployUnit(botTeam, bestAction.unitType || 'combat', bestAction.power, bestAction.speed, bestAction.targetCol, bestAction.targetRow);
            } else if (bestAction.type === 'MOVE') {
                this.game.moveUnit(bestAction.unitCol, bestAction.unitRow, bestAction.targetCol, bestAction.targetRow);
            } else {
                this.game.logAction(botTeam, 'AI chose to Skip Action.');
                this.game.endTurn();
            }
        }
        return bestAction;
    }

    computeReachability(state) {
        // Map<"col,row", Array<{unit, player}>>
        let reachMap = new Map();

        // Initialize map for all non-barricade tiles
        for (let col = 0; col < state.cols; col++) {
            for (let row = 0; row < state.rows; row++) {
                if (!state.barricades.has(`${col},${row}`)) {
                    reachMap.set(`${col},${row}`, []);
                }
            }
        }

        for (let u of state.units) {
            let visited = new Set([`${u.col},${u.row}`]);
            let queue = [{ c: u.col, r: u.row, dist: 0 }];

            while (queue.length > 0) {
                let curr = queue.shift();

                let tileKey = `${curr.c},${curr.r}`;
                if (reachMap.has(tileKey)) {
                    reachMap.get(tileKey).push(u);
                }

                if (curr.dist >= u.speed) continue;

                // Stop traversal past enemy units (cannot walk through them), but can attack onto them
                let currOccupant = state.units.find(o => o.col === curr.c && o.row === curr.r);
                if (curr.dist > 0 && currOccupant && currOccupant.player !== u.player) continue;

                const ax = hexMath.offsetToAxial(curr.c, curr.r);
                for (let dir of hexMath.hexDirections) {
                    const nAx = { q: ax.q + dir.dq, r: ax.r + dir.dr };
                    const nOff = hexMath.axialToOffset(nAx.q, nAx.r);

                    if (nOff.col >= 0 && nOff.row >= 0 && nOff.col < state.cols && nOff.row < state.rows) {
                        const nKey = `${nOff.col},${nOff.row}`;
                        if (!visited.has(nKey) && reachMap.has(nKey)) {
                            visited.add(nKey);
                            queue.push({ c: nOff.col, r: nOff.row, dist: curr.dist + 1 });
                        }
                    }
                }
            }
        }
        return reachMap;
    }

    resolveDuel(occupantOpts, tileIsOccupied, occupantPlayer) {
        let blueUnits = occupantOpts.filter(u => u.player === 'BLUE').map(u => ({ ...u }));
        let redUnits = occupantOpts.filter(u => u.player === 'RED').map(u => ({ ...u }));

        while (blueUnits.length > 0 && redUnits.length > 0) {
            blueUnits.sort((a, b) => b.power - a.power);
            redUnits.sort((a, b) => b.power - a.power);

            let b = blueUnits[0];
            let r = redUnits[0];

            if (b.power > r.power) {
                redUnits.shift();
                b.power -= 1;
            } else if (r.power > b.power) {
                blueUnits.shift();
                r.power -= 1;
            } else {
                if (!tileIsOccupied) {
                    blueUnits.shift();
                    redUnits.shift();
                } else {
                    if (occupantPlayer === 'BLUE') {
                        blueUnits.shift();
                        r.power -= 1;
                    } else if (occupantPlayer === 'RED') {
                        redUnits.shift();
                        b.power -= 1;
                    } else {
                        blueUnits.shift();
                        redUnits.shift();
                    }
                }
            }
            if (b.power <= 0 && blueUnits.length > 0 && blueUnits[0] === b) blueUnits.shift();
            if (r.power <= 0 && redUnits.length > 0 && redUnits[0] === r) redUnits.shift();
        }

        if (blueUnits.length > 0 && redUnits.length === 0) return 'BLUE';
        if (redUnits.length > 0 && blueUnits.length === 0) return 'RED';
        if (tileIsOccupied && occupantPlayer) {
            return occupantPlayer === 'BLUE' ? 'RED' : 'BLUE';
        }

        return 'NEUTRAL';
    }

    getAdvanceBonus(tileCol, player, totalCols) {
        const enemyBaseCol = player === 'BLUE' ? totalCols - 1 : 0;
        const dist = Math.abs(tileCol - enemyBaseCol);
        if (dist <= 0) return this.genes.WIN_VALUE || 1000000;

        let totalBonus = 0;
        for (let k = dist; k <= totalCols - 2; k++) {
            totalBonus += Math.round(100000 / k);
        }
        return totalBonus;
    }

    evaluateTileScores(state, botPlayer) {
        let tileScores = [];
        const opponent = botPlayer === 'BLUE' ? 'RED' : 'BLUE';
        const botGoalCol = botPlayer === 'BLUE' ? state.cols - 1 : 0;
        const oppGoalCol = botPlayer === 'BLUE' ? 0 : state.cols - 1;

        let hasOwnFlagBase = state.units.some(u => u.player === botPlayer && u.isFlag && u.col === botGoalCol);
        let hasEnemyFlagBase = state.units.some(u => u.player === opponent && u.isFlag && u.col === oppGoalCol);

        let hasOwnCombatBase = state.gameMode === 'INVADE' && state.units.some(u => u.player === botPlayer && !u.isFlag && u.col === botGoalCol);
        let hasEnemyCombatBase = state.gameMode === 'INVADE' && state.units.some(u => u.player === opponent && !u.isFlag && u.col === oppGoalCol);

        // Map 0 val if game already won/lost for accuracy on empty tiles, otherwise it gets handled at highest depth
        if (hasOwnFlagBase || hasOwnCombatBase || hasEnemyFlagBase || hasEnemyCombatBase) {
            for (let c = 0; c < state.cols; c++) {
                for (let r = 0; r < state.rows; r++) {
                    const isBarr = state.barricades && state.barricades.has(`${c},${r}`);
                    tileScores.push({ col: c, row: r, val: isBarr ? null : 0, isBarricade: !!isBarr });
                }
            }
            return tileScores;
        }

        const genes = this.genes;
        const reachMap = this.computeReachability(state);

        for (let col = 0; col < state.cols; col++) {
            for (let row = 0; row < state.rows; row++) {
                let tileKey = `${col},${row}`;
                if (state.barricades && state.barricades.has(tileKey)) {
                    tileScores.push({ col, row, val: null, isBarricade: true });
                    continue;
                }

                if (col === botGoalCol) {
                    tileScores.push({ col, row, val: genes.WIN_VALUE });
                    continue;
                }

                let occupants = reachMap.get(tileKey) || [];
                let actualOccupant = state.units.find(u => u.col === col && u.row === row);

                // If this is our home base (oppGoalCol), check if an enemy is threatening it:
                if (col === oppGoalCol) {
                    let enemyThreats = occupants.filter(u => u.player === opponent && !u.isFlag && u.type !== 'observation');
                    if (enemyThreats.length > 0) {
                        tileScores.push({ col, row, val: -genes.WIN_VALUE });
                        continue;
                    }
                    // If no enemy can reach our home base, it is NOT -1,000,000!
                    // Fall through to regular tile scoring below, where it gets evaluated naturally.
                }

                let myReach = occupants.filter(u => u.player === botPlayer && !u.isFlag && u.type !== 'observation');
                let enemyReach = occupants.filter(u => u.player === opponent && !u.isFlag && u.type !== 'observation');

                let maxMy = myReach.length > 0 ? Math.max(...myReach.map(u => u.power)) : 0;
                let maxEnemy = enemyReach.length > 0 ? Math.max(...enemyReach.map(u => u.power)) : 0;

                let tileOwner = 'NEUTRAL';
                if (actualOccupant) {
                    if (actualOccupant.player === botPlayer) {
                        let enemyAttackers = occupants.filter(u => u.player === opponent && !u.isFlag && u.type !== 'observation');
                        let threatened = enemyAttackers.some(e => e.power >= actualOccupant.power);
                        if (threatened && myReach.length > 1) {
                            let duelRes = this.resolveDuel(occupants, true, botPlayer);
                            tileOwner = duelRes === botPlayer ? botPlayer : opponent;
                        } else {
                            tileOwner = threatened ? opponent : botPlayer;
                        }
                    } else {
                        let friendlyAttackers = occupants.filter(u => u.player === botPlayer && !u.isFlag && u.type !== 'observation');
                        let conquerable = friendlyAttackers.some(f => f.power >= actualOccupant.power);
                        if (conquerable && enemyReach.length > 1) {
                            let duelRes = this.resolveDuel(occupants, true, opponent);
                            tileOwner = duelRes === botPlayer ? botPlayer : opponent;
                        } else {
                            tileOwner = conquerable ? botPlayer : opponent;
                        }
                    }
                } else {
                    if (maxMy > 0 && maxEnemy > 0) {
                        // Contested zone: multiple units from both sides!
                        let duelWinner = this.resolveDuel(occupants, false, null);
                        if (duelWinner === botPlayer) {
                            tileOwner = botPlayer;
                        } else if (duelWinner === opponent) {
                            tileOwner = opponent;
                        } else {
                            // Deadlock / mutual trade: on opponent's turn, stepping here makes friendly the defender
                            tileOwner = maxMy > maxEnemy ? botPlayer : opponent;
                        }
                    } else if (maxMy > 0) {
                        tileOwner = botPlayer;
                    } else if (maxEnemy > 0) {
                        tileOwner = opponent;
                    } else {
                        tileOwner = 'UNTHREATENED';
                    }
                }

                let tileScore = 0;

                if (state.gameMode === 'INVADE') {
                    if (actualOccupant) {
                        if (actualOccupant.player === botPlayer) {
                            let advanceBonus = this.getAdvanceBonus(col, botPlayer, state.cols);
                            tileScore += (actualOccupant.power * genes.COMBAT_BOOST) + (advanceBonus * 2);
                        } else {
                            let oppAdvance = this.getAdvanceBonus(col, opponent, state.cols);
                            tileScore -= (actualOccupant.power * genes.COMBAT_BOOST) + (oppAdvance * 2);
                        }
                    } else {
                        // Empty tile
                        let advanceBonus = this.getAdvanceBonus(col, botPlayer, state.cols);
                        if (maxMy > 0 && maxEnemy > 0) {
                            // Contested tile: reward control plus combat margin
                            if (tileOwner === botPlayer) {
                                let myTotal = myReach.reduce((s, u) => s + u.power, 0);
                                let enemyTotal = enemyReach.reduce((s, u) => s + u.power, 0);
                                let margin = Math.max(1, myTotal - enemyTotal);
                                tileScore += (margin * genes.COMBAT_BOOST) + advanceBonus;
                            } else {
                                let enemyTotal = enemyReach.reduce((s, u) => s + u.power, 0);
                                let myTotal = myReach.reduce((s, u) => s + u.power, 0);
                                let margin = Math.max(1, enemyTotal - myTotal);
                                tileScore -= (margin * genes.COMBAT_BOOST) + this.getAdvanceBonus(col, opponent, state.cols);
                            }
                        } else if (maxEnemy > 0) {
                            // Enemy uncontested reach
                            tileScore -= (maxEnemy * genes.COMBAT_BOOST) + this.getAdvanceBonus(col, opponent, state.cols);
                        } else {
                            // maxEnemy === 0: Unthreatened safe territory.
                            // Friendly units moving forward do NOT penalize or abandon safe tiles.
                            tileScore += advanceBonus;
                        }
                    }

                    for (let u of state.units) {
                        if (u.type === 'observation') {
                            let dist = hexMath.offsetDistance(u.col, u.row, col, row);
                            if (dist <= 6) {
                                let ringNum = Math.floor(dist) + 1;
                                let scoreVal = (genes.OBS_BOOST / ringNum);
                                tileScore += (u.player === botPlayer ? scoreVal : -scoreVal);
                            }
                        }
                    }
                } else if (state.gameMode === 'PLANT') {
                    if (actualOccupant) {
                        if (actualOccupant.player === botPlayer) {
                            let advanceBonus = this.getAdvanceBonus(col, botPlayer, state.cols);
                            tileScore += (actualOccupant.power * (actualOccupant.speed || 1) * genes.COMBAT_BOOST) + (advanceBonus * 2);
                        } else {
                            let oppAdvance = this.getAdvanceBonus(col, opponent, state.cols);
                            tileScore -= (actualOccupant.power * (actualOccupant.speed || 1) * genes.COMBAT_BOOST) + (oppAdvance * 2);
                        }
                    } else {
                        // Empty tile in PLANT mode
                        let advanceBonus = this.getAdvanceBonus(col, botPlayer, state.cols);
                        if (maxMy > 0 && maxEnemy > 0) {
                            // Contested tile in PLANT mode: multi-unit control & combat margin
                            if (tileOwner === botPlayer) {
                                let myTotal = myReach.reduce((s, u) => s + (u.power * (u.speed || 1)), 0);
                                let enemyTotal = enemyReach.reduce((s, u) => s + (u.power * (u.speed || 1)), 0);
                                let margin = Math.max(1, myTotal - enemyTotal);
                                tileScore += (margin * genes.COMBAT_BOOST) + advanceBonus;
                            } else {
                                let enemyTotal = enemyReach.reduce((s, u) => s + (u.power * (u.speed || 1)), 0);
                                let myTotal = myReach.reduce((s, u) => s + (u.power * (u.speed || 1)), 0);
                                let margin = Math.max(1, enemyTotal - myTotal);
                                tileScore -= (margin * genes.COMBAT_BOOST) + this.getAdvanceBonus(col, opponent, state.cols);
                            }
                        } else if (maxEnemy > 0) {
                            let oppPwr = enemyReach.reduce((s, u) => Math.max(s, u.power * (u.speed || 1)), 0);
                            tileScore -= (oppPwr * genes.COMBAT_BOOST) + this.getAdvanceBonus(col, opponent, state.cols);
                        } else {
                            // maxEnemy === 0: Unthreatened safe territory in PLANT mode.
                            // Adding a 2nd unit does NOT double this score; it was controlled and still is!
                            tileScore += advanceBonus;
                        }
                    }

                    for (let u of state.units) {
                        if (u.type === 'observation') {
                            let dist = hexMath.offsetDistance(u.col, u.row, col, row);
                            if (dist <= 6) {
                                let ringNum = Math.floor(dist) + 1;
                                let scoreVal = (genes.OBS_BOOST / ringNum);
                                tileScore += (u.player === botPlayer ? scoreVal : -scoreVal);
                            }
                        }
                    }

                    const flags = state.units.filter(u => u.isFlag);
                    for (let f of flags) {
                        let fSign = f.player === botPlayer ? 1 : -1;
                        let dist = hexMath.offsetDistance(f.col, f.row, col, row);
                        if (dist === 0) {
                            tileScore += fSign * f.speed * genes.FLAG_TILE_CONSTANT;
                        } else if (dist <= 5) {
                            let ringNum = Math.floor(dist);
                            let flagEnemyBaseCol = (f.player === 'BLUE') ? state.cols - 1 : 0;

                            let redZone = false;
                            for (let cx = 0; cx < state.cols; cx++) {
                                for (let cy = 0; cy < state.rows; cy++) {
                                    if (cx === flagEnemyBaseCol && hexMath.offsetDistance(f.col, f.row, cx, cy) <= 5) {
                                        redZone = true;
                                        break;
                                    }
                                }
                                if (redZone) break;
                            }

                            if (redZone) ringNum = 1;

                            let tileDistToEnemyBase = Math.abs(col - flagEnemyBaseCol);
                            let flagDistToEnemyBase = Math.abs(f.col - flagEnemyBaseCol);
                            let direction = (tileDistToEnemyBase < flagDistToEnemyBase) ? 1 : -1;

                            let multiplier = 1 + (genes.FLAG_BOOST * ringNum * direction);
                            if (f.player === tileOwner) {
                                let advanceBonus = this.getAdvanceBonus(col, botPlayer, state.cols);
                                tileScore += fSign * advanceBonus * (multiplier - 1);
                            }
                        }
                    }
                }

                tileScores.push({ col, row, val: tileScore });
            }
        }
        return tileScores;
    }

    evaluateBoard(state, botPlayer) {
        const opponent = botPlayer === 'BLUE' ? 'RED' : 'BLUE';
        const botGoalCol = botPlayer === 'BLUE' ? state.cols - 1 : 0;
        const oppGoalCol = botPlayer === 'BLUE' ? 0 : state.cols - 1;

        let hasOwnFlagBase = state.units.some(u => u.player === botPlayer && u.isFlag && u.col === botGoalCol);
        let hasEnemyFlagBase = state.units.some(u => u.player === opponent && u.isFlag && u.col === oppGoalCol);

        let hasOwnCombatBase = state.gameMode === 'INVADE' && state.units.some(u => u.player === botPlayer && !u.isFlag && u.col === botGoalCol);
        let hasEnemyCombatBase = state.gameMode === 'INVADE' && state.units.some(u => u.player === opponent && !u.isFlag && u.col === oppGoalCol);

        if (hasOwnFlagBase || hasOwnCombatBase) return 900000000;
        if (hasEnemyFlagBase || hasEnemyCombatBase) return -900000000;

        let tileScores = this.evaluateTileScores(state, botPlayer);
        let score = 0;
        for (let t of tileScores) {
            if (t.val !== null && t.val !== undefined) {
                score += t.val;
            }
        }

        let reachMap = this.computeReachability(state);
        for (let u of state.units) {
            if (u.type === 'observation') continue;
            let tileKey = `${u.col},${u.row}`;
            let occ = reachMap.get(tileKey) || [];
            let threats = occ.filter(en => en.player !== u.player && !en.isFlag && en.type !== 'observation' && en.power >= u.power);
            if (threats.length > 0) {
                let penalty = 500000;
                score += (u.player === botPlayer ? -penalty : penalty);
            }
        }

        if (state.currentPlayer === botPlayer) {
            let bank = botPlayer === 'BLUE' ? state.blue_credits : state.red_credits;
            score -= bank * 2;
        }

        return score;
    }

    generateHeatmap(state, botPlayer) {
        let heatmapCache = this.evaluateTileScores(state, botPlayer);

        let validScores = heatmapCache.filter(h => h.val !== null && h.val !== undefined && !h.isBarricade);
        let min = validScores.length > 0 ? Math.min(...validScores.map(h => h.val)) : 0;
        let max = validScores.length > 0 ? Math.max(...validScores.map(h => h.val)) : 0;

        let range = max - min;
        if (range === 0) range = 1; // Prevent division by zero

        const reachMap = this.computeReachability(state);
        const botCredits = botPlayer === 'BLUE' ? state.blue_credits : state.red_credits;
        const botHomeCol = botPlayer === 'BLUE' ? 0 : state.cols - 1;
        const canDeploy = (botCredits !== undefined ? botCredits : 100) >= 10;

        for (let h of heatmapCache) {
            if (h.isBarricade || h.val === null) {
                h.occupied = false;
                h.norm = 0;
                h.botReachable = false;
                continue;
            }

            let actualOccupant = state.units.find(u => u.col === h.col && u.row === h.row);
            h.occupied = !!actualOccupant;

            if (!h.occupied) {
                h.norm = (h.val - min) / range; // 0.0 to 1.0
            } else {
                h.norm = 0.5;
            }

            // Determine if reachable by the AI bot this turn:
            // 1. A bot unit on the board can move to / attack / stay on this tile
            const occupants = reachMap.get(`${h.col},${h.row}`) || [];
            const unitCanReach = occupants.some(u => u.player === botPlayer);
            // 2. Or this is a bot home tile that can be deployed to
            const deployCanReach = canDeploy && (h.col === botHomeCol) && !actualOccupant;

            h.botReachable = unitCanReach || deployCanReach;
        }
        return heatmapCache;
    }

    generateActionTreeValues(state, botPlayer) {
        let cache = [];
        let pwr = 5; let spd = 3;
        let actions = this.generateCandidateActions(state, botPlayer);

        let uniqueTargets = new Set();
        let tileVals = {};

        for (let a of actions) {
            let key = `${a.targetCol},${a.targetRow}`;
            if (!uniqueTargets.has(key)) {
                uniqueTargets.add(key);
                let mockState = this.cloneState({ ...state, units: state.units.map(u => ({ ...u })) });

                let occupantIndex = mockState.units.findIndex(u => u.col === a.targetCol && u.row === a.targetRow);
                if (occupantIndex !== -1) mockState.units.splice(occupantIndex, 1);

                mockState.units.push({ id: 'X', type: 'combat', power: pwr, speed: spd, strength: pwr, isFlag: false, player: botPlayer, col: a.targetCol, row: a.targetRow });

                let rawScore = this.evaluateBoard(mockState, botPlayer);
                tileVals[key] = Math.round(rawScore);
            }
        }

        let uniqueVals = Object.values(tileVals);
        let min = uniqueVals.length > 0 ? Math.min(...uniqueVals) : 0;
        let max = uniqueVals.length > 0 ? Math.max(...uniqueVals) : 100;

        for (let key of uniqueTargets) {
            let [c, r] = key.split(',').map(Number);
            let val = tileVals[key];
            let norm = 0.5;
            if (max > min) {
                norm = (val - min) / (max - min);
            }
            cache.push({
                col: c,
                row: r,
                val: val,
                norm: norm
            });
        }
        return cache;
    }
}


// --- main.js ---




 // New Influence Map AI

document.addEventListener('DOMContentLoaded', () => {

    const uiLayer = document.getElementById('ui-layer');
    const configModal = document.getElementById('config-modal');
    const mainMenu = document.getElementById('main-menu');
    const onlineModal = document.getElementById('online-modal');

    let GLOBAL_NETWORK = null;
    let GLOBAL_AI = null;
    let GLOBAL_MODE = 'LOCAL';

    // 1. Check for immediate Guest Invite overrides
    const urlParams = new URLSearchParams(window.location.search);
    const guestHostId = urlParams.get('host');

    if (guestHostId) {
        mainMenu.classList.add('hidden');
        configModal.classList.add('hidden');

        // Show connecting overlay instead of immediate game
        onlineModal.classList.remove('hidden');
        const mContent = document.querySelector('#online-modal .menu-content');
        if (mContent) mContent.innerHTML = '<h2>Connecting...</h2><p>Waiting for Host Rules...</p>';

        GLOBAL_MODE = 'ONLINE';
        GLOBAL_NETWORK = new NetworkManager(guestHostId);

        // Wait for config from network instead of launching immediately
        window.onReceiveNetworkConfig = (remoteConfig) => {
            onlineModal.classList.add('hidden');
            uiLayer.classList.remove('hidden');
            launchGame(remoteConfig);
            if (GLOBAL_NETWORK) {
                GLOBAL_NETWORK.bindEngines(GLOBAL_GAME, GLOBAL_UI);
                if (GLOBAL_NETWORK.ui) GLOBAL_NETWORK.ui.updateHUD();
            }
        };
    } else {
        // default bootup, hide config for now
        configModal.classList.add('hidden');
    }

    // 2. Bind Main Menu Options
    document.getElementById('btn-mode-local').addEventListener('click', () => {
        mainMenu.classList.add('hidden');
        configModal.classList.remove('hidden');
        GLOBAL_MODE = 'LOCAL';
    });

    document.getElementById('btn-mode-ai').addEventListener('click', () => {
        mainMenu.classList.add('hidden');
        configModal.classList.remove('hidden');
        GLOBAL_MODE = 'AI';
    });

    document.getElementById('btn-mode-online').addEventListener('click', () => {
        mainMenu.classList.add('hidden');
        configModal.classList.remove('hidden');
        GLOBAL_MODE = 'ONLINE';
    });

    const lobbyModal = document.getElementById('lobby-modal');

    function fetchLobby() {
        const lobbyList = document.getElementById('lobby-list');
        lobbyList.innerHTML = '<p style="color: #ccc; text-align: center;">Loading games...</p>';
        fetch('/api/lobby')
            .then(res => res.json())
            .then(data => {
                lobbyList.innerHTML = '';
                if (data.length === 0) {
                    lobbyList.innerHTML = '<p style="color: #ccc; text-align: center; margin-top: 20px;">No online games found.</p>';
                    return;
                }
                data.forEach(game => {
                    const div = document.createElement('div');
                    div.style.cssText = 'padding: 10px; background: rgba(255,255,255,0.1); border-radius: 4px; display: flex; justify-content: space-between; align-items: center;';
                    div.innerHTML = `
                        <div>
                            <strong style="color: #60a5fa;">${game.name}'s Game</strong>
                            <div style="font-size: 0.8rem; color: #aaa;">Host ID: ${game.hostId.substring(0, 8)}...</div>
                        </div>
                        <button class="btn-primary" style="padding: 5px 15px; font-size: 0.9rem;">Join</button>
                    `;
                    div.querySelector('button').onclick = () => {
                        lobbyModal.classList.add('hidden');
                        document.getElementById('online-modal').classList.remove('hidden');
                        const mContent = document.querySelector('#online-modal .menu-content');
                        if (mContent) mContent.innerHTML = '<h2>Connecting...</h2><p>Waiting for Host Rules...</p>';

                        GLOBAL_MODE = 'ONLINE';
                        const myName = document.getElementById('player-name').value || 'Guest';
                        GLOBAL_NETWORK = new NetworkManager(game.hostId, myName);

                        window.onReceiveNetworkConfig = (remoteConfig) => {
                            document.getElementById('victory-modal').classList.add('hidden');
                            document.getElementById('online-modal').classList.add('hidden');
                            uiLayer.classList.remove('hidden');
                            remoteConfig.redName = myName;
                            // Engine internally maps NetworkManager when GLOBAL_NETWORK is provided
                            launchGame(remoteConfig);
                        };
                    };
                    lobbyList.appendChild(div);
                });
            })
            .catch(err => {
                lobbyList.innerHTML = '<p style="color: #ef4444; text-align: center;">Failed to load lobby list.</p>';
            });
    }

    document.getElementById('btn-mode-find').addEventListener('click', () => {
        mainMenu.classList.add('hidden');
        lobbyModal.classList.remove('hidden');
        fetchLobby();
    });

    document.getElementById('btn-lobby-refresh').addEventListener('click', fetchLobby);
    document.getElementById('btn-lobby-back').addEventListener('click', () => {
        lobbyModal.classList.add('hidden');
        mainMenu.classList.remove('hidden');
    });

    // Map Radio configurations to Custom Input row visibility
    document.querySelectorAll('input[name="cfg-dims"]').forEach(r => {
        r.addEventListener('change', (e) => {
            const customRow = document.getElementById('custom-dims-row');
            if (e.target.value === 'CUSTOM') {
                customRow.style.display = 'flex';
            } else {
                customRow.style.display = 'none';
            }
        });
    });

    // 3. Bind the traditional Local Start (proceeding from Config screen)
    document.getElementById('btn-start-game').addEventListener('click', () => {
        configModal.classList.add('hidden');

        if (GLOBAL_MODE === 'ONLINE') {
            onlineModal.classList.remove('hidden');
            GLOBAL_NETWORK = new NetworkManager();
            GLOBAL_NETWORK.hostGame();
        } else {
            uiLayer.classList.remove('hidden');
        }

        launchGame();
    });

    window.restartCurrentGame = launchGame;
    function launchGame(overrideConfig = null) {
        document.getElementById('victory-modal').classList.add('hidden');
        let config;

        if (overrideConfig) {
            config = overrideConfig;
        } else {
            // Read configs (or use defaults if bypassed by Online guest)
            let boardW = 30;
            let boardH = 15;
            const dimsRadio = document.querySelector('input[name="cfg-dims"]:checked');
            if (dimsRadio) {
                if (dimsRadio.value === 'CUSTOM') {
                    boardW = parseInt(document.getElementById('cfg-width').value) || 40;
                    boardH = parseInt(document.getElementById('cfg-height').value) || 20;
                } else {
                    const s = dimsRadio.value.split(',');
                    boardW = parseInt(s[0]);
                    boardH = parseInt(s[1]);
                }
            }

            config = {
                type: document.querySelector('input[name="cfg-type"]:checked') ? document.querySelector('input[name="cfg-type"]:checked').value : 'INVADE',
                mode: document.querySelector('input[name="cfg-mode"]:checked') ? document.querySelector('input[name="cfg-mode"]:checked').value : 'STANDARD',
                powerMode: document.querySelector('input[name="cfg-powerMode"]:checked') ? document.querySelector('input[name="cfg-powerMode"]:checked').value : 'DEPLETING',
                width: boardW,
                height: boardH,
                credits: parseInt(document.getElementById('cfg-credits').value) || 50,
                flagCost: parseInt(document.getElementById('cfg-flagCost').value) || 10,
                barricadeCost: parseInt(document.getElementById('cfg-barricadeCost').value) || 10,
                maxStrength: parseInt(document.getElementById('cfg-maxStrength').value) || 10,
                maxSpeed: parseInt(document.getElementById('cfg-maxSpeed').value) || 5,
                timerDuration: parseInt(document.querySelector('input[name="cfg-timer"]:checked') ? document.querySelector('input[name="cfg-timer"]:checked').value : '0'),
                blueName: document.getElementById('player-name').value || 'Player 1',
                redName: GLOBAL_MODE === 'AI' ? 'Bot' : 'Player 2'
            };
        }
        configModal.classList.add('hidden');
        uiLayer.classList.remove('hidden');

        // Max ranges are now handled dynamically by the buildDeployMatrix method in ui.js

        // Initialize systems
        const canvas = document.getElementById('gameCanvas');

        const game = new HexGame(config);
        const render = new RenderEngine(canvas, game);
        const input = new InputController(canvas, game, render);
        const ui = new UIManager(game, render, input);

        game.ui = ui; // Bind explicitly for animation dispatches

        // Attach special engine classes globally so game.js can easily broadcast
        game.gameMode = GLOBAL_MODE;
        if (GLOBAL_NETWORK) {
            GLOBAL_NETWORK.bindEngines(game, ui);
            ui.network = GLOBAL_NETWORK;
            game.network = GLOBAL_NETWORK;

            if (GLOBAL_NETWORK.isHost && GLOBAL_NETWORK.connected) {
                GLOBAL_NETWORK.sendData({
                    type: 'CONFIG',
                    config: config
                });
            }
        }

        if (GLOBAL_MODE === 'AI') {
            // Deploying the freshly unified strict mathematical engine (V1)
            GLOBAL_AI = new AIBotV3(game);
            game.aiBot = GLOBAL_AI;
            game.localTeam = 'BLUE';
        }

        // On game state changes, trigger AI if necessary
        game.onStateChange = () => {
            ui.updateHUD();
            if (GLOBAL_MODE === 'AI' && GLOBAL_AI && game.activeTeam === 'RED') {
                game.logSystem('Computer is thinking...');
                setTimeout(() => {
                    if (game.activeTeam === 'RED') {
                        GLOBAL_AI.executeTurn();
                    }
                }, 600); // Stall execution precisely past the native 500ms DOM interpolation
            }
        };

        // Sync initial HUD state
        ui.updateHUD();
        game.logSystem(`Game Started! Grid: ${config.width}x${config.height} | Mode: ${config.mode}`);

        window.gameAPI = { game, render, input, ui, network: GLOBAL_NETWORK, ai: GLOBAL_AI };

        // Do not start timer if we are the Host waiting for a Guest to connect.
        // The NetworkManager will start it when the guest joins.
        const isWaitingHost = GLOBAL_MODE === 'ONLINE' && (!GLOBAL_NETWORK || GLOBAL_NETWORK.isHost) && !overrideConfig;
        if (!isWaitingHost && game.timerDuration > 0) {
            game.startTimer();
        }
    }
});


