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
        const q = (2/3 * px) / hexRadius;
        const r = (-1/3 * px + Math.sqrt(3)/3 * py) / hexRadius;
        
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
    
    // Get adjacent hexes (Axial coords)
    // Flat-topped directions: right, bottom-right, bottom-left, left, top-left, top-right
    hexDirections: [
        {dq: 1, dr: 0},
        {dq: 1, dr: -1},
        {dq: 0, dr: -1},
        {dq: -1, dr: 0},
        {dq: -1, dr: 1},
        {dq: 0, dr: 1}
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
            this.cost = flagCost * speed;
        } else {
            this.strength = strength;
            this.speed = speed;
            this.isFlag = false;
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

        this.logSystem(`Game initialized. ${this.blueName}'s Turn.`);
        this.saveSnapshot();
        // Timers in network games will be started manually upon connection
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

        const cost = this.config ? (this.config.barricadeCost || 5) : 5;
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

        const cost = this.config ? (this.config.barricadeCost || 5) : 5;
        const t = this.getTile(col, row);
        const u = t.unit;
        const footprint = this.getBarricadeFootprint(col, row, u.strength, offset);

        // Commit Barricade
        this.credits[this.activeTeam] -= cost;
        // Kill unit
        t.unit = null;
        // Paint black
        for (let pt of footprint) {
            if (this.isValid(pt.col, pt.row)) {
                this.getTile(pt.col, pt.row).isBarricade = true;
            }
        }

        this.logAction(this.activeTeam, `Constructed a vertical barricade at [${col},${row}].`);
        this.actionUsed = true;
        this.selectedTile = null;
        this.checkWinConditions();
        if (!this.winner) this.endTurn(isSyncEvent, true);
        return true;
    }

    getFogOfWar(col, row, perspective) {
        if (this.config.mode === 'VISIBLE' || this.winner !== null) return false;

        const tile = this.getTile(col, row);
        if (!tile || !tile.unit) return false;

        const isEnemy = tile.unit.team !== perspective;
        if (!isEnemy) return false;

        if (tile.unit.exposedCounter && tile.unit.exposedCounter > 0) return false;

        if (this.config.mode === 'HIDDEN') return true;

        if (this.config.mode === 'NEARBY') {
            const maxRange = this.config.maxSpeed + 1;

            for (let c = 0; c < this.cols; c++) {
                for (let r = 0; r < this.rows; r++) {
                    const t = this.getTile(c, r);
                    if (t.unit && t.unit.team === perspective) {
                        if (hexMath.offsetDistance(col, row, c, r) <= maxRange) {
                            return false; // Found a friendly unit close enough
                        }
                    }
                }
            }
            return true; // Unseen
        }

        return false;
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
            const size = this.hexRadius * 4 * this.camera.zoom;
            const screenX = (pt.x * this.camera.zoom) + this.camera.x;
            const screenY = (pt.y * this.camera.zoom) + this.camera.y;

            // Center image over tile with a visual anchor shift upwards
            if (exp.el) {
                exp.el.style.left = (screenX - size / 2) + 'px';
                exp.el.style.top = (screenY - size / 2 - size * 0.075) + 'px';
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

        requestAnimationFrame(() => this.drawLoop());
    }
}


