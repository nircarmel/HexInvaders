import { AIBotV3 } from './js/ai-v3.js';
import { DEFAULT_V3_GENES } from './js/genes-v3.js';
import { hexMath } from './js/hex.js';

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

console.log("=== DIAGNOSTIC REPORT ANALYSIS ===");

// 1. Initial tile scores
const tileScores = bot.evaluateTileScores(state, 'RED');
const initialBoardScore = bot.evaluateBoard(state, 'RED');
console.log(`Initial evaluateBoard for RED: ${initialBoardScore.toLocaleString()}`);

function getTileScore(c, r) {
    const item = tileScores.find(t => t.col === c && t.row === r);
    return item ? item.val : null;
}

console.log(`Tile (14, 6) score: ${getTileScore(14, 6)}`);
console.log(`Tile (11, 5) score: ${getTileScore(11, 5)}`);
console.log(`Tile (14, 0) score: ${getTileScore(14, 0)}`);
console.log(`Tile (9, 2) score:  ${getTileScore(9, 2)}`);
console.log(`Tile (19, 6) score: ${getTileScore(19, 6)}`);
console.log(`Tile (14, 7) score: ${getTileScore(14, 7)}`);

// 2. Can unit (14, 0) reach (9, 2)?
const validMovesR1 = bot.getValidMovesVirtual(state, state.units.find(u => u.col === 14 && u.row === 0));
const canReach9_2 = validMovesR1.some(m => m.col === 9 && m.row === 2);
console.log(`Can (14, 0) reach (9, 2)? ${canReach9_2}`);
console.log(`Valid moves count for (14, 0): ${validMovesR1.length}`);

// 3. Inspect specific candidate moves
const candidateMoves = [
    { name: "Move A (Chosen by bot): (14, 6) -> (11, 5)", a: { type: 'MOVE', unitCol: 14, unitRow: 6, targetCol: 11, targetRow: 5 } },
    { name: "Move B (User Option 1):   (14, 0) -> (9, 2)", a: { type: 'MOVE', unitCol: 14, unitRow: 0, targetCol: 9, targetRow: 2 } },
    { name: "Move C (User Option 2):   (19, 6) -> (14, 7)", a: { type: 'MOVE', unitCol: 19, unitRow: 6, targetCol: 14, targetRow: 7 } }
];

for (let cand of candidateMoves) {
    console.log(`\n--- Evaluating ${cand.name} ---`);
    const nextState = bot.applyVirtualAction(state, cand.a);
    const evalScore = bot.evaluateBoard(nextState, 'RED');
    const isSuicide = bot.isSuicideMove(state, cand.a, 'RED');

    // Check threats on the moved unit in nextState
    const reachMapNext = bot.computeReachability(nextState);
    const targetKey = `${cand.a.targetCol},${cand.a.targetRow}`;
    const targetOccupants = reachMapNext.get(targetKey) || [];
    const enemyThreats = targetOccupants.filter(u => u.player === 'BLUE');

    console.log(`evaluateBoard score: ${evalScore.toLocaleString()}`);
    console.log(`isSuicideMove: ${isSuicide}`);
    console.log(`Delta over initial board: ${(evalScore - initialBoardScore).toLocaleString()}`);
    console.log(`Enemy threats on target tile:`, enemyThreats.map(e => `${e.player} ${e.type} at (${e.col},${e.row}) power:${e.power} spd:${e.speed}`));
}

// 4. Run full decideAction / minimax
console.log("\n--- Full minimax search result ---");
const best = await bot.decideAction(state);
console.log("Selected Best Action:", JSON.stringify(best, null, 2));

// 5. Check all scored candidate actions at depth 1
const allActions = bot.generateCandidateActions(state, 'RED');
console.log(`\nTotal candidate actions: ${allActions.length}`);
const scored = [];
for (let a of allActions) {
    const nextState = bot.applyVirtualAction(state, a);
    let score = bot.evaluateBoard(nextState, 'RED');
    if (bot.isSuicideMove(state, a, 'RED')) score -= 2000000;
    scored.push({ a, score });
}
scored.sort((x, y) => y.score - x.score);
console.log("\nTop 5 actions after immediate evaluation:");
for (let i = 0; i < Math.min(5, scored.length); i++) {
    const s = scored[i];
    console.log(`Rank ${i + 1}: Action ${JSON.stringify(s.a)} -> Score: ${s.score.toLocaleString()}`);
}
