import { HexGame } from './js/game.js';
import { Unit } from './js/unit.js';
import { UIManager } from './js/ui.js';

let count = 0;
function test(desc, fn) {
    count++;
    try {
        fn();
        console.log(`PASS #${count}: ${desc}`);
    } catch (e) {
        console.error(`FAIL #${count}: ${desc} -> ${e.message}`);
        process.exitCode = 1;
    }
}

const game = new HexGame({
    width: 8, height: 6, mode: 'VISIBLE', type: 'INVADE',
    credits: 50, flagCost: 10, barricadeCost: 10
});

const mockUI = {
    game: game,
    teachAIPanelOpen: true,
    awaitingTileMention: false,
    teachAITextarea: { value: '', selectionStart: 0, setSelectionRange: () => { }, focus: () => { } },
    formatBoardStateText: UIManager.prototype.formatBoardStateText,
    generateTeachAIReport: UIManager.prototype.generateTeachAIReport,
    insertTileMention: UIManager.prototype.insertTileMention,
    setAwaitingTileMention: function (active) { this.awaitingTileMention = active; }
};

test('Format initial board state', () => {
    const snap = game.history[0];
    const txt = mockUI.formatBoardStateText(snap, 'Initial');
    if (!txt.includes('#### Initial')) throw new Error('Missing header');
    if (!txt.includes('**Active Turn**: BLUE')) throw new Error('Missing active turn');
    if (!txt.includes('Credits')) throw new Error('Missing credits');
});

test('Format board with units and barricades', () => {
    game.getTile(2, 3).unit = new Unit('BLUE', 'combat', 4, 2, 20);
    game.getTile(5, 3).unit = new Unit('RED', 'combat', 3, 3, 15);
    game.getTile(4, 2).isBarricade = true;
    game.getTile(4, 3).isBarricade = true;
    game.saveSnapshot();

    const snap = game.history[game.history.length - 1];
    const txt = mockUI.formatBoardStateText(snap, 'WithUnits');
    if (!txt.includes('BLUE')) throw new Error('Missing BLUE');
    if (!txt.includes('RED')) throw new Error('Missing RED');
    if (!txt.includes('###')) throw new Error('Missing barricade');
    if (!txt.includes('B4')) throw new Error('Missing B4');
    if (!txt.includes('R3')) throw new Error('Missing R3');
});

test('Generate full Teach AI report', () => {
    mockUI.teachAITextarea.value = 'The bot should not move to center hex.';
    game.historyIndex = game.history.length - 1;
    const report = mockUI.generateTeachAIReport();
    if (!report.includes('# Teach AI: Bot Feedback Report')) throw new Error('Missing report title');
    if (!report.includes('## 1. User Feedback')) throw new Error('Missing section 1');
    if (!report.includes('The bot should not move to center hex.')) throw new Error('Missing user text');
    if (!report.includes('## 2. Previous Board State')) throw new Error('Missing section 2');
    if (!report.includes('## 3. Current Board State')) throw new Error('Missing section 3');
    if (!report.includes('## 4. Metadata')) throw new Error('Missing section 4');
});

test('Tile mention insertion with score and barricade', () => {
    game.aiHeatmapCache = [
        { col: 1, row: 1, val: 95400 },
        { col: 4, row: 3, val: null, isBarricade: true },
        { col: 2, row: 2, val: -12500 }
    ];

    // Non-barricade tile
    mockUI.teachAITextarea.value = 'Review tile @';
    mockUI.teachAITextarea.selectionStart = mockUI.teachAITextarea.value.length;
    mockUI.insertTileMention(1, 1);
    if (!mockUI.teachAITextarea.value.includes('@Tile(1, 1) [Score: +95,400]')) {
        throw new Error('Mention not formatted: ' + mockUI.teachAITextarea.value);
    }

    // Barricade tile
    mockUI.teachAITextarea.value = 'Watch wall @';
    mockUI.teachAITextarea.selectionStart = mockUI.teachAITextarea.value.length;
    mockUI.insertTileMention(4, 3);
    if (!mockUI.teachAITextarea.value.includes('@Tile(4, 3) [Barricade]')) {
        throw new Error('Mention not formatted: ' + mockUI.teachAITextarea.value);
    }

    // Negative score tile
    mockUI.teachAITextarea.value = 'Avoid @';
    mockUI.teachAITextarea.selectionStart = mockUI.teachAITextarea.value.length;
    mockUI.insertTileMention(2, 2);
    if (!mockUI.teachAITextarea.value.includes('@Tile(2, 2) [Score: -12,500]')) {
        throw new Error('Mention not formatted: ' + mockUI.teachAITextarea.value);
    }
});

console.log('--- TEST RUN COMPLETE ---');