// --- ui.js ---
// js/ui.js
class UIManager {
    constructor(game, render, input) {
        this.game = game;
        this.render = render;
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
        if (btnHelp && helpPanel) {
            const showHelp = () => helpPanel.classList.remove('hidden');
            const hideHelp = () => helpPanel.classList.add('hidden');

            btnHelp.addEventListener('mousedown', showHelp);
            btnHelp.addEventListener('touchstart', showHelp);

            btnHelp.addEventListener('mouseup', hideHelp);
            btnHelp.addEventListener('mouseleave', hideHelp);
            btnHelp.addEventListener('touchend', hideHelp);
        }

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
        if (btnRestart) btnRestart.onclick = () => { if (window.restartCurrentGame) window.restartCurrentGame(); };

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
                const s = this.game.selectedTile.split(',');
                const col = parseInt(s[0]);
                const row = parseInt(s[1]);
                const unit = this.game.getTile(col, row).unit;
                if (!unit) return;

                const length = Math.floor((unit.strength + 1) / 2) + 1;
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
        });
    }

    updateTooltip(e) {
        this.render.hoverHexes = null;
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
            let hideStats = this.game.getFogOfWar(col, row, perspective);

            if (tile.unit.exposedCounter && tile.unit.exposedCounter > 0) {
                hideStats = false;
            }

            if (!hideStats) {
                if (!this.game.selectedTile && !this._contextTarget) {
                    this.render.hoverHexes = this.game.getReachableHexes(col, row, tile.unit.team, tile.unit.speed);
                    this.render.hoverHexesColor = 'rgba(255, 255, 255, 0.06)';
                }

                document.getElementById('tt-str').innerText = tile.unit.strength;
                document.getElementById('tt-spd').innerText = tile.unit.speed;
                this.unitTooltip.classList.remove('hidden');

                // Position relative to local canvas bounds
                const rect = this.canvas.getBoundingClientRect();
                this.unitTooltip.style.left = `${e.clientX - rect.left}px`;
                this.unitTooltip.style.top = `${e.clientY - rect.top - 20}px`;
                return;
            }
        }

        if (this.unitTooltip) this.unitTooltip.classList.add('hidden');
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
            document.getElementById('info-mode').innerText = this.game.config.type === 'PLANT' ? 'Plant Flag' : 'Invade';

            const vString = {
                'HIDDEN': 'Your Units',
                'NEARBY': 'Nearby Units',
                'VISIBLE': 'All Units'
            };
            document.getElementById('info-vis').innerText = vString[this.game.config.mode] || 'Unknown';
            document.getElementById('info-power').innerText = this.game.config.powerMode === 'DEPLETING' ? 'Depleting' : 'Constant';
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
            goalText.innerText = this.game.config.type === 'PLANT' ?
                "Deploy a Flag and carry it into the absolute opposite end of the board." :
                "Move any friendly unit into the absolute opposite end of the board.";
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
            if (this.game.localTeam === 'BLUE') {
                bigText.innerHTML = 'Your<br>Turn';
            } else {
                bigText.innerHTML = `${this.game.blueName}<br>Turn`;
            }
            skipBtn.classList.remove('btn-red');
        } else {
            bluePanel.classList.remove('active-turn');
            redPanel.classList.add('active-turn');

            const rightBox = document.getElementById('right-turn-container');
            if (rightBox) rightBox.appendChild(turnSidebar);

            bigText.style.color = '#ef4444';
            if (this.game.localTeam === 'RED') {
                bigText.innerHTML = 'Your<br>Turn';
            } else {
                bigText.innerHTML = `${this.game.redName}<br>Turn`;
            }
            skipBtn.classList.add('btn-red');
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

    openContextMenu(x, y, col, row, options) {
        this.closeContextMenu();
        this._contextTarget = { col, row };

        // Build buttons first to populate DOM
        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'btn-action';
            btn.innerText = opt.label;
            btn.addEventListener('click', opt.onClick);
            this.contextOptions.appendChild(btn);
        });

        this.contextMenu.classList.remove('hidden');

        const rect = this.canvas.getBoundingClientRect();

        // Estimate the maximum possible size of this menu when the deploy panel expands (~350px tall, ~270px wide).
        const estMaxHeight = 350;
        const estMaxWidth = 270;

        let localX = x - rect.left;
        let localY = y - rect.top;

        let safeX = localX > rect.width / 2 ? localX - estMaxWidth - 10 : localX + 10;
        let safeY = localY + 10;

        if (safeX < 10) safeX = 10;
        if (safeY + estMaxHeight > rect.height) {
            safeY = Math.max(10, rect.height - estMaxHeight - 20);
        }

        this.contextMenu.style.left = `${safeX}px`;
        this.contextMenu.style.top = `${safeY}px`;
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
            this.render.highlightHexes = this.game.getReachableHexes(col, row, this.game.activeTeam, tile.unit.speed);
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

                const rect = this.canvas.getBoundingClientRect();
                let localX = e.clientX - rect.left;
                let localY = e.clientY - rect.top;
                let estMaxWidth = 350;
                let estMaxHeight = 350;

                let safeX = localX > rect.width / 2 ? localX - estMaxWidth - 10 : localX + 10;
                let safeY = localY + 10;

                if (safeX < 10) safeX = 10;
                if (safeY + estMaxHeight > rect.height) {
                    safeY = Math.max(10, rect.height - estMaxHeight - 20);
                }

                this.contextMenu.style.left = `${safeX}px`;
                this.contextMenu.style.top = `${safeY}px`;

                this.contextDeployPanel.classList.remove('hidden');

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
                btn.style.width = '35px';
                btn.style.height = '35px';
                btn.style.borderRadius = '6px';
                btn.style.cursor = 'pointer';
                btn.style.display = 'flex';
                btn.style.flexDirection = 'column';
                btn.style.alignItems = 'center';
                btn.style.justifyContent = 'center';
                btn.style.lineHeight = '1.1';
                btn.style.transition = 'all 0.15s ease-out';
                btn.style.userSelect = 'none';
                const currentCredits = this.game.credits[this.game.activeTeam];

                if (cost > currentCredits) {
                    btn.style.opacity = '0.3';
                    btn.style.cursor = 'not-allowed';
                }

                btn.innerHTML = ``;

                const sizeP = maxPower > 0 ? 0.5 + (p / maxPower) * 0.5 : 0;
                const sizeS = 0.5 + (s / maxSpeed) * 0.5;

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
                const length = Math.floor((tile.unit.strength + 1) / 2) + 1;
                this.barricadeOffset = Math.floor(length / 2); // initialize offset

                this.render.hoverHexes = null;
                this.render.previewBarricade = this.game.getBarricadePreview(col, row, this.barricadeOffset);

                const cost = this.game.config ? (this.game.config.barricadeCost || 5) : 5;
                const opts = [];
                opts.push({
                    label: `Confirm Barricade (-${cost} cr)`,
                    onClick: () => {
                        this.game.createBarricade(col, row, this.barricadeOffset);
                        this.resetActiveState();
                        this.updateHUD();
                    }
                });
                this.openContextMenu(e.clientX, e.clientY, col, row, opts);
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

                const rect = this.canvas.getBoundingClientRect();
                let localX = e.clientX - rect.left;
                let localY = e.clientY - rect.top;
                let estMaxWidth = 350;
                let estMaxHeight = 350;

                let safeX = localX > rect.width / 2 ? localX - estMaxWidth - 10 : localX + 10;
                let safeY = localY + 10;

                if (safeX < 10) safeX = 10;
                if (safeY + estMaxHeight > rect.height) {
                    safeY = Math.max(10, rect.height - estMaxHeight - 20);
                }

                this.contextMenu.style.left = `${safeX}px`;
                this.contextMenu.style.top = `${safeY}px`;

                this.contextDeployPanel.classList.remove('hidden');
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

        const btnRestart = document.getElementById('btn-restart-game');
        if (btnRestart) btnRestart.onclick = () => {
            if (window.restartCurrentGame) {
                document.getElementById('victory-modal').classList.add('hidden');
                document.getElementById('ui-layer').classList.remove('hidden');
                window.restartCurrentGame();
            }
        };

        document.getElementById('btn-review-game').onclick = () => {
            modal.classList.add('hidden');
        };
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


