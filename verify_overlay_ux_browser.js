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

        page.on('console', msg => console.log('BROWSER LOG:', msg.type(), msg.text()));
        page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

        console.log('Navigating to http://localhost:8080 ...');
        await page.goto('http://localhost:8080', { waitUntil: 'networkidle0' });

        console.log('Starting AI game...');
        await page.click('#btn-mode-ai');
        await page.waitForSelector('#btn-start-game', { visible: true });
        await page.click('#btn-start-game');

        await page.waitForSelector('#gameCanvas', { visible: true });
        await new Promise(r => setTimeout(r, 600));

        console.log('Toggling AI Heatmap in browser...');
        const inspection = await page.evaluate(async () => {
            const game = window.gameAPI.game;

            // Clear board
            for (let c = 0; c < game.cols; c++) {
                for (let r = 0; r < game.rows; r++) {
                    const t = game.getTile(c, r);
                    t.unit = null;
                    t.isBarricade = false;
                }
            }

            // Set Red Combat at (19, 4)
            game.getTile(19, 4).unit = { team: 'RED', type: 'combat', strength: 5, speed: 5, isFlag: false, isObservation: false, cost: 25, hasActed: false };
            // Set Blue Combat at (5, 4)
            game.getTile(5, 4).unit = { team: 'BLUE', type: 'combat', strength: 5, speed: 5, isFlag: false, isObservation: false, cost: 25, hasActed: false };

            game.activeTeam = 'RED';

            // Intercept fillText on render context to record drawn scores
            const drawn = [];
            const origFillText = game.render.ctx.fillText;
            game.render.ctx.fillText = function (text, x, y) {
                drawn.push({
                    text: text,
                    font: game.render.ctx.font,
                    fillStyle: game.render.ctx.fillStyle,
                    x: x,
                    y: y
                });
                return origFillText.apply(this, arguments);
            };

            // Trigger AI Heatmap for RED
            game.ui.toggleAIHeatmap('RED');
            if (game.render) game.render.draw();

            // Restore original fillText
            game.render.ctx.fillText = origFillText;

            const evals = game.aiHeatmapCache || [];
            const reachableVals = evals
                .filter(e => e.botReachable && !e.isBarricade && e.val !== null && e.val !== undefined && e.val < 500000)
                .map(e => e.val);
            const maxVal = reachableVals.length > 0 ? Math.max(...reachableVals) : null;

            return {
                totalTiles: evals.length,
                reachableCount: evals.filter(e => e.botReachable).length,
                maxVal: maxVal,
                drawnScoresSample: drawn.slice(0, 10),
                boldDrawn: drawn.filter(d => d.font.includes('bold')),
                orangeDrawn: drawn.filter(d => d.fillStyle === '#fbbf24')
            };
        });

        console.log('Overlay inspection results:', inspection);

        // Take screenshot of canvas
        const canvas = await page.$('#gameCanvas');
        const screenshotPath = path.join(ARTIFACT_DIR, 'ai_overlay_ux_verified.png');
        await canvas.screenshot({ path: screenshotPath });
        console.log(`Saved screenshot to ${screenshotPath}`);

    } catch (err) {
        console.error('Error during verification:', err);
    } finally {
        await browser.close();
    }
}

run();
