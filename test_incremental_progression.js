import { AIBotV3 } from './js/ai-v3.js';
import { DEFAULT_V3_GENES } from './js/genes-v3.js';

const bot = new AIBotV3(null, DEFAULT_V3_GENES);

console.log("===============================================================================");
console.log("TESTING getAdvanceBonus EXACT DELTAS (100k / dist)");
console.log("===============================================================================");

// For Blue on a 10-column board (cols 0 to 9, enemy base is col 9):
// Dist 1 is col 8
// Dist 2 is col 7
// Dist 3 is col 6
// Dist 4 is col 5
const b8 = bot.getAdvanceBonus(8, 'BLUE', 10); // dist 1
const b7 = bot.getAdvanceBonus(7, 'BLUE', 10); // dist 2
const b6 = bot.getAdvanceBonus(6, 'BLUE', 10); // dist 3
const b5 = bot.getAdvanceBonus(5, 'BLUE', 10); // dist 4

console.log(`Col 5 (dist 4): ${b5}`);
console.log(`Col 6 (dist 3): ${b6}`);
console.log(`Col 7 (dist 2): ${b7}`);
console.log(`Col 8 (dist 1): ${b8}`);

const delta4to3 = b6 - b5;
const delta3to2 = b7 - b6;
const delta2to1 = b8 - b7;

console.log(`\nDelta from dist 4 to dist 3: ${delta4to3} (Target: ~33,333 = 100000/3)`);
console.log(`Delta from dist 3 to dist 2: ${delta3to2} (Target: 50,000 = 100000/2)`);
console.log(`Delta from dist 2 to dist 1: ${delta2to1} (Target: 100,000 = 100000/1)`);

const pass2to1 = delta2to1 === 100000;
const pass3to2 = delta3to2 === 50000;
const pass4to3 = Math.abs(delta4to3 - 33333) <= 1;

console.log(`\nStep 2 -> 1 check: ${pass2to1 ? "PASSED" : "FAILED"}`);
console.log(`Step 3 -> 2 check: ${pass3to2 ? "PASSED" : "FAILED"}`);
console.log(`Step 4 -> 3 check: ${pass4to3 ? "PASSED" : "FAILED"}`);

console.log("\n===============================================================================");
console.log("TESTING TILE SCORES WITH ACTIVE UNIT (INVADE MODE)");
console.log("===============================================================================");

const testState = {
    cols: 10,
    rows: 6,
    blue_credits: 0,
    red_credits: 0,
    currentPlayer: 'BLUE',
    gameMode: 'INVADE',
    flagCost: 10,
    barricades: new Set(),
    units: [
        {
            id: 'blue_sprinter',
            player: 'BLUE',
            col: 4,
            row: 2,
            power: 3,
            speed: 4,
            type: 'combat',
            isFlag: false
        }
    ]
};

const scores = bot.evaluateTileScores(testState, 'BLUE');
console.log("Row 2 Tile Scores across columns (from col 0 to col 9):");
for (let c = 0; c < 10; c++) {
    const tile = scores.find(t => t.col === c && t.row === 2);
    console.log(`  Col ${c}: ${tile ? tile.val : 0}`);
}

const t5 = scores.find(t => t.col === 5 && t.row === 2)?.val;
const t6 = scores.find(t => t.col === 6 && t.row === 2)?.val;
const t7 = scores.find(t => t.col === 7 && t.row === 2)?.val;
const t8 = scores.find(t => t.col === 8 && t.row === 2)?.val;

console.log(`\nTile increment Col 5->6 (dist 4->3): ${t6 - t5}`);
console.log(`Tile increment Col 6->7 (dist 3->2): ${t7 - t6}`);
console.log(`Tile increment Col 7->8 (dist 2->1): ${t8 - t7}`);
