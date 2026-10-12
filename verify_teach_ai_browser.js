import puppeteer from 'puppeteer';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/nir/.gemini/antigravity/brain/6d808e88-fba7-4270-af4c-2334cc94a7ce';

async function run() {
    console.log('Launching Puppeteer...');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1400, height: 900 });

        console.log('Navigating to http://localhost:8080 ...');
        await page.goto('http://localhost:8080', { waitUntil: 'networkidle0' });

        // Start game: Click Player vs Computer then Start Game
        console.log('Starting AI game...');
        await page.waitForSelector('#btn-mode-ai', { visible: true });
        await page.click('#btn-mode-ai');

        await new Promise(r => setTimeout(r, 400));
        await page.waitForSelector('#btn-start-game', { visible: true });
        await page.click('#btn-start-game');

        await new Promise(r => setTimeout(r, 800));

        // Click Red Robot Button to activate Heatmap
        console.log('Toggling AI Heatmap...');
        await page.waitForSelector('#btn-red-action-tree', { visible: true });
        await page.click('#btn-red-action-tree');

        await new Promise(r => setTimeout(r, 600));

        // Verify Teach AI button is visible
        await page.waitForSelector('#btn-red-teach-ai', { visible: true });
        console.log('Teach AI button is visible!');

        const screenshotButtonPath = path.join(ARTIFACT_DIR, 'teach_ai_button_active.png');
        await page.screenshot({ path: screenshotButtonPath });
        console.log('Saved button screenshot:', screenshotButtonPath);

        page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
        page.on('pageerror', err => console.error('BROWSER ERROR:', err.message));

        // Click Teach AI button to open panel
        console.log('Opening Teach AI panel...');
        await page.click('#btn-red-teach-ai');
        await new Promise(r => setTimeout(r, 500));

        const panelState = await page.evaluate(() => {
            const p = document.getElementById('teach-ai-panel');
            return {
                exists: !!p,
                className: p ? p.className : null,
                styleDisplay: p ? window.getComputedStyle(p).display : null,
                offsetWidth: p ? p.offsetWidth : null,
                offsetHeight: p ? p.offsetHeight : null
            };
        });
        console.log('Panel State after click:', panelState);

        // Type feedback with '@' mention
        console.log('Typing feedback and testing tile mention...');
        await page.type('#teach-ai-feedback-text', 'Bot made an aggressive blunder by advancing towards @');
        await new Promise(r => setTimeout(r, 300));

        // Click a tile on the canvas (e.g. near center-right)
        const canvas = await page.$('#gameCanvas');
        const box = await canvas.boundingBox();
        await page.mouse.click(box.x + box.width * 0.65, box.y + box.height * 0.45);

        await new Promise(r => setTimeout(r, 500));

        const screenshotPanelPath = path.join(ARTIFACT_DIR, 'teach_ai_panel_open.png');
        await page.screenshot({ path: screenshotPanelPath });
        console.log('Saved panel screenshot:', screenshotPanelPath);

        // Click Generate Report
        console.log('Generating report...');
        await page.click('#btn-teach-ai-submit');
        await new Promise(r => setTimeout(r, 500));

        // Click Copy Report
        console.log('Testing Copy Report button...');
        await page.click('#btn-teach-ai-copy');
        await new Promise(r => setTimeout(r, 400));

        const screenshotReportPath = path.join(ARTIFACT_DIR, 'teach_ai_report_view.png');
        await page.screenshot({ path: screenshotReportPath });
        console.log('Saved report screenshot:', screenshotReportPath);

        console.log('All visual verification steps completed successfully!');
    } catch (e) {
        console.error('Puppeteer verification failed:', e.message);
        console.error(e.stack);
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
}

run();
