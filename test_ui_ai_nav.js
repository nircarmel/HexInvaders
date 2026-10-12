import { JSDOM } from 'jsdom';
import fs from 'fs';

// Setup DOM from index.html (strip scripts so JSDOM doesn't auto-run bundle)
const rawHtml = fs.readFileSync('index.html', 'utf8');
const html = rawHtml.replace(/<script[\s\S]*?<\/script>/gi, '');
const dom = new JSDOM(html);
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;

import { HexGame } from './js/game.js';
import { UIManager } from './js/ui.js';
import { AIBotV3 } from './js/ai-v3.js';

console.log("=== Testing AI Bot Visibility, Heatmap Toggle, and Turn History Navigation ===");

const config = {
    width: 10,
    height: 7,
    mode: 'VISIBLE',
    type: 'INVADE',
    credits: 50,
    flagCost: 10,
    barricadeCost: 10,
    maxStrength: 5,
    maxSpeed: 5,
    timerDuration: 0,
    blueName: 'Player 1',
    redName: 'Bot'
};

const game = new HexGame(config);
game.gameMode = 'AI';
game.localTeam = 'BLUE';

const dummyRender = {
    draw: () => { },
    clearExplosions: () => { },
    addMoveAnimation: () => { },
    visionHexes: [],
    hoverHexes: []
};

const dummyInput = {
    handleHover: () => { },
    handleClick: () => { },
    handleRightClick: () => { }
};
const ui = new UIManager(game, dummyRender, dummyInput);
game.ui = ui;
const bot = new AIBotV3(game);
game.aiBot = bot;

// 1. Verify Robot Button Visibility in AI mode
ui.updateHUD();
const blueAiContainer = document.getElementById('blue-ai-container');
const redAiContainer = document.getElementById('red-ai-container');

console.log("Test 1: Visibility in AI mode (Blue Human, Red Computer)");
console.log("  Blue AI Container display:", blueAiContainer.style.display, "(Expected: 'none')");
console.log("  Red AI Container display:", redAiContainer.style.display, "(Expected: 'flex')");
if (blueAiContainer.style.display === 'none' && redAiContainer.style.display === 'flex') {
    console.log("  => PASSED: Robot button is hidden for Human (Blue) and shown for Computer (Red).");
} else {
    console.error("  => FAILED: Unexpected container display.");
    process.exit(1);
}

// Test in LOCAL mode (2 Humans)
game.gameMode = 'LOCAL';
ui.updateHUD();
console.log("\nTest 2: Visibility in LOCAL mode (Both Human)");
console.log("  Blue AI Container display:", blueAiContainer.style.display, "(Expected: 'none')");
console.log("  Red AI Container display:", redAiContainer.style.display, "(Expected: 'none')");
if (blueAiContainer.style.display === 'none' && redAiContainer.style.display === 'none') {
    console.log("  => PASSED: Robot buttons hidden for both players in 2-player local mode.");
} else {
    console.error("  => FAILED: Robot button should not show in local mode.");
    process.exit(1);
}

// Reset to AI mode
game.gameMode = 'AI';
ui.updateHUD();

// 2. Test Click-to-Toggle Heatmap
console.log("\nTest 3: Click-to-Toggle Heatmap");
const btnRedTree = document.getElementById('btn-red-action-tree');
const btnRedPrev = document.getElementById('btn-red-ai-prev');
const btnRedNext = document.getElementById('btn-red-ai-next');
const redTurnLabel = document.getElementById('red-ai-turn-label');

console.log("  Initial state: showAIHeatmap =", ui.showAIHeatmap);
console.log("  Clicking Red Robot Button once...");
btnRedTree.dispatchEvent(new dom.window.MouseEvent('click'));

console.log("  After 1st Click: showAIHeatmap =", ui.showAIHeatmap, "(Expected: true)");
console.log("  Nav Prev button display:", btnRedPrev.style.display, "(Expected: 'flex')");
console.log("  Nav Next button display:", btnRedNext.style.display, "(Expected: 'flex')");
console.log("  Turn Label display:", redTurnLabel.style.display, "(Expected: 'block')");
console.log("  Heatmap Cache populated:", Array.isArray(game.aiHeatmapCache) && game.aiHeatmapCache.length > 0);

