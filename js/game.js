// js/game.js
import { hexMath } from './hex.js';
import { Unit } from './unit.js';

export class HexGame {
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
        // value: { unit: Unit|null, isBarricade: boolean, isMine: boolean }
        this.board = new Map();
        for (let col = 0; col < this.cols; col++) {
            for (let row = 0; row < this.rows; row++) {
                this.board.set(`${col},${row}`, { unit: null, isBarricade: false, barricadeTeam: null, barricadeId: null, isMine: false });
            }
        }

        this.initMines();

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

    initMines() {
        if (!this.config) return;
        let minePositions = Array.isArray(this.config.minePositions) ? this.config.minePositions : null;

        if (!minePositions) {
            const numMines = (typeof this.config.numMines === 'number') ? Math.max(0, this.config.numMines) : 2;
            minePositions = [];

            if (numMines > 0) {
                const minCol = Math.max(2, Math.floor(this.cols * 0.25));
                const maxCol = Math.min(this.cols - 3, Math.ceil(this.cols * 0.75) - 1);
                const minRow = this.rows > 4 ? 1 : 0;
                const maxRow = this.rows > 4 ? this.rows - 2 : this.rows - 1;
                const used = new Set();

                const isFarEnough = (c, r, minDist) => {
                    for (const pos of minePositions) {
                        const [pc, pr] = pos.split(',').map(Number);
                        if (hexMath.offsetDistance(c, r, pc, pr) < minDist) return false;
                    }
                    return true;
                };

                // If odd number of mines, place 1 near the center first
                let remaining = numMines;
                if (remaining % 2 === 1) {
                    const midCol = Math.floor(this.cols / 2);
                    const midRow = Math.floor(this.rows / 2);
                    const key = `${midCol},${midRow}`;
                    if (this.board.has(key)) {
                        minePositions.push(key);
                        used.add(key);
                        remaining--;
                    }
                }

                // Place symmetric pairs across the board center so both players have equal access
                const candidates = [];
                for (let c = minCol; c <= maxCol; c++) {
                    for (let r = minRow; r <= maxRow; r++) {
                        candidates.push({ c, r });
                    }
                }
                // Fallback to all non-home-zone tiles if needed
                if (candidates.length < remaining) {
                    for (let c = 2; c <= this.cols - 3; c++) {
                        for (let r = 0; r < this.rows; r++) {
                            candidates.push({ c, r });
                        }
                    }
                }

                // Shuffle candidates
                for (let i = candidates.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
                }

                for (const minDist of [3, 2, 1]) {
                    if (remaining <= 0) break;
                    for (const cand of candidates) {
                        if (remaining <= 0) break;
                        const c1 = cand.c;
                        const r1 = cand.r;
                        const c2 = this.cols - 1 - c1;
                        const r2 = this.rows - 1 - r1;
                        const k1 = `${c1},${r1}`;
                        const k2 = `${c2},${r2}`;

                        if (remaining >= 2) {
                            if (k1 === k2 || used.has(k1) || used.has(k2)) continue;
                            if (hexMath.offsetDistance(c1, r1, c2, r2) < minDist) continue;
                            if (!isFarEnough(c1, r1, minDist) || !isFarEnough(c2, r2, minDist)) continue;
                            minePositions.push(k1, k2);
                            used.add(k1);
                            used.add(k2);
                            remaining -= 2;
                        } else if (remaining === 1) {
                            if (used.has(k1) || !isFarEnough(c1, r1, minDist)) continue;
                            minePositions.push(k1);
                            used.add(k1);
                            remaining -= 1;
                        }
                    }
                }
            }

            this.config.minePositions = minePositions;
        }

        for (const k of minePositions) {
            const t = this.board.get(k);
            if (t) t.isMine = true;
        }
    }

    get isGameOver() {
        return this.gameFinished === true || (this.history.length > 0 && this.history[this.history.length - 1].winner !== null);
    }

    get liveActiveTeam() {
        if (this.history.length > 0) {
            return this.history[this.history.length - 1].activeTeam;
        }
        return this.activeTeam;
    }

