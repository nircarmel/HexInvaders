import { HexGame } from './js/game.js';
import { AIBotV2 } from './js/ai-v2.js';
import { DEFAULT_V2_GENES } from './js/genes-v2.js';

let game = new HexGame({ width: 10, height: 5, mode: 'NEARBY', type: 'INVADE', credits: 100, flagCost: 10 });
game.network = null; game.ui = null;
let botBlue = new AIBotV2(game, { INVADE: DEFAULT_V2_GENES.INVADE });
let botRed = new AIBotV2(game, { INVADE: DEFAULT_V2_GENES.INVADE });

console.log("Starting match...");
for (let turns = 0; turns < 20; turns++) {
    if (game.winner) break;
    let bot = game.activeTeam === 'BLUE' ? botBlue : botRed;
    let r = bot.minimax(bot.cloneState(), 3, -Infinity, Infinity, true, game.activeTeam);
    console.log(`Turn ${turns} | ${game.activeTeam} : Action ->`, r.action ? r.action : 'NULL', `| Score:`, r.score);
    if (!r.action) game.endTurn(false, true);
    else if (r.action.type === 'DEPLOY') game.deployUnit(game.activeTeam, r.action.unitType, r.action.power, r.action.speed, r.action.targetCol, r.action.targetRow);
    else game.moveUnit(r.action.unitCol, r.action.unitRow, r.action.targetCol, r.action.targetRow);
}
