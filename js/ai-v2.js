// js/ai.js
import { hexMath } from './hex.js';
import { DEFAULT_V2_GENES } from './genes-v2.js';

const SPAWN_ARCHETYPES_V2 = [
    { name: "Sprinter", power: 1, speed: 4, cost: 4 },
    { name: "Enforcer", power: 3, speed: 3, cost: 9 },
    { name: "Interceptor", power: 4, speed: 2, cost: 8 },
    { name: "Titan", power: 5, speed: 3, cost: 15 },
    { name: "Savior", power: 5, speed: 5, cost: 25 },
];
export class OpponentModeler {
    constructor(opponentTeam) {
        this.opponentTeam = opponentTeam;
        this.history = [];
        this.stats = {
            totalSpent: 0,
            avgPower: 3,
            avgSpeed: 3,
            defenseRatio: 0.5,
            cadence: 1.0 // 1.0=steady, high=burst, low=hoarder
        };
        this.lastBank = 100;
        this.turnsTracked = 0;
    }

    updateStats(state) {
        let currentBank = this.opponentTeam === 'BLUE' ? state.blue_credits : state.red_credits;
        let diff = this.lastBank - currentBank;
        if (diff > 0) this.stats.totalSpent += diff;
        this.lastBank = currentBank;
        this.turnsTracked++;

        let oppUnits = state.units.filter(u => u.player === this.opponentTeam && !u.isFlag);
        if (oppUnits.length > 0) {
            let p = 0, s = 0, def = 0;
            let midCol = state.cols / 2;
            for (let u of oppUnits) {
                p += u.power;
                s += u.speed;
                let distToOwnBase = this.opponentTeam === 'BLUE' ? u.col : Math.abs(u.col - (state.cols - 1));
                if (distToOwnBase <= midCol) def++;
            }
            this.stats.avgPower = p / oppUnits.length;
            this.stats.avgSpeed = s / oppUnits.length;
            this.stats.defenseRatio = def / oppUnits.length;
        }

        let avgSpendPerTurn = this.stats.totalSpent / Math.max(1, this.turnsTracked);
        if (avgSpendPerTurn > 8.0) this.stats.cadence = 2.0; // Burst
        else if (avgSpendPerTurn < 3.0) this.stats.cadence = 0.5; // Hoarder
        else this.stats.cadence = 1.0; // Steady
    }
}

export class MinimaxEngine {
    constructor(game, genes) {
        this.game = game;
        this.baseGenes = genes;
    }

    evaluateStrategicAxis(opponentProfile) {
        // Pure Alpha-Beta Minimax relies strictly on the native genome. No exploratory structures mapped.
        let strategyModifier = { ...this.baseGenes };

        if (opponentProfile.cadence === 2.0) {
            // Adaptive Strategy: Counter burst builds by pulling reactive holding
            strategyModifier.tempoWastePenalty = 0;
        }

        return strategyModifier;
    }
}

export class AIBotV2 {
    constructor(game, genes = null) {
        this.game = game;
        this.genes = genes || DEFAULT_V2_GENES; // V2 engine weights natively

        const gName = this.game.type === 'PLANT' ? 'PLANT' : 'INVADE';
        const gRef = this.genes[gName];

        this.game.logSystem(`AI Matrix Initialize: Minimax [Game: ${gName}]`);
        this.game.logSystem(`Weights: Material(${gRef.unitValueMultiplier}), Advance(${gRef.frontierGapWeight}), Defend(${gRef.territorialControlWeight})`);

        this.modeler = new OpponentModeler('BLUE'); // Profile human on Blue team
        this.minimaxCore = new MinimaxEngine(game, gRef);
    }

