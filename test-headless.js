const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

    const fileUrl = `file:///${path.resolve('index.html').replace(/\\/g, '/')}`;
    console.log("Loading", fileUrl);
    await page.goto(fileUrl);

    // Initialize game
    try {
        await page.click('#btn-start-game');
        console.log("Clicked initialize mission");

        // Wait a sec for board to render
        await page.waitForTimeout(500);

        // Click the top-left tile to open deploy context
        // Assuming hex radius ~30, center of 0,0 is around 30,30
        const canvas = await page.$('#gameCanvas');
        const box = await canvas.boundingBox();

        // Let's just click 30, 30 away from top left of the canvas?
        // Wait, camera coordinates center the board!
        // We must click safely. Instead, let's just trigger a click in the center-left.
        await page.mouse.click(box.x + 50, box.y + box.height / 2);
        console.log("Clicked canvas left middle");

        await page.waitForTimeout(500);

        const contextMenu = await page.$('#context-menu');
        const isHidden = await contextMenu.evaluate(el => el.classList.contains('hidden'));
        console.log("Context menu hidden?", isHidden);

        // If not hidden, click Deploy Combat Unit
        if (!isHidden) {
            const btns = await page.$$('#context-options button');
            for (let btn of btns) {
                const text = await btn.innerText();
                console.log("Found option:", text);
                if (text === 'Deploy Combat Unit') {
                    await btn.click();
                    console.log("Clicked deploy option");
                }
            }

            await page.waitForTimeout(500);
            await page.click('#btn-confirm-deploy');
            console.log("Clicked confirm");
        }

        await page.waitForTimeout(500);
    } catch (e) {
        console.log("Test error", e);
    }

    await browser.close();
})();