    ensureLiveState() {
        const wasInHistory = this.historyIndex !== this.history.length - 1;
        if (wasInHistory && this.history.length > 0) {
            this.loadSnapshot(this.history.length - 1);
        }
        if (this.ui) {
            if (this.ui.timeMachineOpen) {
                this.ui.timeMachineOpen = false;
            }
            if (this.ui.showAIHeatmap) {
                this.ui.showAIHeatmap = false;
                this.ui.aiHeatmapTeam = null;
            }
            this.ui.resetActiveState();
        }
        return wasInHistory;
    }

    serializeSnapshot(index = this.history.length - 1) {
        const snap = this.history[index];
        if (!snap) return null;
        const tiles = [];
        for (let [k, v] of snap.board.entries()) {
            if (v.unit || v.isBarricade || v.isMine) {
                let uCopy = v.unit ? { ...v.unit } : null;
                if (uCopy) delete uCopy.isAnimating;
                tiles.push({
                    k,
                    unit: uCopy,
                    isBarricade: !!v.isBarricade,
                    barricadeTeam: v.barricadeTeam || null,
                    barricadeId: v.barricadeId || null,
                    isMine: !!v.isMine
                });
            }
        }
        return {
            turnId: index,
            tiles,
            credits: { ...snap.credits },
            activeTeam: snap.activeTeam,
            winner: snap.winner || null,
            actionUsed: !!snap.actionUsed,
            deployCounts: { ...(snap.deployCounts || { 'BLUE': 0, 'RED': 0 }) },
            hasFlag: { ...(snap.hasFlag || { 'BLUE': false, 'RED': false }) },
            combats: snap.combats ? [...snap.combats] : [],
            lastMove: snap.lastMove ? { ...snap.lastMove } : null
        };
    }

    deserializeSnapshot(serialized) {
        const board = new Map();
        for (let col = 0; col < this.cols; col++) {
            for (let row = 0; row < this.rows; row++) {
                board.set(`${col},${row}`, { unit: null, isBarricade: false, barricadeTeam: null, barricadeId: null, isMine: false });
            }
        }
        if (Array.isArray(serialized.tiles)) {
            for (const t of serialized.tiles) {
                if (board.has(t.k)) {
                    let uCopy = t.unit ? { ...t.unit } : null;
                    if (uCopy) delete uCopy.isAnimating;
                    board.set(t.k, {
                        unit: uCopy,
                        isBarricade: !!t.isBarricade,
                        barricadeTeam: t.barricadeTeam || null,
                        barricadeId: t.barricadeId || null,
                        isMine: !!t.isMine
                    });
                }
            }
        }
        return {
            board,
            credits: { ...serialized.credits },
            activeTeam: serialized.activeTeam,
            winner: serialized.winner || null,
            actionUsed: !!serialized.actionUsed,
            deployCounts: { ...(serialized.deployCounts || { 'BLUE': 0, 'RED': 0 }) },
            hasFlag: { ...(serialized.hasFlag || { 'BLUE': false, 'RED': false }) },
            combats: Array.isArray(serialized.combats) ? [...serialized.combats] : [],
            lastMove: serialized.lastMove ? { ...serialized.lastMove } : null
        };
    }

    doesLiveStateMatch(serialized) {
        if (!serialized || this.history.length === 0) return false;
        const liveIdx = this.history.length - 1;
        if (typeof serialized.turnId === 'number' && liveIdx !== serialized.turnId) return false;

        const liveSnap = this.history[liveIdx];
        if (liveSnap.activeTeam !== serialized.activeTeam) return false;
        if ((liveSnap.winner || null) !== (serialized.winner || null)) return false;
        if (liveSnap.credits.BLUE !== serialized.credits.BLUE || liveSnap.credits.RED !== serialized.credits.RED) return false;

        let liveNonEmptyCount = 0;
        for (let [k, v] of liveSnap.board.entries()) {
            if (v.unit || v.isBarricade || v.isMine) liveNonEmptyCount++;
        }
        const remoteTiles = Array.isArray(serialized.tiles) ? serialized.tiles : [];
        if (liveNonEmptyCount !== remoteTiles.length) return false;

        for (const rt of remoteTiles) {
            const lt = liveSnap.board.get(rt.k);
            if (!lt) return false;
            if (!!lt.isBarricade !== !!rt.isBarricade) return false;
            if (lt.isBarricade && (lt.barricadeTeam || null) !== (rt.barricadeTeam || null)) return false;
            if (!!lt.isMine !== !!rt.isMine) return false;
            if (!!lt.unit !== !!rt.unit) return false;
            if (lt.unit && rt.unit) {
                if (lt.unit.team !== rt.unit.team ||
                    lt.unit.type !== rt.unit.type ||
                    lt.unit.strength !== rt.unit.strength ||
                    lt.unit.speed !== rt.unit.speed) {
                    return false;
                }
            }
        }
        return true;
    }

