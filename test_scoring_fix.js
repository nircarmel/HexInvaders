import { AIBotV3 } from './js/ai-v3.js';
import { DEFAULT_V3_GENES } from './js/genes-v3.js';

const bot = new AIBotV3(null, DEFAULT_V3_GENES);

const state = {
    cols: 20,
    rows: 10,
    blue_credits: 40,
    red_credits: 25,
    currentPlayer: 'RED',
    gameMode: 'INVADE',
    flagCost: 10,
    barricades: new Set(['8,0', '8,1', '8,2', '8,3', '8,4']),
    units: [
        { id: 'b1', player: 'BLUE', col: 5, row: 6, power: 5, speed: 5, type: 'combat', isFlag: false },
        { id: 'b2', player: 'BLUE', col: 7, row: 3, power: 0, speed: 0, type: 'observation', isFlag: false },
        { id: 'r1', player: 'RED', col: 14, row: 0, power: 5, speed: 5, type: 'combat', isFlag: false },
        { id: 'r2', player: 'RED', col: 14, row: 6, power: 5, speed: 5, type: 'combat', isFlag: false },
        { id: 'r3', player: 'RED', col: 19, row: 6, power: 5, speed: 5, type: 'combat', isFlag: false }
    ]
};

const moveA = { type: 'MOVE', unitCol: 14, unitRow: 6, targetCol: 11, targetRow: 5 }; // (14, 6) -> (11, 5)
const moveB = { type: 'MOVE', unitCol: 14, unitRow: 0, targetCol: 9, targetRow: 2 };  // (14, 0) -> (9, 2)
const moveC = { type: 'MOVE', unitCol: 19, unitRow: 6, targetCol: 14, targetRow: 7 }; // (19, 6) -> (14, 7)

// PROPOSED FIX:
// 1. If an empty tile has maxEnemy === 0:
// It is NOT threatened by the enemy.
// Friendly units moving away do NOT "abandon" it.
// Therefore, empty tiles with maxEnemy === 0 should have consistent scoring whether maxMy > 0 or maxMy === 0!
// (combat power projection is for contesting/protecting against enemy presence or actual physical unit presence).
// 2. Physical occupancy: When a unit physically stands on a tile, that unit physically occupies that advanced position!

function evaluateWithProposedFix(st, botPlayer, options = {}) {
    const customBot = new AIBotV3(null, DEFAULT_V3_GENES);

    customBot.evaluateTileScores = function (state, bp) {
        let tileScores = [];
        const opponent = bp === 'BLUE' ? 'RED' : 'BLUE';
        const reachMap = this.computeReachability(state);
        const botGoalCol = bp === 'BLUE' ? state.cols - 1 : 0;
        const oppGoalCol = bp === 'BLUE' ? 0 : state.cols - 1;

        for (let col = 0; col < state.cols; col++) {
            for (let row = 0; row < state.rows; row++) {
                const tileKey = `${col},${row}`;
                if (state.barricades && state.barricades.has(tileKey)) {
                    tileScores.push({ col, row, val: null, isBarricade: true });
                    continue;
                }

                let actualOccupant = state.units.find(u => u.col === col && u.row === row);
                const occupants = reachMap.get(tileKey) || [];

                // Goal checks
                if (col === botGoalCol) {
                    tileScores.push({ col, row, val: 1000000 });
                    continue;
                }
                if (col === oppGoalCol) {
                    let enemyThreats = occupants.filter(u => u.player === opponent && !u.isFlag && u.type !== 'observation');
                    if (enemyThreats.length > 0) {
                        tileScores.push({ col, row, val: -1000000 });
                        continue;
                    }
                }

                let myReach = occupants.filter(u => u.player === bp && !u.isFlag && u.type !== 'observation');
                let enemyReach = occupants.filter(u => u.player === opponent && !u.isFlag && u.type !== 'observation');

                let maxMy = myReach.length > 0 ? Math.max(...myReach.map(u => u.power)) : 0;
                let maxEnemy = enemyReach.length > 0 ? Math.max(...enemyReach.map(u => u.power)) : 0;

                let tileOwner = 'NEUTRAL';
                if (actualOccupant) {
                    if (actualOccupant.player === bp) {
                        let enemyAttackers = occupants.filter(u => u.player === opponent && !u.isFlag && u.type !== 'observation');
                        let threatened = enemyAttackers.some(e => e.power >= actualOccupant.power);
                        tileOwner = threatened ? opponent : bp;
                    } else {
                        let friendlyAttackers = occupants.filter(u => u.player === bp && !u.isFlag && u.type !== 'observation');
                        let conquerable = friendlyAttackers.some(f => f.power >= actualOccupant.power);
                        tileOwner = conquerable ? bp : opponent;
                    }
                } else {
                    if (maxMy > 0 && maxEnemy > 0) {
                        tileOwner = maxMy > maxEnemy ? bp : opponent;
                    } else if (maxMy > 0 && maxEnemy === 0) {
                        tileOwner = bp;
                    } else if (maxEnemy > 0 && maxMy === 0) {
                        tileOwner = opponent;
                    } else {
                        tileOwner = 'UNTHREATENED';
                    }
                }

                let tileScore = 0;
                if (state.gameMode === 'INVADE') {
                    let advanceBonus = this.getAdvanceBonus(col, bp, state.cols);

                    if (actualOccupant && actualOccupant.player === bp) {
                        // Physical friendly unit on tile!
                        tileScore += (actualOccupant.power * 100) + advanceBonus;
                        // Plus physical unit advancement bonus if option enabled
                        if (options.physicalAdvancement) {
                            tileScore += advanceBonus; // Unit itself gets the advance value of standing at this col
                        }
                    } else if (actualOccupant && actualOccupant.player === opponent) {
                        // Physical enemy unit on tile
                        let oppAdvance = this.getAdvanceBonus(col, opponent, state.cols);
                        tileScore -= (actualOccupant.power * 100) + oppAdvance;
                    } else {
                        // Empty tile
                        if (maxMy > 0 && maxEnemy > 0) {
                            // Contested tile
                            if (tileOwner === bp) tileScore += (maxMy * 100) + advanceBonus;
                            else tileScore -= (maxEnemy * 100) + this.getAdvanceBonus(col, opponent, state.cols);
                        } else if (maxEnemy > 0) {
                            // Enemy uncontested reach into this tile
                            tileScore -= (maxEnemy * 100) + this.getAdvanceBonus(col, opponent, state.cols);
                        } else {
                            // maxEnemy === 0: NO ENEMY REACHES THIS TILE!
                            // It is unthreatened! Moving friendly reach away DOES NOT abandon it!
                            tileScore += advanceBonus;
                        }
                    }

                    // Observation units
                    for (let u of state.units) {
                        if (u.type === 'observation') {
                            let dist = this.hexMath ? this.hexMath.offsetDistance(u.col, u.row, col, row) : Math.abs(u.col - col) + Math.abs(u.row - row);
                            if (dist <= 6) {
                                let ringNum = Math.floor(dist) + 1;
                                let scoreVal = (3000 / ringNum);
                                tileScore += (u.player === bp ? scoreVal : -scoreVal);
                            }
                        }
                    }
                }

                tileScores.push({ col, row, val: tileScore });
            }
        }
        return tileScores;
    };

    return customBot.evaluateBoard(st, botPlayer);
}

