import { AIBotV3 } from './js/ai-v3.js';
import { DEFAULT_V3_GENES } from './js/genes-v3.js';
import { hexMath } from './js/hex.js';

const bot = new AIBotV3(null, DEFAULT_V3_GENES);

console.log("===============================================================================");
console.log("SCENARIO 1: EQUAL POWER 5v5 (CONTESTED ZONE MUST BE NEGATIVE FOR BOTH PLAYERS)");
console.log("===============================================================================");

// 10x6 board, Blue at (1, 2) with power 5, speed 5; Red at (8, 2) with power 5, speed 5
const state5v5 = {
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
            id: 'blue_savior',
            player: 'BLUE',
            col: 1,
            row: 2,
            power: 5,
            speed: 5,
            type: 'combat',
            isFlag: false
        },
        {
            id: 'red_savior',
            player: 'RED',
            col: 8,
            row: 2,
            power: 5,
            speed: 5,
            type: 'combat',
            isFlag: false
        }
    ]
};

const reach = bot.computeReachability(state5v5);

// Find all empty tiles reachable by BOTH Blue and Red (the PURPLE ZONE)
const purpleTiles = [];
for (let c = 0; c < state5v5.cols; c++) {
    for (let r = 0; r < state5v5.rows; r++) {
        const key = `${c},${r}`;
        const occ = reach.get(key) || [];
        const hasBlue = occ.some(u => u.player === 'BLUE');
        const hasRed = occ.some(u => u.player === 'RED');
        const isOccupied = state5v5.units.some(u => u.col === c && u.row === r);
        if (hasBlue && hasRed && !isOccupied) {
            purpleTiles.push({ col: c, row: r });
        }
    }
}

console.log(`Found ${purpleTiles.length} contested (purple) empty tiles reachable by both Blue and Red:`);
purpleTiles.forEach(t => console.log(`  Tile (${t.col}, ${t.row})`));

const blueEval = bot.evaluateTileScores(state5v5, 'BLUE');
const redEval = bot.evaluateTileScores(state5v5, 'RED');

let allNegativeForBlue = true;
let allNegativeForRed = true;

for (let t of purpleTiles) {
    const bScore = blueEval.find(x => x.col === t.col && x.row === t.row)?.val;
    const rScore = redEval.find(x => x.col === t.col && x.row === t.row)?.val;
    console.log(`Tile (${t.col}, ${t.row}): Blue Perspective = ${bScore}, Red Perspective = ${rScore}`);
    if (bScore >= 0) allNegativeForBlue = false;
    if (rScore >= 0) allNegativeForRed = false;
}

console.log(`\nEqual Power 5v5 Blue Check: ${allNegativeForBlue ? "PASSED (All contested tiles are NEGATIVE / RED)" : "FAILED"}`);
console.log(`Equal Power 5v5 Red Check:  ${allNegativeForRed ? "PASSED (All contested tiles are NEGATIVE / RED)" : "FAILED"}`);

console.log("\n===============================================================================");
console.log("SCENARIO 2: UNEQUAL POWER 5v3 (BLUE POWER 5, RED POWER 3)");
console.log("===============================================================================");

const state5v3 = {
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
            id: 'blue_savior',
            player: 'BLUE',
            col: 1,
            row: 2,
            power: 5,
            speed: 5,
            type: 'combat',
            isFlag: false
        },
        {
            id: 'red_enforcer',
            player: 'RED',
            col: 8,
            row: 2,
            power: 3,
            speed: 5,
            type: 'combat',
            isFlag: false
        }
    ]
};

const blueEval5v3 = bot.evaluateTileScores(state5v3, 'BLUE');
const redEval5v3 = bot.evaluateTileScores(state5v3, 'RED');

let allPositiveForBlue = true;
let allNegativeForRed5v3 = true;

for (let t of purpleTiles) {
    const bScore = blueEval5v3.find(x => x.col === t.col && x.row === t.row)?.val;
    const rScore = redEval5v3.find(x => x.col === t.col && x.row === t.row)?.val;
    console.log(`Tile (${t.col}, ${t.row}): Blue Perspective = ${bScore}, Red Perspective = ${rScore}`);
    if (bScore <= 0) allPositiveForBlue = false;
    if (rScore >= 0) allNegativeForRed5v3 = false;
}

console.log(`\nUnequal Power 5v3 Blue Check: ${allPositiveForBlue ? "PASSED (Stronger Blue sees all contested tiles as POSITIVE / GREEN)" : "FAILED"}`);
console.log(`Unequal Power 5v3 Red Check:  ${allNegativeForRed5v3 ? "PASSED (Weaker Red sees all contested tiles as NEGATIVE / RED)" : "FAILED"}`);