    applyRemoteSnapshot(serialized) {
        if (!serialized) return false;
        const snap = this.deserializeSnapshot(serialized);
        const targetTurnId = typeof serialized.turnId === 'number' ? serialized.turnId : this.history.length;

        while (this.history.length <= targetTurnId) {
            const filler = this.history.length > 0
                ? this.deserializeSnapshot(this.serializeSnapshot(this.history.length - 1))
                : snap;
            this.history.push(filler);
        }
        if (this.history.length > targetTurnId + 1) {
            this.history.length = targetTurnId + 1;
        }
        this.history[targetTurnId] = snap;

        this.loadSnapshot(targetTurnId);
        this.selectedTile = null;
        this.invalidateOverlayCache();

        if (this.winner) {
            this.gameFinished = true;
            if (this.timerInterval) clearInterval(this.timerInterval);
            const winName = this.winner === 'BLUE' ? this.blueName : this.redName;
            if (this.onWinner) this.onWinner(this.winner, `${winName} won the game!`);
        } else if (this.timerDuration > 0) {
            this.startTimer();
        }

        if (this.onStateChange) this.onStateChange();
        this.saveSessionToStorage();
        return true;
    }

    serializeFullHistory() {
        return this.history.map((_, idx) => this.serializeSnapshot(idx));
    }

    applyRemoteHistory(serializedHistory) {
        if (!Array.isArray(serializedHistory) || serializedHistory.length === 0) return false;
        this.history = serializedHistory.map(s => this.deserializeSnapshot(s));
        this.loadSnapshot(this.history.length - 1);
        this.selectedTile = null;
        this.invalidateOverlayCache();

        if (this.winner) {
            this.gameFinished = true;
            if (this.timerInterval) clearInterval(this.timerInterval);
            const winName = this.winner === 'BLUE' ? this.blueName : this.redName;
            if (this.onWinner) this.onWinner(this.winner, `${winName} won the game!`);
        } else if (this.timerDuration > 0) {
            this.startTimer();
        }

        if (this.onStateChange) this.onStateChange();
        this.saveSessionToStorage();
        return true;
    }

    saveSessionToStorage() {
        if (!this.enablePersistence) return;
        if (typeof sessionStorage === 'undefined') return;
        try {
            const sessionData = {
                version: 1,
                timestamp: Date.now(),
                gameMode: this.gameMode || 'LOCAL',
                localTeam: this.localTeam || 'BLUE',
                config: {
                    ...this.config,
                    blueName: this.blueName,
                    redName: this.redName
                },
                blueName: this.blueName,
                redName: this.redName,
                winner: this.winner || null,
                gameFinished: !!this.gameFinished,
                logs: this.logs.slice(-50),
                history: this.serializeFullHistory(),
                networkInfo: this.network ? {
                    isHost: !!this.network.isHost,
                    hostId: this.network.hostId || null,
                    guestName: this.network.guestName || 'Guest'
                } : null
            };
            sessionStorage.setItem('TPOW_ACTIVE_SESSION', JSON.stringify(sessionData));
        } catch (e) {
            console.warn('Failed to save game session:', e);
        }
    }

