const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    // Serve from the local filesystem
    const url = `file://${path.join(__dirname, 'index.html')}`;
    await page.setViewport({ width: 1200, height: 800 });
    await page.goto(url, { waitUntil: 'networkidle0' });

    // Mock an active unit placement and hover explicitly
    await page.evaluate(() => {
        // Deploy a unit
        const testCol = 5;
        const testRow = 5;
        game.activeTeam = 'BLUE';
        game.setUnit(testCol, testRow, new Unit('BLUE', 'combat', 2, 2, 2));

        // Trigger hover on the unit natively
        const hex = game.getTile(testCol, testRow);
        ui._contextTarget = null;
        game.selectedTile = null;

        // Emulate UI hover hex setter organically
        render.hoverHexes = game.getReachableHexes(testCol, testRow, 'BLUE', 2);
        render.hoverHexesColor = 'rgba(59, 130, 246, 0.120)';
        render.hoveredHex = `${testCol},${testRow}`;

        // Render tick
        render.drawLoop();
    });

    // Wait a brief tick for render
    await new Promise(r => setTimeout(r, 500));

    // Screenshot specifically the canvas!
    const canvasElement = await page.$('#gameCanvas');
    await canvasElement.screenshot({ path: path.join(__dirname, 'hover_edges_test_blue.png') });

    await page.evaluate(() => {
        // Shift to RED
        const testCol = 5;
        const testRow = 5;
        game.activeTeam = 'RED';
        game.setUnit(testCol, testRow, new Unit('RED', 'combat', 2, 2, 2));
        render.hoverHexes = game.getReachableHexes(testCol, testRow, 'RED', 2);
        render.hoverHexesColor = 'rgba(239, 68, 68, 0.120)';
        render.hoveredHex = `${testCol},${testRow}`;
        render.drawLoop();
    });

    await new Promise(r => setTimeout(r, 500));
    await canvasElement.screenshot({ path: path.join(__dirname, 'hover_edges_test_red.png') });

    await browser.close();
    console.log("Screenshots captured natively.");
})();
