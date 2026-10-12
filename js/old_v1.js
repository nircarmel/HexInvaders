// js/ai-v1.js
import { hexMath } from './hex.js';
import { DEFAULT_GENES } from './genes-v1.js';

const SPAWN_ARCHETYPES = [
    { name: "Sprinter", power: 1, speed: 4, cost: 4 },
    { name: "Enforcer", power: 3, speed: 3, cost: 9 },
    { name: "Interceptor", power: 4, speed: 2, cost: 8 },
    { name: "Titan", power: 5, speed: 3, cost: 15 },
    { name: "Savior", power: 5, speed: 5, cost: 25 },
];

export class AIBot {
    constructor(game, genes = null) {
        this.game = game;
        this.genes = genes || DEFAULT_GENES;
    }

    executeTurn() {
        if (this.game.activeTeam !== 'RED') return;
        if (this.game.winner) return;

        this.game.logSystem('Computer is thinking... (Minimax Alpha-Beta)');

        // Run evaluation off the main thread lightly
        setTimeout(() => {
            if (this.game.activeTeam !== 'RED') return;
            this.decideAction();
        }, 100);
    }

    turnsToGoal(unitCol, unitSpeed, targetGoalCol) {
        const dist = Math.abs(unitCol - targetGoalCol);
        return Math.max(1, Math.ceil(dist / unitSpeed));
    }

