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

// Candidate moves
const moveA = { type: 'MOVE', unitCol: 14, unitRow: 6, targetCol: 11, targetRow: 5 }; // (14, 6) -> (11, 5)
const moveB = { type: 'MOVE', unitCol: 14, unitRow: 0, targetCol: 9, targetRow: 2 };  // (14, 0) -> (9, 2)
const moveC = { type: 'MOVE', unitCol: 19, unitRow: 6, targetCol: 14, targetRow: 7 }; // (19, 6) -> (14, 7)

console.log("=== CURRENT SCORING ===");
const currentBase = bot.evaluateBoard(state, 'RED');
console.log(`Initial: ${currentBase.toLocaleString()}`);
console.log(`Move A:  ${bot.evaluateBoard(bot.applyVirtualAction(state, moveA), 'RED').toLocaleString()} (Delta: ${(bot.evaluateBoard(bot.applyVirtualAction(state, moveA), 'RED') - currentBase).toLocaleString()})`);
console.log(`Move B:  ${bot.evaluateBoard(bot.applyVirtualAction(state, moveB), 'RED').toLocaleString()} (Delta: ${(bot.evaluateBoard(bot.applyVirtualAction(state, moveB), 'RED') - currentBase).toLocaleString()})`);
console.log(`Move C:  ${bot.evaluateBoard(bot.applyVirtualAction(state, moveC), 'RED').toLocaleString()} (Delta: ${(bot.evaluateBoard(bot.applyVirtualAction(state, moveC), 'RED') - currentBase).toLocaleString()})`);

// Now let's test Model 1:
// Safe Unthreatened Territory:
// If maxEnemy === 0 on an empty tile, that tile is unthreatened.
// Moving away does NOT penalize it: its value is independent of whether friendly units reach it or not,
// UNLESS an actual friendly unit occupies it, OR enemy threatens it.
console.log("\n=== MODEL 1: UNTHREATENED EMPTY TILES DO NOT LOSE SCORE WHEN FRIENDLY REACH DEPARTS ===");

// Let's implement Model 1 evaluation:
function evaluateModel1(s, botPlayer) {
    const customBot = new AIBotV3(null, DEFAULT_V3_GENES);
    // Custom evaluateTileScores where empty tiles with maxEnemy === 0 don't get pwr * COMBAT_BOOST just for reach
    // Instead, pwr * COMBAT_BOOST is only for:
    // 1) Actually occupied tiles: actualOccupant.power * COMBAT_BOOST
    // 2) Contested tiles where enemy can reach: maxMy * COMBAT_BOOST vs maxEnemy * COMBAT_BOOST
    const origMethod = customBot.evaluateTileScores.bind(customBot);
    customBot.evaluateTileScores = function (st, bp) {
        const scores = origMethod(st, bp);
        // Let's inspect differences if empty unthreatened tiles don't get combat boost
        return scores;
    };
    return customBot.evaluateBoard(s, botPlayer);
}