    restoreFromSession(sessionData) {
        if (!sessionData) return false;
        if (sessionData.blueName) {
            this.blueName = sessionData.blueName;
            if (this.config) this.config.blueName = sessionData.blueName;
        }
        if (sessionData.redName) {
            this.redName = sessionData.redName;
            if (this.config) this.config.redName = sessionData.redName;
        }
        if (sessionData.localTeam) {
            this.localTeam = sessionData.localTeam;
        }
        if (Array.isArray(sessionData.logs)) {
            this.logs = [...sessionData.logs];
        }
        if (Array.isArray(sessionData.history) && sessionData.history.length > 0) {
            this.history = sessionData.history.map(s => this.deserializeSnapshot(s));
            this.loadSnapshot(this.history.length - 1);
        }
        this.winner = sessionData.winner || this.winner || null;
        this.gameFinished = !!sessionData.gameFinished || !!this.winner;
        if (this.onLog) this.onLog();
        if (this.onStateChange) this.onStateChange();
        if (this.winner && this.onWinner) {
            const winName = this.winner === 'BLUE' ? this.blueName : this.redName;
            this.onWinner(this.winner, `${winName} won the game!`);
        }
        return true;
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
                    const currentLiveTeam = this.liveActiveTeam;
                    let isActivePlayer = true;
                    if (this.network && this.localTeam) {
                        isActivePlayer = (this.localTeam === currentLiveTeam);
                    }
                    if (this.gameMode === 'AI' && currentLiveTeam === 'RED') {
                        isActivePlayer = false; // AI handles its own execution
                    }

                    if (isActivePlayer) {
                        this.ensureLiveState();
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
            snap.board.set(k, {
                unit: uCopy,
                isBarricade: v.isBarricade,
                barricadeTeam: v.barricadeTeam || null,
                barricadeId: v.barricadeId || null,
                isMine: !!v.isMine
            });
        }
        snap.lastMove = this.lastMove ? { ...this.lastMove } : null;
        // Save and increment
        this.history.push(snap);
        this.historyIndex = this.history.length - 1;
        this.activeCombats = []; // Clear for next turn's actions
        this.lastMove = null;
        this.saveSessionToStorage();
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
            this.board.set(k, {
                unit: uCopy,
                isBarricade: v.isBarricade,
                barricadeTeam: v.barricadeTeam || null,
                barricadeId: v.barricadeId || null,
                isMine: !!v.isMine
            });
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
        if (this.actionUsed || this.phase !== 'MAIN' || this.winner) return { valid: false, msg: "Action unavailable." };
        if (team !== this.activeTeam) return { valid: false, msg: "Not your turn." };
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
        if (isSyncEvent) {
            this.ensureLiveState();
        }
        const u = new Unit(team, type, strength, speed, this.config.flagCost);
        const check = this.canDeploy(team, col, row, u.cost, type === 'flag');
        if (!check.valid) {
            this.logSystem(`Deployment Failed: ${check.msg}`);
            return false;
        }

        this.credits[team] -= u.cost;
        this.setUnit(col, row, u);

        if (type === 'flag') this.hasFlag[team] = true;
        this.deployCounts[team]++;

        this.logAction(team, `Deployed ${type} unit for ${u.cost} cr.`);
        this.actionUsed = true;
        this.checkWinConditions();
        if (!this.winner) this.endTurn(isSyncEvent, true);

        if (!isSyncEvent && this.network) {
            this.network.recordAndSendTurn({ type: 'DEPLOY', team, unitType: type, str: strength, spd: speed, col, row });
        }
        return true;
    }

    getMineIncome(team, viewerTeam = null) {
        const mineCredit = (this.config && typeof this.config.mineCredit === 'number') ? this.config.mineCredit : 5;
        if (mineCredit <= 0) return 0;

        let minesHeld = 0;
        for (let [key, tile] of this.board.entries()) {
            if (tile && tile.isMine && tile.unit && tile.unit.team === team && tile.unit.type !== 'observation') {
                if (viewerTeam && viewerTeam !== team) {
                    const [c, r] = key.split(',').map(Number);
                    if (!this.canSeeUnit(c, r, viewerTeam)) continue;
                }
                minesHeld++;
            }
        }
        return minesHeld * mineCredit;
    }

    applyMineIncome(team) {
        const maxCredits = (this.config && typeof this.config.credits === 'number') ? this.config.credits : 100;
        const bonus = this.getMineIncome(team);
        if (bonus > 0) {
            const prev = this.credits[team];
            this.credits[team] = Math.min(maxCredits, prev + bonus);
        }
    }

    switchPhase() {
        this.activeTeam = this.activeTeam === 'BLUE' ? 'RED' : 'BLUE';
        this.actionUsed = false;
        this.applyMineIncome(this.activeTeam);
        const currentName = this.activeTeam === 'BLUE' ? this.blueName : this.redName;
        this.logSystem(`${currentName}'s Turn.`);

        if (this.timerDuration > 0) {
            this.startTimer();
        }

        return true;
    }