    cloneState() {
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

    evaluateBoard(state, botPlayer) {
        const opponent = botPlayer === 'BLUE' ? 'RED' : 'BLUE';
        const botGoalCol = botPlayer === 'BLUE' ? state.cols - 1 : 0;
        const oppGoalCol = botPlayer === 'BLUE' ? 0 : state.cols - 1;

        const friendlyUnits = state.units.filter(u => u.player === botPlayer && !u.isFlag && u.type !== 'observation');
        const enemyUnits = state.units.filter(u => u.player === opponent && !u.isFlag && u.type !== 'observation');

        const friendlyFlags = state.units.filter(u => u.player === botPlayer && u.isFlag);
        const enemyFlags = state.units.filter(u => u.player === opponent && u.isFlag);

        let modeGenes = this.genes.UNIFIED || this.genes.INVADE;

        // ==========================================
        // UNIFIED BOARD SCORING VARIANT
        // ==========================================
        let score = 0;

        // 1. Win Condition
        let hasOwnFlagBase = state.units.some(u => u.player === botPlayer && u.isFlag && u.col === botGoalCol);
        let hasEnemyFlagBase = state.units.some(u => u.player === opponent && u.isFlag && u.col === oppGoalCol);

        let hasOwnCombatBase = state.gameMode === 'INVADE' && state.units.some(u => u.player === botPlayer && !u.isFlag && u.col === botGoalCol);
        let hasEnemyCombatBase = state.gameMode === 'INVADE' && state.units.some(u => u.player === opponent && !u.isFlag && u.col === oppGoalCol);

        if (hasOwnFlagBase || hasOwnCombatBase) return 900000000;
        if (hasEnemyFlagBase || hasEnemyCombatBase) return -900000000;

        // 1.5 DEFCON: Imminent Threat Thresholds
        let defconPenalty = 0;
        let defconBonus = 0;

        // Enemy Threat (They are close to winning and UNBLOCKED)
        for (let e of state.units.filter(u => u.player === opponent && (state.gameMode === 'INVADE' || u.isFlag))) {
            // FIX: Opponent is trying to reach oppGoalCol
            let ttg = Math.ceil(Math.abs(e.col - oppGoalCol) / (e.speed || 1));
            if (ttg <= 2 && e.col !== oppGoalCol) {
                let pathIsBlocked = false;
                let stepDir = (oppGoalCol > e.col) ? 1 : -1;
                let maxDist = Math.abs(oppGoalCol - e.col);
                for (let i = 1; i <= maxDist; i++) {
                    let checkCol = e.col + (i * stepDir);
                    if (state.units.some(u => u.col === checkCol && u.player === botPlayer && u.power > 0)) {
                        pathIsBlocked = true;
                        break;
                    }
                }
                if (!pathIsBlocked) {
                    defconPenalty += 500000; // Skyrocket priority of killing/blocking this unit
                }
            }
        }

        // Bot Threat (We are close to winning and UNBLOCKED)
        for (let b of state.units.filter(u => u.player === botPlayer && (state.gameMode === 'INVADE' || u.isFlag))) {
            // FIX: Bot is trying to reach botGoalCol
            let ttg = Math.ceil(Math.abs(b.col - botGoalCol) / (b.speed || 1));
            if (ttg <= 2 && b.col !== botGoalCol) {
                let pathIsBlocked = false;
                let stepDir = (botGoalCol > b.col) ? 1 : -1;
                let maxDist = Math.abs(botGoalCol - b.col);
                for (let i = 1; i <= maxDist; i++) {
                    let checkCol = b.col + (i * stepDir);
                    if (state.units.some(u => u.col === checkCol && u.player === opponent && u.power > 0)) {
                        pathIsBlocked = true;
                        break;
                    }
                }
                if (!pathIsBlocked) {
                    defconBonus += 500000;
                }
            }
        }

        score += defconBonus;
        score -= defconPenalty;

        // 2. Credit Value
        let ownCredits = botPlayer === 'BLUE' ? state.blue_credits : state.red_credits;
        let oppCredits = botPlayer === 'BLUE' ? state.red_credits : state.blue_credits;
        score += ownCredits * (modeGenes.credit_multiplier !== undefined ? modeGenes.credit_multiplier : 1);
        score -= oppCredits * (modeGenes.credit_multiplier !== undefined ? modeGenes.credit_multiplier : 1);

        // 3. Unit Value / Forward Progress
        let ownUnitScore = 0;
        let enemyUnitScore = 0;

        for (let u of state.units) {
            let isBot = u.player === botPlayer;
            let goalCol = isBot ? botGoalCol : oppGoalCol;

            let uScore = 0;

            if (u.type === 'observation') {
                let obsPower = 5;
                let obsSpeed = 5;
                let obsTtgVal = Math.max(1, this.turnsToGoal(u.col, obsSpeed, goalCol));
                let factor = modeGenes.obs_value_factor !== undefined ? modeGenes.obs_value_factor : 0.7;
                uScore = ((obsPower * (modeGenes.advance_bonus !== undefined ? modeGenes.advance_bonus : 100)) / obsTtgVal) * factor;
            } else {
                let power = u.power || 0;
                let speedForTtg = u.speed || 1;

                if (u.isFlag) {
                    power = modeGenes.flag_boost !== undefined ? modeGenes.flag_boost : 10;
                    speedForTtg = u.speed || 1;
                }

                if (state.gameMode === 'PLANT' && !u.isFlag) {
                    // In PLANT Mode, Combat units strictly measure distances to Flags (to hunt or defend)
                    let friendlyFlags = state.units.filter(f => f.isFlag && f.player === u.player);
                    let enemyFlags = state.units.filter(f => f.isFlag && f.player !== u.player);
                    let allTargetFlags = friendlyFlags.concat(enemyFlags);

                    if (allTargetFlags.length > 0) {
                        let minTtg = 999;
                        for (let f of allTargetFlags) {
                            let dist = Math.abs(u.col - f.col); // Pure horizontal proxy to bypass minimax overhead
                            let formTtg = Math.ceil(dist / speedForTtg);
                            if (formTtg < minTtg) minTtg = formTtg;
                        }
                        let ttgVal = Math.max(1, minTtg);
                        uScore = (power * (modeGenes.flag_intercept_K !== undefined ? modeGenes.flag_intercept_K : 100)) / ttgVal;
                    }
                } else {
                    // Default Forward Progress (All units in INVADE, or specifically Flags in PLANT)
                    let ttgVal = Math.max(1, this.turnsToGoal(u.col, speedForTtg, goalCol));
                    let flagMult = (u.isFlag && modeGenes.flag_progress_multiplier !== undefined) ? modeGenes.flag_progress_multiplier : 1;
                    uScore = ((power * (modeGenes.advance_bonus !== undefined ? modeGenes.advance_bonus : 100)) / ttgVal) * flagMult;
                }
            }

            if (isBot) {
                ownUnitScore += uScore;
            } else {
                enemyUnitScore += uScore * (modeGenes.enemy_multiplier !== undefined ? modeGenes.enemy_multiplier : 2);
            }
        }
        score += ownUnitScore - enemyUnitScore;

        // 4. Escort / Wall Bonus
        let ownCombatUnits = friendlyUnits; // Excludes flags/obs 
        let oppCombatUnits = enemyUnits;

        for (let f of friendlyFlags) {
            for (let u of ownCombatUnits) {
                let isEscorting = false;
                for (let e of state.units) {
                    if (e.player === botPlayer) continue;
                    let isBetween = botPlayer === 'BLUE' ? (u.col > f.col && u.col <= e.col) : (u.col < f.col && u.col >= e.col);
                    if (isBetween) {
                        isEscorting = true;
                        break;
                    }
                }
                if (isEscorting) {
                    score += (modeGenes.escortBonusBase !== undefined ? modeGenes.escortBonusBase : 369) * u.power;
                }
            }
        }

        // Symmetrical Escort 
        for (let f of enemyFlags) {
            for (let u of oppCombatUnits) {
                let isEscorting = false;
                for (let e of state.units) {
                    if (e.player === opponent) continue;
                    let isBetween = opponent === 'BLUE' ? (u.col > f.col && u.col <= e.col) : (u.col < f.col && u.col >= e.col);
                    if (isBetween) {
                        isEscorting = true;
                        break;
                    }
                }
                if (isEscorting) {
                    score -= (modeGenes.escortBonusBase !== undefined ? modeGenes.escortBonusBase : 369) * u.power;
                }
            }
        }

        return score;
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
        const enemyHomeCol = player === 'BLUE' ? state.cols - 1 : 0;

        // A. Tactical Moves
        for (let u of state.units) {
            if (u.player !== player || u.type === 'observation' || (state.gameMode !== 'PLANT' && u.isFlag)) continue;

            const validDestinations = this.getValidMovesVirtual(state, u);
            for (let target of validDestinations) {
                actions.push({ type: 'MOVE', unitId: u.id, unitCol: u.col, unitRow: u.row, targetCol: target.col, targetRow: target.row });
            }
        }

        // B. Deployments
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

        if (action.type === 'MOVE') {
            let u = nextState.units.find(un => un.col === action.unitCol && un.row === action.unitRow);
            if (u) {
                let targetIdx = nextState.units.findIndex(un => un.col === action.targetCol && un.row === action.targetRow);
                if (targetIdx !== -1) {
                    let defender = nextState.units[targetIdx];
                    if (u.power >= defender.power) {
                        nextState.units.splice(targetIdx, 1);
                        u.power -= 1;
                        // Note: exhaustion exact match for TPOW Engine
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

    actionPriority(action, state) {
        if (action.type === 'MOVE') {
            let target = state.units.find(u => u.col === action.targetCol && u.row === action.targetRow);
            if (target && target.player !== state.currentPlayer) return 100;
            return 50;
        }
        return 10;
    }

    minimax(state, depth, alpha, beta, maximizing, botPlayer) {
        let score = this.evaluateBoard(state, botPlayer);

        if (depth === 0 || Math.abs(score) >= 90000000.0) {
            if (score >= 90000000.0) score += depth * 1000;
            if (score <= -90000000.0) score -= depth * 1000;
            return { score, action: null };
        }

        let actions = this.generateCandidateActions(state, state.currentPlayer);
        if (actions.length === 0) {
            return { score, action: null };
        }

        // =====================================
        // BEAM SEARCH (Action-Sort Pruning)
        // =====================================
        let scoredActions = [];
        let modeGenes = this.genes.UNIFIED || this.genes.INVADE;
        let beamWidth = modeGenes.beam_width || 12;

        for (let a of actions) {
            let nextState = this.applyVirtualAction(state, a);
            let immediateScore = this.evaluateBoard(nextState, botPlayer);
            scoredActions.push({ action: a, score: immediateScore });
        }

        if (maximizing) {
            scoredActions.sort((a, b) => b.score - a.score);
        } else {
            scoredActions.sort((a, b) => a.score - b.score);
        }

        // PRUNE ALL ACTIONS OUTSIDE THE BEAM WIDTH!
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

    decideAction() {
        const rootState = this.cloneState();

        let actions = this.generateCandidateActions(rootState, 'RED');
        if (actions.length === 0) {
            this.game.logAction('RED', 'AI chose to Skip Action.');
            this.game.endTurn();
            return;
        }

        this.lastEvaluations = [];
        let maxEval = -Infinity;
        let bestAction = actions[0];

        // Shallow beam-prune trace at root
        let scoredActions = [];
        let modeGenes = this.genes.UNIFIED || this.genes.INVADE;
        let beamWidth = modeGenes.beam_width || 12;

        for (let a of actions) {
            let nextState = this.applyVirtualAction(rootState, a);
            let immediateScore = this.evaluateBoard(nextState, 'RED');
            scoredActions.push({ action: a, score: immediateScore });
        }
        scoredActions.sort((a, b) => b.score - a.score);
        actions = scoredActions.slice(0, beamWidth).map(pair => pair.action);

        const DEPTH = 5;
        for (let a of actions) {
            let nextState = this.applyVirtualAction(rootState, a);
            let result = this.minimax(nextState, DEPTH - 1, -Infinity, Infinity, false, 'RED');

            // CACHE EXACT TREE OUTPUT FOR UI INSIGHT
            this.lastEvaluations.push({
                action: a,
                score: result.score
            });

            if (result.score > maxEval) {
                maxEval = result.score;
                bestAction = a;
            }
        }

        if (!bestAction) {
            this.game.logAction('RED', 'AI chose to Skip Action.');
            this.game.endTurn();
            return;
        }

        if (bestAction.type === 'DEPLOY') {
            this.game.deployUnit('RED', bestAction.unitType || 'combat', bestAction.power, bestAction.speed, bestAction.targetCol, bestAction.targetRow);
        } else if (bestAction.type === 'MOVE') {
            this.game.moveUnit(bestAction.unitCol, bestAction.unitRow, bestAction.targetCol, bestAction.targetRow);
        } else {
            this.game.logAction('RED', 'AI chose to Skip Action.');
            this.game.endTurn();
        }
    }


    // --- AI INSIGHT HEATMAP --- 
    generateHeatmap(state, botPlayer) {
        let heatmapCache = [];
        let pwr = 5; let spd = 3;
        for (let c = 0; c < state.cols; c++) {
            for (let r = 0; r < state.rows; r++) {
                // Determine if a mock deployment mathematically escalates/decreases net utility
                let occupant = state.units.find(u => u.col === c && u.row === r);
                if (occupant) {
                    // Record existing unit scalar 
                    heatmapCache.push({ col: c, row: r, val: occupant.player === botPlayer ? 10 : -10, occupied: true });
                } else if (!state.barricades.has(c + ',' + r)) {
                    let mockState = this.cloneState(state);
                    mockState.units.push({ id: 'X', type: 'combat', power: pwr, speed: spd, strength: pwr, isFlag: false, player: botPlayer, col: c, row: r });
                    let val = this.evaluateBoard(mockState, botPlayer);
                    heatmapCache.push({ col: c, row: r, val: val, occupied: false });
                }
            }
        }

        // Normalize scaling linearly safely from min to max to clean colors
        let unocc = heatmapCache.filter(h => !h.occupied);
        let min = unocc.length > 0 ? Math.min(...unocc.map(h => h.val)) : 0;
        let max = unocc.length > 0 ? Math.max(...unocc.map(h => h.val)) : 100;

        for (let h of heatmapCache) {
            if (!h.occupied && max > min) {
                h.norm = (h.val - min) / (max - min); // 0.0 to 1.0
            } else {
                h.norm = 0.5;
            }
        }
        return heatmapCache;
    }

    // --- AI INSIGHT ACTION TREE (Hypothetical Unit Values) ---
    generateActionTreeValues(state, botPlayer) {
        let cache = [];
        let pwr = 5; let spd = 3;
        let actions = this.generateCandidateActions(state, botPlayer);

        let uniqueTargets = new Set();
        let tileVals = {};

        let baseVal = this.evaluateBoard(state, botPlayer);

        for (let a of actions) {
            let key = `${a.targetCol},${a.targetRow}`;
            // Evaluate hypothetical placement once per target tile to save frames
            if (!uniqueTargets.has(key)) {
                uniqueTargets.add(key);
                let mockState = this.cloneState(state);

                // If it's placing on top of something (like an enemy we kill, or our own space), 
                // we simulate exactly replacing it with a new theoretical mock unit
                let occupantIndex = mockState.units.findIndex(u => u.col === a.targetCol && u.row === a.targetRow);
                if (occupantIndex !== -1) mockState.units.splice(occupantIndex, 1);

                mockState.units.push({ id: 'X', type: 'combat', power: pwr, speed: spd, strength: pwr, isFlag: false, player: botPlayer, col: a.targetCol, row: a.targetRow });

                // The value we gain directly from having this unit placed here
                let rawScore = this.evaluateBoard(mockState, botPlayer);
                tileVals[key] = Math.round(rawScore);
            }
        }

        // Cache min/max for color scaling identically to heatmap
        let min = Math.min(...Object.values(tileVals));
        let max = Math.max(...Object.values(tileVals));

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
