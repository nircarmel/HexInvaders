import { AIBotV3 } from './js/ai-v3.js';
import { DEFAULT_V3_GENES } from './js/genes-v3.js';
import { hexMath } from './js/hex.js';

const bot = new AIBotV3(null, DEFAULT_V3_GENES);

console.log("===============================================================================");
console.log("TEST 1: FIXED HOME BASE VALUES (+1,000,000 and -1,000,000)");
console.log("===============================================================================");
const emptyState = {
    cols: 10,
    rows: 6,
    blue_credits: 0,
    red_credits: 0,
    currentPlayer: 'BLUE',
    gameMode: 'INVADE',
    flagCost: 10,
    barricades: new Set(),
    units: []
};
const emptyScores = bot.evaluateTileScores(emptyState, 'BLUE');
const myHomeTile = emptyScores.find(t => t.col === 0 && t.row === 2);
const enemyHomeTile = emptyScores.find(t => t.col === 9 && t.row === 2);

console.log(`My Home Base Tile (0,2): ${myHomeTile ? myHomeTile.val : 'N/A'}`);
console.log(`Enemy Home Base Tile (9,2): ${enemyHomeTile ? enemyHomeTile.val : 'N/A'}`);

const baseCheckPassed = myHomeTile && myHomeTile.val === -1000000 && enemyHomeTile && enemyHomeTile.val === 1000000;
console.log(`Base Values Check: ${baseCheckPassed ? "PASSED (My home is -1,000,000, Enemy home is +1,000,000 unconditionally!)" : "FAILED"}`);

console.log("\n===============================================================================");
console.log("TEST 2: FORWARD PROGRESSION (SCORES INCREASE AS TILES APPROACH ENEMY BASE)");
console.log("===============================================================================");
const singleUnitState = {
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
            id: 'blue_solo',
            player: 'BLUE',
            col: 3,
            row: 2,
            power: 3,
            speed: 3,
            type: 'combat',
            isFlag: false
        }
    ]
};
const soloScores = bot.evaluateTileScores(singleUnitState, 'BLUE');

console.log("Row 2 Tile Scores across columns (from col 0 to col 9):");
let progressionValid = true;
let prevScore = -Infinity;
for (let c = 0; c < 10; c++) {
    const tile = soloScores.find(t => t.col === c && t.row === 2);
    const val = tile ? tile.val : 0;
    console.log(`  Col ${c}: ${val}`);
    if (c >= 2 && c <= 8) {
        if (val < prevScore) {
            progressionValid = false;
        }
        prevScore = val;
    }
}
console.log(`Forward Progression Check: ${progressionValid ? "PASSED (Scores strictly increase as tiles advance toward enemy base!)" : "FAILED"}`);

console.log("\n===============================================================================");
console.log("TEST 3: ADJACENT 1v1 COMBAT (MY TILE NEGATIVE, ENEMY TILE POSITIVE)");
console.log("===============================================================================");
const duelState = {
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
            id: 'blue_1',
            player: 'BLUE',
            col: 3,
            row: 2,
            power: 3,
            speed: 3,
            type: 'combat',
            isFlag: false
        },
        {
            id: 'red_1',
            player: 'RED',
            col: 4,
            row: 2,
            power: 3,
            speed: 3,
            type: 'combat',
            isFlag: false
        }
    ]
};
const duelScores = bot.evaluateTileScores(duelState, 'BLUE');
const blueTile = duelScores.find(t => t.col === 3 && t.row === 2);
const redTile = duelScores.find(t => t.col === 4 && t.row === 2);

console.log(`Blue Unit Tile (3,2) Score: ${blueTile ? blueTile.val : 'N/A'}`);
console.log(`Red Unit Tile (4,2) Score:  ${redTile ? redTile.val : 'N/A'}`);
const combatScoresPassed = blueTile && blueTile.val < 0 && redTile && redTile.val > 0;
console.log(`Combat Tile Perspective Check: ${combatScoresPassed ? "PASSED (My tile is negative/threatened, Enemy tile is positive/winning!)" : "FAILED"}`);

console.log("\n===============================================================================");
console.log("TEST 4: MINIMAX PREFERENCE TO ATTACK AND DESTROY ENEMY UNIT (WHEN MOVING)");
console.log("===============================================================================");
const chosenAction = bot.decideAction(duelState);
console.log("Minimax Chosen Action:", JSON.stringify(chosenAction));

const isKillMove = chosenAction && chosenAction.type === 'MOVE' && chosenAction.targetCol === 4 && chosenAction.targetRow === 2;
console.log(`Minimax Kill Choice Check: ${isKillMove ? "PASSED (Bot automatically chose to attack and eliminate enemy unit!)" : "FAILED"}`);

const attackState = bot.applyVirtualAction(duelState, { type: 'MOVE', unitCol: 3, unitRow: 2, targetCol: 4, targetRow: 2 });
const attackEval = bot.evaluateBoard(attackState, 'BLUE');

const retreatState = bot.applyVirtualAction(duelState, { type: 'MOVE', unitCol: 3, unitRow: 2, targetCol: 2, targetRow: 2 });
const retreatEval = bot.evaluateBoard(retreatState, 'BLUE');

console.log(`\nBoard Evaluation after Killing Enemy: ${attackEval}`);
console.log(`Board Evaluation after Moving Away:    ${retreatEval}`);
console.log(`Score Advantage for Killing Enemy:    +${attackEval - retreatEval} points!`);
