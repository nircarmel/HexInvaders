import { HexGame } from './js/game.js';
import { AIBotV2 } from './js/ai-v2.js';
import { DEFAULT_V2_GENES } from './js/genes-v2.js';
import { AIBot } from './js/ai-v1.js';
import { DEFAULT_GENES } from './js/genes-v1.js';

let game = new HexGame({ width: 30, height: 15, mode: 'NEARBY', type: 'INVADE', credits: 100, flagCost: 10 });
let botBlue = new AIBotV2(game, { INVADE: DEFAULT_V2_GENES.INVADE });
let botRed = new AIBot(game, { INVADE: DEFAULT_GENES.INVADE });

console.log("V2(BLUE) vs V1(RED)");
for (let t = 1; t <= 15; t++) {
    const stB = botBlue.cloneState();
    let rB = botBlue.minimax(stB, 1, -Infinity, Infinity, true, 'BLUE');
    if (rB.action) {
        console.log(`T${t} | BLUE V2 -> ${rB.action.type} -> (${rB.action.targetCol},${rB.action.targetRow}) SCORE: ${rB.score}`);
        if (rB.action.type === 'DEPLOY') game.deployUnit('BLUE', rB.action.unitType, rB.action.power, rB.action.speed, rB.action.targetCol, rB.action.targetRow);
        else if (rB.action.type === 'MOVE') game.moveUnit(rB.action.unitCol, rB.action.unitRow, rB.action.targetCol, rB.action.targetRow);
    } else game.endTurn(false, true);

    const stR = botRed.cloneState();
    let rR = botRed.minimax(stR, 1, -Infinity, Infinity, true, 'RED');
    if (rR.action) {
        console.log(`T${t} | RED V1  -> ${rR.action.type} -> (${rR.action.targetCol},${rR.action.targetRow}) SCORE: ${rR.score}`);
        if (rR.action.type === 'DEPLOY') game.deployUnit('RED', rR.action.unitType, rR.action.power, rR.action.speed, rR.action.targetCol, rR.action.targetRow);
        else if (rR.action.type === 'MOVE') game.moveUnit(rR.action.unitCol, rR.action.unitRow, rR.action.targetCol, rR.action.targetRow);
    } else game.endTurn(false, true);
}
