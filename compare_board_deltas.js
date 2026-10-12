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

const initialTiles = bot.evaluateTileScores(state, 'RED');

function analyzeMove(name, action) {
    console.log(`\n======================================================`);
    console.log(`ANALYSIS FOR: ${name}`);
    console.log(`======================================================`);
    const nextState = bot.applyVirtualAction(state, action);
    const nextTiles = bot.evaluateTileScores(nextState, 'RED');

    let tileDiffs = [];
    for (let c = 0; c < state.cols; c++) {
        for (let r = 0; r < state.rows; r++) {
            const oldT = initialTiles.find(t => t.col === c && t.row === r);
            const newT = nextTiles.find(t => t.col === c && t.row === r);
            const oldV = (oldT && oldT.val !== null) ? oldT.val : 0;
            const newV = (newT && newT.val !== null) ? newT.val : 0;
            const diff = newV - oldV;
            if (Math.abs(diff) > 0.001) {
                tileDiffs.push({ col: c, row: r, oldV, newV, diff });
            }
        }
    }

    tileDiffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    console.log(`Total tiles changed: ${tileDiffs.length}`);
    console.log(`Top 10 tile score changes:`);
    for (let i = 0; i < Math.min(10, tileDiffs.length); i++) {
        const d = tileDiffs[i];
        console.log(`  Tile (${d.col}, ${d.row}): Old = ${Math.round(d.oldV).toLocaleString()}, New = ${Math.round(d.newV).toLocaleString()} (Delta: ${(d.diff > 0 ? '+' : '') + Math.round(d.diff).toLocaleString()})`);
    }

    // Also look at reachability changes
    const reachBefore = bot.computeReachability(state);
    const reachAfter = bot.computeReachability(nextState);

    // How many tiles does Red reach before vs after?
    let redReachBefore = 0, redReachAfter = 0;
    for (let c = 0; c < state.cols; c++) {
        for (let r = 0; r < state.rows; r++) {
            let k = `${c},${r}`;
            if ((reachBefore.get(k) || []).some(u => u.player === 'RED')) redReachBefore++;
            if ((reachAfter.get(k) || []).some(u => u.player === 'RED')) redReachAfter++;
        }
    }
    console.log(`Red tiles reachable: Before = ${redReachBefore}, After = ${redReachAfter} (Reach delta: ${redReachAfter - redReachBefore})`);
}

analyzeMove("Move A: (14, 6) -> (11, 5)", { type: 'MOVE', unitCol: 14, unitRow: 6, targetCol: 11, targetRow: 5 });
analyzeMove("Move B: (14, 0) -> (9, 2)", { type: 'MOVE', unitCol: 14, unitRow: 0, targetCol: 9, targetRow: 2 });
analyzeMove("Move C: (19, 6) -> (14, 7)", { type: 'MOVE', unitCol: 19, unitRow: 6, targetCol: 14, targetRow: 7 });
