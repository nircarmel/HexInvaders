import { HexGame } from './js/game.js';
import { UIManager } from './js/ui.js';
import { RenderEngine } from './js/render.js';
import { JSDOM } from 'jsdom';
import fs from 'fs';

const rawHtml = fs.readFileSync('index.html', 'utf8').replace(/<script[\s\S]*?<\/script>/gi, '');
const dom = new JSDOM(rawHtml);
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.getComputedStyle = dom.window.getComputedStyle;
global.requestAnimationFrame = () => { };

const canvas = dom.window.document.getElementById('gameCanvas');
canvas.getContext = () => ({
    beginPath: () => { }, closePath: () => { }, arc: () => { },
    createRadialGradient: () => ({ addColorStop: () => { } }),
    createPattern: () => null, drawImage: () => { },
    fill: () => { }, stroke: () => { }, fillRect: () => { },
    save: () => { }, restore: () => { }, translate: () => { },
    scale: () => { }, moveTo: () => { }, lineTo: () => { },
    fillText: () => { }, quadraticCurveTo: () => { },
    measureText: () => ({ width: 10 })
});

// Setup game sequence
const game = new HexGame({
    width: 10, height: 7, mode: 'HIDDEN', type: 'INVADE',
    credits: 50, flagCost: 10, barricadeCost: 10,
    maxStrength: 5, maxSpeed: 5, timerDuration: 0,
    blueName: 'Player 1', redName: 'Bot'
});
game.gameMode = 'AI';
game.localTeam = 'BLUE';

const render = new RenderEngine(canvas, game);
const dummyInput = { handleHover: () => { }, handleClick: () => { }, handleRightClick: () => { } };
const ui = new UIManager(game, render, dummyInput);
game.ui = ui;

// Turn 0: Blue deploy (0,3) -> Snap 1
game.deployUnit('BLUE', 'combat', 3, 2, 0, 3);
// Turn 1: Red deploy (9,3) -> Snap 2
game.deployUnit('RED', 'combat', 3, 2, 9, 3);
// Turn 2: Blue move (0,3 -> 1,3) -> Snap 3
game.moveUnit(0, 3, 1, 3);
// Turn 3: Red move (9,3 -> 8,3) -> Snap 4
game.moveUnit(9, 3, 8, 3);
// Turn 4: Blue move (1,3 -> 2,3) -> Snap 5
game.moveUnit(1, 3, 2, 3);
// Turn 5: Red move (8,3 -> 7,3) -> Snap 6
game.moveUnit(8, 3, 7, 3);

console.log("=== Verification: AI Tile Scores Overlay History Navigation ===");
console.log("Total snapshots:", game.history.length);
const aiIndices = ui.getAISnapshotIndices('RED');
console.log("AI snapshot indices:", aiIndices);

// Turn ON AI Heatmap
ui.toggleAIHeatmap('RED');

function verifyBoardUnits(label) {
    let actualUnits = [];
    for (let [k, v] of game.board.entries()) {
        if (v.unit) {
            actualUnits.push({ key: k, unit: v.unit });
        }
    }

    let drawnUnits = [];
    render.drawUnit = (x, y, col, row, unit) => {
        drawnUnits.push({ col, row, team: unit.team, power: unit.strength });
    };

    render.drawLoop();

    console.log(`\n[${label}] historyIndex = ${game.historyIndex}`);
    console.log(`  Actual units on board: ${actualUnits.length}`);
    console.log(`  Drawn units in render: ${drawnUnits.length}`);

    if (actualUnits.length !== drawnUnits.length) {
        console.error(`  FAIL: Mismatch! Actual ${actualUnits.length} vs Drawn ${drawnUnits.length}`);
        process.exit(1);
    }
    console.log(`  => PASS: 100% of units displayed (${drawnUnits.map(u => `${u.team}@(${u.col},${u.row})`).join(', ')})`);
}

// 1. Initial live turn in heatmap
verifyBoardUnits("Live State Turn 6");

// 2. Step back to Snap 5
ui.stepAITurn('RED', -1);
verifyBoardUnits("Stepped back to Turn 5");

// 3. Step back to Snap 3
ui.stepAITurn('RED', -1);
verifyBoardUnits("Stepped back to Turn 3");

// 4. Step back to Snap 1
ui.stepAITurn('RED', -1);
verifyBoardUnits("Stepped back to Turn 1");

// 5. Step forward to Snap 3
ui.stepAITurn('RED', 1);
verifyBoardUnits("Stepped forward to Turn 3");

// 6. Step forward to Snap 5
ui.stepAITurn('RED', 1);
verifyBoardUnits("Stepped forward to Turn 5");

// 7. Step forward to live state
ui.stepAITurn('RED', 1);
verifyBoardUnits("Stepped forward to Live State");

console.log("\nALL HISTORY TRAVERSAL STEPS PASSED WITH 0 MISSING UNITS!");
