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
        return this.history.length > 0 && this.history[this.history.length - 1].winner !== null;
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
            snap.board.set(k, { unit: v.unit ? { ...v.unit } : null, isBarricade: v.isBarricade });
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
        }

        let steppedForward = (index === this.historyIndex + 1);
        let steppedBackward = (index === this.historyIndex - 1);

        this.historyIndex = index;
        const snap = this.history[index];

        // Restore deep copy
        this.board = new Map();
        for (let [k, v] of snap.board.entries()) {
            this.board.set(k, { unit: v.unit ? { ...v.unit } : null, isBarricade: v.isBarricade });
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

        if (this.ui && this.ui.render) {
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
                    targetTile.unit = null;

                    if (this.config.powerMode === 'DEPLETING' && !defender.isFlag && !u.isFlag) {
                        u.strength--;
                        if (u.strength <= 0) {
                            survived = false;
                            this.getTile(currC, currR).unit = null;
                            this.logAction(u.team, `Combat: ${u.team} unit succumbed to exhaustion after battle at [${trgC},${trgR}].`, true);
                            break;
                        }
                    }
                    u.exposedCounter = 2; // Attacker survived and becomes visibly exposed
                } else {
                    this.logAction(u.team, `Combat: ${u.strength} Power died attacking ${defender.strength} Power at [${trgC},${trgR}].`, true);
                    survived = false;
                    this.getTile(currC, currR).unit = null; // attacker dead, erase from current step

                    if (this.config.powerMode === 'DEPLETING' && !defender.isFlag && !u.isFlag) {
                        defender.strength--;
                        if (defender.strength <= 0) {
                            targetTile.unit = null;
                            this.logAction(defender.team, `Combat: ${defender.team} defender succumbed to exhaustion after battle at [${trgC},${trgR}].`, true);
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

        if (currC !== startCol || currR !== startRow) {
            this.lastMove = { sC: startCol, sR: startRow, eC: currC, eR: currR, unit: { ...u } };
            if (this.ui && this.ui.render) {
                const trgt = survived ? this.getTile(currC, currR).unit : null;
                this.ui.render.addMoveAnimation(startCol, startRow, currC, currR, { ...u }, 500, trgt);
            }
        } else if (!survived) {
            this.lastMove = { sC: startCol, sR: startRow, eC: currC, eR: currR, unit: { ...u } };
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
        const length = Math.floor((power + 1) / 2) + 1;
        const actualOffset = offset !== undefined ? offset : Math.floor(length / 2);
        const startRow = row - actualOffset;
        const endRow = startRow + length - 1;

        let footprint = [];
        // Core vertical spine
        for (let i = 0; i < length; i++) {
            footprint.push({ col: col, row: startRow + i });
        }

        // C-shape wings pointing towards enemy home along continuous diagonals
        let team = this.activeTeam;
        if (this.isValid(col, row) && this.getTile(col, row).unit) {
            team = this.getTile(col, row).unit.team;
        }

        let wingDepth = (power >= 4) ? 2 : 1;

        let topAxial = hexMath.offsetToAxial(col, startRow);
        let botAxial = hexMath.offsetToAxial(col, endRow);

        // Blue pushes Top-Right (+1, -1) and Bottom-Right (+1, 0)
        // Red pushes Top-Left (-1, 0) and Bottom-Left (-1, +1)
        let topVector = team === 'BLUE' ? { dq: 1, dr: -1 } : { dq: -1, dr: 0 };
        let botVector = team === 'BLUE' ? { dq: 1, dr: 0 } : { dq: -1, dr: 1 };

        let curTop = { q: topAxial.q, r: topAxial.r };
        let curBot = { q: botAxial.q, r: botAxial.r };

        for (let d = 1; d <= wingDepth; d++) {
            curTop.q += topVector.dq;
            curTop.r += topVector.dr;
            let topOff = hexMath.axialToOffset(curTop.q, curTop.r);
            footprint.push({ col: topOff.col, row: topOff.row });

            curBot.q += botVector.dq;
            curBot.r += botVector.dr;
            let botOff = hexMath.axialToOffset(curBot.q, curBot.r);
            footprint.push({ col: botOff.col, row: botOff.row });
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

    getFogOfWar(col, row, perspective) {
        if (this.config.mode === 'VISIBLE' || this.isGameOver) return false;

        const tile = this.getTile(col, row);
        if (!tile || !tile.unit) return false;

        const isEnemy = tile.unit.team !== perspective;
        if (!isEnemy) return false;

        if (tile.unit.type === 'observation') return false;

        if (tile.unit.exposedCounter && tile.unit.exposedCounter > 0) return false;

        if (this.config.mode === 'HIDDEN') return true;

        if (this.config.mode === 'NEARBY') {
            for (let c = 0; c < this.cols; c++) {
                for (let r = 0; r < this.rows; r++) {
                    const t = this.getTile(c, r);
                    if (t.unit && t.unit.team === perspective) {
                        let viewRange = this.config.maxSpeed + 2;

                        if (hexMath.offsetDistance(col, row, c, r) <= viewRange) {
                            return false; // Found a friendly unit close enough
                        }
                    }
                }
            }
            return true; // Unseen
        }

        return false;
    }

    canSeeUnit(targetCol, targetRow, perspectiveTeam) {
        if (this.isGameOver) return true;

        // Collect all units for the perspective team
        const myUnits = [];
        for (let col = 0; col < this.cols; col++) {
            for (let row = 0; row < this.rows; row++) {
                const t = this.getTile(col, row);
                if (t.unit && t.unit.team === perspectiveTeam) {
                    myUnits.push({ col, row, type: t.unit.type });
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

            // Check intermediate steps exclusively (skip 0 which is source, skip length-1 which is target)
            for (let i = 1; i < line.length - 1; i++) {
                const step = line[i];
                if (this.isValid(step.col, step.row)) {
                    const stepTile = this.getTile(step.col, step.row);
                    if (stepTile.isBarricade) {
                        if (u.type === 'observation' && targetDist <= viewRange) {
                            continue; // Bypasses the barricade securely inside radius constraints
                        }
                        blocked = true;
                        break;
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
                // Exclude last tile in the loop since we want to see what is ON it even if barricade
                for (let i = 0; i < line.length - 1; i++) {
                    const stepCol = line[i].col;
                    const stepRow = line[i].row;
                    if (this.isValid(stepCol, stepRow)) {
                        if (this.getTile(stepCol, stepRow).isBarricade) {
                            if (isObservation && targetDist <= viewRange) {
                                continue;
                            }
                            blocked = true;
                            break;
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
        const winName = team === 'BLUE' ? this.blueName : this.redName;
        this.logSystem(`GAME OVER. ${winName} wins! ${reason}`);
        this.saveSnapshot();
        if (this.onWinner) this.onWinner(team, reason);
    }
}



try {
    const game = new HexGame({ type: 'INVADE', mode: 'HIDDEN', width: 10, height: 10, flagCost: 5, powerMode: 'DEPLETING' });
    game.credits['BLUE'] = 100;
    game.deployUnit('BLUE', 'combat', 5, 5, 0, 0); 

    // Blue moves and wins
    game.activeTeam = 'BLUE';
    game.actionUsed = false;
    
    // stub network and onLog to avoid errors
    game.logAction = function(){};
    game.logSystem = function(){};
    game.onWinner = function(){};
    
    // force invasion
    const u = game.getTile(0, 0).unit;
    u.speed = 100; 
    
    game.checkWinConditions = function() {
        this.setWinner('BLUE', 'winner testing');
    };
    
    game.moveUnit(0, 0, 9, 0); // triggers checkWinConditions

    console.log('isGameOver initially:', game.isGameOver);
    console.log('history length:', game.history.length);
    console.log('last snapshot winner:', game.history[game.history.length - 1].winner);
    console.log('Fog of war before loadSnapshot:', game.getFogOfWar(0, 0, 'RED'));
    console.log('Can see unit before loadSnapshot:', game.canSeeUnit(0, 0, 'RED'));

    game.loadSnapshot(0);
    
    console.log('--- AFTER SCRUBBING TO TURN 0 ---');
    console.log('isGameOver after loadSnapshot(0):', game.isGameOver);
    console.log('last snapshot winner after loadSnapshot(0):', game.history[game.history.length - 1].winner);
    console.log('Fog of war after loadSnapshot:', game.getFogOfWar(0, 0, 'RED'));
    console.log('Can see unit after loadSnapshot:', game.canSeeUnit(0, 0, 'RED'));

} catch (e) {
    console.error("ERROR:", e);
}
