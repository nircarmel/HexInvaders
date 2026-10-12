import { AIBotV3 } from './js/ai-v3.js';
import { DEFAULT_V3_GENES } from './js/genes-v3.js';

const bot = new AIBotV3(null, DEFAULT_V3_GENES);

// Human (Blue) at (2, 2) power 5, speed 5
// Bot (Red) at (8, 2) power 5, speed 5
const state = {
    cols: 10,
    rows: 6,
    blue_credits: 0,
    red_credits: 0,
    currentPlayer: 'RED',
    gameMode: 'INVADE',
    flagCost: 10,
    barricades: new Set(),
    units: [
        {
            id: 'human_blue',
            player: 'BLUE',
            col: 2,
            row: 2,
            power: 5,
            speed: 5,
            type: 'combat',
            isFlag: false
        },
        {
            id: 'bot_red',
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

console.log("=== 1. TILE SCORES FROM RED'S PERSPECTIVE ===");
const tileScores = bot.evaluateTileScores(state, 'RED');
const reach = bot.computeReachability(state);

// Check tiles along row 2
for (let c = 0; c < 10; c++) {
    const tile = tileScores.find(t => t.col === c && t.row === 2);
    const key = `${c},2`;
    const occ = reach.get(key) || [];
    const blueReaches = occ.some(u => u.player === 'BLUE');
    const redReaches = occ.some(u => u.player === 'RED');
    console.log(`Col ${c}: Score = ${tile ? tile.val : 0} | BlueReaches=${blueReaches}, RedReaches=${redReaches}`);
}

console.log("\n=== 2. BOT ACTIONS EVALUATED IN DECIDEACTION ===");
const chosenAction = bot.decideAction(state);
console.log("\nChosen Action:", JSON.stringify(chosenAction));

console.log("\nAll evaluated actions in decideAction:");
for (let ev of bot.lastEvaluations) {
    const tScore = tileScores.find(t => t.col === ev.action.targetCol && t.row === ev.action.targetRow)?.val;
    console.log(`Action to (${ev.action.targetCol}, ${ev.action.targetRow}): Minimax Score = ${ev.score}, Target Tile Score = ${tScore}`);
}
