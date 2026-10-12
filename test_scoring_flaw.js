import { AIBotV3 } from './js/ai-v3.js';
import { DEFAULT_V3_GENES } from './js/genes-v3.js';

const bot = new AIBotV3(null, DEFAULT_V3_GENES);

console.log("=== EXAMINING TILE SCORING MECHANICS ===");

// Let's inspect tile (9, 2) when Red is at (14, 0) vs when Red is at (9, 2)
const stateBefore = {
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

const scoresBefore = bot.evaluateTileScores(stateBefore, 'RED');
const t9_2_before = scoresBefore.find(t => t.col === 9 && t.row === 2);
const t14_0_before = scoresBefore.find(t => t.col === 14 && t.row === 0);

console.log("BEFORE MOVE (Red at 14, 0):");
console.log(`  Tile (9, 2) score:  ${t9_2_before.val}`);
console.log(`  Tile (14, 0) score: ${t14_0_before.val}`);

const stateAfter = bot.applyVirtualAction(stateBefore, {
    type: 'MOVE', unitCol: 14, unitRow: 0, targetCol: 9, targetRow: 2
});

const scoresAfter = bot.evaluateTileScores(stateAfter, 'RED');
const t9_2_after = scoresAfter.find(t => t.col === 9 && t.row === 2);
const t14_0_after = scoresAfter.find(t => t.col === 14 && t.row === 0);

console.log("\nAFTER MOVE (Red at 9, 2):");
console.log(`  Tile (9, 2) score:  ${t9_2_after.val}`);
console.log(`  Tile (14, 0) score: ${t14_0_after.val}`);
console.log(`  Difference on (9, 2):  ${t9_2_after.val - t9_2_before.val}`);
console.log(`  Difference on (14, 0): ${t14_0_after.val - t14_0_before.val}`);
