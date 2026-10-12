import { HexGame } from './js/game.js';
import { Unit } from './js/unit.js';
import { AIBotV3 } from './js/ai-v3.js';
import { UIManager } from './js/ui.js';
import { JSDOM } from 'jsdom';
import fs from 'fs';

const rawHtml = fs.readFileSync('index.html', 'utf8').replace(/<script[\s\S]*?<\/script>/gi, '');
const dom = new JSDOM(rawHtml);
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.getComputedStyle = dom.window.getComputedStyle;
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);

async function runTests() {
    console.log('--- STARTING AI SCORING & MOVEMENT TESTS ---');
    let passed = 0;
    let failed = 0;

    function assert(cond, msg) {
        if (cond) {
            console.log(`[PASS] ${msg}`);
            passed++;
        } else {
            console.error(`[FAIL] ${msg}`);
            failed++;
        }
    }

    const game = new HexGame({
        width: 10, height: 6, mode: 'VISIBLE', type: 'INVADE',
        credits: 50, flagCost: 10, barricadeCost: 10,
        maxStrength: 5, maxSpeed: 5, timerDuration: 0,
        blueName: 'Player 1', redName: 'Bot'
    });
    game.gameMode = 'AI';
    game.localTeam = 'BLUE';

    const ai = new AIBotV3(game);
    game.aiBot = ai;

    // Place units on board
    game.setUnit(8, 3, new Unit('RED', 'combat', 5, 4, 10));
    game.setUnit(0, 3, new Unit('BLUE', 'combat', 5, 2, 10));

    // 1. TEST TILE SCORING IN INVADE MODE:
    const state = ai.cloneState();
    const tileScores = ai.evaluateTileScores(state, 'RED');

    // Find scores along row 3:
    const row3Scores = {};
    for (let t of tileScores) {
        if (t.row === 3) {
            row3Scores[t.col] = t.val;
        }
    }
    console.log('Row 3 Tile Scores (Red perspective):', JSON.stringify(row3Scores, null, 2));

    // CHECK A: Unthreatened tiles between col 3 and col 7 MUST NOT BE NEGATIVE
    for (let c = 3; c <= 7; c++) {
        assert(row3Scores[c] > 0, `Unthreatened forward tile at col ${c} must have positive score, got ${row3Scores[c]}`);
    }

    // CHECK B: Forward movement rule: closer to enemy home (col 0) should score higher among unthreatened tiles
    assert(row3Scores[3] > row3Scores[5], `Tile at col 3 (${row3Scores[3]}) should score higher than tile at col 5 (${row3Scores[5]})`);
    assert(row3Scores[5] > row3Scores[7], `Tile at col 5 (${row3Scores[5]}) should score higher than tile at col 7 (${row3Scores[7]})`);

    // CHECK C: Red's own home base (col 9):
    // Unit on Red's own home base at col 9, row 3
    game.getTile(8, 3).unit = null;
    game.setUnit(9, 3, new Unit('RED', 'combat', 3, 3, 10));
    const homeState = ai.cloneState();
    const homeTileScores = ai.evaluateTileScores(homeState, 'RED');
    const homeTile = homeTileScores.find(t => t.col === 9 && t.row === 3);
    const adjacentTile = homeTileScores.find(t => t.col === 8 && t.row === 3);

    assert(homeTile.val !== -1000000, `Unit on own home base when unthreatened must not be -1000000, got ${homeTile.val}`);
    assert(homeTile.val >= 0, `Unit on own home base when unthreatened must have non-negative score, got ${homeTile.val}`);
    assert(homeTile.val < adjacentTile.val, `Unit on own home base (${homeTile.val}) should be rated slightly less than tile right next to base (${adjacentTile.val})`);

    // 2. TEST BOT ACTION SELECTION:
    // Restore unit with power 5, speed 4 at col 8, row 3.
    game.getTile(9, 3).unit = null;
    game.setUnit(8, 3, new Unit('RED', 'combat', 5, 4, 10));
    game.activeTeam = 'RED';
    game.credits['RED'] = 0; // prevent deploy to isolate movement decision

    const actions = ai.generateCandidateActions(ai.cloneState(), 'RED');
    for (let a of actions) {
        if (a.type === 'MOVE') {
            let nextState = ai.applyVirtualAction(ai.cloneState(), a);
            let score = ai.evaluateBoard(nextState, 'RED');
            console.log(`Action MOVE to col ${a.targetCol}, row ${a.targetRow} -> score: ${score}`);
        }
    }

    const chosenAction = await ai.decideAction();
    console.log('AI Chosen Action:', chosenAction);
    console.log('AI Last Evaluations:', JSON.stringify(ai.lastEvaluations, null, 2));

    assert(chosenAction !== null, 'AI should choose an action');
    assert(chosenAction.type === 'MOVE', `AI should choose MOVE action, got ${chosenAction?.type}`);
    assert(chosenAction.targetCol <= 5, `AI should move 3-4 tiles forward (targetCol <= 5), got targetCol ${chosenAction?.targetCol}`);

    // TEST SPEED 5 UNIT:
    // Clear units at (4,3) and (8,3) and place speed 5 unit at col 9, row 3.
    // Verify it moves 5 full tiles forward to col 4.
    game.getTile(4, 3).unit = null;
    game.getTile(8, 3).unit = null;
    game.setUnit(9, 3, new Unit('RED', 'combat', 5, 5, 25));
    game.activeTeam = 'RED';
    game.credits['RED'] = 0;

    const actions5 = ai.generateCandidateActions(ai.cloneState(), 'RED');
    for (let a of actions5) {
        if (a.type === 'MOVE') {
            let nextState = ai.applyVirtualAction(ai.cloneState(), a);
            let score = ai.evaluateBoard(nextState, 'RED');
            console.log(`Speed 5 Action MOVE to (${a.targetCol}, ${a.targetRow}) -> score: ${score}`);
        }
    }

    const speed5Action = await ai.decideAction();
    console.log('Speed 5 Chosen Action:', speed5Action);
    assert(speed5Action !== null && speed5Action.type === 'MOVE', 'Speed 5 unit should choose MOVE action');
    assert(speed5Action.targetCol <= 5, `Speed 5 unit should advance forward (targetCol <= 5), got targetCol ${speed5Action?.targetCol}`);

    // 3. TEST THINKING UI & PROGRESS BAR:
    const dummyRender = { draw: () => { }, clearMoveAnimations: () => { } };
    const dummyInput = { handleHover: () => { }, handleClick: () => { }, handleRightClick: () => { } };
    const ui = new UIManager(game, dummyRender, dummyInput);
    ui.showAIThinking('RED', true);
    const redThinkingBox = document.getElementById('red-ai-thinking-box');
    const redProgressBar = document.getElementById('red-ai-progress-bar');
    const redProgressText = document.getElementById('red-ai-progress-text');

    assert(redThinkingBox.style.display === 'flex', 'red-ai-thinking-box should be displayed flex when thinking');

    ui.updateAIThinkingProgress('RED', 65);
    assert(redProgressBar.style.width === '65%', `red-ai-progress-bar width should be 65%, got ${redProgressBar.style.width}`);
    assert(redProgressText.textContent === '65%', `red-ai-progress-text should display 65%, got ${redProgressText.textContent}`);

    ui.showAIThinking('RED', false);
    assert(redThinkingBox.style.display === 'none', 'red-ai-thinking-box should be hidden after thinking completes');

    console.log(`\nTEST SUMMARY: ${passed} Passed, ${failed} Failed`);
    if (failed > 0) process.exit(1);
}

runTests().catch(err => {
    console.error('Test run failed:', err);
    process.exit(1);
});
