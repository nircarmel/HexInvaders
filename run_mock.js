const fs = require('fs');
const hexCode = fs.readFileSync('js/hex.js', 'utf8').replace(/export const/g, 'const');
const aiCode = fs.readFileSync('js/ai.js', 'utf8').replace(/export class/g, 'class').replace(/import.*?\;/g, '');

const tester = `
${hexCode}
${aiCode}

try {
    let fakeGame = {
        cols: 30, rows: 15, activeTeam: 'RED', winner: null,
        credits: { BLUE: 46, RED: 50 },
        board: new Map(),
        getTile: function(c, r) { return this.board.get(c + ',' + r) || { isBarricade: false, unit: null }; },
        logSystem: console.log,
        logAction: console.log,
        deployUnit: (team, type, str, spd, c, r) => { console.log('DEPLOY:', team, type, str, spd, c, r); return true; },
        moveUnit: (sc, sr, tc, tr) => { console.log('MOVE:', sc, sr, tc, tr); return true; },
        endTurn: () => { console.log('END TURN'); }
    };

    for(let r=0; r<15; r++) {
        for(let c=0; c<30; c++) {
            fakeGame.board.set(c+','+r, { isBarricade: false, unit: null });
        }
    }
    
    // Exact simulation of Hex-Invaders Unit class (no col/row)
    fakeGame.board.set('0,0', {
        isBarricade: false, 
        unit: { team: 'BLUE', strength: 1, speed: 4, type: 'combat', isFlag: false, hasActed: false, cost: 4 }
    });

    let ai = new AIBot(fakeGame);
    ai.decideAction();
    console.log('SUCCESS');
} catch (err) {
    console.log("AI TRACE:", err.stack);
}
`;
fs.writeFileSync('test_ai.js', tester, 'utf8');
