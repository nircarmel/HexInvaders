
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

// js/ai.js


const SPAWN_ARCHETYPES = [
    { name: "Sprinter", power: 1, speed: 4, cost: 4 },
    { name: "Enforcer", power: 3, speed: 3, cost: 9 },
    { name: "Interceptor", power: 4, speed: 2, cost: 8 },
    { name: "Titan", power: 5, speed: 3, cost: 15 },
    { name: "Savior", power: 5, speed: 5, cost: 25 },
];

class AIBot {
    constructor(game) {
        this.game = game;
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

        // 1. Terminal Checks
        for (let u of state.units) {
            if (u.player === botPlayer && u.col === botGoalCol) return 100000.0;
            if (u.player === opponent && u.col === oppGoalCol) return -100000.0;
        }

        // 2. Invasion Pressure
        let friendlyThreat = 0;
        for (let u of friendlyUnits) {
            let ttg = this.turnsToGoal(u.col, u.speed, botGoalCol);
            friendlyThreat += 1000.0 / (ttg * ttg);
        }

        let enemyThreat = 0;
        for (let e of enemyUnits) {
            let ttg = this.turnsToGoal(e.col, e.speed, oppGoalCol);
            enemyThreat += 1000.0 / (ttg * ttg);
        }
        let deltaInvade = friendlyThreat - enemyThreat;

        // 3. Tactical Combat Threat & Vulnerability
        let deltaCombat = 0.0;
        for (let u of friendlyUnits) {
            for (let e of enemyUnits) {
                let dist = hexMath.offsetDistance(u.col, u.row, e.col, e.row);
                // Friendly can attack and win
                if (u.power >= e.power && dist <= u.speed) {
                    deltaCombat += (e.power * e.speed) * 1.0;
                }
                // Enemy can attack and kill friendly
                if (e.power >= u.power && dist <= e.speed) {
                    deltaCombat -= (u.power * u.speed) * 1.2;
                }
            }
        }

        // 4. Material & Credit Reserves
        let friendlyFieldVal = 0;
        for (let u of friendlyUnits) friendlyFieldVal += u.power * u.speed;

        let enemyFieldVal = 0;
        for (let e of enemyUnits) enemyFieldVal += e.power * e.speed;

        let friendlyBank = botPlayer === 'BLUE' ? state.blue_credits : state.red_credits;
        let enemyBank = botPlayer === 'BLUE' ? state.red_credits : state.blue_credits;

        let deltaMaterial = (friendlyFieldVal + 0.8 * friendlyBank) - (enemyFieldVal + 0.8 * enemyBank);

        // 5. Defensive Screening
        let defensiveScore = 0.0;
        for (let e of enemyUnits) {
            let eTtg = this.turnsToGoal(e.col, e.speed, oppGoalCol);
            for (let u of friendlyUnits) {
                let isBetween = botPlayer === 'BLUE' ? (u.col < e.col) : (u.col > e.col);
                if (isBetween && u.power >= e.power) {
                    let distToThreat = hexMath.offsetDistance(u.col, u.row, e.col, e.row);
                    if (distToThreat <= u.speed + 1) {
                        defensiveScore += 150.0 / eTtg;
                    }
                }
            }
        }

        return deltaInvade + deltaCombat + deltaMaterial + defensiveScore;
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
            if (u.player !== player || u.type === 'observation' || u.isFlag) continue;

            const validDestinations = this.getValidMovesVirtual(state, u);
            for (let target of validDestinations) {
                let targetUnit = state.units.find(un => un.col === target.col && un.row === target.row);

                // Attack
                if (targetUnit && targetUnit.player !== player && targetUnit.type !== 'observation') {
                    actions.push({ type: 'MOVE', unitId: u.id, unitCol: u.col, unitRow: u.row, targetCol: target.col, targetRow: target.row });
                    continue;
                }

                // Advance
                let currDist = Math.abs(u.col - enemyHomeCol);
                let newDist = Math.abs(target.col - enemyHomeCol);
                if (newDist < currDist) {
                    actions.push({ type: 'MOVE', unitId: u.id, unitCol: u.col, unitRow: u.row, targetCol: target.col, targetRow: target.row });
                    continue;
                }

                // Defensive Position
                let isDefensive = player === 'BLUE' ? (target.col < u.col) : (target.col > u.col);
                if (isDefensive) {
                    actions.push({ type: 'MOVE', unitId: u.id, unitCol: u.col, unitRow: u.row, targetCol: target.col, targetRow: target.row });
                }
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
            for (let arch of SPAWN_ARCHETYPES) {
                if (credits >= arch.cost) {
                    // Reduce branching factor by just using generic spread for spawning if possible instead of all blanks
                    let rowsToTest = [];
                    if (emptyHomeTiles.length <= 3) rowsToTest = emptyHomeTiles;
                    else rowsToTest = [emptyHomeTiles[0], emptyHomeTiles[Math.floor(emptyHomeTiles.length / 2)], emptyHomeTiles[emptyHomeTiles.length - 1]];

                    for (let hr of rowsToTest) {
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

            nextState.units.push({
                id: `spawn_${Math.random()}`,
                col: action.targetCol,
                row: action.targetRow,
                player: state.currentPlayer,
                power: action.power,
                speed: action.speed,
                type: 'combat',
                isFlag: false
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

        if (depth === 0 || Math.abs(score) >= 90000.0) {
            return { score, action: null };
        }

        let actions = this.generateCandidateActions(state, state.currentPlayer);
        if (actions.length === 0) {
            return { score, action: null };
        }

        actions.sort((a, b) => this.actionPriority(b, state) - this.actionPriority(a, state));
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
            this.game.deployUnit('RED', 'combat', bestAction.power, bestAction.speed, bestAction.targetCol, bestAction.targetRow);
        } else if (bestAction.type === 'MOVE') {
            this.game.moveUnit(bestAction.unitCol, bestAction.unitRow, bestAction.targetCol, bestAction.targetRow);
        } else {
            this.game.logAction('RED', 'AI chose to Skip Action.');
            this.game.endTurn();
        }
    }
}


try {
    let fakeGame = {
        cols: 30, rows: 15, activeTeam: 'RED', winner: null,
        credits: { BLUE: 46, RED: 50 },
        board: new Map(),
        getTile: function(c, r) { return this.board.get(c + ',' + r) || { isBarricade: false, unit: null }; },
        logSystem: console.log,
        logAction: console.log,
        deployUnit: (team, type, str, spd, c, r) => { console.log('DEPLOY:', team, type, str, spd, c, r); return true; },
        moveUnit: (sc, sr, tc, tr) => { console.log('MOVE:', sc, sr, tc, tr); return true; },
        endTurn: () => { console.log('END TURN'); }
    };

    for(let r=0; r<15; r++) {
        for(let c=0; c<30; c++) {
            fakeGame.board.set(c+','+r, { isBarricade: false, unit: null });
        }
    }
    
    // Exact simulation of Hex-Invaders Unit class (no col/row)
    fakeGame.board.set('0,0', {
        isBarricade: false, 
        unit: { team: 'BLUE', strength: 1, speed: 4, type: 'combat', isFlag: false, hasActed: false, cost: 4 }
    });

    let ai = new AIBot(fakeGame);
    ai.decideAction();
    console.log('SUCCESS');
} catch (err) {
    console.log("AI TRACE:", err.stack);
}