// --- ai.js ---
// js/ai.js
// Heuristic Bot for RED Team
class AIBot {
    constructor(game) {
        this.game = game;
    }

    executeTurn() {
        if (this.game.activeTeam !== 'RED') return;
        if (this.game.winner) return;

        this.game.logSystem('Computer is thinking...');

        // Wait 1 second for simulation feel
        setTimeout(() => {
            if (this.game.activeTeam !== 'RED') return;
            this.decideAction();
        }, 1200);
    }

    decideAction() {
        // Check if we need to deploy Flag
        if (this.game.deployCounts['RED'] >= 4 && !this.game.hasFlag['RED']) {
            this.deployFlag();
            return;
        }

        // See if we have sufficient credits to deploy a strong unit
        // Try to maintain board presence
        const redUnits = this.countUnits('RED');

        // Just deploy sequentially if low on units
        if (redUnits < 3 && this.game.credits['RED'] >= 9) {
            if (!this.game.hasFlag['RED'] && this.game.credits['RED'] >= 10) {
                this.deployFlag();
            } else {
                this.deployCombat();
            }
            return;
        }

        // If we have troops, try to move them!
        if (this.attemptMove()) {
            return;
        }

        // If movement failed but we have credits, deploy
        if (this.game.credits['RED'] >= 10) {
            this.deployCombat();
            return;
        }

        // Fallback: Skip turn
        this.game.logAction('RED', 'AI chose to Skip Action.');
        this.game.endTurn();
    }