    endTurn(isSyncEvent = false, doNotBroadcast = false) {
        if (this.winner) return false;
        if (isSyncEvent) {
            this.ensureLiveState();
        } else if (this.historyIndex !== this.history.length - 1) {
            this.logSystem("Viewing history. Return to Live state to take actions.");
            return false;
        }

        for (let [k, v] of this.board.entries()) {
            if (v.unit && v.unit.exposedCounter !== undefined && v.unit.exposedCounter > 0) {
                v.unit.exposedCounter--;
            }
        }

        this.applyBarricadeKillZoneDamage(this.activeTeam);

        this.invalidateOverlayCache();
        this.checkWinConditions();
        if (!this.winner) {
            this.switchPhase();
            this.saveSnapshot();
            if (this.onStateChange) this.onStateChange();
        }

        if (!isSyncEvent && !doNotBroadcast && this.network) {
            this.network.recordAndSendTurn({ type: 'SKIP' });
        }
        return true;
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
        if (isSyncEvent) {
            this.ensureLiveState();
        }
        if (this.actionUsed || this.phase !== 'MAIN' || this.winner || this.historyIndex !== this.history.length - 1) return false;
        const startTile = this.getTile(startCol, startRow);
        const u = startTile ? startTile.unit : null;
        if (!u || u.team !== this.activeTeam) return false;

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

        if (!isSyncEvent && this.network) {
            this.network.recordAndSendTurn({ type: 'MOVE', col: startCol, row: startRow, tC: endCol, tR: endRow });
        }
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
                const nT = this.getTile(pt.col, pt.row);
                if (nT && nT.isMine) {
                    return { valid: false, reason: "Cannot build a barricade on a gold mine." };
                }
                if (pt.col === col && pt.row === row) continue; // the unit itself
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
        if (isSyncEvent) {
            this.ensureLiveState();
        }
        const check = this.canBarricade(col, row, offset);
        if (!check.valid) {
            this.logSystem(`Error: ${check.reason}`);
            return false;
        }

        const cost = this.config ? (this.config.barricadeCost || 10) : 10;
        const t = this.getTile(col, row);
        const u = t.unit;
        const footprint = this.getBarricadeFootprint(col, row, u.strength, offset);
        const barricadeId = `b_${col}_${row}_${this.history.length}`;

        // Commit Barricade
        this.credits[this.activeTeam] -= cost;
        // Kill unit
        t.unit = null;
        // Paint barricade tiles with team ownership and group ID
        let previewKeys = new Set();
        for (let pt of footprint) {
            if (this.isValid(pt.col, pt.row)) {
                const bTile = this.getTile(pt.col, pt.row);
                bTile.isBarricade = true;
                bTile.barricadeTeam = this.activeTeam;
                bTile.barricadeId = barricadeId;
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
            obsUnit.barricadeId = barricadeId;
            this.setUnit(obsCol, obsRow, obsUnit);
        }

        this.logAction(this.activeTeam, `Constructed a vertical barricade at [${col},${row}].`);
        this.actionUsed = true;
        this.selectedTile = null;
        this.invalidateOverlayCache();
        this.checkWinConditions();
        if (!this.winner) this.endTurn(isSyncEvent, true);

        if (!isSyncEvent && this.network) {
            this.network.recordAndSendTurn({ type: 'BARRICADE', col, row, offset });
        }
        return true;
    }

    getBarricadeGroupKeys(col, row) {
        const startTile = this.getTile(col, row);
        if (!startTile || !startTile.isBarricade) return [];

        const targetId = startTile.barricadeId;
        const targetTeam = startTile.barricadeTeam;

        if (targetId) {
            const keys = [];
            for (let [k, v] of this.board.entries()) {
                if (v.isBarricade && v.barricadeId === targetId) {
                    keys.push(k);
                }
            }
            return keys;
        }

        // Fallback for barricades without barricadeId: contiguous vertical tiles of same team
        const keys = [`${col},${row}`];
        let rUp = row - 1;
        while (this.isValid(col, rUp)) {
            const nt = this.getTile(col, rUp);
            if (nt && nt.isBarricade && nt.barricadeTeam === targetTeam && !nt.barricadeId) {
                keys.push(`${col},${rUp}`);
                rUp--;
            } else {
                break;
            }
        }
        let rDown = row + 1;
        while (this.isValid(col, rDown)) {
            const nt = this.getTile(col, rDown);
            if (nt && nt.isBarricade && nt.barricadeTeam === targetTeam && !nt.barricadeId) {
                keys.push(`${col},${rDown}`);
                rDown++;
            } else {
                break;
            }
        }
        return keys;
    }

    canRemoveBarricade(col, row) {
        if (this.actionUsed || this.phase !== 'MAIN' || this.winner || this.historyIndex !== this.history.length - 1) {
            return { valid: false, reason: "Action unavailable." };
        }
        if (this.config && this.config.barricadeRemovable === false) {
            return { valid: false, reason: "Barricades are not removable in this game." };
        }
        if (!this.isValid(col, row)) {
            return { valid: false, reason: "Out of bounds." };
        }
        const t = this.getTile(col, row);
        if (!t || !t.isBarricade) {
            return { valid: false, reason: "Tile is not a barricade." };
        }
        if (t.barricadeTeam !== this.activeTeam) {
            return { valid: false, reason: "You can only remove barricades that you built." };
        }
        return { valid: true };
    }

    removeBarricade(col, row, isSyncEvent = false) {
        if (isSyncEvent) {
            this.ensureLiveState();
        }
        const check = this.canRemoveBarricade(col, row);
        if (!check.valid) {
            this.logSystem(`Error: ${check.reason}`);
            return false;
        }

        const t = this.getTile(col, row);
        const targetId = t.barricadeId;
        const groupKeys = this.getBarricadeGroupKeys(col, row);

        for (const k of groupKeys) {
            const bt = this.board.get(k);
            if (bt) {
                bt.isBarricade = false;
                bt.barricadeTeam = null;
                bt.barricadeId = null;
            }
        }

        // Remove the observation unit associated with this barricade
        if (targetId) {
            for (let [k, v] of this.board.entries()) {
                if (v.unit && v.unit.type === 'observation' && v.unit.barricadeId === targetId) {
                    v.unit = null;
                }
            }
        } else {
            // Fallback: check adjacent observation unit behind the removed barricade
            const obsDir = this.activeTeam === 'BLUE' ? -1 : 1;
            const obsTile = this.getTile(col + obsDir, row);
            if (obsTile && obsTile.unit && obsTile.unit.type === 'observation' && obsTile.unit.team === this.activeTeam) {
                obsTile.unit = null;
            }
        }

        this.logAction(this.activeTeam, `Removed barricade at [${col},${row}].`);
        this.actionUsed = true;
        this.selectedTile = null;
        this.invalidateOverlayCache();
        this.checkWinConditions();
        if (!this.winner) this.endTurn(isSyncEvent, true);

        if (!isSyncEvent && this.network) {
            this.network.recordAndSendTurn({ type: 'REMOVE_BARRICADE', col, row });
        }
        return true;
    }

    getBarricadeKillZones() {
        const dangerForBlue = new Set();
        const dangerForRed = new Set();

        if (this.config && this.config.barricadeKillZone === false) {
            return { dangerForBlue, dangerForRed };
        }

        const blueBarricades = [];
        const redBarricades = [];

        for (let col = 0; col < this.cols; col++) {
            for (let row = 0; row < this.rows; row++) {
                const t = this.getTile(col, row);
                if (t && t.isBarricade) {
                    if (t.barricadeTeam === 'BLUE') blueBarricades.push({ col, row });
                    else if (t.barricadeTeam === 'RED') redBarricades.push({ col, row });
                }
            }
        }

        if (blueBarricades.length === 0 && redBarricades.length === 0) {
            return { dangerForBlue, dangerForRed };
        }

        for (let col = 0; col < this.cols; col++) {
            for (let row = 0; row < this.rows; row++) {
                const t = this.getTile(col, row);
                if (!t || t.isBarricade) continue;
                const key = `${col},${row}`;

                for (const b of blueBarricades) {
                    if (hexMath.offsetDistance(col, row, b.col, b.row) <= 2) {
                        dangerForRed.add(key);
                        break;
                    }
                }
                for (const b of redBarricades) {
                    if (hexMath.offsetDistance(col, row, b.col, b.row) <= 2) {
                        dangerForBlue.add(key);
                        break;
                    }
                }
            }
        }

        return { dangerForBlue, dangerForRed };
    }

    applyBarricadeKillZoneDamage(team) {
        if (this.config && this.config.barricadeKillZone === false) return;

        const { dangerForBlue, dangerForRed } = this.getBarricadeKillZones();
        const dangerSet = team === 'BLUE' ? dangerForBlue : dangerForRed;
        if (dangerSet.size === 0) return;

        for (const key of dangerSet) {
            const tile = this.board.get(key);
            if (!tile || !tile.unit) continue;
            const u = tile.unit;
            // Only affect combat units belonging to the team that just finished their turn
            if (u.team !== team || u.isFlag || u.type === 'observation') continue;

            const [cStr, rStr] = key.split(',');
            const c = parseInt(cStr, 10);
            const r = parseInt(rStr, 10);

            u.strength -= 1;
            if (u.strength <= 0) {
                tile.pendingDeathVisual = { ...u };
                tile.unit = null;
                this.activeCombats.push({ c, r });
                if (this.onCombat) this.onCombat(c, r);
                this.logAction(team, `Unit at [${c},${r}] was destroyed by enemy barricade kill zone!`, true);
            } else {
                this.logAction(team, `Unit at [${c},${r}] lost 1 Power in enemy barricade kill zone (now ${u.strength}).`, true);
            }
        }
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

    getCombinedEnemyVision(viewerTeam) {
        let spot = new Set();
        let inspect = new Set();

        for (let col = 0; col < this.cols; col++) {
            for (let row = 0; row < this.rows; row++) {
                const t = this.getTile(col, row);
                if (!t || !t.unit || t.unit.isFlag) continue;
                const u = t.unit;
                if (u.team === viewerTeam) continue;

                // Only include enemy units visible to viewerTeam
                if (u.type !== 'observation' && !this.canSeeUnit(col, row, viewerTeam)) {
                    continue;
                }

                const ownKey = `${col},${row}`;
                spot.add(ownKey);
                inspect.add(ownKey);

                const v = this.getUnitVision(col, row);
                for (let k of v.spot) spot.add(k);
                for (let k of v.inspect) inspect.add(k);
            }
        }

        return { spot, inspect };
    }

    checkWinConditions() {
        if (this.winner) return;

        let blueFlagCount = 0;
        let redFlagCount = 0;
        let blueUnitCount = 0;
        let redUnitCount = 0;

        let bInvaded = false;
        let rInvaded = false;

        // Scan board
        for (let col = 0; col < this.cols; col++) {
            for (let row = 0; row < this.rows; row++) {
                const u = this.getTile(col, row).unit;
                if (!u) continue;

                if (u.type !== 'observation') {
                    if (u.team === 'BLUE') blueUnitCount++;
                    if (u.team === 'RED') redUnitCount++;
                }

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
        if (bInvaded) {
            this.setWinner('BLUE', `${this.blueName} successfully invaded the opponent's zone!`);
            return;
        }
        if (rInvaded) {
            this.setWinner('RED', `${this.redName} successfully invaded the opponent's zone!`);
            return;
        }

        const blueEliminated = (blueUnitCount === 0 && this.credits['BLUE'] <= 0);
        const redEliminated = (redUnitCount === 0 && this.credits['RED'] <= 0);

        if (blueEliminated && redEliminated) {
            const winTeam = this.activeTeam;
            const loseName = winTeam === 'BLUE' ? this.redName : this.blueName;
            this.setWinner(winTeam, `${loseName} has no units and no credits remaining!`);
        } else if (blueEliminated) {
            this.setWinner('RED', `${this.blueName} has no units and no credits remaining!`);
        } else if (redEliminated) {
            this.setWinner('BLUE', `${this.redName} has no units and no credits remaining!`);
        }
    }

    setWinner(team, reason) {
        this.winner = team;
        this.gameFinished = true;
        if (this.timerInterval) clearInterval(this.timerInterval);
        const winName = team === 'BLUE' ? this.blueName : this.redName;
        this.logSystem(`GAME OVER. ${winName} wins! ${reason}`);
        this.saveSnapshot();
        if (this.onStateChange) this.onStateChange();
        if (this.onWinner) this.onWinner(team, reason);
    }
}
