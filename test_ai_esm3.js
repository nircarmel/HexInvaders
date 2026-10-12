import { AIBot } from './js/ai-v1.js';

let fakeGame = {
    cols: 30, rows: 15, activeTeam: 'RED', winner: null, type: 'PLANT',
    config: { flagCost: 10 },
    credits: { BLUE: 46, RED: 50 },
    board: new Map(),
    getTile: function (c, r) { return this.board.get(c + ',' + r) || { isBarricade: false, unit: null }; },
    logSystem: console.log,
    logAction: console.log,
    deployUnit: (team, type, str, spd, c, r) => { console.log('DEPLOY:', team, type, str, spd, c, r); return true; },
    moveUnit: (sc, sr, tc, tr) => { console.log('MOVE:', sc, sr, tc, tr); return true; },
    endTurn: () => { console.log('END TURN'); }
};

for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 30; c++) {
        fakeGame.board.set(c + ',' + r, { isBarricade: false, unit: null });
    }
}
// Add an observation unit or a weak blue combat unit 
fakeGame.board.set('0,0', {
    isBarricade: false,
    unit: { team: 'BLUE', strength: 1, speed: 4, type: 'combat', isFlag: false, hasActed: false, cost: 4 }
});

let ai = new AIBot(fakeGame);
ai.decideAction();
console.log('SUCCESS');