    countUnits(team) {
        let count = 0;
        this.game.board.forEach(t => { if (t.unit && t.unit.team === team) count++; });
        return count;
    }

    deployFlag() {
        const deployOptions = this.getEmptyBaseTiles(this.game.cols - 1);
        if (deployOptions.length > 0) {
            const loc = deployOptions[Math.floor(Math.random() * deployOptions.length)];
            this.game.deployUnit('RED', 'flag', 0, 1, loc.c, loc.r);
        } else {
            this.game.endTurn();
        }
    }

    deployCombat() {
        const deployOptions = this.getEmptyBaseTiles(this.game.cols - 1);
        if (deployOptions.length > 0) {
            const loc = deployOptions[Math.floor(Math.random() * deployOptions.length)];
            // Spend up to 12 credits (e.g. 4 str 3 spd = 12, or just random)
            this.game.deployUnit('RED', 'combat', 4, 3, loc.c, loc.r);
        } else {
            this.game.endTurn();
        }
    }

    getEmptyBaseTiles(col) {
        let res = [];
        for (let r = 0; r < this.game.rows; r++) {
            if (this.game.isValid(col, r)) {
                let t = this.game.getTile(col, r);
                if (!t.unit && !t.isBarricade) res.push({ c: col, r });
            }
        }
        return res;
    }

    attemptMove() {
        // Collect all available red units that can move
        let movable = [];
        for (let c = 0; c < this.game.cols; c++) {
            for (let r = 0; r < this.game.rows; r++) {
                let t = this.game.getTile(c, r);
                if (t.unit && t.unit.team === 'RED' && !t.unit.hasMoved && !t.unit.justDeployed && !t.unit.isFlag) {
                    movable.push({ c, r, u: t.unit });
                }
            }
        }

        if (movable.length === 0) return false;

        // Pick random
        const chosen = movable[Math.floor(Math.random() * movable.length)];

        // Look for targets (we want to step leftwards to attack)
        const reach = this.game.getReachableHexes(chosen.c, chosen.r, chosen.u.speed);

        let bestTarget = null;
        let bestScore = -999;

        for (let k of reach) {
            const trgSpl = k.split(',');
            const tc = parseInt(trgSpl[0]);
            const tr = parseInt(trgSpl[1]);
            const tTile = this.game.getTile(tc, tr);

            // Score based on moving Left (towards 0), or killing blue units
            let score = (chosen.c - tc);
            if (tTile.unit && tTile.unit.team === 'BLUE') {
                score += 10; // kill priority
            }

            if (score > bestScore) {
                bestScore = score;
                bestTarget = { c: tc, r: tr };
            }
        }

        if (bestTarget) {
            this.game.moveUnit(chosen.c, chosen.r, bestTarget.c, bestTarget.r);
            return true;
        }

        return false;
    }
}


// --- main.js ---
// js/main.js





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
                barricadeCost: parseInt(document.getElementById('cfg-barricadeCost').value) || 5,
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
        }

        if (GLOBAL_MODE === 'AI') {
            GLOBAL_AI = new AIBot(game);
        }

        // On game state changes, trigger AI if necessary
        game.onStateChange = () => {
            ui.updateHUD();
            if (GLOBAL_MODE === 'AI' && GLOBAL_AI && game.activeTeam === 'RED') {
                GLOBAL_AI.executeTurn();
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