console.log("\n--- TEST: UNTHREATENED TILES (NO PENALTY FOR EMPTY SAFE TILES) ---");
const baseFix1 = evaluateWithProposedFix(state, 'RED');
const scoreA1 = evaluateWithProposedFix(bot.applyVirtualAction(state, moveA), 'RED');
const scoreB1 = evaluateWithProposedFix(bot.applyVirtualAction(state, moveB), 'RED');
const scoreC1 = evaluateWithProposedFix(bot.applyVirtualAction(state, moveC), 'RED');

console.log(`Initial Score: ${baseFix1.toLocaleString()}`);
console.log(`Move A (14, 6) -> (11, 5): ${scoreA1.toLocaleString()} (Delta: ${(scoreA1 - baseFix1).toLocaleString()})`);
console.log(`Move B (14, 0) -> (9, 2):  ${scoreB1.toLocaleString()} (Delta: ${(scoreB1 - baseFix1).toLocaleString()})`);
console.log(`Move C (19, 6) -> (14, 7): ${scoreC1.toLocaleString()} (Delta: ${(scoreC1 - baseFix1).toLocaleString()})`);

console.log("\n--- TEST: UNTHREATENED TILES + PHYSICAL ADVANCEMENT BONUS ---");
const baseFix2 = evaluateWithProposedFix(state, 'RED', { physicalAdvancement: true });
const scoreA2 = evaluateWithProposedFix(bot.applyVirtualAction(state, moveA), 'RED', { physicalAdvancement: true });
const scoreB2 = evaluateWithProposedFix(bot.applyVirtualAction(state, moveB), 'RED', { physicalAdvancement: true });
const scoreC2 = evaluateWithProposedFix(bot.applyVirtualAction(state, moveC), 'RED', { physicalAdvancement: true });

console.log(`Initial Score: ${baseFix2.toLocaleString()}`);
console.log(`Move A (14, 6) -> (11, 5): ${scoreA2.toLocaleString()} (Delta: ${(scoreA2 - baseFix2).toLocaleString()})`);
console.log(`Move B (14, 0) -> (9, 2):  ${scoreB2.toLocaleString()} (Delta: ${(scoreB2 - baseFix2).toLocaleString()})`);
console.log(`Move C (19, 6) -> (14, 7): ${scoreC2.toLocaleString()} (Delta: ${(scoreC2 - baseFix2).toLocaleString()})`);
