import { HexGame } from './js/game.js';
import { AIBotV2 } from './js/ai-v2.js';
import { DEFAULT_V2_GENES } from './js/genes-v2.js';

let game = new HexGame({ width: 30, height: 15, mode: 'NEARBY', type: 'INVADE', credits: 100, flagCost: 10 });
game.network = null; game.ui = null;
let botBlue = new AIBotV2(game, { INVADE: DEFAULT_V2_GENES.INVADE });

console.log("Starting minimax loop...");
let r = botBlue.minimax(botBlue.cloneState(), 2, -Infinity, Infinity, true, 'BLUE');
console.log("Done eval", r);
