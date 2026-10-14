// js/ai-v3.js
import { hexMath } from './hex.js';
import { DEFAULT_V3_GENES } from './genes-v3.js';

const SPAWN_ARCHETYPES = [
    { name: "Sprinter", power: 1, speed: 4, cost: 4 },
    { name: "Enforcer", power: 3, speed: 3, cost: 9 },
    { name: "Interceptor", power: 4, speed: 2, cost: 8 },
    { name: "Titan", power: 5, speed: 3, cost: 15 },
    { name: "Savior", power: 5, speed: 5, cost: 25 },
];

export class AIBotV3 {
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