    executeTurn() {
        if (this.game.activeTeam !== 'RED') return;
        if (this.game.winner) return;

        // Adaptive Opponent Telemetry Update
        this.modeler.updateStats(this.cloneState());

        // Dynamic Genome Adjustments
        const activeGenes = this.minimaxCore.evaluateStrategicAxis(this.modeler.stats);
        this.genes = { PLANT: activeGenes, INVADE: activeGenes };

        this.game.logSystem('Computer is thinking... (Hybrid MCTS/Alpha-Beta)');

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
                        isFlag: t.unit.isFlag,
                        cost: t.unit.cost || 4
                    });
                }
            }
        }
        return state;
    }

    // ==========================================
    // V2: FAST A-STAR HEX ROUTING
    // ==========================================
    calculatePathLengthToColumn(state, unit, targetCol) {
        if (unit.col === targetCol) return 0;

        let openSet = [{ c: unit.col, r: unit.row, g: 0, f: Math.abs(unit.col - targetCol) }];
        let closedSet = new Set();
        let cameFrom = new Map();

        while (openSet.length > 0) {
            openSet.sort((a, b) => a.f - b.f);
            let curr = openSet.shift();

            if (curr.c === targetCol) {
                // Return exact path nodes for T5 tracing
                let pathList = [];
                let step = curr;
                while (step) {
                    pathList.push(step);
                    // reconstruct
                    let parentKey = cameFrom.get(`${step.c},${step.r}`);
                    step = parentKey ? { c: parseInt(parentKey.split(',')[0]), r: parseInt(parentKey.split(',')[1]), g: step.g - 1 } : null; // simplified backtrack
                }
                pathList.reverse();
                return { length: curr.g, path: pathList };
            }

            let key = `${curr.c},${curr.r}`;
            closedSet.add(key);

            let ax = hexMath.offsetToAxial(curr.c, curr.r);
            for (let dir of hexMath.hexDirections) {
                let nAx = { q: ax.q + dir.dq, r: ax.r + dir.dr };
                let nOff = hexMath.axialToOffset(nAx.q, nAx.r);

                if (nOff.col >= 0 && nOff.row >= 0 && nOff.col < state.cols && nOff.row < state.rows) {
                    let nKey = `${nOff.col},${nOff.row}`;
                    if (closedSet.has(nKey) || state.barricades.has(nKey)) continue;

                    let occupant = state.units.find(u => u.col === nOff.col && u.row === nOff.row);
                    if (occupant && occupant.player !== unit.player) continue; // Blocked by enemy

                    let gScore = curr.g + 1;
                    let existing = openSet.find(n => n.c === nOff.col && n.r === nOff.row);

                    if (!existing || gScore < existing.g) {
                        cameFrom.set(nKey, key);
                        if (!existing) {
                            openSet.push({ c: nOff.col, r: nOff.row, g: gScore, f: gScore + Math.abs(nOff.col - targetCol) });
                        } else {
                            existing.g = gScore;
                            existing.f = gScore + Math.abs(nOff.col - targetCol);
                        }
                    }
                }
            }
        }
        return { length: Infinity, path: [] }; // No path exists
    }

    // ==========================================
    // V2: 8-TERM HYBRID EVALUATION ENGINE
    // ==========================================
    evaluateBoard(state, botPlayer) {
        let score = 0;
        const opponent = botPlayer === 'BLUE' ? 'RED' : 'BLUE';
        const botGoalCol = botPlayer === 'BLUE' ? state.cols - 1 : 0;
        const oppGoalCol = botPlayer === 'BLUE' ? 0 : state.cols - 1;

        const friendlyUnits = state.units.filter(u => u.player === botPlayer && !u.isFlag && u.type !== 'observation');
        const enemyUnits = state.units.filter(u => u.player === opponent && !u.isFlag && u.type !== 'observation');
        const friendlyFlags = state.units.filter(u => u.player === botPlayer && u.isFlag);
        const enemyFlags = state.units.filter(u => u.player === opponent && u.isFlag);

        let friendlyBank = botPlayer === 'BLUE' ? state.blue_credits : state.red_credits;
        let enemyBank = botPlayer === 'BLUE' ? state.red_credits : state.blue_credits;

        const genes = state.gameMode === 'PLANT' ? this.genes.PLANT : this.genes.INVADE;

        // ========================
        // T3. Home Base Capture
        // ========================
        if (state.gameMode === 'PLANT') {
            for (let f of friendlyFlags) if (f.col === botGoalCol) return genes.homeBaseCapture;
            for (let f of enemyFlags) if (f.col === oppGoalCol) return -genes.homeBaseCapture;
        } else {
            for (let u of state.units) {
                if (u.player === botPlayer && u.col === botGoalCol) return genes.homeBaseCapture;
                if (u.player === opponent && u.col === oppGoalCol) return -genes.homeBaseCapture;
            }
        }

        // ========================
        // T1. Unit Value Tracking
        // ========================
        let friendlyMaterial = 0;
        let enemyMaterial = 0;
        for (let u of friendlyUnits) friendlyMaterial += u.cost * genes.unitValueMultiplier;
        for (let f of friendlyFlags) friendlyMaterial += f.cost * genes.unitValueMultiplier;
        for (let e of enemyUnits) enemyMaterial += e.cost * genes.unitValueMultiplier;
        for (let f of enemyFlags) enemyMaterial += f.cost * genes.unitValueMultiplier;

        // ========================
        // T2. Flag Capture Surcharge
        // ========================
        // Flags are already factored in T1. The surcharge applies to flags lost (so if enemy has flags on board, we failed to capture them).
        // Wait, T2 mathematically handles if you LOSE a flag or DESTROY an opponent's flag.
        // If they HAVE fewer flags, it means we captured it. Given absolute board state, we evaluate currently existing flags.
        let friendlyFlagValue = 0;
        friendlyFlags.forEach(f => {
            friendlyFlagValue += friendlyBank > 50 ? genes.flagSurchargeSafe : genes.flagSurchargePanic;
        });

        let enemyFlagValue = 0;
        enemyFlags.forEach(f => {
            enemyFlagValue += enemyBank > 50 ? genes.flagSurchargeSafe : genes.flagSurchargePanic;
        });

        score += (friendlyMaterial - enemyMaterial);
        score += (friendlyFlagValue - enemyFlagValue);

        // ========================
        // T4. Flag Proximity Danger / Reward & T5. Path Safety Multiplier
        // ========================
        let friendlyFlagProx = 0;
        for (let f of friendlyFlags) {
            let pathInfo = this.calculatePathLengthToColumn(state, f, botGoalCol);
            if (pathInfo.length < Infinity) {
                let distProgressed = Math.max(0, state.cols - pathInfo.length);
                let baseVal = distProgressed * genes.proximityGradientWeight;

                let intercepted = false;
                for (let node of pathInfo.path) {
                    let flagArrivalTime = Math.ceil(node.g / (f.speed || 1));
                    let interceptor = enemyUnits.find(e => Math.ceil(hexMath.offsetDistance(e.col, e.row, node.c, node.r) / e.speed) <= flagArrivalTime);
                    if (interceptor) { intercepted = true; break; }
                }
                friendlyFlagProx += intercepted ? (baseVal * genes.pathSafetyRetainer) : baseVal;
            }
        }

        let enemyFlagProx = 0;
        for (let f of enemyFlags) {
            let pathInfo = this.calculatePathLengthToColumn(state, f, oppGoalCol);
            if (pathInfo.length < Infinity) {
                let distProgressed = Math.max(0, state.cols - pathInfo.length);
                let baseVal = distProgressed * genes.proximityGradientWeight;

                let intercepted = false;
                for (let node of pathInfo.path) {
                    let flagArrivalTime = Math.ceil(node.g / (f.speed || 1));
                    let interceptor = friendlyUnits.find(e => Math.ceil(hexMath.offsetDistance(e.col, e.row, node.c, node.r) / e.speed) <= flagArrivalTime);
                    if (interceptor) { intercepted = true; break; }
                }
                enemyFlagProx += intercepted ? (baseVal * genes.pathSafetyRetainer) : baseVal;
            }
        }
        score += friendlyFlagProx - enemyFlagProx;

        // ========================
        // T6. Vanguard Frontier (Only the deepest unit pushes)
        // ========================
        let friendlyFrontierVal = 0;
        let enemyFrontierVal = 0;

        if (state.gameMode !== 'PLANT') {
            let pFriendly = friendlyUnits.sort((a, b) => Math.abs(a.col - botGoalCol) - Math.abs(b.col - botGoalCol));
            if (pFriendly.length > 0) {
                let u = pFriendly[0];
                let distProgressed = Math.max(0, state.cols - Math.abs(u.col - botGoalCol));
                friendlyFrontierVal = distProgressed * genes.frontierGapWeight;
            }

            let pEnemy = enemyUnits.sort((a, b) => Math.abs(a.col - oppGoalCol) - Math.abs(b.col - oppGoalCol));
            if (pEnemy.length > 0) {
                let e = pEnemy[0];
                let distProgressed = Math.max(0, state.cols - Math.abs(e.col - oppGoalCol));
                enemyFrontierVal = distProgressed * genes.frontierGapWeight;
            }
        }
        score += friendlyFrontierVal - enemyFrontierVal;

        // ========================
        // T7. Board Control
        // ========================
        let friendlyTerritory = 0;
        let enemyTerritory = 0;
        for (let u of friendlyUnits) {
            let distToEnemyBase = Math.abs(u.col - oppGoalCol);
            let distToFriendlyBase = Math.abs(u.col - botGoalCol);
            if (distToEnemyBase <= 3 || distToFriendlyBase <= 3) friendlyTerritory += genes.territorialControlWeight;
        }
        for (let e of enemyUnits) {
            let distToTheirEnemyBase = Math.abs(e.col - botGoalCol);
            let distToTheirFriendlyBase = Math.abs(e.col - oppGoalCol);
            if (distToTheirEnemyBase <= 3 || distToTheirFriendlyBase <= 3) enemyTerritory += genes.territorialControlWeight;
        }

        // --- V2 Plant Flag Escort Injector ---
        if (state.gameMode === 'PLANT') {
            for (let u of friendlyUnits) {
                for (let f of friendlyFlags) {
                    if (hexMath.offsetDistance(u.col, u.row, f.col, f.row) <= 1) {
                        friendlyTerritory += (genes.territorialControlWeight * 1.5);
                    }
                }
            }
            for (let e of enemyUnits) {
                for (let f of enemyFlags) {
                    if (hexMath.offsetDistance(e.col, e.row, f.col, f.row) <= 1) {
                        enemyTerritory += (genes.territorialControlWeight * 1.5);
                    }
                }
            }
        }

        score += friendlyTerritory - enemyTerritory;

        // ========================
        // T8. Unused Credit Reserve
        // ========================
        score -= (friendlyBank * genes.tempoWastePenalty);
        score += (enemyBank * genes.tempoWastePenalty);

        // ========================
        // T9. Strategic Influence Protocol (Territory Dominance Map)
        // ========================
        let friendlyPowerMap = new Array(state.cols * state.rows).fill(0);
        let enemyPowerMap = new Array(state.cols * state.rows).fill(0);
        let allFlags = friendlyFlags.concat(enemyFlags);

        // Populate Threat Map cleanly across bounds
        for (let u of friendlyUnits.concat(enemyUnits)) {
            let speed = u.speed || 1;
            let power = u.strength || u.power || 0;
            let isFriendly = (u.team === botPlayer);

            let startC = Math.max(0, u.col - speed);
            let endC = Math.min(state.cols - 1, u.col + speed);
            let startR = Math.max(0, u.row - speed);
            let endR = Math.min(state.rows - 1, u.row + speed);

            for (let c = startC; c <= endC; c++) {
                for (let r = startR; r <= endR; r++) {
                    if (hexMath.offsetDistance(u.col, u.row, c, r) <= speed) {
                        let idx = c * state.rows + r;
                        if (isFriendly) {
                            if (power > friendlyPowerMap[idx]) friendlyPowerMap[idx] = power;
                        } else {
                            if (power > enemyPowerMap[idx]) enemyPowerMap[idx] = power;
                        }
                    }
                }
            }
        }

        // Calculate mapped supremacy scores
        let totalStrategicScore = 0;
        for (let c = 0; c < state.cols; c++) {
            for (let r = 0; r < state.rows; r++) {
                // Ignore Barricades physically
                if (state.barricades && state.barricades.has(`${c},${r}`)) continue;

                let idx = c * state.rows + r;
                let fp = friendlyPowerMap[idx];
                let ep = enemyPowerMap[idx];

                let supremacy = 0;
                if (fp > ep) supremacy = 1;
                else if (ep > fp) supremacy = -1;

                if (supremacy !== 0) {
                    let stepsFromCenter = Math.abs(c - ((state.cols - 1) / 2)) - 0.5;
                    let baseColVal = 1000 * Math.pow(1.1, stepsFromCenter);

                    let maxFlagBonus = 0;
                    for (let f of allFlags) {
                        let d = hexMath.offsetDistance(c, r, f.col, f.row);
                        let bonus = 3000 - (300 * Math.ceil(d));
                        if (bonus > maxFlagBonus) maxFlagBonus = bonus;
                    }

                    totalStrategicScore += supremacy * (baseColVal + maxFlagBonus);
                }
            }
        }

        // Scale by 100x to prevent overriding the 90k terminal Victory Cap natively
        score += (totalStrategicScore / 100.0);

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

            for (let arch of SPAWN_ARCHETYPES_V2) {
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
                isFlag: isFlagType,
                cost: action.cost || 10
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

        if (depth === 0 || Math.abs(score) >= 150000.0) {
            if (score >= 150000.0) score += depth * 1000;
            if (score <= -150000.0) score -= depth * 1000;
            return { score, action: null };
        }

        let actions = this.generateCandidateActions(state, state.currentPlayer);
        if (actions.length === 0) return { score, action: null };

        // ----------------------------------------------------
        // BEAM-SEARCH ACTION CULLING (Top-K Filter)
        // ----------------------------------------------------
        // To allow depths up to 10-12, explicitly evaluate actions at shallow depth (1 ply) 
        // to filter out thousands of useless structural deployments dynamically.
        if (depth > 2 && actions.length > 5) {
            let shallowEvals = actions.map(a => {
                let sNext = this.applyVirtualAction(state, a);
                return { action: a, sResult: this.evaluateBoard(sNext, botPlayer) };
            });
            // Sort Descending if BotPlayer is acting (true), else Ascending
            let isBotActing = state.currentPlayer === botPlayer;
            if (isBotActing) shallowEvals.sort((a, b) => b.sResult - a.sResult);
            else shallowEvals.sort((a, b) => a.sResult - b.sResult);

            // Constrict branch factor dramatically on deep layers to maintain microsecond performance
            let branchLimit = (depth > 6) ? 3 : 5;
            actions = shallowEvals.slice(0, branchLimit).map(se => se.action);
        } else {
            actions.sort((a, b) => this.actionPriority(b, state) - this.actionPriority(a, state));
        }
        // ----------------------------------------------------

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

        // Depth 3 for standard alpha-beta pruning lookahead
        const result = this.minimax(rootState, 3, -Infinity, Infinity, true, 'RED');

        const bestAction = result.action;

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

    executeTurn() {
        this.decideAction();
    }
}
