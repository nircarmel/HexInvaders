import { HexGame } from './js/game.js';
import { AIBotV2 } from './js/ai-v2.js';

let game = new HexGame({ width: 16, height: 10, mode: 'VISIBLE', type: 'PLANT', credits: 100, flagCost: 10 });
let bot = new AIBotV2(game);

game.activeTeam = 'RED';
game.logAction = (team, msg) => console.log(`[${team} Action] ${msg}`);
game.logSystem = (msg) => console.log(`[SYSTEM] ${msg}`);

console.log("=== EXECUTING AI TURN WITH 1 RED UNIT AT 15,0 ===");
game.setUnit(15, 0, { team: 'RED', type: 'combat', strength: 1, speed: 4, cost: 4, hasActed: false });
game.credits['RED'] = 100;

const oldMini = bot.minimax.bind(bot);
bot.minimax = function (state, depth, alpha, beta, maximizing, botPlayer) {
    let res = oldMini(state, depth, alpha, beta, maximizing, botPlayer);
    if (depth === 3) console.log("MINIMAX DEPTH 3 CHOSE:", res.action.type, "Score:", res.score);
    return res;
};

bot.decideAction();
