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

const initialBoardScore = bot.evaluateBoard(state, 'RED');
console.log(`Initial Board Score: ${initialBoardScore}`);

const moves = [
    { name: "Move A (Selected by bot): (14, 6) -> (11, 5)", a: { type: 'MOVE', unitCol: 14, unitRow: 6, targetCol: 11, targetRow: 5 } },
    { name: "Move B (User Option 1):   (14, 0) -> (9, 2)", a: { type: 'MOVE', unitCol: 14, unitRow: 0, targetCol: 9, targetRow: 2 } },
    { name: "Move C (User Option 2):   (19, 6) -> (14, 7)", a: { type: 'MOVE', unitCol: 19, unitRow: 6, targetCol: 14, targetRow: 7 } }
];

for (let m of moves) {
    const nextState = bot.applyVirtualAction(state, m.a);
    const score = bot.evaluateBoard(nextState, 'RED');
    const isSuicide = bot.isSuicideMove(state, m.a, 'RED');

    // Check threats on each unit in nextState
    const reach = bot.computeReachability(nextState);
    let threatenedUnits = [];
    for (let u of nextState.units.filter(u => u.player === 'RED')) {
        let key = `${u.col},${u.row}`;
        let occ = reach.get(key) || [];
        let threats = occ.filter(en => en.player === 'BLUE' && !en.isFlag && en.type !== 'observation' && en.power >= u.power);
        if (threats.length > 0) {
            threatenedUnits.push(`Unit at (${u.col},${u.row}) threatened by Blue at (${threats[0].col},${threats[0].row})`);
        }
    }

    console.log(`\n========================================`);
    console.log(m.name);
    console.log(`Immediate evaluateBoard: ${score.toLocaleString()}`);
    console.log(`Delta over initial:      ${(score - initialBoardScore).toLocaleString()}`);
    console.log(`isSuicideMove:          ${isSuicide}`);
    console.log(`Threatened Red Units:    ${threatenedUnits.length > 0 ? threatenedUnits.join('; ') : 'NONE'}`);

    // Minimax search at depth 1 (Blue's response)
    const blueActions = bot.generateCandidateActions(nextState, 'BLUE');
    let minBlueScore = Infinity;
    let bestBlueAction = null;
    for (let ba of blueActions) {
        const stateAfterBlue = bot.applyVirtualAction(nextState, ba);
        let bScore = bot.evaluateBoard(stateAfterBlue, 'RED');
        if (bot.isSuicideMove(nextState, ba, 'BLUE')) bScore += 2000000;
        if (bScore < minBlueScore) {
            minBlueScore = bScore;
            bestBlueAction = ba;
        }
    }
    console.log(`Blue's best response action: ${JSON.stringify(bestBlueAction)}`);
    console.log(`Board score after Blue's response (depth 2): ${minBlueScore.toLocaleString()}`);
}