if (ui.showAIHeatmap === true && btnRedPrev.style.display === 'flex' && btnRedNext.style.display === 'flex' && game.aiHeatmapCache.length > 0) {
    console.log("  => PASSED: Single click activated heatmap and displayed navigation controls.");
} else {
    console.error("  => FAILED: Heatmap toggle did not activate properly.");
    process.exit(1);
}

// 3. Test Stepping through AI Turn History
console.log("\nTest 4: Stepping through AI Turn History");
// Blue deploys unit at (0, 3) -> ends turn -> Snapshot 1 (Red's turn 1)
game.deployUnit('BLUE', 'combat', 3, 2, 0, 3);
// Red deploys unit at (9, 3) -> ends turn -> Snapshot 2 (Blue's turn 2)
game.deployUnit('RED', 'combat', 3, 2, 9, 3);
// Blue moves unit -> ends turn -> Snapshot 3 (Red's turn 2)
game.moveUnit(0, 3, 2, 3);
// Red moves unit -> ends turn -> Snapshot 4 (Blue's turn 3)
game.moveUnit(9, 3, 7, 3);
// Blue moves unit -> ends turn -> Snapshot 5 (Red's turn 3)
game.moveUnit(2, 3, 4, 3);

const redIndices = ui.getAISnapshotIndices('RED');
console.log("  Total game snapshots:", game.history.length);
console.log("  Red AI Turn snapshot indices in history:", redIndices);
console.log("  Current snapshot index:", game.historyIndex);

ui.updateHUD();
console.log("  Current Turn Label:", redTurnLabel.innerText);

// Step Backwards using Prev Button
console.log("  Clicking Prev Button (◀)...");
btnRedPrev.dispatchEvent(new dom.window.MouseEvent('click'));
console.log("  Loaded snapshot index:", game.historyIndex);
console.log("  Turn Label after 1st Prev:", redTurnLabel.innerText);

console.log("  Clicking Prev Button (◀) again...");
btnRedPrev.dispatchEvent(new dom.window.MouseEvent('click'));
console.log("  Loaded snapshot index:", game.historyIndex);
console.log("  Turn Label after 2nd Prev:", redTurnLabel.innerText);

if (game.historyIndex === redIndices[0] && redTurnLabel.innerText.includes("Turn 1")) {
    console.log("  => PASSED: Successfully stepped back to AI Turn 1, skipping opponent turns!");
} else {
    console.error("  => FAILED: Stepping backwards did not land on AI Turn 1.");
    process.exit(1);
}

// Step Forward using Next Button
console.log("  Clicking Next Button (▶)...");
btnRedNext.dispatchEvent(new dom.window.MouseEvent('click'));
console.log("  Loaded snapshot index:", game.historyIndex);
console.log("  Turn Label after Next:", redTurnLabel.innerText);

btnRedNext.dispatchEvent(new dom.window.MouseEvent('click'));
console.log("  Loaded snapshot index:", game.historyIndex);
console.log("  Turn Label after Next (at Live):", redTurnLabel.innerText);

if (game.historyIndex === redIndices[redIndices.length - 1] && redTurnLabel.innerText.includes("Live")) {
    console.log("  => PASSED: Successfully stepped forward back to Live AI Turn!");
} else {
    console.error("  => FAILED: Stepping forward did not return to Live turn.");
    process.exit(1);
}

// 4. Test Click-to-Toggle OFF
console.log("\nTest 5: Click-to-Toggle Heatmap OFF");
console.log("  Clicking Red Robot Button 2nd time...");
btnRedTree.dispatchEvent(new dom.window.MouseEvent('click'));

console.log("  After 2nd Click: showAIHeatmap =", ui.showAIHeatmap, "(Expected: false)");
console.log("  Nav Prev button display:", btnRedPrev.style.display, "(Expected: 'none')");
console.log("  Nav Next button display:", btnRedNext.style.display, "(Expected: 'none')");
console.log("  Turn Label display:", redTurnLabel.style.display, "(Expected: 'none')");

if (ui.showAIHeatmap === false && btnRedPrev.style.display === 'none' && btnRedNext.style.display === 'none') {
    console.log("  => PASSED: 2nd click successfully toggled heatmap OFF and hid controls.");
} else {
    console.error("  => FAILED: Toggling off failed.");
    process.exit(1);
}

console.log("\nALL TESTS COMPLETED AND VERIFIED 100% CORRECT!");
process.exit(0);
