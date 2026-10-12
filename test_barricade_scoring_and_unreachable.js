import { AIBotV3 } from './js/ai-v3.js';
import { DEFAULT_V3_GENES } from './js/genes-v3.js';

const bot = new AIBotV3(null, DEFAULT_V3_GENES);

console.log("===============================================================================");
console.log("TEST: Barricade Scoring Exclusion & Bot Reachability (User Reported Scenario)");
console.log("===============================================================================");

// 20x10 board from the user's report
const state = {
    cols: 20,
    rows: 10,
    blue_credits: 40,
    red_credits: 25,
    currentPlayer: 'RED',
    gameMode: 'INVADE',
    flagCost: 10,
    barricades: new Set(['5,0', '5,1', '5,2', '5,3', '5,4']),
    units: [
        { id: 'b1', player: 'BLUE', col: 3, row: 6, power: 5, speed: 5, type: 'combat', isFlag: false },
        { id: 'b2', player: 'BLUE', col: 4, row: 2, power: 0, speed: 0, type: 'observation', isFlag: false },
        { id: 'r1', player: 'RED', col: 10, row: 3, power: 5, speed: 5, type: 'combat', isFlag: false },
        { id: 'r2', player: 'RED', col: 14, row: 6, power: 5, speed: 5, type: 'combat', isFlag: false },
        { id: 'r3', player: 'RED', col: 19, row: 4, power: 5, speed: 5, type: 'combat', isFlag: false }
    ]
};

// 1. Test evaluateTileScores
const tileScores = bot.evaluateTileScores(state, 'RED');

let barricadePass = true;
const barricadeCoords = ['5,0', '5,1', '5,2', '5,3', '5,4'];
for (let key of barricadeCoords) {
    const [c, r] = key.split(',').map(Number);
    const scoreItem = tileScores.find(s => s.col === c && s.row === r);
    if (!scoreItem) {
        console.error(`FAIL: Missing scoreItem for barricade (${c}, ${r})`);
        barricadePass = false;
    } else if (scoreItem.val !== null || !scoreItem.isBarricade) {
        console.error(`FAIL: Barricade (${c}, ${r}) has val: ${scoreItem.val}, isBarricade: ${scoreItem.isBarricade}`);
        barricadePass = false;
    } else {
        console.log(`PASS: Barricade (${c}, ${r}) correctly has val = null, isBarricade = true`);
    }
}

// 2. Test evaluateBoard doesn't throw or add NaN
const boardScore = bot.evaluateBoard(state, 'RED');
console.log(`Board score evaluated to: ${boardScore}`);
if (isNaN(boardScore) || typeof boardScore !== 'number') {
    console.error("FAIL: Board score is NaN or invalid number!");
    process.exit(1);
} else {
    console.log("PASS: evaluateBoard successfully computed numeric score without barricade pollution.");
}

// 3. Test generateHeatmap for reachability
const heatmap = bot.generateHeatmap(state, 'RED');

// Barricades should have val = null, isBarricade = true, botReachable = false
for (let key of barricadeCoords) {
    const [c, r] = key.split(',').map(Number);
    const item = heatmap.find(h => h.col === c && h.row === r);
    if (!item || item.val !== null || !item.isBarricade || item.botReachable) {
        console.error(`FAIL: Heatmap barricade item (${c}, ${r}) invalid:`, item);
        barricadePass = false;
    }
}

// Reachable tiles: (10, 3) R5 can reach adjacent tiles like (9, 3), (10, 4), etc.
const nearRedUnit = heatmap.find(h => h.col === 9 && h.row === 3);
if (!nearRedUnit || !nearRedUnit.botReachable) {
    console.error("FAIL: Expected tile (9, 3) near R5 to be botReachable: true, got:", nearRedUnit);
    process.exit(1);
} else {
    console.log("PASS: Tile (9, 3) within reach of R5 is correctly marked botReachable: true");
}

// Red unit's own tile (10, 3) should be botReachable: true
const ownTile = heatmap.find(h => h.col === 10 && h.row === 3);
if (!ownTile || !ownTile.botReachable) {
    console.error("FAIL: Expected unit's own tile (10, 3) to be botReachable: true, got:", ownTile);
    process.exit(1);
} else {
    console.log("PASS: Unit's own tile (10, 3) is correctly marked botReachable: true");
}

// Unreachable tiles: Far away tiles like (0, 0), (1, 1), (0, 9) cannot be reached by Red this turn
const farTile = heatmap.find(h => h.col === 0 && h.row === 0);
if (!farTile || farTile.botReachable) {
    console.error("FAIL: Expected far tile (0, 0) to be botReachable: false, got:", farTile);
    process.exit(1);
} else {
    console.log("PASS: Far tile (0, 0) outside reach is correctly marked botReachable: false");
}

// Deployable tiles: Red has 25 credits >= 10, so empty tiles on column 19 (e.g. (19, 0)) should be botReachable: true
const deployTile = heatmap.find(h => h.col === 19 && h.row === 0);
if (!deployTile || !deployTile.botReachable) {
    console.error("FAIL: Expected deployable base tile (19, 0) to be botReachable: true, got:", deployTile);
    process.exit(1);
} else {
    console.log("PASS: Deployable home base tile (19, 0) is correctly marked botReachable: true");
}

if (!barricadePass) {
    console.error("\nONE OR MORE TESTS FAILED!");
    process.exit(1);
} else {
    console.log("\nALL BARRICADE SCORING AND REACHABILITY TESTS PASSED (100%)!");
}
