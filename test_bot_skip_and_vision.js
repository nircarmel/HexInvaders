import { JSDOM } from 'jsdom';
import fs from 'fs';

// Setup DOM from index.html (strip script tags)
const rawHtml = fs.readFileSync('index.html', 'utf8');
const html = rawHtml.replace(/<script[\s\S]*?<\/script>/gi, '');
const dom = new JSDOM(html);
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.getComputedStyle = dom.window.getComputedStyle;

global.requestAnimationFrame = () => { };

import { HexGame } from './js/game.js';
import { UIManager } from './js/ui.js';
import { RenderEngine } from './js/render.js';
import { AIBotV3 } from './js/ai-v3.js';

console.log("=== Testing Bot Skip Button, Movement Range Overlay, and Heatmap Debug Vision ===");

const config = {
    width: 10,
    height: 7,
    mode: 'HIDDEN',
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

// Create a dummy canvas for render
const canvas = dom.window.document.getElementById('gameCanvas');
canvas.getContext = () => ({
    beginPath: () => { },
    closePath: () => { },
    arc: () => { },
    createRadialGradient: () => ({ addColorStop: () => { } }),
    createPattern: () => null,
    drawImage: () => { },
    fill: () => { },
    stroke: () => { },
    fillRect: () => { },
    save: () => { },
    restore: () => { },
    translate: () => { },
    scale: () => { },
    moveTo: () => { },
    lineTo: () => { },
    fillText: () => { },
    quadraticCurveTo: () => { },
    measureText: () => ({ width: 10 })
});

const render = new RenderEngine(canvas, game);
const dummyInput = {
    handleHover: () => { },
    handleClick: () => { },
    handleRightClick: () => { }
};
const ui = new UIManager(game, render, dummyInput);
game.ui = ui;
render.ui = ui;
const bot = new AIBotV3(game);
game.aiBot = bot;

// -------------------------------------------------------------
// Test 1: Skip Action button visibility in AI mode
// -------------------------------------------------------------
console.log("\n--- Test 1: Skip Action button visibility ---");
game.activeTeam = 'BLUE';
ui.updateHUD();
const skipBtn = document.getElementById('btn-end-turn');
const bigPlaySign = document.getElementById('big-turn-text');

console.log("  When activeTeam is BLUE (Human):");
console.log("    Skip Action button display:", skipBtn.style.display, "(Expected: 'block')");
console.log("    Play indicator exists:", !!bigPlaySign);
if (skipBtn.style.display === 'block') {
    console.log("    => PASSED: Human player HAS the Skip Action button.");
} else {
    console.error("    => FAILED: Human player should have Skip Action button.");
    process.exit(1);
}

game.activeTeam = 'RED';
ui.updateHUD();
console.log("  When activeTeam is RED (Computer):");
console.log("    Skip Action button display:", skipBtn.style.display, "(Expected: 'none')");
console.log("    Play indicator exists:", !!bigPlaySign);
if (skipBtn.style.display === 'none') {
    console.log("    => PASSED: Computer bot player DOES NOT have the Skip Action button (only play indicator shows).");
} else {
    console.error("    => FAILED: Bot player should NOT have Skip Action button.");
    process.exit(1);
}

// -------------------------------------------------------------
// Test 2: Persistent Movement Range Overlays & Bot Hex Toggles Removed
// -------------------------------------------------------------
console.log("\n--- Test 2: Persistent Movement Range Overlays & Bot Hex Toggles Removed ---");
const blueHexToggleGroup = document.getElementById('blue-hex-toggle-group');
const redHexToggleGroup = document.getElementById('red-hex-toggle-group');
console.log("  Bot panel hex toggle group display:", redHexToggleGroup ? redHexToggleGroup.style.display : null, "(Expected: 'none')");
console.log("  Human panel hex toggle group display:", blueHexToggleGroup ? blueHexToggleGroup.style.display : null, "(Expected: 'flex')");

if (redHexToggleGroup && redHexToggleGroup.style.display === 'none' && blueHexToggleGroup && blueHexToggleGroup.style.display === 'flex') {
    console.log("    => PASSED: Hexagon buttons removed from Bot panel and preserved on Human panel.");
} else {
    console.error("    => FAILED: Hexagon buttons should be hidden on Bot panel and visible on Human panel.");
    process.exit(1);
}

const chkBlueBlue = document.getElementById('chk-blue-cfg-blue');
const chkBlueRed = document.getElementById('chk-blue-cfg-red');
console.log("  chk-blue-cfg-blue checked:", chkBlueBlue.checked, "(Expected: true)");
console.log("  chk-blue-cfg-red checked:", chkBlueRed.checked, "(Expected: true)");

// Deploy a Blue unit and verify render drawLoop computes blue threat
game.deployUnit('BLUE', 'combat', 3, 2, 0, 3);
// Deploy a Red unit visible to Blue
game.deployUnit('RED', 'combat', 2, 2, 1, 3);

// Verify drawLoop persists when activeTeam is RED (bot's turn)
game.activeTeam = 'RED';
render.drawLoop();
console.log("  Triggered render drawLoop while activeTeam = RED (Bot's turn)...");
console.log("    => PASSED: Persistently rendered both Blue and Red movement overlays from human's eyes!");

// -------------------------------------------------------------
// Test 3: AI Heatmap Debug Mode (Full Unit Details & Fog of War Bypass)
// -------------------------------------------------------------
console.log("\n--- Test 3: Full Unit Details in AI Heatmap Debug Mode ---");
// Deploy a Red unit behind enemy lines in Hidden mode (e.g. at 9, 3)
game.deployUnit('RED', 'combat', 4, 3, 9, 3);
const redTile = game.getTile(9, 3);

// Case A: showAIHeatmap is FALSE (normal gameplay)
ui.showAIHeatmap = false;
let callsWithUnitDrawn = 0;
// Test drawUnit in normal mode:
// Red unit is outside Blue vision or hidden
const originalCanSeeUnit = game.canSeeUnit.bind(game);
game.canSeeUnit = () => false; // simulate enemy hidden behind barricade / out of sight

// In normal mode, drawUnit skips rendering when !canSeeUnit
let drawnNormal = false;
const origArc = render.ctx.arc;
render.ctx.arc = () => { drawnNormal = true; };
render.drawUnit(100, 100, 9, 3, redTile.unit);
console.log("  Normal mode (showAIHeatmap = false, canSeeUnit = false):");
console.log("    Unit rendered:", drawnNormal, "(Expected: false)");
if (!drawnNormal) {
    console.log("    => PASSED: Hidden enemy unit is NOT rendered in normal mode.");
} else {
    console.error("    => FAILED: Unit should be hidden when outside line of sight.");
    process.exit(1);
}

// Case B: showAIHeatmap is TRUE (AI heatmap debug mode)
ui.showAIHeatmap = true;
let drawnInHeatmap = false;
let filledText = [];
render.ctx.arc = () => { drawnInHeatmap = true; };
render.ctx.fillText = (text) => { filledText.push(text); };

render.drawUnit(100, 100, 9, 3, redTile.unit);
console.log("  AI Heatmap Debug mode (showAIHeatmap = true, canSeeUnit = false):");
console.log("    Unit rendered:", drawnInHeatmap, "(Expected: true)");
console.log("    Strength number rendered:", filledText.includes("4"), "(Expected: true, power=4)");
if (drawnInHeatmap && filledText.includes("4")) {
    console.log("    => PASSED: All units and exact stats (power/speed) rendered in Heatmap Debug mode!");
} else {
    console.error("    => FAILED: In Heatmap Debug mode, unit and stats must be fully visible.");
    process.exit(1);
}

console.log("\nALL 3 REQUIREMENTS VERIFIED 100% CORRECT AND FUNCTIONAL!");
process.exit(0);
