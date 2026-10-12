import puppeteer from 'puppeteer';
import path from 'path';

const ARTIFACT_DIR = 'C:\\Users\\nir\\.gemini\\antigravity\\brain\\6d808e88-fba7-4270-af4c-2334cc94a7ce';

async function run() {
    console.log('Launching Puppeteer...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1400, height: 900 });

        console.log('Navigating to http://localhost:8080 ...');
        await page.goto('http://localhost:8080', { waitUntil: 'networkidle0' });

        // Start vs Computer game
        console.log('Starting AI game...');
        await page.click('#btn-mode-ai');
        await page.waitForSelector('#btn-start-game', { visible: true });
        await page.click('#btn-start-game');

        await page.waitForSelector('#gameCanvas', { visible: true });
        await new Promise(r => setTimeout(r, 600));

        // Inject the user's reported board state
        console.log('Injecting user board scenario with barricades at col 5 and Red units...');
        await page.evaluate(() => {
            const game = window.gameAPI.game;
            // Clear board
            for (let c = 0; c < game.cols; c++) {
                for (let r = 0; r < game.rows; r++) {
                    const t = game.getTile(c, r);
                    t.unit = null;
                    t.isBarricade = false;
                }
            }

            // Set barricades at (5, 0..4)
            for (let r = 0; r <= 4; r++) {
                game.getTile(5, r).isBarricade = true;
            }

            // Set units
            // Blue Combat (3, 6) Str 5 Spd 5
            game.getTile(3, 6).unit = { team: 'BLUE', type: 'combat', strength: 5, speed: 5, isFlag: false, isObservation: false, cost: 25, hasActed: false };
            // Blue Observation (4, 2)
            game.getTile(4, 2).unit = { team: 'BLUE', type: 'observation', strength: 0, speed: 0, isFlag: false, isObservation: true, cost: 0, hasActed: false };
            // Red Combat (10, 3) Str 5 Spd 5
            game.getTile(10, 3).unit = { team: 'RED', type: 'combat', strength: 5, speed: 5, isFlag: false, isObservation: false, cost: 25, hasActed: false };
            // Red Combat (14, 6) Str 5 Spd 5
            game.getTile(14, 6).unit = { team: 'RED', type: 'combat', strength: 5, speed: 5, isFlag: false, isObservation: false, cost: 25, hasActed: false };
            // Red Combat (19, 4) Str 5 Spd 5
            game.getTile(19, 4).unit = { team: 'RED', type: 'combat', strength: 5, speed: 5, isFlag: false, isObservation: false, cost: 25, hasActed: false };

            game.activeTeam = 'RED';
            game.credits['BLUE'] = 40;
            game.credits['RED'] = 25;

            // Trigger heatmap for RED
            game.ui.toggleAIHeatmap('RED');
            if (game.render) game.render.draw();
        });

        await new Promise(r => setTimeout(r, 800));

        // Verify heatmap cache states
        const diagnostics = await page.evaluate(() => {
            const game = window.gameAPI.game;
            const cache = game.aiHeatmapCache;
            const wallItem = cache.find(h => h.col === 5 && h.row === 2);
            const reachItem = cache.find(h => h.col === 10 && h.row === 3);
            const unreachItem = cache.find(h => h.col === 0 && h.row === 0);
            return {
                wallItem,
                reachItem,
                unreachItem
            };
        });
        console.log('Diagnostics:', JSON.stringify(diagnostics, null, 2));

        const screenshotHeatmapPath = path.join(ARTIFACT_DIR, 'barricade_and_unreachable_overlay.png');
        await page.screenshot({ path: screenshotHeatmapPath });
        console.log('Saved heatmap screenshot:', screenshotHeatmapPath);

        // Open Teach AI panel and click barricade tile
        console.log('Opening Teach AI panel and testing barricade tile mention...');
        await page.click('#btn-red-teach-ai');
        await new Promise(r => setTimeout(r, 400));

        // Click pick tile button
        await page.click('#btn-teach-ai-pick-tile');
        await new Promise(r => setTimeout(r, 300));

        // Click tile (5, 2) which is a barricade
        await page.evaluate(() => {
            window.gameAPI.ui.insertTileMention(5, 2);
        });
        await new Promise(r => setTimeout(r, 300));

        const mentionVal = await page.$eval('#teach-ai-feedback-text', el => el.value);
        console.log('Textarea value after clicking barricade tile:', mentionVal);

        const screenshotMentionPath = path.join(ARTIFACT_DIR, 'teach_ai_barricade_mention.png');
        await page.screenshot({ path: screenshotMentionPath });
        console.log('Saved barricade mention screenshot:', screenshotMentionPath);

        console.log('All visual verification steps completed successfully!');
    } finally {
        await browser.close();
    }
}

run().catch(err => {
    console.error('Browser verification failed:', err);
    process.exit(1);
});
