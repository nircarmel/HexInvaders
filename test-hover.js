const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto('file://' + path.resolve(__dirname, 'index.html'));

    await page.waitForTimeout(1000);

    // Get a tile's position. Tile 4,4 usually has a unit in setup phase? No, in LOCAL mode units start off.
    // Let's programmatically deploy a unit.
    await page.evaluate(() => {
        window.game.gameMode = 'LOCAL';
        // Give some credits
        window.game.credits['BLUE'] = 100;
        // Deploy unit at 4,4
        window.game.deployUnit('BLUE', 'combat', 3, 3, 4, 4);
        window.game.render.drawLoop();
    });

    await page.waitForTimeout(500);

    // Hover over 4,4
    const res = await page.evaluate(() => {
        // Find 4,4 coords
        const pt = window.game.hexMath.offsetToPixel(4, 4, window.game.render.hexRadius);
        // Dispatch mousemove
        const evt = new MouseEvent('mousemove', {
            clientX: pt.x,
            clientY: pt.y
        });
        window.game.canvas.dispatchEvent(evt);
        return {
            x: pt.x, y: pt.y,
            hoverHexes: window.game.render.hoverHexes,
        };
    });

    console.log("Hover hexes array:", res.hoverHexes);

    await browser.close();
})();
