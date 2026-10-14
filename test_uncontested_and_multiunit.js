import { AIBotV3 } from './js/ai-v3.js';
import { DEFAULT_V3_GENES } from './js/genes-v3.js';

const bot = new AIBotV3(null, DEFAULT_V3_GENES);

// Test 1: Uncontested Tile Stability in PLANT mode
console.log("=== TEST 1: UNCONTESTED TILE STABILITY (PLANT MODE) ===");
const state1Plant = {
    cols: 20, rows: 10, blue_credits: 75, red_credits: 75, currentPlayer: 'RED', gameMode: 'PLANT', flagCost: 10, barricades: new Set(),
    units: [
        { id: 'b1', player: 'BLUE', col: 5, row: 4, power: 5, speed: 5, type: 'combat', isFlag: false },
        { id: 'r1', player: 'RED', col: 19, row: 4, power: 5, speed: 5, type: 'combat', isFlag: false }
    ]
};
const scores1Plant = bot.evaluateTileScores(state1Plant, 'RED');
const t15_4_onePlant = scores1Plant.find(t => t.col === 15 && t.row === 4);
console.log(`With 1 Red unit, score of (15, 4) in PLANT mode = ${t15_4_onePlant.val}`);

const state2Plant = {
    cols: 20, rows: 10, blue_credits: 75, red_credits: 50, currentPlayer: 'RED', gameMode: 'PLANT', flagCost: 10, barricades: new Set(),
    units: [
        { id: 'b1', player: 'BLUE', col: 5, row: 4, power: 5, speed: 5, type: 'combat', isFlag: false },
        { id: 'r1', player: 'RED', col: 19, row: 4, power: 5, speed: 5, type: 'combat', isFlag: false },
        { id: 'r2', player: 'RED', col: 19, row: 3, power: 5, speed: 5, type: 'combat', isFlag: false }
    ]
};
const scores2Plant = bot.evaluateTileScores(state2Plant, 'RED');
const t15_4_twoPlant = scores2Plant.find(t => t.col === 15 && t.row === 4);
console.log(`With 2 Red units, score of (15, 4) in PLANT mode = ${t15_4_twoPlant.val}`);
console.log(`Difference on (15, 4) in PLANT mode: ${t15_4_twoPlant.val - t15_4_onePlant.val}`);

if (t15_4_twoPlant.val === t15_4_onePlant.val) {
    console.log("PASS: PLANT mode uncontested tile score is stable!\n");
} else {
    console.error("FAIL: PLANT mode uncontested tile score changed!\n");
}

// Test 2: Uncontested Tile Stability in INVADE mode
console.log("=== TEST 2: UNCONTESTED TILE STABILITY (INVADE MODE) ===");
const state1Invade = {
    cols: 20, rows: 10, blue_credits: 75, red_credits: 75, currentPlayer: 'RED', gameMode: 'INVADE', flagCost: 10, barricades: new Set(),
    units: [
        { id: 'b1', player: 'BLUE', col: 5, row: 4, power: 5, speed: 5, type: 'combat', isFlag: false },
        { id: 'r1', player: 'RED', col: 19, row: 4, power: 5, speed: 5, type: 'combat', isFlag: false }
    ]
};
const scores1Invade = bot.evaluateTileScores(state1Invade, 'RED');
const t15_4_oneInvade = scores1Invade.find(t => t.col === 15 && t.row === 4);
console.log(`With 1 Red unit, score of (15, 4) in INVADE mode = ${t15_4_oneInvade.val}`);

const state2Invade = {
    cols: 20, rows: 10, blue_credits: 75, red_credits: 50, currentPlayer: 'RED', gameMode: 'INVADE', flagCost: 10, barricades: new Set(),
    units: [
        { id: 'b1', player: 'BLUE', col: 5, row: 4, power: 5, speed: 5, type: 'combat', isFlag: false },
        { id: 'r1', player: 'RED', col: 19, row: 4, power: 5, speed: 5, type: 'combat', isFlag: false },
        { id: 'r2', player: 'RED', col: 19, row: 3, power: 5, speed: 5, type: 'combat', isFlag: false }
    ]
};
const scores2Invade = bot.evaluateTileScores(state2Invade, 'RED');
const t15_4_twoInvade = scores2Invade.find(t => t.col === 15 && t.row === 4);
console.log(`With 2 Red units, score of (15, 4) in INVADE mode = ${t15_4_twoInvade.val}`);
console.log(`Difference on (15, 4) in INVADE mode: ${t15_4_twoInvade.val - t15_4_oneInvade.val}`);

if (t15_4_twoInvade.val === t15_4_oneInvade.val) {
    console.log("PASS: INVADE mode uncontested tile score is stable!\n");
} else {
    console.error("FAIL: INVADE mode uncontested tile score changed!\n");
}

// Test 3: Contested Multi-Unit Control Calculation
console.log("=== TEST 3: CONTESTED MULTI-UNIT CONTROL CALCULATION ===");
// Tile (12, 4) is reachable by:
// Blue at (10, 4) [dist = 2, within spd 5]
// Red at (15, 4)  [dist = 3, within spd 5]
const stateContested1vs1 = {
    cols: 20, rows: 10, blue_credits: 50, red_credits: 50, currentPlayer: 'RED', gameMode: 'INVADE', flagCost: 10, barricades: new Set(),
    units: [
        { id: 'b1', player: 'BLUE', col: 10, row: 4, power: 5, speed: 5, type: 'combat', isFlag: false },
        { id: 'r1', player: 'RED', col: 15, row: 4, power: 5, speed: 5, type: 'combat', isFlag: false }
    ]
};
const scores1vs1 = bot.evaluateTileScores(stateContested1vs1, 'RED');
const t12_4_1vs1 = scores1vs1.find(t => t.col === 12 && t.row === 4);
console.log(`Contested (12, 4) with 1 Red (5) vs 1 Blue (5): Score for RED = ${t12_4_1vs1.val}`);

// Now add 2nd Red unit at (14, 4) [also reaches (12, 4)]
const stateContested2vs1 = {
    cols: 20, rows: 10, blue_credits: 50, red_credits: 25, currentPlayer: 'RED', gameMode: 'INVADE', flagCost: 10, barricades: new Set(),
    units: [
        { id: 'b1', player: 'BLUE', col: 10, row: 4, power: 5, speed: 5, type: 'combat', isFlag: false },
        { id: 'r1', player: 'RED', col: 15, row: 4, power: 5, speed: 5, type: 'combat', isFlag: false },
        { id: 'r2', player: 'RED', col: 14, row: 4, power: 5, speed: 5, type: 'combat', isFlag: false }
    ]
};
const scores2vs1 = bot.evaluateTileScores(stateContested2vs1, 'RED');
const t12_4_2vs1 = scores2vs1.find(t => t.col === 12 && t.row === 4);
console.log(`Contested (12, 4) with 2 Red (5, 5) vs 1 Blue (5): Score for RED = ${t12_4_2vs1.val}`);

if (t12_4_2vs1.val > 0 && t12_4_2vs1.val > t12_4_1vs1.val) {
    console.log("PASS: Multi-unit presence decisively awarded control and positive score to Red!\n");
} else {
    console.error("FAIL: 2 vs 1 did not award control to Red!\n");
}
