import { JSDOM } from 'jsdom';
import fs from 'fs';

const rawHtml = fs.readFileSync('index.html', 'utf8');
const html = rawHtml.replace(/<script[\s\S]*?<\/script>/gi, '');
const dom = new JSDOM(html);
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;

Object.defineProperty(dom.window.navigator, 'clipboard', {
    value: {
        writeText: (text) => {
            global.__clipboardContent = text;
            return Promise.resolve();
        }
    },
    configurable: true
});

import { HexGame } from './js/game.js';
import { UIManager } from './js/ui.js';
import { AIBotV3 } from './js/ai-v3.js';

console.log('=== TEACH AI DOM INTEGRATION TEST ===');

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

// Initial state: Teach AI button should be hidden
const btnTeachRed = document.getElementById('btn-red-teach-ai');
const teachPanel = document.getElementById('teach-ai-panel');
const textarea = document.getElementById('teach-ai-feedback-text');
const btnSubmit = document.getElementById('btn-teach-ai-submit');
const btnCopy = document.getElementById('btn-teach-ai-copy');
const btnTree = document.getElementById('btn-red-action-tree');

console.log('Test 1: Initial Teach AI button hidden');
if (btnTeachRed.style.display !== 'none') {
    throw new Error('Expected btn-red-teach-ai to be hidden initially');
}
console.log('  => PASS: Initially hidden');

// Test 2: Activate heatmap -> Teach AI button shows
console.log('Test 2: Activate heatmap shows debug button');
btnTree.dispatchEvent(new dom.window.MouseEvent('click'));
if (btnTeachRed.style.display !== 'flex') {
    throw new Error('Expected btn-red-teach-ai to be displayed as flex when heatmap is active');
}
console.log('  => PASS: Debug button is visible when heatmap active');

// Test 3: Click Teach AI button opens panel
console.log('Test 3: Click debug button opens panel');
btnTeachRed.dispatchEvent(new dom.window.MouseEvent('click'));
if (teachPanel.classList.contains('hidden')) {
    throw new Error('Expected teach-ai-panel to NOT be hidden after click');
}
console.log('  => PASS: Panel is visible');

// Test 4: Typing '@' activates awaiting tile mention
console.log('Test 4: Typing @ activates tile mention mode');
textarea.value = 'The bot should not have moved to @';
textarea.selectionStart = textarea.value.length;
textarea.dispatchEvent(new dom.window.Event('input'));

if (!ui.isAwaitingTileMention()) {
    throw new Error('Expected ui.isAwaitingTileMention() to be true');
}
console.log('  => PASS: Tile mention mode active');

// Test 5: Click a tile on the board (col 4, row 3)
console.log('Test 5: Click tile inserts @Tile(4, 3) [Score: ...]');
game.aiHeatmapCache = [
    { col: 4, row: 3, val: 84200 }
];

ui.handleHexClick(4, 3, '4,3', {});

console.log('  Textarea value after click:', textarea.value);
if (!textarea.value.includes('@Tile(4, 3) [Score: +84,200]')) {
    throw new Error('Expected tile mention with score in textarea');
}
if (ui.isAwaitingTileMention()) {
    throw new Error('Expected awaitingTileMention to be false after insertion');
}
console.log('  => PASS: Tile coordinates and score inserted successfully');

// Test 6: Submit Report
console.log('Test 6: Submit report generates report view');
btnSubmit.dispatchEvent(new dom.window.MouseEvent('click'));

const inputView = document.getElementById('teach-ai-input-view');
const reportView = document.getElementById('teach-ai-report-view');
const reportPre = document.getElementById('teach-ai-report-pre');

if (!inputView.classList.contains('hidden')) {
    throw new Error('Expected inputView to be hidden after submit');
}
if (reportView.classList.contains('hidden')) {
    throw new Error('Expected reportView to be visible after submit');
}
if (!reportPre.textContent.includes('Teach AI: Bot Feedback Report')) {
    throw new Error('Report pre text does not contain title');
}
if (!reportPre.textContent.includes('@Tile(4, 3) [Score: +84,200]')) {
    throw new Error('Report pre text does not contain tile mention');
}
if (!reportPre.textContent.includes('Board Before Bot Move')) {
    throw new Error('Report missing prev board');
}
if (!reportPre.textContent.includes('Board After Bot Move')) {
    throw new Error('Report missing current board');
}
console.log('  => PASS: Report generated with feedback, prev board, and current board');

// Test 7: Copy Report
console.log('Test 7: Copy report to clipboard');
btnCopy.dispatchEvent(new dom.window.MouseEvent('click'));
await new Promise(r => setTimeout(r, 20));

if (!global.__clipboardContent || !global.__clipboardContent.includes('Teach AI: Bot Feedback Report')) {
    throw new Error('Expected clipboard content to contain report');
}
console.log('  => PASS: Report successfully copied to clipboard');

// Test 8: Toggle heatmap OFF closes panel and hides debug button
console.log('Test 8: Toggle heatmap OFF');
btnTree.dispatchEvent(new dom.window.MouseEvent('click'));
if (btnTeachRed.style.display !== 'none') {
    throw new Error('Expected btn-red-teach-ai to be hidden after heatmap toggled off');
}
if (!teachPanel.classList.contains('hidden')) {
    throw new Error('Expected teach-ai-panel to be closed after heatmap toggled off');
}
console.log('  => PASS: Debug button hidden and panel closed');

console.log('\n=== ALL DOM INTEGRATION TESTS PASSED 100% ===');
